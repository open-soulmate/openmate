"""
PromptStore 核心存储模块

提供全局单例 PromptStore，支持：
- 提示词模板的增删改查
- 自动版本管理与回滚
- {{variable}} 变量模板渲染
- 按 namespace 多租户隔离
"""

from __future__ import annotations

import re
import threading
from datetime import datetime, timezone
from typing import Any

from .models import PromptTemplate


class PromptStore:
    """
    提示词仓库 — 全局单例

    内部以 (namespace, name) 为主键，每个主键维护一个版本历史列表。
    所有公共方法线程安全（通过 threading.Lock 保护）。

    使用方式:
        store = PromptStore()
        store.save("greet", "Hello {{user}}!", namespace="default", tags=["chat"])
        text = store.render("greet", {"user": "Alice"}, namespace="default")
    """

    _instance: PromptStore | None = None
    _lock_cls = threading.Lock()  # 用于保护单例创建

    def __new__(cls) -> PromptStore:
        """单例模式：全局唯一实例"""
        if cls._instance is None:
            with cls._lock_cls:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._init_store()
                    cls._instance = instance
        return cls._instance

    def _init_store(self) -> None:
        """
        初始化内部存储结构

        数据结构:
            _store: {(namespace, name): [PromptTemplate, ...]}
                    每个 key 对应一个版本列表，按版本号升序排列
        """
        # 主存储：(namespace, name) -> 版本历史列表
        self._store: dict[tuple[str, str], list[PromptTemplate]] = {}
        # 实例锁，保护并发读写
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    #  公共 API
    # ------------------------------------------------------------------ #

    def save(
        self,
        name: str,
        content: str,
        namespace: str = "default",
        tags: list[str] | None = None,
    ) -> PromptTemplate:
        """
        保存提示词模板

        首次保存时创建 v1；后续保存自动递增版本号。
        每次保存都会重新解析 content 中的 {{variable}} 占位符。

        参数:
            name:      模板名称
            content:   模板正文（可含 {{var}} 占位符）
            namespace: 命名空间，默认 "default"
            tags:      标签列表

        返回:
            保存后的 PromptTemplate 实例（含最新版本号）
        """
        with self._lock:
            key = (namespace, name)
            history = self._store.get(key, [])

            if history:
                # 已存在 → 递增版本号
                new_version = history[-1].version + 1
                template = PromptTemplate(
                    name=name,
                    namespace=namespace,
                    content=content,
                    version=new_version,
                    tags=tags or [],
                    created_at=datetime.now(timezone.utc),
                )
            else:
                # 首次保存 → v1
                template = PromptTemplate(
                    name=name,
                    namespace=namespace,
                    content=content,
                    version=1,
                    tags=tags or [],
                    created_at=datetime.now(timezone.utc),
                )

            # 将新版本追加到历史
            self._store.setdefault(key, []).append(template)
            return template

    def get(
        self,
        name: str,
        namespace: str = "default",
        version: int | None = None,
    ) -> PromptTemplate | None:
        """
        获取指定模板

        参数:
            name:      模板名称
            namespace: 命名空间
            version:   指定版本号；None 则返回最新版本

        返回:
            匹配的 PromptTemplate，不存在则返回 None
        """
        with self._lock:
            key = (namespace, name)
            history = self._store.get(key)
            if not history:
                return None

            if version is None:
                # 返回最新版本
                return history[-1]

            # 按版本号查找
            for tpl in history:
                if tpl.version == version:
                    return tpl
            return None

    def list(
        self,
        namespace: str | None = None,
        tag: str | None = None,
    ) -> list[PromptTemplate]:
        """
        列出模板（每个模板仅返回最新版本）

        参数:
            namespace: 过滤命名空间；None 则返回所有命名空间
            tag:       按标签过滤；None 则不过滤

        返回:
            满足条件的最新版本 PromptTemplate 列表
        """
        with self._lock:
            result: list[PromptTemplate] = []
            for (ns, _name), history in self._store.items():
                if namespace is not None and ns != namespace:
                    continue
                latest = history[-1]
                if tag is not None and tag not in latest.tags:
                    continue
                result.append(latest)
            return result

    def delete(
        self,
        name: str,
        namespace: str = "default",
        version: int | None = None,
    ) -> bool:
        """
        删除模板

        参数:
            name:      模板名称
            namespace: 命名空间
            version:   指定版本号删除；None 则删除该模板所有版本

        返回:
            True 表示成功删除，False 表示未找到
        """
        with self._lock:
            key = (namespace, name)
            history = self._store.get(key)
            if not history:
                return False

            if version is None:
                # 删除整个模板（所有版本）
                del self._store[key]
                return True

            # 删除指定版本
            new_history = [t for t in history if t.version != version]
            if len(new_history) == len(history):
                return False  # 版本不存在

            if new_history:
                self._store[key] = new_history
            else:
                # 所有版本都删了，清理 key
                del self._store[key]
            return True

    def history(
        self,
        name: str,
        namespace: str = "default",
    ) -> list[PromptTemplate]:
        """
        获取模板的完整版本历史

        参数:
            name:      模板名称
            namespace: 命名空间

        返回:
            按版本号升序排列的 PromptTemplate 列表；不存在则返回空列表
        """
        with self._lock:
            key = (namespace, name)
            return list(self._store.get(key, []))

    def rollback(
        self,
        name: str,
        target_version: int,
        namespace: str = "default",
    ) -> PromptTemplate | None:
        """
        回滚到指定历史版本

        实际操作：将目标版本的内容作为新版本保存（不删除历史记录）。

        参数:
            name:          模板名称
            target_version: 要回滚到的版本号
            namespace:     命名空间

        返回:
            回滚后创建的新版本 PromptTemplate；目标版本不存在则返回 None
        """
        with self._lock:
            key = (namespace, name)
            history = self._store.get(key)
            if not history:
                return None

            # 查找目标版本
            target: PromptTemplate | None = None
            for tpl in history:
                if tpl.version == target_version:
                    target = tpl
                    break

            if target is None:
                return None

            # 以目标版本内容创建新版本
            new_version = history[-1].version + 1
            rolled_back = PromptTemplate(
                name=name,
                namespace=namespace,
                content=target.content,
                version=new_version,
                tags=list(target.tags),
                created_at=datetime.now(timezone.utc),
            )
            history.append(rolled_back)
            return rolled_back

    def render(
        self,
        name: str,
        variables: dict[str, Any] | None = None,
        namespace: str = "default",
        version: int | None = None,
    ) -> str | None:
        """
        渲染模板：将 {{variable}} 占位符替换为实际值

        参数:
            name:      模板名称
            variables: 变量字典，key 为变量名，value 为替换值
            namespace: 命名空间
            version:   指定版本号；None 则使用最新版本

        返回:
            替换后的最终文本；模板不存在则返回 None

        示例:
            store.render("greet", {"user": "Alice"})
            # 模板 "Hello {{user}}!" → "Hello Alice!"
        """
        template = self.get(name, namespace=namespace, version=version)
        if template is None:
            return None

        if variables is None:
            variables = {}

        def _replace(match: re.Match[str]) -> str:
            """替换匹配到的 {{variable}}"""
            var_name = match.group(1)
            if var_name in variables:
                return str(variables[var_name])
            # 变量未提供时保留原始占位符
            return match.group(0)

        return re.sub(r"\{\{(\w+)\}\}", _replace, template.content)

    # ------------------------------------------------------------------ #
    #  调试辅助
    # ------------------------------------------------------------------ #

    def stats(self) -> dict[str, Any]:
        """
        返回仓库统计信息（调试用）

        返回:
            包含模板总数、版本总数、命名空间列表的字典
        """
        with self._lock:
            total_templates = len(self._store)
            total_versions = sum(len(h) for h in self._store.values())
            namespaces = sorted({ns for ns, _ in self._store.keys()})
            return {
                "total_templates": total_templates,
                "total_versions": total_versions,
                "namespaces": namespaces,
            }

    @classmethod
    def reset(cls) -> None:
        """
        重置单例（仅用于测试）

        清除全局实例，下次调用 PromptStore() 将创建新实例。
        """
        with cls._lock_cls:
            cls._instance = None
