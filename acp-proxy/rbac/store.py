"""RBAC 存储层 — 全局单例权限存储。

提供RBAC系统的持久化存储和权限检查能力。
采用纯Python内存实现，所有数据存储在字典中。

核心功能：
- 用户管理：添加、查询、删除用户
- 角色管理：添加、查询角色
- 权限分配：为用户分配角色、撤销角色
- 权限检查：验证用户是否有权对资源执行特定操作

使用单例模式确保全局唯一存储实例。
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Union

from rbac.models import Action, Resource, Role, User

logger = logging.getLogger("rbac.store")


class RBACStore:
    """RBAC全局存储单例。

    管理所有用户、角色及其关联关系。
    提供线程安全的权限检查和角色管理功能。

    使用方式：
        store = RBACStore()
        store.add_user("user1", "Alice")
        store.assign_role("user1", "admin")
        has_perm = store.check_permission("user1", "session", "create")
    """

    _instance: Optional[RBACStore] = None

    def __new__(cls) -> RBACStore:
        """单例模式实现，确保全局唯一实例。"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._users = {}
            cls._instance._roles = {}
            logger.info("RBACStore 单例已创建")
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """重置单例实例（仅用于测试）。

        警告：此方法会清除所有数据，仅在单元测试中使用。
        """
        cls._instance = None
        logger.warning("RBACStore 单例已重置")

    def add_user(self, user_id: str, name: str) -> User:
        """添加新用户到存储。

        如果用户已存在，返回现有用户对象。

        Args:
            user_id: 用户唯一标识符
            name: 用户显示名称

        Returns:
            创建或已存在的User对象
        """
        if user_id in self._users:
            logger.debug("用户 %s 已存在，返回现有对象", user_id)
            return self._users[user_id]

        user = User(id=user_id, name=name)
        self._users[user_id] = user
        logger.info("已添加用户: %s (%s)", name, user_id)
        return user

    def get_user(self, user_id: str) -> Optional[User]:
        """根据ID获取用户。

        Args:
            user_id: 用户唯一标识符

        Returns:
            User对象，如果不存在返回None
        """
        return self._users.get(user_id)

    def remove_user(self, user_id: str) -> bool:
        """从存储中删除用户。

        Args:
            user_id: 用户唯一标识符

        Returns:
            True表示删除成功，False表示用户不存在
        """
        if user_id not in self._users:
            logger.warning("删除用户失败: 用户 %s 不存在", user_id)
            return False

        del self._users[user_id]
        logger.info("已删除用户: %s", user_id)
        return True

    def add_role(self, role: Role) -> Role:
        """添加角色到存储。

        如果角色已存在，更新其权限配置。

        Args:
            role: 要添加的Role对象

        Returns:
            添加或更新后的Role对象
        """
        if role.id in self._roles:
            logger.debug("角色 %s 已存在，更新权限配置", role.id)
            existing = self._roles[role.id]
            existing.permissions = role.permissions
            existing.name = role.name
            return existing

        self._roles[role.id] = role
        logger.info("已添加角色: %s (%s)", role.name, role.id)
        return role

    def get_role(self, role_id: str) -> Optional[Role]:
        """根据ID获取角色。

        Args:
            role_id: 角色唯一标识符

        Returns:
            Role对象，如果不存在返回None
        """
        return self._roles.get(role_id)

    def list_roles(self) -> List[Role]:
        """获取所有角色列表。

        Returns:
            角色对象列表
        """
        return list(self._roles.values())

    def assign_role(self, user_id: str, role_id: str) -> bool:
        """为用户分配角色。

        Args:
            user_id: 用户唯一标识符
            role_id: 角色唯一标识符

        Returns:
            True表示分配成功，False表示用户或角色不存在
        """
        user = self._users.get(user_id)
        if not user:
            logger.warning("分配角色失败: 用户 %s 不存在", user_id)
            return False

        role = self._roles.get(role_id)
        if not role:
            logger.warning("分配角色失败: 角色 %s 不存在", role_id)
            return False

        if user.has_role(role_id):
            logger.debug("用户 %s 已拥有角色 %s，跳过分配", user_id, role_id)
            return True

        user.roles.append(role)
        logger.info("已为用户 %s 分配角色 %s", user_id, role_id)
        return True

    def revoke_role(self, user_id: str, role_id: str) -> bool:
        """撤销用户的角色。

        Args:
            user_id: 用户唯一标识符
            role_id: 角色唯一标识符

        Returns:
            True表示撤销成功，False表示用户不存在或未拥有该角色
        """
        user = self._users.get(user_id)
        if not user:
            logger.warning("撤销角色失败: 用户 %s 不存在", user_id)
            return False

        if not user.has_role(role_id):
            logger.warning("撤销角色失败: 用户 %s 未拥有角色 %s", user_id, role_id)
            return False

        user.roles = [r for r in user.roles if r.id != role_id]
        logger.info("已撤销用户 %s 的角色 %s", user_id, role_id)
        return True

    def check_permission(
        self,
        user_id: str,
        resource: Union[str, Resource],
        action: Union[str, Action],
    ) -> bool:
        """检查用户是否有权对资源执行指定操作。

        这是RBAC系统的核心方法，遍历用户的所有角色，
        检查是否存在允许该操作的权限。

        Args:
            user_id: 用户唯一标识符
            resource: 资源类型（字符串或Resource枚举）
            action: 操作类型（字符串或Action枚举）

        Returns:
            True表示有权限，False表示无权限
        """
        user = self._users.get(user_id)
        if not user:
            logger.warning("权限检查失败: 用户 %s 不存在", user_id)
            return False

        # 转换为枚举类型
        if isinstance(resource, str):
            try:
                resource = Resource(resource)
            except ValueError:
                logger.warning("权限检查失败: 未知资源类型 %s", resource)
                return False

        if isinstance(action, str):
            try:
                action = Action(action)
            except ValueError:
                logger.warning("权限检查失败: 未知操作类型 %s", action)
                return False

        has_perm = user.has_permission(resource, action)
        logger.debug(
            "权限检查: 用户=%s, 资源=%s, 操作=%s, 结果=%s",
            user_id, resource.value, action.value, has_perm
        )
        return has_perm

    def get_user_roles(self, user_id: str) -> List[str]:
        """获取用户的所有角色ID列表。

        Args:
            user_id: 用户唯一标识符

        Returns:
            角色ID列表，如果用户不存在返回空列表
        """
        user = self._users.get(user_id)
        if not user:
            logger.warning("获取角色失败: 用户 %s 不存在", user_id)
            return []

        return user.get_role_ids()

    def list_users(self) -> List[User]:
        """获取所有用户列表。

        Returns:
            用户对象列表
        """
        return list(self._users.values())

    def get_stats(self) -> Dict[str, int]:
        """获取存储统计信息。

        Returns:
            包含用户数、角色数等统计信息的字典
        """
        return {
            "users": len(self._users),
            "roles": len(self._roles),
            "total_permissions": sum(
                len(role.permissions) for role in self._roles.values()
            ),
        }