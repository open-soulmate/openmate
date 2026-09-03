"""ACP JSON-RPC 2.0 WebSocket端点 — 多Agent路由

所有agent统一走/ws/acp，ACP Proxy做：
1. JWT鉴权
2. 等待session.create消息，提取agent_id
3. 根据agent_id路由到对应的Agent端点
4. 双向消息透传（不做任何协议转换）

路由规则：
- soulmate → ws://127.0.0.1:8787 (Agent Engine)
- hermes → ws://127.0.0.1:9119 (hermes serve)
- openclaw → openclaw acp --url <gateway_url> (子进程)
- 其他 → fallback到Agent Engine
"""

import asyncio
import json
import logging
import os
from uuid import UUID
import subprocess

import jwt
import websockets
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = logging.getLogger("acp-proxy.ws_acp")

# 读取JWT配置
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

# Agent路由配置：agent_id → 连接方式
AGENT_ROUTES = {
    "soulmate": {"type": "websocket", "url": "ws://127.0.0.1:8787"},
    "hermes": {"type": "websocket", "url": "ws://127.0.0.1:9119"},
    "openclaw": {"type": "subprocess", "cmd": ["openclaw", "acp", "--session", "agent:main:main"]},
}

# 默认路由（未配置的agent走Agent Engine）
DEFAULT_ROUTE = {"type": "websocket", "url": "ws://127.0.0.1:8787"}


def decode_token(token: str) -> str | None:
    """验证JWT token，返回user_id或None"""
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
    """发送JSON-RPC消息给客户端"""
    await ws.send_text(json.dumps(data, ensure_ascii=False))


async def _send_engine(engine_ws, data: dict):
    """发送JSON消息给Agent Engine（websockets库）"""
    await engine_ws.send(json.dumps(data, ensure_ascii=False) + "\n")


async def _connect_agent(route: dict):
    """根据路由配置连接到Agent端点

    Returns:
        engine_ws: WebSocket连接对象
        cleanup: 清理函数（subprocess模式需要）
    """
    if route["type"] == "websocket":
        engine_ws = await websockets.connect(route["url"])
        logger.info(f"[ACP] Connected to agent at {route['url']}")
        return engine_ws, None

    elif route["type"] == "subprocess":
        # 启动子进程，通过stdin/stdout通信
        proc = await asyncio.create_subprocess_exec(
            *route["cmd"],
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        logger.info(f"[ACP] Started subprocess: {route['cmd']}")

        # 创建一个包装器，模拟websockets接口
        class SubprocessBridge:
            """将subprocess stdin/stdout包装成websockets风格接口"""
            def __init__(self, proc):
                self.proc = proc
                self._closed = False

            async def send(self, data):
                if isinstance(data, str):
                    data = data.encode()
                if not data.endswith(b"\n"):
                    data += b"\n"
                self.proc.stdin.write(data)
                await self.proc.stdin.drain()

            async def recv(self):
                line = await self.proc.stdout.readline()
                if not line:
                    raise ConnectionError("Subprocess stdout closed")
                return line.decode().strip()

            def __aiter__(self):
                return self

            async def __anext__(self):
                line = await self.proc.stdout.readline()
                if not line:
                    raise StopAsyncIteration
                return line.decode().strip()

            async def close(self):
                if not self._closed:
                    self._closed = True
                    try:
                        self.proc.stdin.close()
                        self.proc.terminate()
                        await asyncio.wait_for(self.proc.wait(), timeout=5)
                    except Exception:
                        self.proc.kill()

        bridge = SubprocessBridge(proc)
        return bridge, bridge.close

    else:
        raise ValueError(f"Unknown route type: {route['type']}")


async def ws_acp_endpoint(client_ws: WebSocket):
    """/ws/acp WebSocket入口 — ACP JSON-RPC 2.0多Agent路由

    流程：
    1. 从query参数提取token，验证JWT
    2. 等待client发送initialize握手，转发并获取响应
    3. 等待client发送session.create，提取agent_id
    4. 根据agent_id路由到对应Agent端点
    5. 建立双向透传通道
    """
    await client_ws.accept()

    # 提取token
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

    # 等待client发送initialize
    try:
        init_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=10)
    except asyncio.TimeoutError:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Timeout waiting for initialize"}})
        await client_ws.close()
        return
    except WebSocketDisconnect:
        logger.info(f"[ACP] user {user_id} disconnected before initialize")
        return
    except Exception as e:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Invalid JSON: {e}"}})
        await client_ws.close()
        return

    # 验证是initialize请求
    if init_msg.get("method") != "initialize":
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32600, "message": "First message must be initialize"}})
        await client_ws.close()
        return

    # 第一步：连到默认Agent Engine转发initialize，拿到响应
    # （initialize不需要知道agent_id，任何Agent Engine都能处理）
    default_route = DEFAULT_ROUTE
    engine_ws = None
    cleanup_fn = None
    try:
        engine_ws, cleanup_fn = await _connect_agent(default_route)
    except Exception as e:
        logger.error(f"[ACP] Failed to connect to default Agent Engine: {e}")
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32603, "message": f"Agent Engine unavailable: {e}"}})
        await client_ws.close()
        return

    # 转发initialize并返回响应
    try:
        await _send_engine(engine_ws, init_msg)
        raw_resp = await asyncio.wait_for(engine_ws.recv(), timeout=10)
        init_resp = json.loads(raw_resp.strip())
        await _send_acp(client_ws, init_resp)
        logger.info(f"[ACP] initialize handshake OK for user {user_id}")
    except Exception as e:
        logger.error(f"[ACP] initialize failed: {e}")
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32603, "message": f"initialize failed: {e}"}})
        if cleanup_fn:
            await cleanup_fn()
        else:
            await engine_ws.close()
        await client_ws.close()
        return

    # 第二步：等session.create，提取agent_id
    try:
        session_create_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=30)
    except asyncio.TimeoutError:
        logger.warning(f"[ACP] user {user_id} timeout waiting for session.create")
        if cleanup_fn:
            await cleanup_fn()
        else:
            await engine_ws.close()
        await client_ws.close()
        return
    except WebSocketDisconnect:
        logger.info(f"[ACP] user {user_id} disconnected before session.create")
        if cleanup_fn:
            await cleanup_fn()
        else:
            await engine_ws.close()
        return

    # 提取agent_id
    params = session_create_msg.get("params", {})
    agent_id = params.get("agent_id") or params.get("agentId", "soulmate")
    logger.info(f"[ACP] user {user_id} requested agent: {agent_id}")

    # 第三步：如果agent不是soulmate（默认），需要切换到对应agent
    target_route = AGENT_ROUTES.get(agent_id, DEFAULT_ROUTE)
    if agent_id != "soulmate":
        # 关闭默认连接，连接到目标agent
        logger.info(f"[ACP] Switching from default to {agent_id} → {target_route}")
        try:
            if cleanup_fn:
                await cleanup_fn()
            else:
                await engine_ws.close()
        except Exception:
            pass

        try:
            engine_ws, cleanup_fn = await _connect_agent(target_route)
        except Exception as e:
            logger.error(f"[ACP] Failed to connect to agent {agent_id}: {e}")
            await _send_acp(client_ws, {"jsonrpc": "2.0", "id": session_create_msg.get("id"), "error": {"code": -32603, "message": f"Agent {agent_id} unavailable: {e}"}})
            await client_ws.close()
            return

        # 对新agent做initialize握手
        try:
            await _send_engine(engine_ws, init_msg)
            raw_resp = await asyncio.wait_for(engine_ws.recv(), timeout=10)
            # 不需要转发initialize响应给client（已经发过了）
        except Exception as e:
            logger.error(f"[ACP] initialize for {agent_id} failed: {e}")
            await _send_acp(client_ws, {"jsonrpc": "2.0", "id": session_create_msg.get("id"), "error": {"code": -32603, "message": f"Agent {agent_id} init failed: {e}"}})
            if cleanup_fn:
                await cleanup_fn()
            else:
                await engine_ws.close()
            await client_ws.close()
            return

    logger.info(f"[ACP] user {user_id} → agent {agent_id}")

    try:
        # 转发session.create到目标agent
        await _send_engine(engine_ws, session_create_msg)
        raw_resp = await asyncio.wait_for(engine_ws.recv(), timeout=10)
        session_resp = json.loads(raw_resp.strip())
        await _send_acp(client_ws, session_resp)
        logger.info(f"[ACP] session.create forwarded for user {user_id} → {agent_id}")

        # 建立双向透传通道
        await _forward_bidirectional(client_ws, engine_ws, user_id, agent_id)
    except Exception as e:
        logger.error(f"[ACP] Error in session for {agent_id}: {e}", exc_info=True)
    finally:
        try:
            if cleanup_fn:
                await cleanup_fn()
            else:
                await engine_ws.close()
        except Exception:
            pass
        logger.info(f"[ACP] user {user_id} session with {agent_id} ended")


