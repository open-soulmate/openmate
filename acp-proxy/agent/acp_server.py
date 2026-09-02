"""ACP WebSocket Server — JSON-RPC 2.0 over NDJSON协议层

实现Agent Client Protocol v1.0 (ACP-1.0)的WebSocket服务端，管理客户端连接和会话生命周期。
状态机：idle → running → input-required → completed / failed

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
    """会话状态枚举 — 严格对齐ACP定义"""
    IDLE = "idle"
    RUNNING = "running"
    INPUT_REQUIRED = "input-required"  # 等待人工审批
    COMPLETED = "completed"
    FAILED = "failed"


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
    """一个独立的Agent会话，包含状态、消息历史、工作目录"""

    def __init__(self, session_id: str, workspace: str, agent_id: str = "openmate-agent"):
        """初始化会话，创建独立上下文和取消事件"""
        self.id = session_id                  # 会话唯一ID
        self.agent_id = agent_id              # Agent标识
        self.state = SessionState.IDLE        # 当前状态
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

    def touch(self):
        """更新最后活跃时间"""
        self.last_active = time.time()

    def is_alive(self, timeout: float = 300) -> bool:
        """检查会话是否还活着（默认5分钟空闲超时）"""
        return (time.time() - self.last_active) < timeout


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
            # 清理该连接绑定的所有会话
            for sid, session in list(self.sessions.items()):
                if session.ws is ws:
                    session.cancel_event.set()
                    if session.task and not session.task.done():
                        session.task.cancel()
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
        """创建新会话 — 分配sessionId，初始化工作目录

        ACP v1.0要求响应包含 session_id、agent_id、created_at
        """
        sid = f"om-{uuid.uuid4().hex[:12]}"
        workspace = params.get("cwd", params.get("workspace", "/home/climbing"))
        agent_id = params.get("agentId", "openmate-agent")
        session = Session(sid, workspace, agent_id)
        session.ws = ws
        session.client_id = params.get("clientId", "")
        self.sessions[sid] = session
        result = {
            "session_id": sid,
            "agent_id": agent_id,
            "created_at": session.created_at,
            "cwd": workspace,
        }
        await self._send_result(ws, msg_id, result)
        logger.info(f"Session created: {sid} agent={agent_id} workspace={workspace}")

    async def _handle_session_prompt(self, msg_id: str, params: dict, ws):
        """接收用户任务指令 — 启动Agent异步任务"""
        sid = params.get("session_id", params.get("sessionId", ""))
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_SESSION_NOT_FOUND, f"Session not found: {sid}")
            return
        if session.state == SessionState.RUNNING:
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS, "Session already running")
            return

        prompt = params.get("prompt", "")
        session.state = SessionState.RUNNING
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
        """带超时的Agent任务执行 — 30分钟最大执行时间"""
        logger.info(f"[{session.id}] Starting agent task")
        try:
            await asyncio.wait_for(
                self._engine_task(session, prompt),
                timeout=1800,  # 30分钟任务超时
            )
        except asyncio.TimeoutError:
            logger.error(f"Task timeout for session {session.id}")
            session.state = SessionState.FAILED
            await self._emit_event(session, EventType.FAILED, {
                "error": "Task execution timed out (30 min limit)",
                "error_code": ERR_TASK_TIMEOUT,
            })
        except asyncio.CancelledError:
            logger.info(f"Task cancelled for session {session.id}")
            session.state = SessionState.COMPLETED
            await self._emit_event(session, EventType.COMPLETED, {
                "summary": "Task was cancelled by user",
            })
        except Exception as e:
            logger.error(f"Task error for session {session.id}: {e}", exc_info=True)
            session.state = SessionState.FAILED
            await self._emit_event(session, EventType.FAILED, {
                "error": str(e),
                "error_code": ERR_AGENT_EXCEPTION,
            })

    async def _echo_response(self, session: Session, prompt: str):
        """无引擎时的echo回显 — 用于阶段1测试"""
        reply = f"Echo: {prompt}"
        # 发送消息事件（流式内容）
        await self._emit_event(session, EventType.MESSAGE, {
            "content": reply,
        })
        session.state = SessionState.COMPLETED
        session.messages.append({"role": "assistant", "content": reply})
        # 发送完成事件
        await self._emit_event(session, EventType.COMPLETED, {
            "summary": reply,
        })

    async def _handle_session_close(self, msg_id: str, params: dict, ws):
        """关闭会话 — 关闭会话、清理资源、销毁实例（ACP v1.0 session.close）"""
        sid = params.get("session_id", params.get("sessionId", ""))
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_SESSION_NOT_FOUND, f"Session not found: {sid}")
            return
        session.cancel_event.set()
        if session.task and not session.task.done():
            session.task.cancel()
        session.state = SessionState.COMPLETED
        # 从会话池中移除
        del self.sessions[sid]
        await self._send_result(ws, msg_id, {"session_id": sid, "status": "destroyed"})
        logger.info(f"Session destroyed: {sid}")

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
            data: 事件负载数据
        """
        params = {
            "session_id": session.id,
            "event_type": event_type.value,
            "timestamp": time.time(),
            **data,
        }
        await self._notify(session.ws, "session.event", params, session=session)

    # ── 以下为供外部引擎调用的公共事件接口 ──────────────────────────

    async def emit_message(self, session: Session, content: str,
                           content_delta: Optional[str] = None):
        """发送消息事件 — 流式或完整内容

        供Agent引擎回调使用，替代原来的 session/update。
        content: 完整内容（累积），content_delta: 本次增量（流式场景）
        """
        data: dict[str, Any] = {"content": content}
        if content_delta is not None:
            data["content_delta"] = content_delta
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
        """定时GC — 每60秒清理死会话和断开的连接"""
        while self._running:
            await asyncio.sleep(60)
            dead_sids = []
            for sid, session in self.sessions.items():
                if not session.is_alive(timeout=600):  # 10分钟无活动
                    dead_sids.append(sid)
            for sid in dead_sids:
                session = self.sessions.pop(sid)
                if session.task and not session.task.done():
                    session.task.cancel()
                logger.info(f"GC: removed dead session {sid}")

    def get_session(self, session_id: str) -> Optional[Session]:
        """获取会话对象"""
        return self.sessions.get(session_id)

    async def shutdown(self):
        """优雅关闭 — 取消所有任务，清理资源"""
        self._running = False
        if self._gc_task:
            self._gc_task.cancel()
        for sid, session in self.sessions.items():
            session.cancel_event.set()
            if session.task and not session.task.done():
                session.task.cancel()
        logger.info("ACP Server shutdown complete")
