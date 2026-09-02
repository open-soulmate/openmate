"""RBAC 预设角色和默认权限映射。

定义系统内置的四种标准角色：
- admin：管理员，拥有所有资源的所有操作权限
- operator：运维人员，拥有大部分资源的读写权限，无用户/角色管理权限
- developer：开发者，拥有开发相关资源的读写权限
- viewer：观察者，只有只读权限

每种角色的权限范围：
- admin：全资源 × 全操作（create/read/update/delete/execute）
- operator：session/agent/artifact/memory/gateway/mcp/eventbus/trace × CRUD+execute，config/system × read/update
- developer：session/agent/artifact/memory × CRUD+execute，config × read
- viewer：全资源 × read
"""

from __future__ import annotations

from typing import List

from rbac.models import Action, Permission, Resource, Role
from rbac.store import RBACStore


def _create_all_permissions() -> List[Permission]:
    """创建所有资源的完整权限列表。

    为每种资源创建包含所有操作的权限实例。

    Returns:
        权限对象列表
    """
    all_actions = list(Action)
    permissions = []

    for resource in Resource:
        perm = Permission(
            id=f"perm:{resource.value}:all",
            resource=resource,
            actions=all_actions.copy(),
        )
        permissions.append(perm)

    return permissions


def _create_readonly_permissions() -> List[Permission]:
    """创建所有资源的只读权限列表。

    为每种资源创建仅包含read操作的权限实例。

    Returns:
        权限对象列表
    """
    permissions = []

    for resource in Resource:
        perm = Permission(
            id=f"perm:{resource.value}:read",
            resource=resource,
            actions=[Action.READ],
        )
        permissions.append(perm)

    return permissions


def _create_operator_permissions() -> List[Permission]:
    """创建运维人员权限列表。

    运维人员权限范围：
    - 完整CRUD+execute：session, agent, artifact, memory, gateway, mcp, eventbus, trace
    - 只读+更新：config, system
    - 无权限：user, role

    Returns:
        权限对象列表
    """
    # 完整操作权限的资源
    full_access_resources = [
        Resource.SESSION,
        Resource.AGENT,
        Resource.ARTIFACT,
        Resource.MEMORY,
        Resource.GATEWAY,
        Resource.MCP,
        Resource.EVENTBUS,
        Resource.TRACE,
    ]

    # 只读+更新权限的资源
    limited_resources = [
        Resource.CONFIG,
        Resource.SYSTEM,
    ]

    permissions = []

    # 完整操作权限
    for resource in full_access_resources:
        perm = Permission(
            id=f"perm:{resource.value}:full",
            resource=resource,
            actions=[Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.EXECUTE],
        )
        permissions.append(perm)

    # 只读+更新权限
    for resource in limited_resources:
        perm = Permission(
            id=f"perm:{resource.value}:read_update",
            resource=resource,
            actions=[Action.READ, Action.UPDATE],
        )
        permissions.append(perm)

    return permissions


def _create_developer_permissions() -> List[Permission]:
    """创建开发者权限列表。

    开发者权限范围：
    - 完整CRUD+execute：session, agent, artifact, memory
    - 只读：config
    - 无权限：user, role, system, gateway, mcp, eventbus, trace

    Returns:
        权限对象列表
    """
    # 完整操作权限的资源
    full_access_resources = [
        Resource.SESSION,
        Resource.AGENT,
        Resource.ARTIFACT,
        Resource.MEMORY,
    ]

    # 只读权限的资源
    readonly_resources = [
        Resource.CONFIG,
    ]

    permissions = []

    # 完整操作权限
    for resource in full_access_resources:
        perm = Permission(
            id=f"perm:{resource.value}:dev_full",
            resource=resource,
            actions=[Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.EXECUTE],
        )
        permissions.append(perm)

    # 只读权限
    for resource in readonly_resources:
        perm = Permission(
            id=f"perm:{resource.value}:dev_read",
            resource=resource,
            actions=[Action.READ],
        )
        permissions.append(perm)

    return permissions


def create_admin_role() -> Role:
    """创建管理员角色。

    管理员拥有所有资源的所有操作权限。

    Returns:
        配置完成的admin角色对象
    """
    return Role(
        id="admin",
        name="管理员",
        permissions=_create_all_permissions(),
    )


def create_operator_role() -> Role:
    """创建运维人员角色。

    运维人员拥有大部分资源的读写权限，无用户/角色管理权限。

    Returns:
        配置完成的operator角色对象
    """
    return Role(
        id="operator",
        name="运维人员",
        permissions=_create_operator_permissions(),
    )


def create_developer_role() -> Role:
    """创建开发者角色。

    开发者拥有开发相关资源的读写权限。

    Returns:
        配置完成的developer角色对象
    """
    return Role(
        id="developer",
        name="开发者",
        permissions=_create_developer_permissions(),
    )


def create_viewer_role() -> Role:
    """创建观察者角色。

    观察者只有只读权限，不能创建、更新或删除任何资源。

    Returns:
        配置完成的viewer角色对象
    """
    return Role(
        id="viewer",
        name="观察者",
        permissions=_create_readonly_permissions(),
    )


def setup_default_roles(store: RBACStore) -> None:
    """在RBACStore中设置所有预设角色。

    创建并注册admin、operator、developer、viewer四种标准角色。
    如果角色已存在，会更新其权限配置。

    Args:
        store: RBACStore单例实例
    """
    roles = [
        create_admin_role(),
        create_operator_role(),
        create_developer_role(),
        create_viewer_role(),
    ]

    for role in roles:
        store.add_role(role)