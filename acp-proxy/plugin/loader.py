"""
插件加载器 — 管理插件生命周期和Hook注册

负责插件的加载、启用、禁用和卸载，以及权限校验。
插件通过模块路径加载，Loader会：
1. 导入插件模块
2. 读取其 get_manifest() 和 register_hooks() 接口
3. 校验权限声明
4. 管理状态流转
"""

from __future__ import annotations

import importlib
import logging
from typing import Any

from plugin.models import (
    KNOWN_PERMISSIONS,
    HookContext,
    PluginInstance,
    PluginManifest,
    PluginState,
)
from plugin.hooks import hook_registry
from plugin.routes import invoke_register_routes, invoke_unregister_routes

logger = logging.getLogger("plugin.loader")


# ---- 权限校验 ----

class PermissionDenied(Exception):
    """插件缺少运行所需权限时抛出"""
    pass


def check_permissions(
    manifest: PluginManifest,
    required: set[str] | None = None,
) -> None:
    """
    校验插件权限声明

    参数:
        manifest: 插件清单
        required: 运行时要求的权限集合（如为空则仅校验声明合法性）

    异常:
        PermissionDenied: 声明了未知权限或缺少必要权限
    """
    # 校验声明的权限是否都合法
    declared = set(manifest.permissions)
    unknown = declared - KNOWN_PERMISSIONS
    if unknown:
        raise PermissionDenied(f"插件 {manifest.name} 声明了未知权限: {unknown}")

    # 如果调用方要求特定权限，检查插件是否声明了这些权限
    if required:
        missing = required - declared
        if missing:
            raise PermissionDenied(
                f"插件 {manifest.name} 缺少必要权限: {missing}，"
                f"已声明权限: {declared}"
            )


# ---- 插件加载器 ----

