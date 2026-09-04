"""ACP WebSocket端点 — 所有Agent统一通过stdio子进程连接

传输层：WebSocket(前端) ↔ ACP Proxy ↔ stdio子进程(Agent)
- SoulMate: python -m agent.start --stdio
- Hermes: hermes acp
- OpenClaw: openclaw acp

ACP Proxy只做消息转发，不做任何协议转换。
"""

import asyncio
import json
import logging
import os
from uuid import UUID

import jwt
import websockets
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = logging.getLogger("acp-proxy.ws_acp")

# JWT配置
_OPSOUL_ENV = {}
_env_path = "/home/climbing/opensoul/.env"
try:
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                _OPSOUL_ENV[k.strip()] = v.strip().strip('"').strip("'")
except FileNotFoundError:
    pass

JWT_SECRET = os.getenv("JWT_SECRET", _OPSOUL_ENV.get("JWT_SECRET", "openmate-jwt-secret"))
JWT_ALGORITHM = "HS256"

# Agent路由配置：agent_id → subprocess命令
AGENT_ROUTES = {
    "soulmate": {"cmd": ["python", "-m", "agent.start", "--stdio"], "cwd": "/home/climbing/openmate/acp-proxy"},
    "hermes": {"cmd": ["hermes", "acp"], "cwd": "/home/climbing"},
    "openclaw": {"cmd": ["openclaw", "acp"], "cwd": "/home/climbing"},
    "opencode": {"cmd": ["opencode", "acp"], "cwd": "/home/climbing"},
}

# 默认路由
DEFAULT_ROUTE = {"cmd": ["python", "-m", "agent.start", "--stdio"], "cwd": "/home/climbing/openmate/acp-proxy"}


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub") or payload.get("user_id")
        if uid:
            try:
                return str(UUID(uid))
            except ValueError:
                return uid
        return None
    except jwt.ExpiredSignatureError:
        logger.warning("[ACP] Token expired")
        return None
    except jwt.InvalidTokenError:
        logger.warning("[ACP] Invalid token")
        return None


async def _send_acp(ws: WebSocket, data: dict):
    await ws.send_text(json.dumps(data, ensure_ascii=False))


async def ws_acp_endpoint(client_ws: WebSocket):
    """//ws/acp WebSocket入口 — ACP JSON-RPC 2.0多Agent路由

    流程（ACP v1.0）：
    1. JWT鉴权
    2. 等待 initialize + session/new 消息提取agent_id
    3. 启动对应agent的stdio子进程
    4. 双向透传：WebSocket ↔ subprocess stdin/stdout
    """
    await client_ws.accept()

    token = client_ws.query_params.get("token", "")
    if not token:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Missing token"}})
        await client_ws.close()
        return

    user_id = decode_token(token)
    if not user_id:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid token"}})
        await client_ws.close()
        return

    logger.info(f"[ACP] user {user_id} connected")

    # 收集客户端消息，等newSession来确定agent_id
    init_msg = None
    session_msg = None
    agent_id = None
    route = None

    # 先等initialize
    try:
        init_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=10)
    except Exception as e:
        logger.warning(f"[ACP] Failed to receive initialize: {e}")
        await client_ws.close()
        return

    if init_msg.get("method") != "initialize":
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32600, "message": "First message must be initialize"}})
        await client_ws.close()
        return

    # 先等newSession确定agent_id，再启动子进程
    # 初始化消息暂存，等newSession到了一起发
    buffered_msgs = [init_msg]
    
    # 等session/new（或newSession兼容旧前端）
    try:
        session_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=30)
        buffered_msgs.append(session_msg)
    except Exception as e:
        logger.warning(f"[ACP] Failed to receive newSession: {e}")
        await client_ws.close()
        return

    # 提取agent_id
    params = session_msg.get("params", {})
    agent_id = params.get("agent_id") or params.get("agentId", "soulmate")
    route = AGENT_ROUTES.get(agent_id, DEFAULT_ROUTE)
    logger.info(f"[ACP] user {user_id} → agent {agent_id} → {route['cmd']}")

    # 启动Agent子进程
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *route["cmd"],
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=route.get("cwd"),
        )
        # 增大 readline 限制（某些 agent 输出超长单行，如 opencode）
        proc.stdout._limit = 1024 * 1024  # 1MB
        logger.info(f"[ACP] Started {agent_id} subprocess (pid={proc.pid})")
    except Exception as e:
        logger.error(f"[ACP] Failed to start {agent_id}: {e}")
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": session_msg.get("id"), "error": {"code": -32603, "message": f"Agent {agent_id} unavailable: {e}"}})
        await client_ws.close()
        return

    # 转发所有缓冲消息到子进程（initialize + session/new）
    try:
        for msg in buffered_msgs:
            _msg = json.dumps(msg, ensure_ascii=False)
            proc.stdin.write((_msg + "\n").encode())
            await proc.stdin.drain()
    except Exception as e:
        logger.error(f"[ACP] Failed to forward initial messages: {e}")
        proc.terminate()
        await client_ws.close()
        return

    # 双向透传：WebSocket ↔ subprocess
    async def ws_to_stdin():
        """WebSocket → subprocess stdin"""
        try:
            while True:
                raw = await client_ws.receive_text()
                proc.stdin.write((raw + "\n").encode())
                await proc.stdin.drain()
        except (WebSocketDisconnect, ConnectionError):
            pass
        except Exception as e:
            logger.debug(f"[{user_id}] ws_to_stdin: {e}")
        finally:
            try:
                proc.stdin.close()
            except Exception:
                pass

    async def stdout_to_ws():
        """subprocess stdout → WebSocket"""
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                msg = line.decode().strip()
                if not msg:
                    continue
                # 跳过非 JSON 行（某些 agent 的 banner/版本信息，如 openclaw）
                try:
                    json.loads(msg)
                except (json.JSONDecodeError, ValueError):
                    logger.debug(f"[{agent_id}] skip non-JSON: {msg[:100]}")
                    continue
                await client_ws.send_text(msg)
        except (WebSocketDisconnect, ConnectionError):
            pass
        except Exception as e:
            logger.debug(f"[{user_id}] stdout_to_ws: {e}")

    async def stderr_drain():
        """subprocess stderr → log"""
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                logger.debug(f"[{agent_id}] {line.decode().strip()}")
        except Exception:
            pass

    t1 = asyncio.create_task(ws_to_stdin())
    t2 = asyncio.create_task(stdout_to_ws())
    t3 = asyncio.create_task(stderr_drain())

    try:
        # 等待任一任务完成（WebSocket断开或子进程退出）
        done, pending = await asyncio.wait(
            [t1, t2], return_when=asyncio.FIRST_COMPLETED
        )
        for t in pending:
            t.cancel()
    finally:
        t3.cancel()
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=5)
        except Exception:
            proc.kill()
        logger.info(f"[ACP] user {user_id} session with {agent_id} ended")
