"""A2A HTTP Server 路由模块。

在FastAPI app上挂载 /a2a 路由前缀，提供：
- JSON-RPC 2.0 端点（tasks/send, tasks/get, tasks/cancel, tasks/sendSubscribe等）
- AgentCard well-known 端点（/.well-known/agent.json）
- AgentCard 查询端点（/a2a/agents）
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from a2a.models import (
    A2A_INVALID_TASK_STATE,
    A2A_TASK_NOT_CANCELABLE,
    A2A_TASK_NOT_FOUND,
    A2A_UNSUPPORTED_OPERATION,
    Artifact,
    JSONRPC_INVALID_PARAMS,
    JSONRPC_INVALID_REQUEST,
    JSONRPC_METHOD_NOT_FOUND,
    JSONRPC_PARSE_ERROR,
    JSONRPCRequest,
    JSONRPCResponse,
    JSONRPCError,
    Message,
    TaskState,
    TextPart,
)
from a2a.sse_events import (
    A2ACompletedEvent,
    A2AErrorEvent,
    MessageAppendedEvent,
    NewArtifactEvent,
    TaskStatusChangedEvent,
)
from a2a.stream_manager import get_stream_manager
from a2a.bridge import get_bridge
from a2a.task_store import TaskStore
from a2a.agent_card import get_agent_card, list_agent_cards
from a2a.security import verify_auth
from a2a.push_notify import (
    get_push_config,
    push_task_event,
    register_push_config,
    remove_push_config,
)
from a2a.logger import log_error, log_request, log_response, log_task_event

logger = logging.getLogger("a2a.server")

# 全局TaskStore实例（惰性初始化）
_task_store: TaskStore | None = None


def get_task_store() -> TaskStore:
    """获取全局TaskStore单例。"""
    global _task_store
    if _task_store is None:
        _task_store = TaskStore()
    return _task_store


# ---------------------------------------------------------------------------
# 路由器
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/a2a", tags=["A2A"])


def _error_response(request_id: Any, code: int, message: str,
                    data: Any = None) -> JSONResponse:
    """构造JSON-RPC错误响应。"""
    resp = JSONRPCResponse(
        id=request_id if request_id is not None else 0,
        error=JSONRPCError(code=code, message=message, data=data),
    )
    return JSONResponse(content=resp.model_dump(), status_code=200)


def _success_response(request_id: Any, result: Any) -> JSONResponse:
    """构造JSON-RPC成功响应。"""
    resp = JSONRPCResponse(id=request_id, result=result)
    return JSONResponse(content=resp.model_dump(exclude_none=True))


# ---------------------------------------------------------------------------
# JSON-RPC 方法处理器
# ---------------------------------------------------------------------------

async def _handle_tasks_send(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/send 方法：创建新Task并启动Agent任务。

    params:
        sessionId: str (可选)
        message: Message - 初始消息
        metadata: dict (可选)
    """
    message_data = params.get("message")
    if not message_data:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 message 参数")

    session_id = params.get("sessionId")
    metadata = params.get("metadata")
    msg = Message(**message_data)

    store = get_task_store()
    task = await store.create_task(
        session_id=session_id,
        initial_message=msg,
        metadata=metadata,
    )

    # 启动后台Agent任务
    asyncio.create_task(_agent_task_worker(task.id, msg))

    return _success_response(request_id, task.model_dump(exclude_none=True))


