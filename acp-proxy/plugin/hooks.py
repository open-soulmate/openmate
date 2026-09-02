"""
Hook注册中心 — 全局单例

管理所有Hook点的注册和触发，支持：
- 按优先级排序执行
- 装饰器注册 (@hook)
- 显式注册 (register_hook)
- 异步/同步处理函数混合
- before_*类Hook的取消拦截机制
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Any, Callable, Coroutine, Optional, Union

from plugin.models import (
    HookContext,
    HookEntry,
    HookHandler,
    HOOK_POINTS,
)

logger = logging.getLogger("plugin.hooks")


class HookRegistry:
    """
    Hook注册中心 — 全局单例

    管理所有Hook点的处理函数注册和触发逻辑。
    每个Hook点维护一个按priority升序排列的处理函数列表。

    使用方式:
        # 方式1: 装饰器
        @hook_registry.hook("before_session_create", priority=10)
        def my_handler(ctx: HookContext):
            ...

        # 方式2: 显式注册
        hook_registry.register_hook("before_tool_call", my_func, priority=50)

        # 方式3: 带插件名注册（插件Loader使用）
        hook_registry.register_hook("on_event", my_func, plugin_name="my-plugin")

        # 触发
        await hook_registry.trigger_hook("before_session_create", {"session_id": "abc"})
    """

    def __init__(self) -> None:
        # {hook_point: [HookEntry, ...]} 按priority升序
        self._hooks: dict[str, list[HookEntry]] = {p: [] for p in HOOK_POINTS}

    def register_hook(
        self,
        hook_point: str,
        handler: HookHandler,
        priority: int = 100,
        plugin_name: str = "",
    ) -> HookEntry:
        """
        注册Hook处理函数

        参数:
            hook_point: Hook点名称，必须是HOOK_POINTS中的合法值
            handler: 处理函数，签名为 (HookContext) -> None（可为async）
            priority: 优先级，数值越小越先执行（默认100）
            plugin_name: 所属插件名，框架级Hook留空

        返回:
            HookEntry对象，可用于后续注销

        异常:
            ValueError: hook_point不是合法的Hook点
        """
        if hook_point not in HOOK_POINTS:
            raise ValueError(
                f"未知Hook点: {hook_point}，合法值: {HOOK_POINTS}"
            )

        entry = HookEntry(
            hook_point=hook_point,
            handler=handler,
            priority=priority,
            plugin_name=plugin_name,
        )

        # 按priority插入到正确位置（维持升序）
        hooks_list = self._hooks[hook_point]
        inserted = False
        for i, existing in enumerate(hooks_list):
            if priority < existing.priority:
                hooks_list.insert(i, entry)
                inserted = True
                break
        if not inserted:
            hooks_list.append(entry)

        logger.debug(
            "注册Hook: %s -> %s (priority=%d, plugin=%s)",
            hook_point,
            getattr(handler, "__name__", str(handler)),
            priority,
            plugin_name or "(framework)",
        )
        return entry

    def unregister_hook(self, entry: HookEntry) -> bool:
        """
        注销指定的Hook条目

        参数:
            entry: 注册时返回的HookEntry对象

        返回:
            是否成功注销（False表示未找到该条目）
        """
        hooks_list = self._hooks.get(entry.hook_point, [])
        try:
            hooks_list.remove(entry)
            logger.debug("注销Hook: %s -> %s", entry.hook_point, entry.plugin_name)
            return True
        except ValueError:
            return False

    def unregister_plugin_hooks(self, plugin_name: str) -> int:
        """
        注销指定插件的所有Hook

        参数:
            plugin_name: 插件名称

        返回:
            注销的Hook数量
        """
        count = 0
        for hook_point in HOOK_POINTS:
            hooks_list = self._hooks[hook_point]
            before = len(hooks_list)
            self._hooks[hook_point] = [
                e for e in hooks_list if e.plugin_name != plugin_name
            ]
            count += before - len(self._hooks[hook_point])
        if count:
            logger.debug("注销插件 %s 的 %d 个Hook", plugin_name, count)
        return count

    def get_hooks(self, hook_point: str) -> list[HookEntry]:
        """
        获取指定Hook点的所有注册条目（副本）

        参数:
            hook_point: Hook点名称

        返回:
            按priority排序的HookEntry列表副本
        """
        return list(self._hooks.get(hook_point, []))

    def hook(
        self,
        hook_point: str,
        priority: int = 100,
        plugin_name: str = "",
    ) -> Callable[[HookHandler], HookHandler]:
        """
        装饰器方式注册Hook

        用法:
            @registry.hook("before_session_create", priority=10)
            def my_handler(ctx: HookContext):
                print(ctx.data)

            @registry.hook("on_event", priority=50)
            async def async_handler(ctx: HookContext):
                await do_something()

        参数:
            hook_point: Hook点名称
            priority: 优先级（默认100）
            plugin_name: 所属插件名（默认框架级）
        """
        def decorator(fn: HookHandler) -> HookHandler:
            self.register_hook(hook_point, fn, priority, plugin_name)
            return fn
        return decorator

    async def trigger_hook(
        self,
        hook_point: str,
        data: dict[str, Any] | None = None,
    ) -> HookContext:
        """
        触发指定Hook点，按优先级顺序执行所有已注册的处理函数

        对于before_*类Hook，如果某个处理函数设置了ctx.cancelled=True，
        后续处理函数仍会执行，但返回的HookContext会携带cancelled标记，
        调用方可据此决定是否继续原操作。

        参数:
            hook_point: Hook点名称
            data: 传递给Hook处理函数的上下文数据

        返回:
            HookContext对象，可检查cancelled状态和data修改

        异常:
            ValueError: hook_point不是合法的Hook点
        """
        if hook_point not in HOOK_POINTS:
            raise ValueError(f"未知Hook点: {hook_point}")

        ctx = HookContext(hook_point=hook_point, data=data or {})
        hooks_list = self._hooks[hook_point]

        for entry in hooks_list:
            try:
                result = entry.handler(ctx)
                # 兼容异步处理函数
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception(
                    "Hook处理异常: %s -> %s (plugin=%s)",
                    hook_point,
                    getattr(entry.handler, "__name__", str(entry.handler)),
                    entry.plugin_name or "(framework)",
                )
                # 单个Hook异常不阻断后续执行

        return ctx

    def get_stats(self) -> dict[str, int]:
        """
        获取各Hook点的注册统计

        返回:
            {hook_point: registered_count} 字典
        """
        return {p: len(hooks) for p, hooks in self._hooks.items()}

    def clear(self) -> None:
        """清空所有Hook注册（用于测试）"""
        for p in HOOK_POINTS:
            self._hooks[p].clear()
        logger.debug("已清空所有Hook注册")


# ---- 全局单例 ----

hook_registry = HookRegistry()


# ---- 便捷函数（模块级快捷入口） ----

def hook(
    hook_point: str,
    priority: int = 100,
    plugin_name: str = "",
) -> Callable[[HookHandler], HookHandler]:
    """
    模块级Hook装饰器快捷方式

    用法:
        from plugin.hooks import hook

        @hook("before_session_create", priority=10)
        def my_handler(ctx):
            ...
    """
    return hook_registry.hook(hook_point, priority, plugin_name)


async def trigger_hook(
    hook_point: str,
    data: dict[str, Any] | None = None,
) -> HookContext:
    """
    模块级trigger_hook快捷方式

    用法:
        from plugin.hooks import trigger_hook
        ctx = await trigger_hook("before_session_create", {"session_id": "abc"})
    """
    return await hook_registry.trigger_hook(hook_point, data)
