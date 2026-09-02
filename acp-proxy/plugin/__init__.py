"""
Plugin v1.0 插件扩展系统

提供插件定义、生命周期管理、Hook拦截和权限管控能力。
所有逻辑纯Python内存实现，不依赖外部框架。

使用示例:
    from plugin.models import PluginManifest, PluginInstance
    from plugin.loader import PluginLoader
    from plugin.hooks import hook_registry, trigger_hook, hook

    # 定义插件清单
    manifest = PluginManifest(
        name="my-plugin",
        version="1.0.0",
        author="developer",
        description="示例插件",
        hooks=["before_session_create"],
        permissions=["session.read"],
    )

    # 注册Hook
    @hook("before_session_create", priority=10)
    def my_handler(ctx):
        print("会话即将创建")

    # 触发Hook
    await trigger_hook("before_session_create", {"session_id": "abc"})
"""

from plugin.models import PluginManifest, PluginInstance, HookContext, PluginState
from plugin.loader import PluginLoader
from plugin.hooks import hook_registry, trigger_hook, hook

__all__ = [
    "PluginManifest",
    "PluginInstance",
    "HookContext",
    "PluginState",
    "PluginLoader",
    "hook_registry",
    "trigger_hook",
    "hook",
]
