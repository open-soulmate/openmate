"""RBAC v1.0 权限管理模块。

五层权限模型：User → Role → Permission → Resource → Action

提供基于角色的访问控制(RBAC)能力，支持：
- 用户管理：创建用户、分配角色
- 角色管理：定义角色、关联权限
- 权限检查：验证用户是否有权对资源执行特定操作
- 预设角色：admin/operator/developer/viewer 四种标准角色

使用示例：
    from rbac import RBACStore
    from rbac.default_roles import setup_default_roles

    store = RBACStore()
    setup_default_roles(store)

    # 添加用户并分配角色
    store.add_user("user1", "Alice")
    store.assign_role("user1", "admin")

    # 检查权限
    has_perm = store.check_permission("user1", "session", "create")
"""

from rbac.models import User, Role, Permission, Resource, Action
from rbac.store import RBACStore
from rbac.default_roles import setup_default_roles

__all__ = [
    "User",
    "Role",
    "Permission",
    "Resource",
    "Action",
    "RBACStore",
    "setup_default_roles",
]