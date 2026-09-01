"""ACP WebSocket Server — JSON-RPC 2.0 over NDJSON协议层

实现Agent Client Protocol(ACP)的WebSocket服务端，管理客户端连接和会话生命周期。
状态机：idle → running → input-required → completed / failed
"""

import asyncio
import json
import logging
import time
import uuid
from enum import Enum
from typing import Any, Callable, Coroutine, Optional

import websockets

logger = logging.getLogger("acp-agent.server")


class SessionState(str, Enum):
    """会话状态枚举 — 严格对齐ACP定义"""
    IDLE = "idle"
    RUNNING = "running"
    INPUT_REQUIRED = "input-required"  # 等待人工审批
    COMPLETED = "completed"
    FAILED = "failed"


class Session:
    """一个独立的Agent会话，包含状态、消息历史、工作目录"""

    def __init__(self, session_id: str, workspace: str):
        """初始化会话，创建独立上下文和取消事件"""
        self.id = session_id                  # 会话唯一ID
        self.state = SessionState.IDLE        # 当前状态
        self.messages: list[dict] = []        # 消息历史
        self.workspace = workspace            # 工作目录
        self.task: Optional[asyncio.Task] = None           # 正在运行的Agent任务
        self.cancel_event = asyncio.Event()                  # 取消信号
        self.permission_futures: dict[str, asyncio.Future] = {}  # 审批请求→Future
        self.created_at = time.time()         # 创建时间
        self.last_active = time.time()        # 最后活跃时间
        self.ws: Optional[Any] = None         # 绑定的WebSocket连接
        self.client_id: str = ""              # 客户端标识

    def touch(self):
        """更新最后活跃时间"""
        self.last_active = time.time()

    def is_alive(self, timeout: float = 300) -> bool:
        """检查会话是否还活着（默认5分钟空闲超时）"""
        return (time.time() - self.last_active) < timeout


# JSON-RPC 2.0 错误码
ERR_PARSE = -32700       # JSON解析错误
ERR_INVALID_REQ = -32600  # 无效请求
ERR_METHOD_NOT_FOUND = -32601  # 方法不存在
ERR_INVALID_PARAMS = -32602    # 参数错误
ERR_INTERNAL = -32603    # 内部错误
ERR_TASK_TIMEOUT = -32001  # 任务超时


class ACPServer:
    """ACP WebSocket Server — 管理所有客户端连接和会话

    实现完整的ACP协议：initialize握手、session生命周期、权限审批、心跳保活。
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

        # ACP方法路由表
        handlers = {
            "initialize": self._handle_initialize,
            "session/new": self._handle_session_new,
            "session/prompt": self._handle_session_prompt,
            "session/cancel": self._handle_session_cancel,
            "permission/approve": self._handle_permission_approve,
            "permission/deny": self._handle_permission_deny,
        }

        handler = handlers.get(method)
        if handler:
            await handler(msg_id, params, ws)
        else:
            await self._send_error(ws, msg_id, ERR_METHOD_NOT_FOUND, f"Unknown method: {method}")

    async def _handle_initialize(self, msg_id: str, params: dict, ws):
        """处理ACP initialize握手 — 协议版本协商，上报capabilities"""
        result = {
            "protocolVersion": "2025-07-28",
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
        logger.info("ACP initialize handshake completed")

    async def _handle_session_new(self, msg_id: str, params: dict, ws):
        """创建新会话 — 分配sessionId，初始化工作目录"""
        sid = f"om-{uuid.uuid4().hex[:12]}"
        workspace = params.get("cwd", params.get("workspace", "/home/climbing"))
        session = Session(sid, workspace)
        session.ws = ws
        session.client_id = params.get("clientId", "")
        self.sessions[sid] = session
        result = {"sessionId": sid, "cwd": workspace}
        await self._send_result(ws, msg_id, result)
        logger.info(f"Session created: {sid} workspace={workspace}")

    async def _handle_session_prompt(self, msg_id: str, params: dict, ws):
        """接收用户任务指令 — 启动Agent异步任务"""
        sid = params.get("sessionId", "")
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS, f"Session not found: {sid}")
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
        await self._send_result(ws, msg_id, {"sessionId": sid, "status": "accepted"})

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
        try:
            await asyncio.wait_for(
                self._engine_task(session, prompt),
                timeout=1800,  # 30分钟任务超时
            )
        except asyncio.TimeoutError:
            logger.error(f"Task timeout for session {session.id}")
            session.state = SessionState.FAILED
            await self._notify(session.ws, "session/failed", {
                "sessionId": session.id,
                "error": "Task execution timed out (30 min limit)",
            })
        except asyncio.CancelledError:
            logger.info(f"Task cancelled for session {session.id}")
            session.state = SessionState.COMPLETED
            await self._notify(session.ws, "session/completed", {
                "sessionId": session.id,
                "summary": "Task was cancelled by user",
            })
        except Exception as e:
            logger.error(f"Task error for session {session.id}: {e}", exc_info=True)
            session.state = SessionState.FAILED
            await self._notify(session.ws, "session/failed", {
                "sessionId": session.id,
                "error": str(e),
            })

    async def _echo_response(self, session: Session, prompt: str):
        """无引擎时的echo回显 — 用于阶段1测试"""
        reply = f"Echo: {prompt}"
        await self._notify(session.ws, "session/update", {
            "sessionId": session.id,
            "content": reply,
        })
        session.state = SessionState.COMPLETED
        session.messages.append({"role": "assistant", "content": reply})
        await self._notify(session.ws, "session/completed", {
            "sessionId": session.id,
            "summary": reply,
        })

    async def _handle_session_cancel(self, msg_id: str, params: dict, ws):
        """取消正在运行的会话任务"""
        sid = params.get("sessionId", "")
        session = self.sessions.get(sid)
        if not session:
            await self._send_error(ws, msg_id, ERR_INVALID_PARAMS, f"Session not found: {sid}")
            return
        session.cancel_event.set()
        if session.task and not session.task.done():
            session.task.cancel()
        session.state = SessionState.COMPLETED
        await self._send_result(ws, msg_id, {"sessionId": sid, "status": "cancelled"})
        logger.info(f"Session cancelled: {sid}")

    async def _handle_permission_approve(self, msg_id: str, params: dict, ws):
        """处理审批通过响应"""
        request_id = params.get("requestId", "")
        sid = params.get("sessionId", "")
        session = self.sessions.get(sid)
        if session and request_id in session.permission_futures:
            session.permission_futures[request_id].set_result(True)
        await self._send_result(ws, msg_id, {"requestId": request_id, "approved": True})

    async def _handle_permission_deny(self, msg_id: str, params: dict, ws):
        """处理审批拒绝响应"""
        request_id = params.get("requestId", "")
        sid = params.get("sessionId", "")
        session = self.sessions.get(sid)
        if session and request_id in session.permission_futures:
            session.permission_futures[request_id].set_result(False)
        await self._send_result(ws, msg_id, {"requestId": request_id, "approved": False})

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

    async def _notify(self, ws, method: str, params: dict):
        """发送ACP通知（无id字段，Agent→Client方向）"""
        if not ws:
            return
        notify = {"jsonrpc": "2.0", "method": method, "params": params}
        try:
            await ws.send(json.dumps(notify, ensure_ascii=False) + "\n")
        except Exception:
            logger.warning(f"Failed to send notification: {method}")

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
