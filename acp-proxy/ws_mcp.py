"""MCP WebSocket长连接端点 — 管控通道。

ws://127.0.0.1:8092/ws/mcp

协议：JSON-RPC 2.0 over WebSocket
- 管控端发送请求（带id），Agent返回响应（带id）
- Agent可主动推送 mcp/system/event 事件（无id）
- 所有请求必须携带 control_token
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("mcp.ws")


async def ws_mcp_endpoint(websocket: WebSocket):
    """MCP WebSocket长连接处理端点。"""
    await websocket.accept()
    logger.info("MCP WebSocket连接建立")

    from mcp.server import _METHOD_HANDLERS, _check_token, _error_response, _event_subscribers

    # 注册为事件订阅者
    _event_subscribers.append(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                resp = _error_response(None, -32700, "JSON解析失败")
                await websocket.send_text(resp.body.decode())
                continue

            rpc_id = body.get("id")
            method = body.get("method", "")
            params = body.get("params", {})

            # control_token校验
            token_err = _check_token(params)
            if token_err:
                resp = _error_response(rpc_id, -32001, token_err)
                await websocket.send_text(resp.body.decode())
                continue

            handler = _METHOD_HANDLERS.get(method)
            if not handler:
                resp = _error_response(rpc_id, -32601, f"未知方法: {method}")
                await websocket.send_text(resp.body.decode())
                continue

            try:
                result = await handler(params, rpc_id)
                await websocket.send_text(result.body.decode())
            except Exception as e:
                logger.error(f"MCP WS方法异常: {method}: {e}")
                resp = _error_response(rpc_id, -32603, f"内部错误: {e}")
                await websocket.send_text(resp.body.decode())

    except WebSocketDisconnect:
        logger.info("MCP WebSocket断开")
    except Exception as e:
        logger.error(f"MCP WebSocket异常: {e}")
    finally:
        if websocket in _event_subscribers:
            _event_subscribers.remove(websocket)
        logger.info("MCP WebSocket清理完成")