async def _forward_bidirectional(client_ws: WebSocket, engine_ws, user_id: str, agent_id: str):
    """双向透传ACP JSON-RPC消息 — client ↔ agent

    Starlette WebSocket → websockets库（client→engine）
    websockets库 → Starlette WebSocket（engine→client）
    """
    async def forward_to_engine():
        """client → agent engine"""
        try:
            while True:
                raw_msg = await client_ws.receive_text()
                try:
                    msg = json.loads(raw_msg)
                    method = msg.get("method", "")
                    logger.debug(f"[{user_id}] → {agent_id}: {method}")
                    if hasattr(engine_ws, 'send'):
                        if asyncio.iscoroutinefunction(engine_ws.send):
                            await engine_ws.send(raw_msg)
                        else:
                            engine_ws.send(raw_msg)
                    else:
                        await engine_ws.send(raw_msg)
                except json.JSONDecodeError:
                    pass
        except (WebSocketDisconnect, ConnectionError):
            pass
        except Exception as e:
            logger.error(f"[{user_id}] forward_to_engine error: {e}")

    async def forward_from_engine():
        """agent engine → client"""
        try:
            async for raw_msg in engine_ws:
                try:
                    msg = json.loads(raw_msg) if isinstance(raw_msg, str) else json.loads(raw_msg.decode())
                    method = msg.get("method", "")
                    if method == "session.event":
                        event_type = msg.get("params", {}).get("event_type", "")
                        logger.info(f"[{user_id}] engine event: session.event({event_type})")
                    await _send_acp(client_ws, msg)
                except json.JSONDecodeError:
                    logger.warning(f"[{user_id}] engine sent invalid JSON")
            logger.info(f"[{user_id}] engine disconnected")
        except Exception as e:
            logger.error(f"[{user_id}] forward_from_engine error: {e}")

    await asyncio.gather(
        asyncio.create_task(forward_to_engine()),
        asyncio.create_task(forward_from_engine()),
        return_exceptions=True,
    )
