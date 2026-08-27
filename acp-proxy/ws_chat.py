"""WebSocket chat endpoint — stable version.

Key improvements:
1. Never expose raw Python exceptions to frontend
2. Proper WebSocket lifecycle management
3. Robust error recovery with user-friendly messages
4. Logging to file for debugging
"""

import asyncio
import logging
import os
import shutil
import sqlite3
import time
from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from proxy import get_acp_process

_OPENSOUL_DB = "/home/climbing/opensoul/data/opensoul.db"


def _get_agent_db():
    """Get a connection to the OpenSoul database for agent session storage."""
    db = sqlite3.connect(_OPENSOUL_DB)
    db.row_factory = sqlite3.Row
    return db


def _create_or_get_agent_session(agent_id: str, session_id: str | None = None) -> str:
    """Create a new agent session or return existing one. Returns session_id."""
    db = _get_agent_db()
    try:
        if session_id:
            row = db.execute("SELECT id FROM agent_sessions WHERE id = ?", (session_id,)).fetchone()
            if row:
                return session_id
        # Create new session
        new_id = session_id or f"agent_{agent_id}_{int(time.time() * 1000)}"
        db.execute(
            "INSERT OR IGNORE INTO agent_sessions (id, agent_id, title, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?)",
            (new_id, agent_id, "New Chat", time.time(), time.time()),
        )
        db.commit()
        return new_id
    finally:
        db.close()


def _store_agent_message(session_id: str, role: str, content: str):
    """Store a message in an agent session."""
    db = _get_agent_db()
    try:
        now = time.time()
        db.execute(
            "INSERT INTO agent_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now),
        )
        db.execute(
            "UPDATE agent_sessions SET last_activity_at = ?, message_count = message_count + 1 WHERE id = ?",
            (now, session_id),
        )
        db.commit()
    finally:
        db.close()

logger = logging.getLogger("acp-proxy.ws")
router = APIRouter()

# Read JWT config from OpenSoul's .env (shared secret)
_OPSOUL_ENV = {}
_env_path = "/home/climbing/opensoul/.env"
try:
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                _OPSOUL_ENV[k.strip()] = v.strip()
except FileNotFoundError:
    logger.warning(f"OpenSoul .env not found at {_env_path}")

JWT_SECRET = _OPSOUL_ENV.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = _OPSOUL_ENV.get("JWT_ALGORITHM", "HS256")


