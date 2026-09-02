"""RBAC 数据模型定义。

五层模型结构：
- User：用户实体，关联多个角色
- Role：角色实体，关联多个权限
- Permission：权限实体，定义对资源可执行的操作
- Resource：资源枚举，定义系统中的受保护资源
- Action：操作枚举，定义可执行的CRUD操作

设计原则：
- 使用 dataclass 实现轻量级数据模型
- 所有ID均为字符串类型，便于灵活扩展
- Role和Permission使用列表存储关联关系，支持动态修改
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List


class Resource(str, Enum):
    """系统资源枚举。

    定义RBAC系统中可被保护的资源类型。
    每种资源对应系统中的一个功能模块或数据实体。
    """

    SESSION = "session"        # 会话管理
    AGENT = "agent"            # 智能体管理
    CONFIG = "config"          # 配置管理
    ARTIFACT = "artifact"      # 产物/文件管理
    MEMORY = "memory"          # 记忆/知识库
    GATEWAY = "gateway"        # 网关管理
    MCP = "mcp"                # MCP服务
    EVENTBUS = "eventbus"      # 事件总线
    TRACE = "trace"            # 链路追踪
    USER = "user"              # 用户管理
    ROLE = "role"              # 角色管理
    SYSTEM = "system"          # 系统级操作


class Action(str, Enum):
    """操作类型枚举。

    定义对资源可执行的标准CRUD操作，外加execute用于执行类操作。
    """

    CREATE = "create"      # 创建资源
    READ = "read"          # 读取资源
    UPDATE = "update"      # 更新资源
    DELETE = "delete"      # 删除资源
    EXECUTE = "execute"    # 执行操作（如运行agent、触发任务等）


@dataclass
class Permission:
    """权限实体。

    定义对特定资源可执行的操作集合。
    一个Permission实例表示"可以对resource执行actions中的操作"。

    Attributes:
        id: 权限唯一标识符
        resource: 受保护的资源类型
        actions: 允许的操作列表
    """

    id: str
    resource: Resource
    actions: List[Action] = field(default_factory=list)

    def __post_init__(self) -> None:
        """初始化后处理，确保resource和actions类型正确。"""
        if isinstance(self.resource, str):
            self.resource = Resource(self.resource)
        self.actions = [
            Action(a) if isinstance(a, str) else a
            for a in self.actions
        ]

    def allows(self, action: Action) -> bool:
        """检查此权限是否允许指定操作。

        Args:
            action: 要检查的操作类型

        Returns:
            True表示允许，False表示拒绝
        """
        return action in self.actions

    def __hash__(self) -> int:
        """基于id计算哈希值，支持放入集合。"""
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        """基于id判断相等性。"""
        if not isinstance(other, Permission):
            return False
        return self.id == other.id


@dataclass
class Role:
    """角色实体。

    角色是权限的集合，代表系统中的一组职责。
    用户通过被分配角色来获得相应的权限。

    Attributes:
        id: 角色唯一标识符
        name: 角色显示名称
        permissions: 该角色拥有的权限列表
    """

    id: str
    name: str
    permissions: List[Permission] = field(default_factory=list)

    def has_permission(self, resource: Resource, action: Action) -> bool:
        """检查角色是否拥有对指定资源的指定操作权限。

        Args:
            resource: 目标资源类型
            action: 目标操作类型

        Returns:
            True表示拥有权限，False表示无权限
        """
        return any(
            perm.resource == resource and perm.allows(action)
            for perm in self.permissions
        )

    def __hash__(self) -> int:
        """基于id计算哈希值。"""
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        """基于id判断相等性。"""
        if not isinstance(other, Role):
            return False
        return self.id == other.id


@dataclass
class User:
    """用户实体。

    用户是RBAC系统的主体，通过被分配角色来获得操作权限。
    一个用户可以拥有多个角色，其有效权限是所有角色权限的并集。

    Attributes:
        id: 用户唯一标识符
        name: 用户显示名称
        roles: 用户被分配的角色列表
    """

    id: str
    name: str
    roles: List[Role] = field(default_factory=list)

    def has_role(self, role_id: str) -> bool:
        """检查用户是否拥有指定角色。

        Args:
            role_id: 角色ID

        Returns:
            True表示拥有该角色，False表示未拥有
        """
        return any(role.id == role_id for role in self.roles)

    def has_permission(self, resource: Resource, action: Action) -> bool:
        """检查用户是否拥有对指定资源的指定操作权限。

        遍历用户的所有角色，任一角色拥有权限即返回True。

        Args:
            resource: 目标资源类型
            action: 目标操作类型

        Returns:
            True表示拥有权限，False表示无权限
        """
        return any(
            role.has_permission(resource, action)
            for role in self.roles
        )

    def get_role_ids(self) -> List[str]:
        """获取用户所有角色的ID列表。

        Returns:
            角色ID列表
        """
        return [role.id for role in self.roles]

    def __hash__(self) -> int:
        """基于id计算哈希值。"""
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        """基于id判断相等性。"""
        if not isinstance(other, User):
            return False
        return self.id == other.id