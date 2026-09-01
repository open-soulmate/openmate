"""A2A Client 客户端模块。

供Hermes等Agent调用其他Agent的A2A接口。
封装JSON-RPC 2.0通信协议。
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from a2a.models import (
    JSONRPCError,
    JSONRPCRequest,
    JSONRPCResponse,
    Message,
    Task,
)

logger = logging.getLogger("a2a.client")


class A2AClient:
    """A2A JSON-RPC客户端。

    用于向其他Agent发送A2A协议请求。
    基于httpx实现异步HTTP通信。
    """

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        """初始化A2A客户端。

        Args:
            base_url: 目标Agent的A2A服务基础URL（如 http://localhost:8000/a2a）
            timeout: HTTP请求超时时间（秒）
        """
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._request_id = 0

    def _next_id(self) -> int:
        """生成下一个请求ID。"""
        self._request_id += 1
        return self._request_id

    async def _call(self, method: str, params: Optional[dict[str, Any]] = None) -> Any:
        """发送JSON-RPC请求并返回结果。

        Args:
            method: JSON-RPC方法名
            params: 方法参数

        Returns:
            成功响应的result字段

        Raises:
            A2ARPCError: 服务端返回错误时抛出
        """
        req = JSONRPCRequest(
            id=self._next_id(),
            method=method,
            params=params,
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._base_url,
                json=req.model_dump(exclude_none=True),
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()

        rpc_resp = JSONRPCResponse(**resp.json())

        if rpc_resp.error:
            raise A2ARPCError(rpc_resp.error)

        return rpc_resp.result

    async def create_task(self, session_id: Optional[str] = None,
                          message: Optional[Message] = None,
                          metadata: Optional[dict] = None) -> Task:
        """创建新Task。

        Args:
            session_id: 可选的会话ID
            message: 可选的初始消息
            metadata: 可选的元数据

        Returns:
            创建的Task对象
        """
        params: dict[str, Any] = {}
        if session_id:
            params["sessionId"] = session_id
        if message:
            params["message"] = message.model_dump(exclude_none=True)
        if metadata:
            params["metadata"] = metadata

        result = await self._call("tasks/create", params)
        return Task(**result)

    async def get_task(self, task_id: str, history_length: Optional[int] = None) -> Task:
        """查询Task状态。

        Args:
            task_id: Task唯一标识
            history_length: 可选的history消息数量上限

        Returns:
            Task对象
        """
        params: dict[str, Any] = {"taskId": task_id}
        if history_length is not None:
            params["historyLength"] = history_length

        result = await self._call("tasks/get", params)
        return Task(**result)

    async def send_message(self, task_id: str, message: Message) -> Task:
        """向Task发送消息。

        Args:
            task_id: Task唯一标识
            message: 要发送的消息

        Returns:
            更新后的Task对象
        """
        params = {
            "taskId": task_id,
            "message": message.model_dump(exclude_none=True),
        }
        result = await self._call("tasks/send", params)
        return Task(**result)

    async def cancel_task(self, task_id: str) -> Task:
        """取消Task。

        Args:
            task_id: Task唯一标识

        Returns:
            更新后的Task对象
        """
        result = await self._call("tasks/cancel", {"taskId": task_id})
        return Task(**result)

    async def transition_task(self, task_id: str, state: str,
                              message: Optional[Message] = None) -> Task:
        """转换Task状态。

        Args:
            task_id: Task唯一标识
            state: 目标状态值
            message: 可选的状态变更附加消息

        Returns:
            更新后的Task对象
        """
        params: dict[str, Any] = {"taskId": task_id, "state": state}
        if message:
            params["message"] = message.model_dump(exclude_none=True)

        result = await self._call("tasks/transition", params)
        return Task(**result)


class A2ARPCError(Exception):
    """A2A JSON-RPC错误异常。"""

    def __init__(self, error: JSONRPCError) -> None:
        self.code = error.code
        self.message = error.message
        self.data = error.data
        super().__init__(f"[{error.code}] {error.message}")
