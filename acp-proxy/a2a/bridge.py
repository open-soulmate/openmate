"""A2A ↔ Agent Engine 桥接层。

通过WebSocket连接内置Agent Engine(端口8787)，使用ACP JSON-RPC 2.0 over NDJSON协议，
将A2A tasks/sendSubscribe请求转换为ACP session/prompt调用，
并将ACP session/update事件转换为A2A SSE事件广播给订阅者。

协议流程：
  A2A Client → bridge → Agent Engine (ACP WebSocket)
  1. initialize握手
  2. session/new创建会话
  3. session/prompt提交任务
  4. 接收session/update(contentDelta) → MessageAppendedEvent
  5. 接收session/completed → A2ACompletedEvent
  6. 接收session/failed → A2AErrorEvent
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import websockets

from a2a.models import Message, TaskState, TextPart
from a2a.sse_events import (
    A2ACompletedEvent,
    A2AErrorEvent,
    MessageAppendedEvent,
    TaskStatusChangedEvent,
)
from a2a.stream_manager import StreamManager
from a2a.task_store import TaskStore
from a2a.push_notify import push_task_event, remove_push_config
from a2a.logger import log_error, log_task_event

logger = logging.getLogger("a2a.bridge")


def _ensure_str(value: Any) -> str:
    """将任意类型安全转换为str，防止list/dict拼接str时TypeError。"""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(str(item) for item in value)
    if value is None:
        return ""
    return str(value)

# Agent Engine WebSocket地址
AGENT_ENGINE_WS_URL = "ws://127.0.0.1:8787"

# 桥接层客户端信息
CLIENT_INFO = {"name": "a2a-bridge", "version": "1.0.0"}


class AgentEngineBridge:
    """A2A ↔ Agent Engine WebSocket桥接器。

    管理与Agent Engine的WebSocket连接，执行ACP握手，
    将A2A任务请求转发给Agent Engine并流式接收结果。
    """

    def __init__(self, ws_url: str = AGENT_ENGINE_WS_URL):
        """初始化桥接器。

        Args:
            ws_url: Agent Engine WebSocket地址
        """
        self._ws_url = ws_url
        self._msg_id: int = 0

    async def run_task(
        self,
        task_id: str,
        message: Message | None,
        store: TaskStore,
        stream: StreamManager,
    ) -> None:
        """执行A2A任务 — 通过Agent Engine处理并流式广播结果。

        完整流程：连接WS → initialize → session/new → session/prompt →
        接收事件 → 转换为A2A SSE事件 → 广播 → 标记完成。

        Args:
            task_id: A2A Task ID
            message: 用户消息（可为None）
            store: TaskStore实例
            stream: StreamManager实例
        """
        try:
            log_task_event(task_id, "bridge_start")

            # 状态变更: SUBMITTED → WORKING
            task = await store.update_task_status(task_id, TaskState.WORKING)
            status_event = TaskStatusChangedEvent(
                taskId=task_id,
                state=TaskState.WORKING,
                timestamp=task.status.timestamp,
            )
            await stream.broadcast(task_id, status_event)
            await push_task_event(task_id, "statusChanged", status_event.model_dump())
            log_task_event(task_id, "status_changed", "WORKING")

            # 连接Agent Engine并执行任务
            await self._connect_and_run(task_id, message, store, stream)

            # 状态变更: WORKING → COMPLETED
            task = await store.get_task(task_id)
            if task and task.status.state != TaskState.FAILED:
                task = await store.update_task_status(task_id, TaskState.COMPLETED)
                completed_event = A2ACompletedEvent(
                    taskId=task_id,
                    task=task,
                )
                await stream.broadcast(task_id, completed_event)
                await push_task_event(task_id, "completed", completed_event.model_dump())
                log_task_event(task_id, "completed")

        except Exception as e:
            log_error("桥接任务执行异常", e, task_id=task_id)
            try:
                await store.update_task_status(task_id, TaskState.FAILED)
            except Exception:
                pass
            error_event = A2AErrorEvent(
                taskId=task_id,
                code=-32603,
                message=str(e),
            )
            await stream.broadcast(task_id, error_event)
            await push_task_event(task_id, "error", error_event.model_dump())
        finally:
            remove_push_config(task_id)
            await stream.close(task_id)

    async def _connect_and_run(
        self,
        task_id: str,
        message: Message | None,
        store: TaskStore,
        stream: StreamManager,
    ) -> None:
        """连接Agent Engine并执行完整的ACP任务流程。

        Args:
            task_id: A2A Task ID
            message: 用户消息
            store: TaskStore实例
            stream: StreamManager实例
        """
        # 提取用户文本
        user_text = ""
        if message and message.parts:
            for part in message.parts:
                if isinstance(part, TextPart):
                    user_text += part.text

        if not user_text:
            user_text = "(空消息)"

        try:
            async with websockets.connect(self._ws_url) as ws:
                logger.info(f"[{task_id}] 已连接Agent Engine: {self._ws_url}")

                # Step 1: initialize握手
                await self._acp_initialize(ws)

                # Step 2: session/new创建会话
                session_id = await self._acp_session_new(ws)
                logger.info(f"[{task_id}] ACP会话已创建: {session_id}")

                # Step 3: session/prompt提交任务并接收流式响应
                await self._acp_session_prompt(
                    ws, session_id, user_text, task_id, store, stream
                )

        except websockets.ConnectionClosed as e:
            logger.error(f"[{task_id}] WebSocket连接断开: {e}")
            raise RuntimeError(f"Agent Engine连接断开: {e}")
        except OSError as e:
            logger.error(f"[{task_id}] 无法连接Agent Engine: {e}")
            raise RuntimeError(f"无法连接Agent Engine({self._ws_url}): {e}")

    async def _acp_initialize(self, ws) -> None:
        """发送ACP initialize握手请求。

        Args:
            ws: WebSocket连接
        """
        result = await self._rpc(ws, "initialize", {
            "protocolVersion": 1,
            "clientInfo": CLIENT_INFO,
        })
        agent_name = result.get("agent", {}).get("name", "unknown")
        logger.info(f"ACP握手成功: agent={agent_name}")

    async def _acp_session_new(self, ws) -> str:
        """发送session/new创建新会话。

        Args:
            ws: WebSocket连接

        Returns:
            新创建的sessionId
        """
        result = await self._rpc(ws, "session/new", {
            "cwd": "/home/climbing",
            "mcpServers": [],
        })
        session_id = result.get("sessionId") or result.get("session_id", "")
        if not session_id:
            raise RuntimeError("session/new未返回sessionId")
        return session_id

    async def _acp_session_prompt(
        self,
        ws,
        session_id: str,
        user_text: str,
        task_id: str,
        store: TaskStore,
        stream: StreamManager,
    ) -> None:
        """发送session/prompt并流式处理响应事件。

        发送prompt后，持续读取WebSocket消息：
        - session/update(contentDelta) → 累积文本 → 广播MessageAppendedEvent
        - session/completed → 任务完成
        - session/failed → 任务失败

        Args:
            ws: WebSocket连接
            session_id: ACP会话ID
            user_text: 用户输入文本
            task_id: A2A Task ID
            store: TaskStore实例
            stream: StreamManager实例
        """
        # 发送prompt请求（不等待响应，通过通知流接收结果）
        self._msg_id += 1
        msg_id = str(self._msg_id)
        request = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": "session/prompt",
            "params": {
                "prompt": user_text,
                "sessionId": session_id,
            },
        }
        await ws.send(json.dumps(request, ensure_ascii=False) + "\n")
        logger.info(f"[{task_id}] session/prompt已发送, msg_id={msg_id}")

        # 流式接收并处理事件
        accumulated_text = ""
        chunk_count = 0

        async for raw_msg in ws:
            try:
                msg = json.loads(raw_msg.strip())
            except json.JSONDecodeError:
                continue

            msg_id_field = msg.get("id", "")
            method = msg.get("method", "")

            # 处理prompt的ack响应（id匹配）
            if msg_id_field == msg_id and "result" in msg:
                logger.debug(f"[{task_id}] session/prompt ack已收到")
                continue

            # 处理prompt的错误响应
            if msg_id_field == msg_id and "error" in msg:
                err = msg["error"]
                raise RuntimeError(f"session/prompt错误: {err}")

            # 处理通知事件（无id字段）
            if method == "session/update":
                # engine发送: params = {sessionId, contentDelta: str}
                params = msg.get("params", {})
                delta = params.get("contentDelta", "")
                if delta:
                    accumulated_text += delta
                    chunk_count += 1

                    reply = Message(
                        role="agent",
                        parts=[TextPart(text=delta)],
                    )
                    msg_event = MessageAppendedEvent(
                        taskId=task_id,
                        message=reply,
                    )
                    await stream.broadcast(task_id, msg_event)
                    await push_task_event(
                        task_id, "messageAppended", msg_event.model_dump()
                    )

            elif method == "session/completed":
                # engine发送: params = {sessionId, summary, elapsedSeconds}
                params = msg.get("params", {})
                summary = params.get("summary", "")
                logger.info(
                    f"[{task_id}] Agent Engine任务完成, "
                    f"chunks={chunk_count}, text_len={len(accumulated_text)}"
                )
                if accumulated_text:
                    full_reply = Message(
                        role="agent",
                        parts=[TextPart(text=accumulated_text)],
                    )
                    await store.add_message(task_id, full_reply)
                return

            elif method == "session/failed":
                # engine发送: params = {sessionId, error: str}
                params = msg.get("params", {})
                error_msg = params.get("error", "Agent Engine任务失败")
                logger.error(f"[{task_id}] Agent Engine任务失败: {error_msg}")
                await store.update_task_status(task_id, TaskState.FAILED)
                error_event = A2AErrorEvent(
                    taskId=task_id,
                    code=-32603,
                    message=str(error_msg),
                )
                await stream.broadcast(task_id, error_event)
                await push_task_event(task_id, "error", error_event.model_dump())
                return

        # WebSocket关闭但未收到completed/failed
        if accumulated_text:
            logger.warning(f"[{task_id}] WebSocket已关闭，但有累积文本({len(accumulated_text)}字符)")
            full_reply = Message(
                role="agent",
                parts=[TextPart(text=accumulated_text)],
            )
            await store.add_message(task_id, full_reply)
        else:
            raise RuntimeError("Agent Engine WebSocket连接意外关闭，无响应数据")

    async def _rpc(self, ws, method: str, params: dict) -> dict:
        """发送JSON-RPC请求并等待响应。

        Args:
            ws: WebSocket连接
            method: RPC方法名
            params: 请求参数

        Returns:
            响应的result字段

        Raises:
            RuntimeError: RPC返回错误或超时
        """
        self._msg_id += 1
        msg_id = str(self._msg_id)
        request = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method,
            "params": params,
        }
        await ws.send(json.dumps(request, ensure_ascii=False) + "\n")

        # 等待匹配的响应
        try:
            async for raw_msg in ws:
                msg = json.loads(raw_msg.strip())
                if str(msg.get("id", "")) == msg_id:
                    if "error" in msg:
                        raise RuntimeError(f"ACP RPC错误({method}): {msg['error']}")
                    return msg.get("result", {})
        except websockets.ConnectionClosed:
            raise RuntimeError(f"WebSocket连接断开，RPC({method})未完成")

        raise RuntimeError(f"WebSocket关闭，RPC({method})无响应")


# 全局桥接器单例
_bridge: AgentEngineBridge | None = None


def get_bridge() -> AgentEngineBridge:
    """获取全局AgentEngineBridge单例。"""
    global _bridge
    if _bridge is None:
        _bridge = AgentEngineBridge()
    return _bridge
