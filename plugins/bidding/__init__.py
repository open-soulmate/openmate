"""
OpenMate 智能招投标插件 v1.0

遵循 Plugin v1.0 插件加载与生命周期规范：
- 工具统一注册至全局 Tool 网关
- 支持热加载（hot_reload=true）
- 权限白名单：file:read/write, storage:read/write, network:http, log:write
- 前端嵌入：openface组件体系
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger("plugin.bidding")

# 插件根目录
PLUGIN_DIR = Path(__file__).parent


def get_manifest() -> Dict[str, Any]:
    """
    返回插件清单（Plugin v1.0标准）
    
    插件清单定义了：
    - id/name/version: 插件标识
    - tools: 对外暴露的工具列表
    - permissions: 权限白名单
    - frontend: 前端嵌入配置
    """
    manifest_path = PLUGIN_DIR / "plugin.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


def register_routes(app: Any) -> None:
    """
    注册插件API路由到FastAPI应用
    
    遵循Plugin v1.0规范：
    - 路由前缀与插件id一致：/bidding
    - 所有接口通过网关统一调用
    - 每次调用自动记录日志
    """
    from .router import router
    app.include_router(router, tags=["plugin:bidding"])
    logger.info("[plugin:bidding] 路由已注册: /bidding/*")


def register_tools(tool_gateway: Any) -> None:
    """
    注册插件工具到全局Tool网关
    
    遵循Plugin v1.0规范：
    - 所有工具统一注册至网关
    - 调用链路：Skill/Agent → 网关鉴权 → 插件执行 → 日志埋点 → 返回
    """
    from .tools import bid_tools
    
    tools = [
        {
            "name": "parse_bid_document",
            "description": "解析招标文件，提取评分标准、技术参数、废标条款",
            "parameters": {"file_path": "招标文件路径"},
            "handler": bid_tools.parse_bid_document
        },
        {
            "name": "generate_outline",
            "description": "根据解析结果生成标书三级提纲",
            "parameters": {"project_id": "项目ID"},
            "handler": bid_tools.generate_outline
        },
        {
            "name": "generate_chapter",
            "description": "生成指定章节的标书内容",
            "parameters": {"project_id": "项目ID", "chapter_id": "章节ID"},
            "handler": bid_tools.generate_chapter
        },
        {
            "name": "check_compliance",
            "description": "合规风控检查",
            "parameters": {"project_id": "项目ID"},
            "handler": bid_tools.check_compliance
        },
        {
            "name": "export_to_word",
            "description": "导出Word文档",
            "parameters": {"project_id": "项目ID"},
            "handler": bid_tools.export_to_word
        }
    ]
    
    for tool in tools:
        tool_gateway.register_tool(
            name=tool["name"],
            description=tool["description"],
            parameters=tool["parameters"],
            handler=tool["handler"],
            plugin_id="bidding"
        )
    
    logger.info("[plugin:bidding] 已注册 %d 个工具到Tool网关", len(tools))


def on_enable() -> None:
    """插件启用回调"""
    logger.info("[plugin:bidding] 插件已启用")


def on_disable() -> None:
    """插件禁用回调"""
    logger.info("[plugin:bidding] 插件已禁用")


def on_uninstall() -> None:
    """插件卸载回调 — 清理资源"""
    logger.info("[plugin:bidding] 插件已卸载，资源已回收")
