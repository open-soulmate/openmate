"""ACP JSON-RPC 2.0 WebSocket端点 — 纯透传路由

所有agent统一走/ws/acp，ACP Proxy只做：
1. JWT鉴权
2. agent_id路由（从session/new的params中提取）
3. 双向消息透传（不做任何协议转换）
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

# 读取JWT配置
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

# Agent Engine地址
AGENT_ENGINE_URL = os.getenv("AGENT_ENGINE_URL", "ws://127.0.0.1:8787")


def decode_token(token: str) -> UUID | None:
    """Decode JWT and return user UUID, or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            try:
                return UUID(str(user_id))
            except ValueError:
                return UUID(int=int(user_id))
    except Exception as e:
        logger.warning(f"[AUTH] decode failed: {e}")
    return None


async def _send_acp(ws: WebSocket, data: dict):
    """发送ACP JSON-RPC消息到客户端（Starlette WebSocket）"""
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def _send_engine(engine_ws, data: dict):
    """发送ACP JSON-RPC消息到Agent Engine（websockets库）"""
    try:
        await engine_ws.send(json.dumps(data, ensure_ascii=False) + "\n")
    except Exception:
        pass


async def ws_acp_endpoint(client_ws: WebSocket):
    """/ws/acp WebSocket入口 — ACP JSON-RPC 2.0纯透传

    流程：
    1. 从query参数提取token，验证JWT
    2. 等待client发送initialize握手
    3. 连接Agent Engine，转发initialize
    4. 建立双向透传通道
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

    # 等待client发送initialize（Starlette receive_json自动解析JSON）
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
        # Starlette receive_json在JSON解析失败时会抛异常
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Invalid JSON: {e}"}})
        await client_ws.close()
        return

    # 验证是initialize请求
    if init_msg.get("method") != "initialize":
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32600, "message": "First message must be initialize"}})
        await client_ws.close()
        return

    # 连接Agent Engine
    try:
        engine_ws = await websockets.connect(AGENT_ENGINE_URL)
    except Exception as e:
        logger.error(f"[ACP] Failed to connect to Agent Engine: {e}")
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32603, "message": f"Agent Engine unavailable: {e}"}})
        await client_ws.close()
        return

    logger.info(f"[ACP] user {user_id} → Agent Engine at {AGENT_ENGINE_URL}")

    try:
        # 转发initialize到agent engine
        await _send_engine(engine_ws, init_msg)

        # 读取initialize响应并转发给client
        raw_resp = await asyncio.wait_for(engine_ws.recv(), timeout=10)
        init_resp = json.loads(raw_resp.strip())
        await _send_acp(client_ws, init_resp)
        logger.info(f"[ACP] initialize handshake forwarded for user {user_id}")

        # 建立双向透传通道
        await _forward_bidirectional(client_ws, engine_ws, user_id)
    except Exception as e:
        logger.error(f"[ACP] Error in session: {e}", exc_info=True)
    finally:
        try:
            await engine_ws.close()
        except Exception:
            pass
        logger.info(f"[ACP] user {user_id} session ended")


async def _forward_bidirectional(client_ws: WebSocket, engine_ws, user_id):
    """双向透传ACP JSON-RPC消息 — client ↔ agent engine

    Starlette WebSocket → websockets库（client→engine）
    websockets库 → Starlette WebSocket（engine→client）
    """
    async def forward_to_engine():
        """client → agent engine"""
        try:
            while True:
                try:
                    msg = await client_ws.receive_json()
                    method = msg.get("method", msg.get("id", "?"))
                    logger.debug(f"[{user_id}] → engine: {method}")
                    await _send_engine(engine_ws, msg)
                except WebSocketDisconnect:
                    logger.info(f"[{user_id}] client disconnected")
                    break
                except Exception as e:
                    logger.error(f"[{user_id}] forward_to_engine error: {e}")
                    break
        except Exception:
            pass

    async def forward_to_client():
        """agent engine → client"""
        try:
            async for raw_msg in engine_ws:
                try:
                    msg = json.loads(raw_msg.strip())
                    method = msg.get("method", "")
                    # 只记录关键事件
                    if method in ("session/completed", "session/failed"):
                        logger.info(f"[{user_id}] engine event: {method}")
                    await _send_acp(client_ws, msg)
                except json.JSONDecodeError:
                    logger.warning(f"[{user_id}] engine sent invalid JSON")
        except websockets.ConnectionClosed:
            logger.info(f"[{user_id}] engine disconnected")
        except Exception as e:
            logger.error(f"[{user_id}] forward_to_client error: {e}")

    # 双向并发，任一方向结束则取消另一个
    done, pending = await asyncio.wait(
        [asyncio.create_task(forward_to_engine()),
         asyncio.create_task(forward_to_client())],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