def decode_token(token: str) -> UUID | None:
    """Decode JWT and return user UUID, or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            return UUID(user_id)
    except Exception:
        pass
    return None


# Agent proxy registry — synced with OpenSoul's AGENT_REGISTRY
AGENT_REGISTRY = {
    "hermes": {"name": "Hermes Agent", "binary": "hermes", "args": ["-z"]},
    "mimo": {"name": "MiMo Code", "binary": "mimo", "args": ["run", "--prompt"]},
    "claude": {"name": "Claude Code", "binary": "claude", "args": ["-p"]},
    "codex": {"name": "Codex CLI", "binary": "codex", "args": ["-q"]},
    "aider": {"name": "Aider", "binary": "aider", "args": ["--message"]},
    "pi-agent": {"name": "Pi Agent", "binary": "pi", "args": ["--message"]},
    "opencode": {"name": "OpenCode", "binary": "opencode", "args": ["-q"]},
    "gemini": {"name": "Gemini CLI", "binary": "gemini", "args": ["-p"]},
    "copilot": {"name": "GitHub Copilot", "binary": "gh", "args": ["copilot", "-p"]},
    "amazon-q": {"name": "Amazon Q", "binary": "q", "args": ["chat", "--no-interactive", "-p"]},
    "qwen": {"name": "Qwen Coder", "binary": "qwen", "args": ["--message"]},
    "deepseek": {"name": "DeepSeek", "binary": "deepseek", "args": ["--message"]},
    "perplexity": {"name": "Perplexity CLI", "binary": "pplx", "args": ["--message"]},
}


async def run_agent_proxy(agent_id: str, text: str) -> tuple[str, str, bool]:
    """Run a message through agent proxy."""
    agent_config = AGENT_REGISTRY.get(agent_id)
    if not agent_config:
        return f"未知Agent: {agent_id}", "error", False
    binary = agent_config["binary"]
    if not shutil.which(binary):
        return f"Agent未安装: {binary}", "error", False
    cmd = [binary] + agent_config["args"] + [text]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        response = stdout.decode("utf-8", errors="replace").strip()
        if not response and proc.returncode != 0:
            response = stderr.decode("utf-8", errors="replace").strip()
        return response or "（无响应）", agent_id, proc.returncode == 0
    except TimeoutError:
        return "Agent响应超时 (120s)", "error", False
    except Exception as e:
        logger.error(f"Agent proxy error: {e}")
        return f"Agent执行出错: {type(e).__name__}", "error", False


async def _safe_send_ws(websocket: WebSocket, data: dict) -> bool:
    """Send JSON to WebSocket, return False if send fails."""
    try:
        await websocket.send_json(data)
        return True
    except Exception:
        return False


@router.get("/health")
async def ws_chat_health():
    return {"status": "ok", "component": "WSChat"}


@router.get("/acp/status")
async def acp_status():
    acp = get_acp_process()
    return {"running": acp.is_running}


class ACPMessage:
    def __init__(self, text: str, session_id: str | None = None):
        self.text = text
        self.session_id = session_id


@router.post("/acp/send")
async def acp_send(data: dict):
    """HTTP fallback for sending messages."""
    acp = get_acp_process()
    try:
        result = await acp.send_message(data.get("text", ""), data.get("session_id"))
        return {"ok": True, "content": result.get("response_text", ""), "source": result.get("source", "acp")}
    except TimeoutError:
        return {"ok": False, "error": "请求超时，请重试"}
    except Exception as e:
        logger.error(f"HTTP send error: {e}")
        return {"ok": False, "error": "处理消息时出错，请重试"}


@router.post("/acp/send-image")
async def acp_send_image(data: dict):
    """HTTP fallback for sending images."""
    acp = get_acp_process()
    try:
        result = await acp.send_message_with_image(
            data.get("text", ""), data.get("image_data", ""),
            data.get("mime_type", "image/png"), data.get("session_id")
        )
        return {"ok": True, "content": result.get("response_text", ""), "source": result.get("source", "acp")}
    except TimeoutError:
        return {"ok": False, "error": "图片处理超时，请重试"}
    except Exception as e:
        logger.error(f"HTTP image send error: {e}")
        return {"ok": False, "error": "处理图片时出错，请重试"}


@router.post("/acp/send-file")
async def acp_send_file(data: dict):
    """HTTP fallback for sending file attachments."""
    acp = get_acp_process()
    try:
        result = await acp.send_message_with_file(
            data.get("text", ""), data.get("file_data", ""),
            data.get("file_name", "file"), data.get("mime_type", "application/octet-stream"),
            data.get("session_id")
        )
        return {"ok": True, "content": result.get("response_text", ""), "source": result.get("source", "acp")}
    except TimeoutError:
        return {"ok": False, "error": "文件处理超时，请重试"}
    except Exception as e:
        logger.error(f"HTTP file send error: {e}")
        return {"ok": False, "error": "处理文件时出错，请重试"}


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time chat.

    Protocol:
    - Client: {"type":"message","text":"...","mode":"hermes|acp|agent_proxy","session_id":"...","agent_id":"...","attachments":[...]}
    - Server: {"type":"thinking"} / {"type":"chunk","text":"..."} / {"type":"done","text":"...","source":"..."} / {"type":"error","message":"..."}
    """
    await websocket.accept()

    token = websocket.query_params.get("token", "")
    if not token:
        await _safe_send_ws(websocket, {"type": "error", "message": "缺少认证令牌"})
        await websocket.close()
        return

    user_id = decode_token(token)
    if not user_id:
        await _safe_send_ws(websocket, {"type": "error", "message": "认证令牌无效或已过期"})
        await websocket.close()
        return

    await _safe_send_ws(websocket, {"type": "connected", "user_id": str(user_id)})
    logger.info(f"WebSocket connected: user={user_id}")

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "message":
                text = data.get("text", "").strip()
                mode = data.get("mode", "hermes")
                session_id = data.get("session_id")
                agent_id = data.get("agent_id")
                attachments = data.get("attachments", [])

                if not text and attachments:
                    image_parts = [a for a in attachments if a.get("type") == "image"]
                    file_parts = [a for a in attachments if a.get("type") == "file"]
                    if image_parts:
                        text = "用户发送了一张图片"
                    elif file_parts:
                        text = f"用户发送了文件: {', '.join(a.get('name', 'file') for a in file_parts)}"

                if not text:
                    await _safe_send_ws(websocket, {"type": "error", "message": "消息内容为空"})
                    continue

                await _safe_send_ws(websocket, {"type": "thinking"})

                try:
                    image_attachments = [a for a in attachments if a.get("type") == "image"]
                    file_attachments = [a for a in attachments if a.get("type") == "file"]

                    if mode == "agent_proxy" and agent_id:
                        # Create or get agent session for persistence
                        agent_session_id = _create_or_get_agent_session(agent_id, session_id)
                        _store_agent_message(agent_session_id, "user", text)
                        response_text, source, success = await run_agent_proxy(agent_id, text)
                        if response_text:
                            _store_agent_message(agent_session_id, "assistant", response_text)
                        # Update title from first user message
                        if not session_id:
                            db = _get_agent_db()
                            try:
                                db.execute(
                                    "UPDATE agent_sessions SET title = ? WHERE id = ? AND title = 'New Chat'",
                                    (text[:50], agent_session_id),
                                )
                                db.commit()
                            finally:
                                db.close()
                    else:
                        acp = get_acp_process()
                        if image_attachments and mode in ("hermes", "acp"):
                            img = image_attachments[0]
                            result = await acp.send_message_with_image(
                                text, img.get("data", ""), img.get("mime_type", "image/png"), session_id
                            )
                            response_text = result.get("response_text", "")
                            source = result.get("source", "acp")
                        elif file_attachments and mode in ("hermes", "acp"):
                            # Handle file attachments - save to temp, pass path to agent
                            f = file_attachments[0]
                            result = await acp.send_message_with_file(
                                text, f.get("data", ""), f.get("name", "file"),
                                f.get("mime_type", "application/octet-stream"), session_id
                            )
                            response_text = result.get("response_text", "")
                            source = result.get("source", "acp")
                        else:
                            # Real streaming: forward chunks as they arrive
                            async for chunk_data in acp.stream_message(text, session_id):
                                if not await _safe_send_ws(websocket, chunk_data):
                                    break
                            continue

                    if response_text:
                        # Stream in chunks for real-time feel
                        chunk_size = 20
                        for i in range(0, len(response_text), chunk_size):
                            chunk = response_text[i : i + chunk_size]
                            if not await _safe_send_ws(websocket, {"type": "chunk", "text": chunk}):
                                break
                            await asyncio.sleep(0.05)
                        # Include session_id in done message for new sessions
                        done_msg = {"type": "done", "text": response_text, "source": source}
                        if mode == "agent_proxy" and agent_id:
                            done_msg["session_id"] = agent_session_id
                        elif result.get("session_id"):
                            done_msg["session_id"] = result["session_id"]
                        await _safe_send_ws(websocket, done_msg)
                    else:
                        await _safe_send_ws(websocket, {"type": "error", "message": "未收到响应，请重试"})

                except TimeoutError:
                    logger.warning("WS chat prompt timeout")
                    await _safe_send_ws(websocket, {"type": "error", "message": "响应超时，请重试"})
                except (BrokenPipeError, OSError, ConnectionResetError) as e:
                    logger.warning(f"WS chat pipe error: {e}")
                    # Try once more
                    try:
                        acp = get_acp_process()
                        result = await acp.send_message(text, session_id)
                        response_text = result.get("response_text", "")
                        source = result.get("source", "hermes")
                        if response_text:
                            await _safe_send_ws(websocket, {"type": "chunk", "text": response_text})
                            await _safe_send_ws(websocket, {"type": "done", "text": response_text, "source": source})
                        else:
                            await _safe_send_ws(websocket, {"type": "error", "message": "连接已断开，请重试"})
                    except Exception as retry_e:
                        logger.error(f"WS chat retry failed: {retry_e}")
                        await _safe_send_ws(websocket, {"type": "error", "message": "连接已断开，请重试"})
                except Exception as e:
                    logger.error(f"WS chat error: {type(e).__name__}: {e}", exc_info=True)
                    await _safe_send_ws(websocket, {"type": "error", "message": "处理消息时出错，请重试"})

            elif msg_type == "ping":
                await _safe_send_ws(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: user={user_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {type(e).__name__}: {e}")
        try:
            await _safe_send_ws(websocket, {"type": "error", "message": "连接异常断开"})
        except Exception:
            pass