async def _handle_tasks_get(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/get 方法：查询Task状态。

    params:
        taskId: str - Task ID
        historyLength: int (可选) - 返回的history消息数量上限
    """
    task_id = params.get("taskId")
    if not task_id:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 taskId 参数")

    store = get_task_store()
    task = await store.get_task(task_id)
    if not task:
        return _error_response(request_id, A2A_TASK_NOT_FOUND, f"Task不存在: {task_id}")

    # 可选截断history
    history_length = params.get("historyLength")
    if history_length is not None and isinstance(history_length, int) and history_length >= 0:
        task.history = task.history[-history_length:]

    return _success_response(request_id, task.model_dump(exclude_none=True))


async def _handle_tasks_cancel(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/cancel 方法：取消Task。

    params:
        taskId: str - Task ID
    """
    task_id = params.get("taskId")
    if not task_id:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 taskId 参数")

    store = get_task_store()
    task = await store.get_task(task_id)
    if not task:
        return _error_response(request_id, A2A_TASK_NOT_FOUND, f"Task不存在: {task_id}")

    if task.status.state in (TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELED, TaskState.REJECTED):
        return _error_response(request_id, A2A_TASK_NOT_CANCELABLE,
                               f"Task处于终态 {task.status.state.value}，无法取消")

    try:
        task = await store.update_task_status(task_id, TaskState.CANCELED)
    except ValueError as e:
        return _error_response(request_id, A2A_INVALID_TASK_STATE, str(e))

    return _success_response(request_id, task.model_dump(exclude_none=True))


async def _handle_tasks_create(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/create 方法：创建新Task。

    params:
        sessionId: str (可选)
        message: Message (可选) - 初始消息
        metadata: dict (可选)
    """
    store = get_task_store()
    session_id = params.get("sessionId")
    message_data = params.get("message")
    metadata = params.get("metadata")

    initial_message = Message(**message_data) if message_data else None

    task = await store.create_task(
        session_id=session_id,
        initial_message=initial_message,
        metadata=metadata,
    )
    return _success_response(request_id, task.model_dump(exclude_none=True))


async def _agent_task_worker(task_id: str, message: Message | None) -> None:
    """后台Agent任务执行worker — 通过bridge调用Agent Engine。

    连接Agent Engine(端口8787)的ACP WebSocket，将A2A任务转发给内置Agent，
    流式接收结果并通过stream_manager广播A2A SSE事件。
    """
    store = get_task_store()
    stream = get_stream_manager()
    bridge = get_bridge()

    await bridge.run_task(task_id, message, store, stream)


async def _handle_tasks_send_subscribe(params: dict[str, Any], request_id: Any) -> EventSourceResponse:
    """处理 tasks/sendSubscribe 方法：SSE流式订阅。

    创建Task后启动后台Agent任务，返回SSE事件流。
    客户端通过SSE接收状态变更、消息追加、Artifact产出等事件。
    """
    task_id = params.get("taskId")
    message_data = params.get("message")
    session_id = params.get("sessionId")
    metadata = params.get("metadata")

    store = get_task_store()
    stream = get_stream_manager()

    # 创建或获取Task
    if task_id:
        task = await store.get_task(task_id)
        if not task:
            # Task不存在，创建新的
            initial_msg = Message(**message_data) if message_data else None
            task = await store.create_task(
                session_id=session_id,
                initial_message=initial_msg,
                metadata=metadata,
            )
            task_id = task.id
        else:
            # Task存在，追加消息
            if message_data:
                msg = Message(**message_data)
                await store.add_message(task_id, msg)
    else:
        # 创建新Task
        initial_msg = Message(**message_data) if message_data else None
        task = await store.create_task(
            session_id=session_id,
            initial_message=initial_msg,
            metadata=metadata,
        )
        task_id = task.id

    # 订阅SSE事件流
    queue = stream.subscribe(task_id)

    # 启动后台Agent任务
    msg = Message(**message_data) if message_data else None
    asyncio.create_task(_agent_task_worker(task_id, msg))

    async def event_generator() -> AsyncGenerator:
        """SSE事件生成器。"""
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield {
                    "event": event.type,
                    "data": json.dumps(event.model_dump(), ensure_ascii=False),
                }
        finally:
            stream.unsubscribe(task_id, queue)

    return EventSourceResponse(event_generator())


async def _handle_tasks_transition(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/transition 方法：转换Task状态。

    params:
        taskId: str
        state: str - 目标状态
        message: Message (可选) - 状态变更附加消息
    """
    task_id = params.get("taskId")
    state_str = params.get("state")

    if not task_id or not state_str:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 taskId 或 state 参数")

    try:
        target_state = TaskState(state_str)
    except ValueError:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, f"无效的状态值: {state_str}")

    message_data = params.get("message")
    status_message = Message(**message_data) if message_data else None

    store = get_task_store()
    try:
        task = await store.update_task_status(task_id, target_state, status_message)
    except ValueError as e:
        return _error_response(request_id, A2A_INVALID_TASK_STATE, str(e))

    return _success_response(request_id, task.model_dump(exclude_none=True))


async def _handle_push_notification_set(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/pushNotification/set 方法：注册推送通知配置。

    params:
        taskId: str - Task ID
        url: str - 回调URL
        token: str (可选) - 回调鉴权Token
    """
    task_id = params.get("taskId")
    url = params.get("url")

    if not task_id:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 taskId 参数")
    if not url:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 url 参数")

    store = get_task_store()
    task = await store.get_task(task_id)
    if not task:
        return _error_response(request_id, A2A_TASK_NOT_FOUND, f"Task不存在: {task_id}")

    config: dict[str, Any] = {"url": url}
    if params.get("token"):
        config["token"] = params["token"]
    register_push_config(task_id, config)

    return _success_response(request_id, {"taskId": task_id, "url": url, "registered": True})


async def _handle_push_notification_get(params: dict[str, Any], request_id: Any) -> JSONResponse:
    """处理 tasks/pushNotification/get 方法：查询推送通知配置。

    params:
        taskId: str - Task ID
    """
    task_id = params.get("taskId")
    if not task_id:
        return _error_response(request_id, JSONRPC_INVALID_PARAMS, "缺少 taskId 参数")

    config = get_push_config(task_id)
    if not config:
        return _success_response(request_id, {"taskId": task_id, "registered": False})

    # 返回时隐藏token
    return _success_response(request_id, {
        "taskId": task_id,
        "url": config.get("url"),
        "registered": True,
    })


# ---------------------------------------------------------------------------
# 方法分发表
# ---------------------------------------------------------------------------

_METHOD_HANDLERS: dict[str, Any] = {
    "tasks/send": _handle_tasks_send,
    "tasks/get": _handle_tasks_get,
    "tasks/cancel": _handle_tasks_cancel,
    "tasks/create": _handle_tasks_create,
    "tasks/transition": _handle_tasks_transition,
    "tasks/sendSubscribe": _handle_tasks_send_subscribe,
    "tasks/pushNotification/set": _handle_push_notification_set,
    "tasks/pushNotification/get": _handle_push_notification_get,
}


# ---------------------------------------------------------------------------
# JSON-RPC 统一入口
# ---------------------------------------------------------------------------

@router.post("")
async def jsonrpc_endpoint(request: Request):
    """A2A JSON-RPC 2.0 统一入口。

    接收JSON-RPC请求，分发到对应的处理器。
    所有A2A方法通过 method 字段区分。
    tasks/sendSubscribe 返回 EventSourceResponse（SSE流），其余返回 JSONResponse。
    """
    # 鉴权（默认跳过，A2A_SKIP_AUTH=true）
    auth_err = await verify_auth(request)
    if auth_err:
        return auth_err

    try:
        body = await request.json()
    except Exception:
        return _error_response(None, JSONRPC_PARSE_ERROR, "JSON解析失败")

    # 支持批量请求
    if isinstance(body, list):
        # 批量JSON-RPC（暂不实现，返回错误）
        return _error_response(None, JSONRPC_INVALID_REQUEST, "暂不支持批量JSON-RPC请求")

    # 解析单个请求
    try:
        rpc_req = JSONRPCRequest(**body)
    except Exception as e:
        return _error_response(body.get("id"), JSONRPC_INVALID_REQUEST, f"无效的请求格式: {e}")

    method = rpc_req.method
    params = rpc_req.params or {}

    handler = _METHOD_HANDLERS.get(method)
    if not handler:
        return _error_response(
            rpc_req.id, JSONRPC_METHOD_NOT_FOUND,
            f"未知方法: {method}。支持的方法: {list(_METHOD_HANDLERS.keys())}",
        )

    # 全链路日志：请求入口 + 计时
    client_ip = request.client.host if request.client else ""
    timer = log_request(method, rpc_req.id, client_ip)

    try:
        result = await handler(params, rpc_req.id)
        log_response(method, rpc_req.id, timer, status="ok")
        return result
    except Exception as e:
        log_error(f"A2A方法执行异常: {method}", e)
        log_response(method, rpc_req.id, timer, status="error", error_code=-32603)
        return _error_response(rpc_req.id, -32603, f"内部错误: {e}")


# ---------------------------------------------------------------------------
# AgentCard 端点
# ---------------------------------------------------------------------------

@router.get("/agents")
async def list_agents() -> JSONResponse:
    """列出所有已注册的AgentCard。"""
    cards = list_agent_cards()
    return JSONResponse(content=[c.model_dump() for c in cards])


@router.get("/agents/{name}")
async def get_agent(name: str) -> JSONResponse:
    """根据名称获取单个AgentCard。"""
    card = get_agent_card(name)
    if not card:
        return JSONResponse(
            content={"error": f"Agent不存在: {name}"},
            status_code=404,
        )
    return JSONResponse(content=card.model_dump())


# ---------------------------------------------------------------------------
# well-known AgentCard 路由（需挂载到根路径）
# ---------------------------------------------------------------------------

well_known_router = APIRouter(tags=["A2A-WellKnown"])


@well_known_router.get("/.well-known/agent.json")
async def well_known_agent_card() -> JSONResponse:
    """标准 well-known AgentCard 端点。

    默认返回 SoulMate 的AgentCard（主入口Agent）。
    可通过 ?agent=xxx 查询参数指定其他Agent。
    """
    # 默认返回soulmate（主Agent）
    card = get_agent_card("soulmate")
    if not card:
        return JSONResponse(content={"error": "AgentCard注册表为空"}, status_code=500)
    return JSONResponse(content=card.model_dump())
