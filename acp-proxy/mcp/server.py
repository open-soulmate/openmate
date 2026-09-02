"""MCP JSON-RPC 2.0 路由模块 — 对齐 MCP v1.0 规范。

提供：
- POST /admin/mcp HTTP端点（运维兜底通道）
- ws://8092/ws/mcp WebSocket长连接（管控通道）
- mcp/agent/start, mcp/agent/stop, mcp/agent/restart
- mcp/config/reload
- mcp/health/check
- mcp/monitor/report
- mcp/system/event 统一事件推送
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import JSONResponse

logger = logging.getLogger("mcp.server")

# MCP control_token（从环境变量读取，默认开发用）
_CONTROL_TOKEN = os.environ.get("MCP_CONTROL_TOKEN", "opensoulmate-mcp-dev")

# 全局Agent实例注册表（内存，后续可持久化）
_instances: dict[str, dict[str, Any]] = {}

# 事件订阅者（WebSocket连接列表）
_event_subscribers: list[WebSocket] = []


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _check_token(params: dict[str, Any]) -> str | None:
    """校验control_token，返回错误信息或None。"""
    token = params.get("control_token", "")
    if token != _CONTROL_TOKEN:
        return "control_token无效"
    return None


def _error_response(request_id: Any, code: int, message: str) -> JSONResponse:
    """构造JSON-RPC错误响应。"""
    return JSONResponse(content={
        "jsonrpc": "2.0", "id": request_id,
        "error": {"code": code, "message": message},
    })


def _success_response(request_id: Any, result: Any) -> JSONResponse:
    """构造JSON-RPC成功响应。"""
    return JSONResponse(content={
        "jsonrpc": "2.0", "id": request_id,
        "result": {"success": True, "code": 0, **result},
    })


async def _emit_event(event_type: str, payload: dict[str, Any], agent_id: str = "", node_id: str = ""):
    """广播MCP系统事件给所有订阅者。"""
    event = {
        "jsonrpc": "2.0",
        "method": "mcp/system/event",
        "params": {
            "agent_id": agent_id,
            "node_id": node_id,
            "event_level": payload.pop("event_level", "info"),
            "event_type": event_type,
            "payload": payload,
        },
    }
    dead = []
    for ws in _event_subscribers:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _event_subscribers.remove(ws)


# ---------------------------------------------------------------------------
# MCP RPC方法处理器
# ---------------------------------------------------------------------------

async def _handle_agent_start(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/agent/start — 启动Agent实例。"""
    agent_id = params.get("agent_id")
    if not agent_id:
        return _error_response(request_id, -32602, "缺少agent_id")

    instance_id = f"inst-{agent_id}-{int(time.time())}"
    _instances[instance_id] = {
        "agent_id": agent_id,
        "instance_id": instance_id,
        "status": "running",
        "started_at": time.time(),
        "pid": os.getpid(),  # 当前进程PID（演示用）
        "resource_quota": params.get("resource_quota", {}),
        "config_version": params.get("config_version", "v1.0"),
        "auto_restart": params.get("auto_restart", True),
    }

    await _emit_event("agent.started", {"instance_id": instance_id}, agent_id=agent_id)
    return _success_response(request_id, {
        "instance_id": instance_id,
        "pid": _instances[instance_id]["pid"],
        "status": "starting",
    })


