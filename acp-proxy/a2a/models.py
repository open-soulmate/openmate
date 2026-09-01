"""A2A v0.2.2 数据模型定义。

包含所有A2A协议实体：Task、Message、Part、Artifact、AgentCard、JSON-RPC等。
基于Pydantic v2实现，严格遵循A2A协议规范。
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Task 状态枚举
# ---------------------------------------------------------------------------

class TaskState(str, Enum):
    """Task生命周期状态枚举。"""
    UNSPECIFIED = "UNSPECIFIED"
    SUBMITTED = "SUBMITTED"
    WORKING = "WORKING"
    INPUT_REQUIRED = "INPUT_REQUIRED"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


# 合法状态跳转表：key → set of allowed next states
_VALID_TRANSITIONS: dict[TaskState, set[TaskState]] = {
    TaskState.UNSPECIFIED: {TaskState.SUBMITTED},
    TaskState.SUBMITTED: {TaskState.WORKING, TaskState.CANCELED, TaskState.REJECTED},
    TaskState.WORKING: {TaskState.INPUT_REQUIRED, TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELED},
    TaskState.INPUT_REQUIRED: {TaskState.WORKING, TaskState.CANCELED},
    TaskState.AUTH_REQUIRED: {TaskState.WORKING, TaskState.CANCELED},
    # 终态不可跳转
    TaskState.COMPLETED: set(),
    TaskState.FAILED: set(),
    TaskState.CANCELED: set(),
    TaskState.REJECTED: set(),
}

# 终态集合
TERMINAL_STATES: set[TaskState] = {
    TaskState.COMPLETED,
    TaskState.FAILED,
    TaskState.CANCELED,
    TaskState.REJECTED,
}


def validate_transition(current: TaskState, target: TaskState) -> None:
    """校验Task状态跳转是否合法。

    Args:
        current: 当前状态
        target: 目标状态

    Raises:
        ValueError: 跳转不合法时抛出
    """
    allowed = _VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ValueError(
            f"非法状态跳转: {current.value} → {target.value}。"
            f"允许的目标状态: {[s.value for s in allowed] or '(终态，不可跳转)'}"
        )


def now_iso() -> str:
    """返回当前UTC时间的ISO8601字符串。"""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Part 类型（多模态原子单元）
# ---------------------------------------------------------------------------

class TextPart(BaseModel):
    """文本内容单元。"""
    type: Literal["text"] = "text"
    text: str


class FilePart(BaseModel):
    """文件内容单元，支持URI引用或base64内嵌。"""
    type: Literal["file"] = "file"
    fileName: Optional[str] = None
    mimeType: Optional[str] = None
    uri: Optional[str] = None
    bytes: Optional[str] = Field(default=None, description="base64编码的文件内容")


class DataPart(BaseModel):
    """结构化数据单元。"""
    type: Literal["data"] = "data"
    data: dict[str, Any]
    mimeType: Optional[str] = None


Part = Union[TextPart, FilePart, DataPart]
"""多模态内容联合类型。"""


# ---------------------------------------------------------------------------
# Message / Artifact / TaskStatus / Task
# ---------------------------------------------------------------------------

class Message(BaseModel):
    """A2A消息，包含角色和多模态内容。"""
    role: Literal["user", "agent"]
    parts: list[Part]
    metadata: Optional[dict[str, Any]] = None


class Artifact(BaseModel):
    """不可变工件，Task产出的结构化结果。"""
    artifactId: str
    name: Optional[str] = None
    description: Optional[str] = None
    parts: list[Part]
    metadata: Optional[dict[str, Any]] = None


class TaskStatus(BaseModel):
    """Task状态快照。"""
    state: TaskState
    message: Optional[Message] = Field(default=None, description="状态变更时的附加消息")
    timestamp: str = Field(default_factory=now_iso, description="ISO8601时间戳")


class Task(BaseModel):
    """A2A Task，代表一个Agent执行的工作单元。"""
    id: str = Field(description="Task唯一标识")
    sessionId: Optional[str] = None
    status: TaskStatus
    history: list[Message] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# AgentCard 相关模型
# ---------------------------------------------------------------------------

class AgentCapabilities(BaseModel):
    """Agent能力声明。"""
    streaming: bool = False
    pushNotifications: bool = False
    stateTransitionHistory: bool = False


class AgentSkill(BaseModel):
    """Agent技能描述。"""
    id: str
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)
    examples: Optional[list[str]] = None


class AgentCard(BaseModel):
    """Agent身份与能力卡片，遵循A2A AgentCard规范。"""
    name: str
    description: str
    version: str
    url: str = Field(description="A2A服务地址")
    capabilities: AgentCapabilities
    skills: list[AgentSkill]
    securitySchemes: Optional[dict[str, Any]] = None
    security: Optional[list[dict[str, Any]]] = None
    defaultInputModes: list[str] = Field(default_factory=lambda: ["text/plain", "application/json"])
    defaultOutputModes: list[str] = Field(default_factory=lambda: ["text/plain", "application/json"])


# ---------------------------------------------------------------------------
# JSON-RPC 2.0 模型
# ---------------------------------------------------------------------------

class JSONRPCError(BaseModel):
    """JSON-RPC 2.0 错误对象。"""
    code: int
    message: str
    data: Optional[Any] = None


class JSONRPCRequest(BaseModel):
    """JSON-RPC 2.0 请求。"""
    jsonrpc: Literal["2.0"] = "2.0"
    id: Union[str, int]
    method: str
    params: Optional[dict[str, Any]] = None


class JSONRPCResponse(BaseModel):
    """JSON-RPC 2.0 响应。"""
    jsonrpc: Literal["2.0"] = "2.0"
    id: Union[str, int]
    result: Optional[Any] = None
    error: Optional[JSONRPCError] = None


class JSONRPCNotification(BaseModel):
    """JSON-RPC 2.0 通知（无id，不需要响应）。"""
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# JSON-RPC 标准错误码
# ---------------------------------------------------------------------------

JSONRPC_PARSE_ERROR: int = -32700
"""JSON解析失败。"""

JSONRPC_INVALID_REQUEST: int = -32600
"""无效的JSON-RPC请求。"""

JSONRPC_METHOD_NOT_FOUND: int = -32601
"""方法不存在。"""

JSONRPC_INVALID_PARAMS: int = -32602
"""参数无效。"""

JSONRPC_INTERNAL_ERROR: int = -32603
"""内部JSON-RPC错误。"""


# ---------------------------------------------------------------------------
# A2A 自定义错误码（-32000 ~ -32099 保留给A2A）
# ---------------------------------------------------------------------------

A2A_TASK_NOT_FOUND: int = -32001
"""指定的Task不存在。"""

A2A_TASK_NOT_CANCELABLE: int = -32002
"""Task处于终态，无法取消。"""

A2A_INVALID_TASK_STATE: int = -32003
"""非法的Task状态跳转。"""

A2A_UNSUPPORTED_OPERATION: int = -32004
"""当前Agent不支持请求的操作。"""
