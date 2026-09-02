"""ACP WebSocket Server — JSON-RPC 2.0 over NDJSON协议层

实现Agent Client Protocol v1.0 (ACP-1.0)的WebSocket服务端，管理客户端连接和会话生命周期。

Session v1.0 六态状态机：
    init → active ↔ frozen
    active/frozen → destroy_pending → destroyed (终态不可逆)

协议版本：ACP-1.0
所有事件统一走 session.event，通过 event_type 字段区分类型。
"""

import asyncio
import json
import logging
import sys
import time
import uuid
from enum import Enum
from typing import Any, Callable, Coroutine, Optional

import websockets

# 确保日志输出到stderr，不污染stdout的JSON-RPC协议流
logger = logging.getLogger("acp-agent.server")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)


class SessionState(str, Enum):
    """Session v1.0 六态状态机枚举

    生命周期流转：
        init → active ↔ frozen
        active/frozen → destroy_pending → destroyed
        destroyed 是终态，不可逆
    """
    INIT = "init"                      # 初始化中，未就绪
    ACTIVE = "active"                  # 活跃，可接收消息和执行任务
    FROZEN = "frozen"                  # 冻结，暂停新任务，快照落地
    RESUMING = "resuming"              # 恢复中，从快照加载
    DESTROY_PENDING = "destroy_pending"  # 待销毁，拒绝新请求
    DESTROYED = "destroyed"            # 已销毁，不可恢复


# ── 合法状态流转映射表 ──────────────────────────────────────────────
_VALID_TRANSITIONS: dict[SessionState, set[SessionState]] = {
    SessionState.INIT: {SessionState.ACTIVE},
    SessionState.ACTIVE: {SessionState.FROZEN, SessionState.DESTROY_PENDING},
    SessionState.FROZEN: {SessionState.ACTIVE, SessionState.RESUMING, SessionState.DESTROY_PENDING},
    SessionState.RESUMING: {SessionState.ACTIVE},
    SessionState.DESTROY_PENDING: {SessionState.DESTROYED},
    SessionState.DESTROYED: set(),  # 终态，不可逆
}


class InvalidStateTransition(Exception):
    """非法状态流转异常 — 当尝试不允许的状态转换时抛出"""
    pass


def validate_transition(from_state: SessionState, to_state: SessionState) -> None:
    """验证状态流转是否合法，非法流转抛出 InvalidStateTransition

    Args:
        from_state: 当前状态
        to_state: 目标状态

    Raises:
        InvalidStateTransition: 当流转不合法时
    """
    allowed = _VALID_TRANSITIONS.get(from_state, set())
    if to_state not in allowed:
        raise InvalidStateTransition(
            f"非法状态流转: {from_state.value} → {to_state.value}，"
            f"允许的目标状态: {[s.value for s in allowed]}"
        )


# ACP v1.0 事件类型常量
class EventType(str, Enum):
    """ACP v1.0 统一事件类型 — 所有事件通过 session.event 分发"""
    MESSAGE = "agent.message"              # 流式文本输出
    COMPLETED = "session.completed"        # 任务正常结束
    FAILED = "session.error"              # 会话异常
    PERMISSION_REQUEST = "human.approval.required"  # 人工审批请求
    TOOL_CALL = "agent.tool_call"        # 工具调用触发
    SKILL_STATE = "agent.state.update"   # SKILL.state状态同步


