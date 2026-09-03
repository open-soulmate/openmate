"""
插件路由注册扩展 — 让插件可以注册FastAPI路由

插件通过 register_routes(app) 函数声明自己的API端点，
Loader在加载插件时自动调用。
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("plugin.routes")


async def invoke_register_routes(module: Any, app: Any, plugin_name: str) -> int:
    """
    调用插件模块的 register_routes(app) 函数
    
    参数:
        module: 插件Python模块
        app: FastAPI应用实例
        plugin_name: 插件名称（用于日志）
    
    返回:
        注册的路由数量
    """
    register_fn = getattr(module, "register_routes", None)
    if not callable(register_fn):
        return 0
    
    import inspect
    result = register_fn(app)
    if inspect.isawaitable(result):
        await result
    
    # 统计注册的路由数
    routes_count = len([r for r in app.routes if hasattr(r, "path") and "bidding" in r.path.lower()])
    logger.info("插件 %s 注册了路由", plugin_name)
    return routes_count


async def invoke_unregister_routes(module: Any, app: Any, plugin_name: str) -> None:
    """
    调用插件模块的 unregister_routes(app) 函数（如果有）
    """
    unregister_fn = getattr(module, "unregister_routes", None)
    if not callable(unregister_fn):
        return
    
    import inspect
    result = unregister_fn(app)
    if inspect.isawaitable(result):
        await result
    
    logger.info("插件 %s 注销了路由", plugin_name)
