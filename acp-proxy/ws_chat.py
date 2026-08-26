"""WebSocket chat endpoint — standalone, no OpenSoul dependency."""

import asyncio
import logging
import shutil
from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from proxy import get_acp_process

logger = logging.getLogger(__name__)
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
    pass

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


# Agent proxy registry
AGENT_REGISTRY = {
    "hermes": {"name": "Hermes Agent", "binary": "hermes", "args": ["-z"]},
    "mimo": {"name": "MiMo Code", "binary": "mimo", "args": ["run", "--prompt"]},
    "claude": {"name": "Claude Code", "binary": "claude", "args": ["-p"]},
    "codex": {"name": "Codex CLI", "binary": "codex", "args": ["-q"]},
    "aider": {"name": "Aider", "binary": "aider", "args": ["--message"]},
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
        return str(e), "error", False


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
        return {"ok": False, "error": "ACP timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
        return {"ok": False, "error": "ACP timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
        await websocket.send_json({"type": "error", "message": "Missing token"})
        await websocket.close()
        return

    user_id = decode_token(token)
    if not user_id:
        await websocket.send_json({"type": "error", "message": "Invalid token"})
        await websocket.close()
        return

    await websocket.send_json({"type": "connected", "user_id": str(user_id)})

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
                    await websocket.send_json({"type": "error", "message": "Empty message"})
                    continue

                await websocket.send_json({"type": "thinking"})

                try:
                    image_attachments = [a for a in attachments if a.get("type") == "image"]

                    if mode == "agent_proxy" and agent_id:
                        response_text, source, success = await run_agent_proxy(agent_id, text)
                    else:
                        acp = get_acp_process()
                        if image_attachments and mode in ("hermes", "acp"):
                            img = image_attachments[0]
                            result = await acp.send_message_with_image(
                                text, img.get("data", ""), img.get("mime_type", "image/png"), session_id
                            )
                            response_text = result.get("response_text", "")
                            source = result.get("source", "acp")
                        else:
                            result = await acp.send_message(text, session_id)
                            response_text = result.get("response_text", "")
                            source = result.get("source", "hermes")

                    if response_text:
                        chunk_size = 20
                        for i in range(0, len(response_text), chunk_size):
                            chunk = response_text[i : i + chunk_size]
                            await websocket.send_json({"type": "chunk", "text": chunk})
                            await asyncio.sleep(0.05)
                        await websocket.send_json({"type": "done", "text": response_text, "source": source})
                    else:
                        await websocket.send_json({"type": "error", "message": "无响应"})

                except (BrokenPipeError, OSError, ConnectionResetError) as e:
                    logger.warning(f"WS chat pipe error: {e}, retrying...")
                    try:
                        acp = get_acp_process()
                        result = await acp.send_message(text, session_id)
                        response_text = result.get("response_text", "")
                        source = result.get("source", "hermes")
                        if response_text:
                            await websocket.send_json({"type": "chunk", "text": response_text})
                            await websocket.send_json({"type": "done", "text": response_text, "source": source})
                        else:
                            await websocket.send_json({"type": "error", "message": "连接已断开，请重试"})
                    except Exception as retry_e:
                        logger.error(f"WS chat retry failed: {retry_e}")
                        await websocket.send_json({"type": "error", "message": "连接已断开，请重试"})
                except Exception as e:
                    logger.error(f"WS chat error: {e}")
                    await websocket.send_json({"type": "error", "message": "处理消息时出错，请重试"})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