class Session:
    """一个独立的Agent会话 — Session v1.0 六态生命周期管理

    状态流转：init → active ↔ frozen → destroy_pending → destroyed
    支持超时自动冻结、快照保存/恢复、资源清理。
    """

    def __init__(self, session_id: str, workspace: str, agent_id: str = "openmate-agent",
                 idle_timeout_seconds: float = 1800.0):
        """初始化会话 — 初始状态为 init，需立即通过 session/create 转为 active

        Args:
            session_id: 会话唯一ID
            workspace: 工作目录
            agent_id: Agent标识
            idle_timeout_seconds: 空闲超时自动冻结秒数，默认1800秒(30分钟)
        """
        self.id = session_id                  # 会话唯一ID
        self.agent_id = agent_id              # Agent标识
        self.state = SessionState.INIT        # 初始状态：init
        self.messages: list[dict] = []        # 消息历史
        self.workspace = workspace            # 工作目录
        self.task: Optional[asyncio.Task] = None           # 正在运行的Agent任务
        self.cancel_event = asyncio.Event()                  # 取消信号
        self.permission_futures: dict[str, asyncio.Future] = {}  # 审批请求→Future
        self.created_at = time.time()         # 创建时间
        self.last_active = time.time()        # 最后活跃时间
        self.ws: Optional[Any] = None         # 绑定的WebSocket连接
        self.ws_lock = asyncio.Lock()         # WS写入锁（防止并发send冲突）
        self.client_id: str = ""              # 客户端标识
        self.idle_timeout_seconds = idle_timeout_seconds  # 空闲超时阈值
        self.snapshot: Optional[dict] = None  # 冻结快照数据（freeze时保存）

    def touch(self):
        """更新最后活跃时间"""
        self.last_active = time.time()

    def is_alive(self, timeout: float = 300) -> bool:
        """检查会话是否还活着（默认5分钟空闲超时）"""
        return (time.time() - self.last_active) < timeout

    def is_idle_expired(self) -> bool:
        """检查会话是否超过空闲超时阈值，应被自动冻结"""
        if self.state != SessionState.ACTIVE:
            return False
        return (time.time() - self.last_active) > self.idle_timeout_seconds

    def freeze(self) -> dict:
        """冻结会话 — 状态→frozen，保存快照到内存

        快照包含会话元数据，用于后续恢复。
        仅在 active 状态下可调用。

        Returns:
            dict: 快照数据（包含session_id、state、messages、workspace等）

        Raises:
            InvalidStateTransition: 当前状态不允许冻结
        """
        validate_transition(self.state, SessionState.FROZEN)
        self.snapshot = {
            "session_id": self.id,
            "agent_id": self.agent_id,
            "workspace": self.workspace,
            "client_id": self.client_id,
            "messages": list(self.messages),  # 消息历史副本
            "created_at": self.created_at,
            "frozen_at": time.time(),
        }
        self.state = SessionState.FROZEN
        logger.info(f"[{self.id}] Session frozen, snapshot saved")
        return self.snapshot

    def resume(self) -> None:
        """恢复会话 — 状态→resuming→active，从快照加载数据

        仅在 frozen 状态下可调用。恢复后快照保留（可再次冻结）。

        Raises:
            InvalidStateTransition: 当前状态不允许恢复
        """
        validate_transition(self.state, SessionState.RESUMING)
        self.state = SessionState.RESUMING
        logger.info(f"[{self.id}] Session resuming from snapshot")
        # 从快照恢复（如果有）
        if self.snapshot:
            self.messages = list(self.snapshot.get("messages", []))
        # 直接转为 active
        self.state = SessionState.ACTIVE
        self.touch()
        logger.info(f"[{self.id}] Session resumed to active")

    def destroy(self) -> None:
        """销毁会话 — 状态→destroy_pending→destroyed，清理所有资源

        仅在 active 或 frozen 状态下可调用。
        destroyed 是终态，不可逆。

        Raises:
            InvalidStateTransition: 当前状态不允许销毁
        """
        validate_transition(self.state, SessionState.DESTROY_PENDING)
        self.state = SessionState.DESTROY_PENDING
        # 取消正在运行的任务
        self.cancel_event.set()
        if self.task and not self.task.done():
            self.task.cancel()
        # 清理审批Future
        for future in self.permission_futures.values():
            if not future.done():
                future.cancel()
        self.permission_futures.clear()
        # 转为终态
        self.state = SessionState.DESTROYED
        self.snapshot = None  # 释放快照
        logger.info(f"[{self.id}] Session destroyed")


