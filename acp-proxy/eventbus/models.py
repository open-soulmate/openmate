"""事件数据模型定义。

包含 EventBus 所需的核心数据结构：
- EventType：事件隔离级别枚举（全局/命名空间/服务私有）
- EventMeta：事件元数据（持久化、重试策略）
- Event：标准事件结构体
- Subscription：订阅记录
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 事件隔离级别枚举
# ---------------------------------------------------------------------------

class EventType(str, Enum):
    """事件隔离级别。

    - GLOBAL: 全局事件，所有租户可见（如系统升级通知）
    - NAMESPACE: 命名空间事件，仅同一租户可见（如租户内任务完成）
    - SERVICE: 服务私有事件，仅同服务实例可见（如内部状态同步）
    """

    GLOBAL = "global"
    NAMESPACE = "namespace"
    SERVICE = "service"


# ---------------------------------------------------------------------------
# 事件元数据
# ---------------------------------------------------------------------------

class EventMeta(BaseModel):
    """事件投递元数据。

    控制事件的可靠投递策略：
    - persist: 是否持久化存储（核心事件为 True）
    - retry_times: 当前已重试次数
    - max_retry: 最大重试次数（默认 3）
    - dead_letter: 是否已进入死信队列
    """

    persist: bool = False
    """是否持久化存储。核心事件设为 True，轻量事件为 False。"""

    retry_times: int = 0
    """当前已重试次数。"""

    max_retry: int = 3
    """最大重试次数，超过后进入死信队列。"""

    dead_letter: bool = False
    """是否已进入死信队列。"""


# ---------------------------------------------------------------------------
# 标准事件结构体
# ---------------------------------------------------------------------------

class Event(BaseModel):
    """标准事件结构体。

    EventBus 中流转的最小事件单元。所有字段均遵循 v1.0 规范：

    - eventId: 全局唯一事件 ID（UUID4）
    - eventTopic: 事件主题，格式为 领域/模块/事件动作
    - eventType: 事件隔离级别
    - timestamp: 事件创建时间戳（UTC）
    - traceId: 分布式追踪 ID，用于事件溯源
    - clusterId: 集群标识
    - namespace: 命名空间（租户 ID），global 事件为空
    - sourceService: 来源服务名
    - sourceInstanceId: 来源服务实例 ID
    - payload: 事件载荷（任意 JSON）
    - meta: 投递元数据
    """

    event_id: str = Field(default_factory=lambda: str(uuid4()), description="全局唯一事件ID")
    event_topic: str = Field(..., description="事件主题，格式：领域/模块/事件动作")
    event_type: EventType = Field(default=EventType.GLOBAL, description="事件隔离级别")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="事件创建时间戳(UTC)")
    trace_id: Optional[str] = Field(default=None, description="分布式追踪ID")
    cluster_id: Optional[str] = Field(default=None, description="集群标识")
    namespace: Optional[str] = Field(default=None, description="命名空间(租户ID)")
    source_service: Optional[str] = Field(default=None, description="来源服务名")
    source_instance_id: Optional[str] = Field(default=None, description="来源服务实例ID")
    payload: dict[str, Any] = Field(default_factory=dict, description="事件载荷")
    meta: EventMeta = Field(default_factory=EventMeta, description="投递元数据")

    model_config = {"json_schema_extra": {
        "examples": [{
            "event_id": "550e8400-e29b-41d4-a716-446655440000",
            "event_topic": "agent/task/completed",
            "event_type": "namespace",
            "timestamp": "2026-09-02T10:00:00Z",
            "trace_id": "trace-abc-123",
            "namespace": "tenant-001",
            "source_service": "acp-proxy",
            "source_instance_id": "instance-01",
            "payload": {"task_id": "task-42", "status": "completed"},
            "meta": {"persist": True, "retry_times": 0, "max_retry": 3}
        }]
    }}


# ---------------------------------------------------------------------------
# 订阅记录
# ---------------------------------------------------------------------------

# 回调函数类型：接受 Event，可同步或异步
EventCallback = Callable[[Event], Any]

class Subscription(BaseModel):
    """订阅记录。

    记录一个 topic pattern 到回调函数的绑定关系。
    订阅者可选择过滤特定 namespace 和 eventType。

    Attributes:
        sub_id: 订阅唯一 ID
        topic_pattern: 订阅的主题模式，支持 # 通配符
        callback: 回调函数（不参与序列化）
        namespace_filter: 可选的命名空间过滤
        event_type_filter: 可选的事件类型过滤
    """

    sub_id: str = Field(default_factory=lambda: str(uuid4()), description="订阅唯一ID")
    topic_pattern: str = Field(..., description="订阅主题模式，支持#通配符")
    namespace_filter: Optional[str] = Field(default=None, description="命名空间过滤")
    event_type_filter: Optional[EventType] = Field(default=None, description="事件类型过滤")

    # callback 不参与 JSON 序列化
    callback: Optional[Any] = Field(default=None, exclude=True, description="回调函数")

    model_config = {"arbitrary_types_allowed": True}
