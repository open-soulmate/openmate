"""A2A WebSocket长连接端点 — Agent间双向通信。

ws://127.0.0.1:8092/ws/a2a

协议：JSON-RPC 2.0 over WebSocket
- 客户端发送请求（带id），服务端返回响应（带id）
- 服务端可主动推送 a2a/event 事件（无id）
- 支持 a2a/task/delegate, a2a/task/result, a2a/task/cancel, a2a/artifact/sync, a2a/agent/heartbeat
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("a2a.ws")


async def ws_a2a_endpoint(websocket: WebSocket):
    """A2A WebSocket长连接处理端点。

    接收JSON-RPC 2.0报文，复用HTTP端点的处理器分发。
    支持双向通信：客户端请求+服务端主动推送。
    """
    await websocket.accept()
    logger.info("A2A WebSocket连接建立")

    # 导入HTTP端点的处理器（复用同一套逻辑）
    from a2a.server import _METHOD_HANDLERS, _error_response
    from a2a.models import JSONRPC_PARSE_ERROR, JSONRPC_INVALID_REQUEST, JSONRPC_METHOD_NOT_FOUND

    # 启动心跳检测任务
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket))

    try:
        while True:
            # 接收JSON-RPC报文
            raw = await websocket.receive_text()

            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                resp = _error_response(None, JSONRPC_PARSE_ERROR, "JSON解析失败")
                await websocket.send_text(resp.body if isinstance(resp.body, str) else resp.body.decode())
                continue

            # 解析请求
            rpc_id = body.get("id")
            method = body.get("method", "")
            params = body.get("params", {})

            # 事件推送（无id，不需响应）
            if rpc_id is None and method:
                logger.debug(f"A2A事件推送: {method}")
                continue

            # 方法分发
            handler = _METHOD_HANDLERS.get(method)
            if not handler:
                resp = _error_response(
                    rpc_id, JSONRPC_METHOD_NOT_FOUND,
                    f"未知方法: {method}。支持: {list(_METHOD_HANDLERS.keys())}",
                )
                await websocket.send_text(resp.body if isinstance(resp.body, str) else resp.body.decode())
                continue

            try:
                result = await handler(params, rpc_id)
                # result是JSONResponse，提取body
                await websocket.send_text(result.body.decode())
            except Exception as e:
                logger.error(f"A2A WS方法执行异常: {method}: {e}")
                resp = _error_response(rpc_id, -32603, f"内部错误: {e}")
                await websocket.send_text(resp.body if isinstance(resp.body, str) else resp.body.decode())

    except WebSocketDisconnect:
        logger.info("A2A WebSocket连接断开")
    except Exception as e:
        logger.error(f"A2A WebSocket异常: {e}")
    finally:
        heartbeat_task.cancel()
        logger.info("A2A WebSocket清理完成")


async def _heartbeat_loop(websocket: WebSocket):
    """定期发送心跳ping，检测连接存活。"""
    try:
        while True:
            await asyncio.sleep(30)
            try:
                await websocket.send_json({"jsonrpc": "2.0", "method": "a2a/event", "params": {"event_type": "heartbeat"}})
            except Exception:
                break
    except asyncio.CancelledError:
        pass
