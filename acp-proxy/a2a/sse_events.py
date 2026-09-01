"""A2A SSE 事件模型定义。

用于 tasks/sendSubscribe 流式接口的事件类型。
遵循A2A协议SSE事件规范。
"""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field

from a2a.models import Artifact, Message, Task, TaskState


class TaskStatusChangedEvent(BaseModel):
    """Task状态变更事件。"""
    type: Literal["TaskStatusChanged"] = "TaskStatusChanged"
    taskId: str
    state: TaskState
    message: Optional[Message] = None
    timestamp: str


class MessageAppendedEvent(BaseModel):
    """消息追加事件。"""
    type: Literal["MessageAppended"] = "MessageAppended"
    taskId: str
    message: Message


class NewArtifactEvent(BaseModel):
    """新Artifact产出事件。"""
    type: Literal["NewArtifact"] = "NewArtifact"
    taskId: str
    artifact: Artifact


class A2ACompletedEvent(BaseModel):
    """Task完成事件（终态）。"""
    type: Literal["A2ACompleted"] = "A2ACompleted"
    taskId: str
    task: Task


class A2AErrorEvent(BaseModel):
    """Task错误事件。"""
    type: Literal["A2AError"] = "A2AError"
    taskId: str
    code: int
    message: str
    data: Optional[Any] = None


# 所有SSE事件的联合类型
SSEEvent = Union[
    TaskStatusChangedEvent,
    MessageAppendedEvent,
    NewArtifactEvent,
    A2ACompletedEvent,
    A2AErrorEvent,
]