# ACP v1.0 标准错误码
ERR_PARSE = -32700              # JSON解析错误
ERR_INVALID_REQ = -32600        # 无效请求
ERR_METHOD_NOT_FOUND = -32601   # 方法不存在
ERR_INVALID_PARAMS = -32602     # 参数非法
ERR_INTERNAL = -32603           # 内部错误
ERR_AUTH_FAILED = -32001        # 鉴权失败
ERR_SESSION_NOT_FOUND = -32002  # Session不存在
ERR_AGENT_EXCEPTION = -32003    # Agent进程异常
ERR_APPROVAL_REJECTED = -32004  # 审批被拒绝
ERR_TASK_TIMEOUT = -32005       # 任务超时


class ACPServer:
    """ACP WebSocket Server — 管理所有客户端连接和会话

    实现ACP-1.0协议：initialize握手、session生命周期、权限审批、心跳保活。
    所有事件统一走 session.event，通过 event_type 区分类型。
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8787):
        """初始化ACP Server，绑定地址和端口"""
        self.host = host                      # 监听地址
        self.port = port                      # 监听端口
        self.sessions: dict[str, Session] = {}  # sessionId → Session
        self._clients: set = set()            # 活跃WebSocket连接集合
        self._engine_task: Optional[Callable] = None  # Agent引擎回调
        self._gc_task: Optional[asyncio.Task] = None   # GC定时任务
        self._running = False                 # 服务运行标志

    def set_engine_callback(self, callback: Callable[..., Coroutine]):
        """注册Agent引擎回调 — session/prompt时调用"""
        self._engine_task = callback

    async def serve(self):
        """启动WebSocket服务器，开始监听客户端连接"""
        self._running = True
        # 启动GC定时任务，每60秒清理死会话
        self._gc_task = asyncio.create_task(self._gc_loop())
        logger.info(f"ACP Server starting on ws://{self.host}:{self.port}")
        async with websockets.serve(
            self._handle_client,
            self.host,
            self.port,
            ping_interval=10,     # 每10秒发一次ping
            ping_timeout=15,      # 15秒无pong判定断开
            max_size=10 * 1024 * 1024,  # 10MB消息上限
        ) as server:
            logger.info(f"ACP Server ready on ws://{self.host}:{self.port}")
            await asyncio.Future()  # 永久运行

    async def _handle_client(self, ws):
        """处理单个客户端连接的主循环 — 接收NDJSON消息并分发"""
        self._clients.add(ws)
        client_addr = ws.remote_address
        logger.info(f"Client connected: {client_addr}")
        try:
            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg.strip())
                    await self._dispatch(msg, ws)
                except json.JSONDecodeError:
                    await self._send_error(ws, None, ERR_PARSE, "Invalid JSON")
                except Exception as e:
                    logger.error(f"Dispatch error: {e}", exc_info=True)
                    msg_id = None
                    try:
                        msg_id = json.loads(raw_msg).get("id")
                    except Exception:
                        pass
                    await self._send_error(ws, msg_id, ERR_INTERNAL, str(e))
        except websockets.ConnectionClosed:
            logger.info(f"Client disconnected: {client_addr}")
        finally:
            self._clients.discard(ws)
            # 清理该连接绑定的所有会话（走destroy流程）
            for sid, session in list(self.sessions.items()):
                if session.ws is ws:
                    try:
                        session.destroy()
                    except InvalidStateTransition:
                        pass  # 已销毁的跳过
                    del self.sessions[sid]
                    logger.info(f"Cleaned up session {sid} from disconnected client")

    async def _dispatch(self, msg: dict, ws):
        """路由ACP方法到对应的处理器"""
        method = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params", {})

        # ACP v1.0 方法路由表
        handlers = {
            "initialize": self._handle_initialize,
            "session.create": self._handle_session_create,
            "session.prompt": self._handle_session_prompt,
            "session.close": self._handle_session_close,
            "session.approval": self._handle_session_approval,
        }

        handler = handlers.get(method)
        if handler:
            await handler(msg_id, params, ws)
        else:
            await self._send_error(ws, msg_id, ERR_METHOD_NOT_FOUND, f"Unknown method: {method}")

    async def _handle_initialize(self, msg_id: str, params: dict, ws):
        """处理ACP initialize握手 — 协议版本协商，上报capabilities"""
        result = {
            "protocolVersion": "ACP-1.0",
            "agent": {
                "name": "OpenMate Agent",
                "version": "0.1.0",
                "description": "OpenMate内置Vibe Coding Agent",
            },
            "capabilities": {
                "session": True,
                "artifacts": True,
                "permissionRequests": True,
                "cancellation": True,
            },
        }
        await self._send_result(ws, msg_id, result)
        logger.info("ACP initialize handshake completed (ACP-1.0)")

    async def _handle_session_create(self, msg_id: str, params: dict, ws):
        """创建新会话 — init→active，分配sessionId，初始化工作目录

        ACP v1.0要求响应包含 session_id、agent_id、created_at
        Session v1.0: 创建后立即从 init 转为 active 状态
        """
        sid = f"om-{uuid.uuid4().hex[:12]}"
        workspace = params.get("cwd", params.get("workspace", "/home/climbing"))
        agent_id = params.get("agentId", "openmate-agent")
        idle_timeout = params.get("idleTimeoutSeconds", 1800.0)
        session = Session(sid, workspace, agent_id, idle_timeout_seconds=idle_timeout)
        session.ws = ws
        session.client_id = params.get("clientId", "")
        # init → active：创建后立即激活
        validate_transition(session.state, SessionState.ACTIVE)
        session.state = SessionState.ACTIVE
        session.touch()
        self.sessions[sid] = session
        result = {
            "session_id": sid,
            "agent_id": agent_id,
            "created_at": session.created_at,
            "cwd": workspace,
            "state": session.state.value,
        }
        await self._send_result(ws, msg_id, result)
        logger.info(f"Session created: {sid} agent={agent_id} workspace={workspace} state=active")

    async def _handle_session_prompt(self, msg_id: str, params: dict, ws):
        """接收用户任务指令 — 仅active状态可接收，启动Agent异步任务

        Session v1.0: 状态必须为 active 才能接收新消息
        """
        sid = params.get("session_id", params.get("sessionId", ""))
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_SESSION_NOT_FOUND, f"Session not found: {sid}")
            return
        # Session v1.0: 必须是 active 状态才能接收消息
        if session.state != SessionState.ACTIVE:
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS,
                                   f"Session not active (current state: {session.state.value})")
            return

        prompt = params.get("prompt", "")
        session.cancel_event.clear()
        session.touch()
        session.messages.append({"role": "user", "content": prompt})

        # 先返回ack，再异步执行Agent任务
        await self._send_result(ws, msg_id, {"session_id": sid, "status": "accepted"})

        # 启动Agent引擎任务
        if self._engine_task:
            session.task = asyncio.create_task(
                self._run_with_timeout(session, prompt)
            )
        else:
            # 没有引擎，直接echo回复
            await self._echo_response(session, prompt)

    async def _run_with_timeout(self, session: Session, prompt: str):
        """带超时的Agent任务执行 — 30分钟最大执行时间

        Session v1.0: 任务完成/失败后，session保持active状态，可接受新任务
        """
        logger.info(f"[{session.id}] Starting agent task")
        try:
            await asyncio.wait_for(
                self._engine_task(session, prompt),
                timeout=1800,  # 30分钟任务超时
            )
            # 任务完成后保持 active 状态，等待下一个 prompt
            session.touch()
        except asyncio.TimeoutError:
            logger.error(f"Task timeout for session {session.id}")
            # 超时后保持 active，报告错误但不改变生命周期状态
            session.touch()
            await self._emit_event(session, EventType.FAILED, {
                "error": "Task execution timed out (30 min limit)",
                "error_code": ERR_TASK_TIMEOUT,
            })
        except asyncio.CancelledError:
            logger.info(f"Task cancelled for session {session.id}")
            session.touch()
            await self._emit_event(session, EventType.COMPLETED, {
                "summary": "Task was cancelled by user",
            })
        except Exception as e:
            logger.error(f"Task error for session {session.id}: {e}", exc_info=True)
            # 异常后保持 active，报告错误但不改变生命周期状态
            session.touch()
            await self._emit_event(session, EventType.FAILED, {
                "error": str(e),
                "error_code": ERR_AGENT_EXCEPTION,
            })

    async def _echo_response(self, session: Session, prompt: str):
        """无引擎时的echo回显 — 用于阶段1测试

        Session v1.0: 回显完成后保持 active 状态
        """
        reply = f"Echo: {prompt}"
        # 发送消息事件（流式内容）
        await self._emit_event(session, EventType.MESSAGE, {
            "content": reply,
        })
        session.messages.append({"role": "assistant", "content": reply})
        session.touch()
        # 发送完成事件
        await self._emit_event(session, EventType.COMPLETED, {
            "summary": reply,
        })

    async def _handle_session_close(self, msg_id: str, params: dict, ws):
        """关闭会话 — 走destroy流程：active/frozen→destroy_pending→destroyed

        Session v1.0: 使用 Session.destroy() 方法进行规范的状态流转和资源清理
        """
        sid = params.get("session_id", params.get("sessionId", ""))
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_SESSION_NOT_FOUND, f"Session not found: {sid}")
            return
        # 已经是终态，直接返回
        if session.state == SessionState.DESTROYED:
            await self._send_result(ws, msg_id, {"session_id": sid, "status": "already_destroyed"})
            return
        # 已经在销毁中，等待完成
        if session.state == SessionState.DESTROY_PENDING:
            await self._send_result(ws, msg_id, {"session_id": sid, "status": "destroy_pending"})
            return
        try:
            session.destroy()  # active/frozen → destroy_pending → destroyed
        except InvalidStateTransition as e:
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS, str(e))
            return
        # 从会话池中移除
        del self.sessions[sid]
        await self._send_result(ws, msg_id, {"session_id": sid, "status": "destroyed"})
        logger.info(f"Session destroyed via close: {sid}")

    async def _handle_session_approval(self, msg_id: str, params: dict, ws):
        """处理审批决议 — ACP v1.0 session.approval

        params: { session_id, request_id, action: "approve" | "reject", comment: "" }
        """
        request_id = params.get("request_id", params.get("requestId", ""))
        sid = params.get("session_id", params.get("sessionId", ""))
        action = params.get("action", "")

        if action not in ("approve", "reject"):
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS,
                                   f"Invalid action: {action}, must be 'approve' or 'reject'")
            return

        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_SESSION_NOT_FOUND, f"Session not found: {sid}")
            return

        approved = (action == "approve")
        if request_id in session.permission_futures:
            session.permission_futures[request_id].set_result(approved)

        await self._send_result(ws, msg_id, {
            "request_id": request_id,
            "action": action,
            "resolved": True,
        })

    # ── 事件发送（ACP v1.0 统一 session.event） ──────────────────────

    async def _emit_event(self, session: Session, event_type: EventType, data: dict):
        """发送ACP v1.0统一事件 — 所有事件走 session.event，通过event_type区分

        Args:
            session: 目标会话
            event_type: 事件类型（EventType枚举值）
            data: 事件负载数据（放入payload字段）
        """
        params = {
            "session_id": session.id,
            "event_type": event_type.value,
            "payload": data,
        }
        await self._notify(session.ws, "session.event", params, session=session)

    # ── 以下为供外部引擎调用的公共事件接口 ──────────────────────────

    async def emit_message(self, session: Session, content: str,
                           content_delta: Optional[str] = None):
        """发送消息事件 — 流式或完整内容

        供Agent引擎回调使用，替代原来的 session/update。
        content: 完整内容（累积），content_delta: 本次增量（流式场景）
        ACP v1.0 payload格式：chunk=增量文本，content=累积文本
        """
        data: dict[str, Any] = {"content": content}
        if content_delta is not None:
            data["chunk"] = content_delta
        await self._emit_event(session, EventType.MESSAGE, data)

    async def emit_completed(self, session: Session, summary: str = "",
                             artifacts: Optional[list] = None):
        """发送任务完成事件 — 替代原来的 session/completed"""
        data: dict[str, Any] = {"summary": summary}
        if artifacts:
            data["artifacts"] = artifacts
        await self._emit_event(session, EventType.COMPLETED, data)

    async def emit_failed(self, session: Session, error: str,
                          error_code: int = ERR_AGENT_EXCEPTION):
        """发送任务失败事件 — 替代原来的 session/failed"""
        await self._emit_event(session, EventType.FAILED, {
            "error": error,
            "error_code": error_code,
        })

    async def emit_permission_request(self, session: Session, request_id: str,
                                      action: str, description: str = "",
                                      details: Optional[dict] = None):
        """发送权限审批请求事件 — 替代原来的 permission/request

        Args:
            session: 目标会话
            request_id: 审批请求唯一ID
            action: 请求审批的操作（如 "file_write", "shell_exec"）
            description: 人类可读的审批描述
            details: 操作详情（如文件路径、命令内容等）
        """
        data: dict[str, Any] = {
            "request_id": request_id,
            "action": action,
            "description": description,
        }
        if details:
            data["details"] = details
        await self._emit_event(session, EventType.PERMISSION_REQUEST, data)

    async def request_human_approval(self, session: Session,
                                      tool_name: str,
                                      risk_level: str = "medium",
                                      description: str = "",
                                      timeout: float = 300) -> bool:
        """ACP v1.0 人工审批流程 — 发送human.approval.required事件并等待用户响应

        Agent引擎在执行高危操作前调用此方法，阻塞等待前端用户审批。
        用户点击"批准"返回True，点击"拒绝"返回False，超时返回False。

        Args:
            session: 目标会话
            tool_name: 工具名称（browser | shell | write_file | delete_file）
            risk_level: 风险等级（low | medium | high）
            description: 即将执行的操作说明
            timeout: 审批超时秒数，默认300秒（5分钟）

        Returns:
            bool: True=批准, False=拒绝或超时

        ACP v1.0事件格式:
            event_type: human.approval.required
            payload: { request_id, tool_name, risk_level, description }
        """
        # 生成唯一审批请求ID
        request_id = f"apr-{uuid.uuid4().hex[:12]}"

        # Session v1.0: 审批期间保持 active 状态，不切换到 INPUT_REQUIRED
        # （INPUT_REQUIRED 已从状态机中移除，审批是业务流程而非生命周期状态）

        # 创建Future，等待前端session/approval回传
        loop = asyncio.get_event_loop()
        future: asyncio.Future[bool] = loop.create_future()
        session.permission_futures[request_id] = future

        # 发送human.approval.required事件给前端
        await self._emit_event(session, EventType.PERMISSION_REQUEST, {
            "request_id": request_id,
            "tool_name": tool_name,
            "risk_level": risk_level,
            "description": description,
        })
        logger.info(f"[{session.id}] 审批请求已发送: request_id={request_id} tool={tool_name} risk={risk_level}")

        try:
            # 阻塞等待用户审批，超时返回False
            approved = await asyncio.wait_for(future, timeout=timeout)
            logger.info(f"[{session.id}] 审批结果: request_id={request_id} approved={approved}")
            return approved
        except asyncio.TimeoutError:
            logger.warning(f"[{session.id}] 审批超时: request_id={request_id} ({timeout}s)")
            return False
        finally:
            # 清理Future引用
            session.permission_futures.pop(request_id, None)
            # Session v1.0: 审批期间保持 active，无需恢复状态
            session.touch()

    async def emit_tool_call(self, session: Session, tool_name: str,
                             arguments: Optional[dict] = None,
                             call_id: Optional[str] = None):
        """发送工具调用事件（预留接口）— 工具调用触发时发"""
        data: dict[str, Any] = {"tool_name": tool_name}
        if arguments:
            data["arguments"] = arguments
        if call_id:
            data["call_id"] = call_id
        await self._emit_event(session, EventType.TOOL_CALL, data)

    async def emit_skill_state(self, session: Session, skill_name: str,
                               state: str, details: Optional[dict] = None):
        """发送技能状态同步事件（预留接口）— SKILL.state状态同步"""
        data: dict[str, Any] = {
            "skill_name": skill_name,
            "state": state,
        }
        if details:
            data["details"] = details
        await self._emit_event(session, EventType.SKILL_STATE, data)

    # ── JSON-RPC 底层发送 ──────────────────────────────────────────

    async def _send_result(self, ws, msg_id: str, result: Any):
        """发送JSON-RPC 2.0成功响应"""
        resp = {"jsonrpc": "2.0", "id": msg_id, "result": result}
        try:
            await ws.send(json.dumps(resp, ensure_ascii=False) + "\n")
        except Exception:
            logger.warning(f"Failed to send result to client, msg_id={msg_id}")

    async def _send_error(self, ws, msg_id: str, code: int, message: str):
        """发送JSON-RPC 2.0错误响应"""
        resp = {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}
        try:
            await ws.send(json.dumps(resp, ensure_ascii=False) + "\n")
        except Exception:
            logger.warning(f"Failed to send error to client: {message}")

    async def _notify(self, ws, method: str, params: dict, session: Optional[Session] = None):
        """发送ACP通知（无id字段，Agent→Client方向）"""
        if not ws:
            return
        notify = {"jsonrpc": "2.0", "method": method, "params": params}
        try:
            if session and hasattr(session, 'ws_lock'):
                async with session.ws_lock:
                    await ws.send(json.dumps(notify, ensure_ascii=False) + "\n")
            else:
                await ws.send(json.dumps(notify, ensure_ascii=False) + "\n")
        except Exception:
            logger.warning(f"Failed to send notification: {method}")

    # ── 生命周期管理 ──────────────────────────────────────────────

    async def _gc_loop(self):
        """定时GC — 每60秒检查：自动冻结空闲会话、清理死会话

        Session v1.0 增强：
        - 空闲超时的 active 会话自动冻结（freeze）
        - 超过10分钟无活动的 destroyed/frozen 会话从池中移除
        """
        while self._running:
            await asyncio.sleep(60)
            dead_sids = []
            freeze_sids = []
            for sid, session in self.sessions.items():
                # 空闲超时的 active 会话自动冻结
                if session.is_idle_expired():
                    freeze_sids.append(sid)
                # 超过10分钟无活动的非active会话清理
                elif not session.is_alive(timeout=600) and session.state != SessionState.ACTIVE:
                    dead_sids.append(sid)
            # 自动冻结空闲会话
            for sid in freeze_sids:
                session = self.sessions.get(sid)
                if session and session.state == SessionState.ACTIVE:
                    try:
                        session.freeze()
                        logger.info(f"GC: auto-froze idle session {sid}")
                    except InvalidStateTransition:
                        pass  # 状态已变化，跳过
            # 清理死会话
            for sid in dead_sids:
                session = self.sessions.pop(sid)
                if session.task and not session.task.done():
                    session.task.cancel()
                logger.info(f"GC: removed dead session {sid}")

    def get_session(self, session_id: str) -> Optional[Session]:
        """获取会话对象"""
        return self.sessions.get(session_id)

    async def shutdown(self):
        """优雅关闭 — 遍历所有会话走destroy流程，取消GC任务"""
        self._running = False
        if self._gc_task:
            self._gc_task.cancel()
        for sid, session in self.sessions.items():
            try:
                session.destroy()
            except InvalidStateTransition:
                pass  # 已销毁的跳过
        logger.info("ACP Server shutdown complete")
