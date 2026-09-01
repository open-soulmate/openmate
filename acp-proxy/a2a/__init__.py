"""A2A (Agent-to-Agent) v0.2.2 协议实现包。

提供数据模型、AgentCard、Task生命周期管理、JSON-RPC通信等核心能力。
"""

from a2a.models import (
    TaskState,
    TextPart,
    FilePart,
    DataPart,
    Part,
    Message,
    Artifact,
    TaskStatus,
    Task,
    AgentCapabilities,
    AgentSkill,
    AgentCard,
    JSONRPCRequest,
    JSONRPCResponse,
    JSONRPCError,
    JSONRPCNotification,
    # 错误码常量
    JSONRPC_PARSE_ERROR,
    JSONRPC_INVALID_REQUEST,
    JSONRPC_METHOD_NOT_FOUND,
    JSONRPC_INVALID_PARAMS,
    JSONRPC_INTERNAL_ERROR,
    # A2A自定义错误码
    A2A_TASK_NOT_FOUND,
    A2A_TASK_NOT_CANCELABLE,
    A2A_INVALID_TASK_STATE,
    A2A_UNSUPPORTED_OPERATION,
)

from a2a.task_store import TaskStore
from a2a.agent_card import get_agent_card, list_agent_cards, AGENT_CARD_REGISTRY
from a2a.client import A2AClient

__all__ = [
    # 状态枚举
    "TaskState",
    # Part类型
    "TextPart",
    "FilePart",
    "DataPart",
    "Part",
    # 核心实体
    "Message",
    "Artifact",
    "TaskStatus",
    "Task",
    # AgentCard
    "AgentCapabilities",
    "AgentSkill",
    "AgentCard",
    # JSON-RPC
    "JSONRPCRequest",
    "JSONRPCResponse",
    "JSONRPCError",
    "JSONRPCNotification",
    # 错误码
    "JSONRPC_PARSE_ERROR",
    "JSONRPC_INVALID_REQUEST",
    "JSONRPC_METHOD_NOT_FOUND",
    "JSONRPC_INVALID_PARAMS",
    "JSONRPC_INTERNAL_ERROR",
    "A2A_TASK_NOT_FOUND",
    "A2A_TASK_NOT_CANCELABLE",
    "A2A_INVALID_TASK_STATE",
    "A2A_UNSUPPORTED_OPERATION",
    # 存储与服务
    "TaskStore",
    "get_agent_card",
    "list_agent_cards",
    "AGENT_CARD_REGISTRY",
    "A2AClient",
]