class PluginLoader:
    """
    插件加载器 — 管理全部插件实例的生命周期

    职责:
    - 加载/卸载插件（读取manifest，注册/注销Hook）
    - 启用/禁用插件（状态流转+Hook激活控制）
    - 权限校验
    - 插件实例查询

    使用方式:
        loader = PluginLoader()

        # 从模块路径加载插件
        instance = await loader.load("my_plugin_module")

        # 启用
        await loader.enable("my-plugin")

        # 查询
        info = loader.get_plugin("my-plugin")

        # 禁用 / 卸载
        await loader.disable("my-plugin")
        await loader.uninstall("my-plugin")
    """

    def __init__(self) -> None:
        # {plugin_name: PluginInstance}
        self._plugins: dict[str, PluginInstance] = {}

    def _resolve_manifest(self, module: Any) -> PluginManifest:
        """
        从插件模块解析Manifest

        优先调用模块的 get_manifest() 函数，
        也支持模块直接定义 MANIFEST 变量。

        参数:
            module: 已导入的插件Python模块

        返回:
            PluginManifest对象

        异常:
            RuntimeError: 模块缺少manifest定义
        """
        # 方式1: get_manifest() 函数
        getter = getattr(module, "get_manifest", None)
        if callable(getter):
            manifest = getter()
            if isinstance(manifest, PluginManifest):
                return manifest

        # 方式2: MANIFEST 变量
        manifest_var = getattr(module, "MANIFEST", None)
        if isinstance(manifest_var, PluginManifest):
            return manifest_var

        raise RuntimeError(
            f"插件模块缺少 get_manifest() 函数或 MANIFEST 变量"
        )

    async def _invoke_register_hooks(
        self, module: Any, instance: PluginInstance
    ) -> None:
        """
        调用插件模块的 register_hooks() 函数，让插件注册自己的Hook

        参数:
            module: 插件模块
            instance: 插件实例
        """
        register_fn = getattr(module, "register_hooks", None)
        if callable(register_fn):
            import inspect
            result = register_fn(instance)
            if inspect.isawaitable(result):
                await result

    async def load(self, module_path: str) -> PluginInstance:
        """
        加载插件（不注册路由）

        流程: 导入模块 → 解析manifest → 校验权限 → 注册Hook → 创建实例

        参数:
            module_path: 插件Python模块路径（如 "plugins.my_plugin"）

        返回:
            已创建的PluginInstance（状态为INSTALLED）

        异常:
            RuntimeError: 模块加载失败或manifest缺失
            PermissionDenied: 权限校验失败
        """
        try:
            module = importlib.import_module(module_path)
        except ImportError as e:
            raise RuntimeError(f"无法导入插件模块 {module_path}: {e}") from e

        manifest = self._resolve_manifest(module)

        # 检查是否已加载同名插件
        if manifest.name in self._plugins:
            existing = self._plugins[manifest.name]
            if existing.state != PluginState.UNINSTALLED:
                raise RuntimeError(
                    f"插件 {manifest.name} 已加载，状态: {existing.state.value}"
                )

        # 权限校验
        check_permissions(manifest)

        # 创建实例
        instance = PluginInstance(
            manifest=manifest,
            state=PluginState.INSTALLED,
            module_path=module_path,
        )
        self._plugins[manifest.name] = instance

        # 调用插件注册Hook
        await self._invoke_register_hooks(module, instance)

        logger.info(
            "插件已加载: %s v%s (hooks=%d, permissions=%s)",
            manifest.name,
            manifest.version,
            len(manifest.hooks),
            manifest.permissions,
        )
        return instance

    async def load_with_app(self, module_path: str, app: Any) -> PluginInstance:
        """
        加载插件并注册路由

        流程: 导入模块 → 解析manifest → 校验权限 → 注册Hook → 注册路由 → 创建实例

        参数:
            module_path: 插件Python模块路径（如 "plugins.my_plugin"）
            app: FastAPI应用实例

        返回:
            已创建的PluginInstance（状态为ENABLED）
        """
        instance = await self.load(module_path)

        # 导入模块并注册路由
        module = importlib.import_module(module_path)
        await invoke_register_routes(module, app, instance.name)

        # 自动启用
        instance.transition(PluginState.ENABLED)

        logger.info("插件已加载并启用: %s", instance.name)
        return instance

    async def enable(self, plugin_name: str) -> PluginInstance:
        """
        启用插件

        流程: 校验状态 → 状态流转 → 标记Hook为活跃

        参数:
            plugin_name: 插件名称

        返回:
            已启用的PluginInstance

        异常:
            KeyError: 插件不存在
            RuntimeError: 当前状态不允许启用
        """
        instance = self._get_or_raise(plugin_name)
        instance.transition(PluginState.ENABLED)
        logger.info("插件已启用: %s", plugin_name)
        return instance

    async def disable(self, plugin_name: str) -> PluginInstance:
        """
        禁用插件

        流程: 校验状态 → 状态流转 → 注销该插件的Hook

        参数:
            plugin_name: 插件名称

        返回:
            已禁用的PluginInstance

        异常:
            KeyError: 插件不存在
            RuntimeError: 当前状态不允许禁用
        """
        instance = self._get_or_raise(plugin_name)
        instance.transition(PluginState.DISABLED)

        # 注销该插件的所有Hook
        count = hook_registry.unregister_plugin_hooks(plugin_name)
        instance.registered_hooks.clear()

        logger.info("插件已禁用: %s (注销 %d 个Hook)", plugin_name, count)
        return instance

    async def uninstall(self, plugin_name: str) -> PluginInstance:
        """
        卸载插件

        流程: 注销Hook → 状态设为UNINSTALLED → 调用插件cleanup（如有）

        参数:
            plugin_name: 插件名称

        返回:
            已卸载的PluginInstance

        异常:
            KeyError: 插件不存在
        """
        instance = self._get_or_raise(plugin_name)

        # 注销Hook
        count = hook_registry.unregister_plugin_hooks(plugin_name)
        instance.registered_hooks.clear()

        # 尝试调用插件的清理函数
        try:
            module = importlib.import_module(instance.module_path)
            cleanup_fn = getattr(module, "on_uninstall", None)
            if callable(cleanup_fn):
                import inspect
                result = cleanup_fn(instance)
                if inspect.isawaitable(result):
                    await result
        except Exception:
            logger.exception("插件 %s 清理函数执行异常", plugin_name)

        instance.transition(PluginState.UNINSTALLED)
        logger.info("插件已卸载: %s (注销 %d 个Hook)", plugin_name, count)
        return instance

    async def reload(self, plugin_name: str) -> PluginInstance:
        """
        重新加载插件（先卸载再加载）

        参数:
            plugin_name: 插件名称

        返回:
            重新加载后的PluginInstance
        """
        instance = self._get_or_raise(plugin_name)
        module_path = instance.module_path

        await self.uninstall(plugin_name)

        # 清理模块缓存以便重新导入
        import sys
        if module_path in sys.modules:
            del sys.modules[module_path]

        return await self.load(module_path)

    def get_plugin(self, plugin_name: str) -> PluginInstance | None:
        """
        获取插件实例（不存在返回None）

        参数:
            plugin_name: 插件名称

        返回:
            PluginInstance或None
        """
        return self._plugins.get(plugin_name)

    def list_plugins(
        self, state: PluginState | None = None
    ) -> list[PluginInstance]:
        """
        列出所有插件实例

        参数:
            state: 可选状态过滤

        返回:
            PluginInstance列表
        """
        plugins = list(self._plugins.values())
        if state is not None:
            plugins = [p for p in plugins if p.state == state]
        return plugins

    def get_stats(self) -> dict[str, Any]:
        """
        获取插件加载统计

        返回:
            包含各状态插件数量的字典
        """
        states: dict[str, int] = {}
        for p in self._plugins.values():
            states[p.state.value] = states.get(p.state.value, 0) + 1
        return {
            "total": len(self._plugins),
            "states": states,
            "hook_stats": hook_registry.get_stats(),
        }

    def _get_or_raise(self, plugin_name: str) -> PluginInstance:
        """获取插件实例，不存在则抛KeyError"""
        instance = self._plugins.get(plugin_name)
        if instance is None:
            raise KeyError(f"插件不存在: {plugin_name}")
        return instance


# ---- 全局加载器单例 ----

plugin_loader = PluginLoader()
