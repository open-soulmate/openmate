"""
配置中心数据模型模块。

定义配置项（ConfigItem）及变更事件（ConfigChange）的数据结构。
支持四层命名空间（cluster/project/service/instance）和版本管理。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# 命名空间层级分隔符
NS_SEPARATOR = "/"

# 命名空间层级名称（从左到右）
NS_LEVELS = ("cluster", "project", "service", "instance")

# 命名空间正则：每层允许字母、数字、下划线、连字符，或通配符 *
_NS_SEGMENT = r"[a-zA-Z0-9_\-*]+"
NS_PATTERN = re.compile(
    rf"^{_NS_SEGMENT}(?:/{_NS_SEGMENT}){{0,3}}$"
)


class ConfigAction(str, Enum):
    """配置变更动作类型。"""
    SET = "set"           # 新增或更新
    DELETE = "delete"     # 删除
    ROLLBACK = "rollback" # 回滚


@dataclass
class ConfigItem:
    """
    配置项数据模型。

    Attributes:
        key: 配置键名，同一命名空间内唯一
        value: 配置值（任意类型）
        namespace: 四层命名空间，格式 cluster/project/service/instance
        version: 版本号，每次修改自动递增
        encrypted: 是否为敏感配置（加密标记）
        updated_at: 最后更新时间（UTC）
    """
    key: str
    value: Any
    namespace: str
    version: int = 1
    encrypted: bool = False
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def full_path(self) -> str:
        """返回完整配置路径：namespace/key"""
        return f"{self.namespace}/{self.key}"

    def to_dict(self) -> dict:
        """序列化为字典。"""
        return {
            "key": self.key,
            "value": self.value,
            "namespace": self.namespace,
            "version": self.version,
            "encrypted": self.encrypted,
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ConfigItem":
        """从字典反序列化。"""
        updated_at = data.get("updated_at")
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        return cls(
            key=data["key"],
            value=data["value"],
            namespace=data["namespace"],
            version=data.get("version", 1),
            encrypted=data.get("encrypted", False),
            updated_at=updated_at or datetime.now(timezone.utc),
        )


@dataclass
class ConfigChange:
    """
    配置变更事件。

    Attributes:
        action: 变更动作类型
        item: 变更后的配置项快照（删除时为变更前的快照）
        old_value: 变更前的值（仅 set 动作且 key 已存在时有值）
    """
    action: ConfigAction
    item: ConfigItem
    old_value: Any = None


def validate_namespace(namespace: str) -> None:
    """
    校验命名空间格式。

    规则：
    - 格式为 cluster/project/service/instance（至少一层，最多四层）
    - 每层允许字母、数字、下划线、连字符、通配符 *
    - 层级间用 / 分隔

    Args:
        namespace: 待校验的命名空间字符串

    Raises:
        ValueError: 命名空间格式非法
    """
    if not namespace:
        raise ValueError("命名空间不能为空")
    if not NS_PATTERN.match(namespace):
        raise ValueError(
            f"命名空间格式非法: '{namespace}'，"
            f"应为 cluster/project/service/instance 格式，"
            f"每层允许字母、数字、下划线、连字符或通配符 *"
        )
    parts = namespace.split(NS_SEPARATOR)
    if len(parts) > len(NS_LEVELS):
        raise ValueError(
            f"命名空间层级超过最大层数 {len(NS_LEVELS)}: '{namespace}'"
        )
    for part in parts:
        if not part:
            raise ValueError(f"命名空间存在空层级: '{namespace}'")


def namespace_matches(pattern: str, target: str) -> bool:
    """
    检查目标命名空间是否匹配模式（支持通配符 *）。

    模式中 * 匹配任意单层，例如：
    - "prod/*/api-server" 匹配 "prod/myproject/api-server"
    - "prod" 匹配 "prod" 但不匹配 "prod/myproject"

    Args:
        pattern: 带通配符的命名空间模式
        target: 目标命名空间

    Returns:
        是否匹配
    """
    pattern_parts = pattern.split(NS_SEPARATOR)
    target_parts = target.split(NS_SEPARATOR)

    # 模式层级不能超过目标层级
    if len(pattern_parts) > len(target_parts):
        return False

    for i, pat in enumerate(pattern_parts):
        if pat == "*":
            continue  # 通配符匹配任意单层
        if i >= len(target_parts):
            return False
        if pat != target_parts[i]:
            return False

    return True