async def _handle_agent_stop(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/agent/stop — 停止Agent实例。"""
    instance_id = params.get("instance_id")
    if not instance_id:
        return _error_response(request_id, -32602, "缺少instance_id")

    inst = _instances.get(instance_id)
    if not inst:
        return _error_response(request_id, -32002, f"实例不存在: {instance_id}")

    stop_mode = params.get("stop_mode", "graceful")
    inst["status"] = "stopped"
    inst["stop_mode"] = stop_mode

    await _emit_event("agent.stopped", {"instance_id": instance_id, "mode": stop_mode}, agent_id=inst["agent_id"])
    return _success_response(request_id, {"instance_id": instance_id, "status": "stopped"})


async def _handle_agent_restart(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/agent/restart — 重启Agent实例。"""
    instance_id = params.get("instance_id")
    if not instance_id:
        return _error_response(request_id, -32602, "缺少instance_id")

    inst = _instances.get(instance_id)
    if not inst:
        return _error_response(request_id, -32002, f"实例不存在: {instance_id}")

    inst["status"] = "running"
    inst["restarted_at"] = time.time()

    await _emit_event("agent.started", {"instance_id": instance_id, "restart": True}, agent_id=inst["agent_id"])
    return _success_response(request_id, {"instance_id": instance_id, "status": "restarted"})


async def _handle_config_reload(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/config/reload — 配置热更新。"""
    instance_id = params.get("instance_id")
    update_keys = params.get("update_keys", [])
    new_config = params.get("new_config", {})
    dry_run = params.get("dry_run", False)

    if dry_run:
        return _success_response(request_id, {
            "dry_run": True,
            "update_keys": update_keys,
            "valid": True,
        })

    if instance_id and instance_id in _instances:
        _instances[instance_id]["config_version"] = new_config.get("version", "v1.0")

    await _emit_event("config.updated", {"update_keys": update_keys}, agent_id=instance_id or "")
    return _success_response(request_id, {"update_keys": update_keys, "reloaded": True})


async def _handle_health_check(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/health/check — 健康巡检。"""
    instance_id = params.get("instance_id")

    if instance_id:
        inst = _instances.get(instance_id)
        if not inst:
            return _error_response(request_id, -32002, f"实例不存在: {instance_id}")
        healthy = inst["status"] == "running"
        await _emit_event("health.pass" if healthy else "health.fail", {"instance_id": instance_id})
        return _success_response(request_id, {
            "instance_id": instance_id,
            "healthy": healthy,
            "status": inst["status"],
            "uptime_s": int(time.time() - inst["started_at"]),
        })

    # 全局巡检
    results = []
    for iid, inst in _instances.items():
        healthy = inst["status"] == "running"
        results.append({"instance_id": iid, "healthy": healthy, "status": inst["status"]})

    return _success_response(request_id, {"instances": results, "total": len(results)})


async def _handle_monitor_report(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/monitor/report — 资源指标上报。"""
    instance_id = params.get("instance_id")
    metrics = params.get("metrics", {})

    if instance_id and instance_id in _instances:
        _instances[instance_id]["last_metrics"] = metrics
        _instances[instance_id]["last_report_at"] = time.time()

    return _success_response(request_id, {"acknowledged": True})


async def _handle_system_restart(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """mcp/system/restart — 网关/系统重启。"""
    target = params.get("target", "gateway")
    await _emit_event("system.restarting", {"target": target})
    return _success_response(request_id, {"target": target, "restarting": True})


# ---------------------------------------------------------------------------
# 方法分发表
# ---------------------------------------------------------------------------

_METHOD_HANDLERS: dict[str, Any] = {
    "mcp/agent/start": _handle_agent_start,
    "mcp/agent/stop": _handle_agent_stop,
    "mcp/agent/restart": _handle_agent_restart,
    "mcp/config/reload": _handle_config_reload,
    "mcp/health/check": _handle_health_check,
    "mcp/monitor/report": _handle_monitor_report,
    "mcp/system/restart": _handle_system_restart,
}


# ---------------------------------------------------------------------------
# 路由器
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/admin/mcp", tags=["MCP"])


@router.post("")
async def mcp_jsonrpc_endpoint(request: Request):
    """MCP JSON-RPC 2.0 HTTP入口 (/admin/mcp)。"""
    try:
        body = await request.json()
    except Exception:
        return _error_response(None, -32700, "JSON解析失败")

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    # control_token校验
    token_err = _check_token(params)
    if token_err:
        return _error_response(rpc_id, -32001, token_err)

    handler = _METHOD_HANDLERS.get(method)
    if not handler:
        return _error_response(rpc_id, -32601, f"未知方法: {method}")

    try:
        return await handler(params, rpc_id)
    except Exception as e:
        logger.error(f"MCP方法执行异常: {method}: {e}")
        return _error_response(rpc_id, -32603, f"内部错误: {e}")


@router.get("/instances")
async def list_instances():
    """列出所有已注册的Agent实例（调试用）。"""
    return JSONResponse(content=list(_instances.values()))
