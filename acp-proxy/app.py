"""FastAPI app for ACP Proxy service — 支持插件动态加载

集成ModelRouter智能路由REST API，提供模型选择、模式切换、统计查询等端点。
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from proxy import get_acp_process
from ws_chat import router as ws_router
from ws_acp import ws_acp_endpoint  # ACP JSON-RPC 2.0纯透传端点
from a2a.server import router as a2a_router, rpc_router as a2a_rpc_router, well_known_router
from mcp.server import router as mcp_router
from gateway.router import router as gateway_router
from model_router import get_model_router  # 智能模型路由

logger = logging.getLogger("acp-proxy.app")

# 插件目录 — 与OpenMate核心代码分离
PLUGINS_DIR = Path(__file__).parent.parent / "plugins"


def load_plugins(app: FastAPI) -> list[str]:
    """
    动态加载所有插件
    
    扫描plugins目录，加载每个插件的：
    1. plugin.json（元数据）
    2. __init__.py（register_routes函数）
    
    返回:
        已加载的插件名称列表
    """
    loaded = []
    
    if not PLUGINS_DIR.exists():
        logger.warning("插件目录不存在: %s", PLUGINS_DIR)
        return loaded
    
    # 将plugins目录加入Python路径
    plugins_str = str(PLUGINS_DIR)
    if plugins_str not in sys.path:
        sys.path.insert(0, plugins_str)
    
    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        
        plugin_json = plugin_dir / "plugin.json"
        init_py = plugin_dir / "__init__.py"
        
        if not plugin_json.exists() or not init_py.exists():
            continue
        
        plugin_name = plugin_dir.name
        
        try:
            # 读取插件清单
            import json
            with open(plugin_json, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            
            # 动态导入插件模块
            plugin_module = __import__(plugin_name)
            
            # 调用register_routes注册API
            if hasattr(plugin_module, "register_routes"):
                plugin_module.register_routes(app)
                logger.info("✅ 插件已加载: %s v%s - %s", 
                    manifest.get("name", plugin_name),
                    manifest.get("version", "0.0.0"),
                    manifest.get("description", "")
                )
                loaded.append(plugin_name)
            else:
                logger.warning("⚠️ 插件 %s 缺少 register_routes 函数", plugin_name)
                
        except Exception as e:
            logger.error("❌ 插件 %s 加载失败: %s", plugin_name, e)
    
    return loaded


@asynccontextmanager
async def lifespan(app: FastAPI):
    """ACP Proxy生命周期 — 启动FastAPI服务并加载插件"""
    logger.info("ACP Proxy starting (Agent Engine managed separately)")
    
    # 加载所有插件
    loaded_plugins = load_plugins(app)
    if loaded_plugins:
        logger.info("已加载 %d 个插件: %s", len(loaded_plugins), ", ".join(loaded_plugins))
    
    yield
    
    logger.info("ACP Proxy stopped")


app = FastAPI(title="ACP Proxy", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 核心路由（OpenMate内置）
app.include_router(ws_router)
app.include_router(a2a_router)
app.include_router(a2a_rpc_router)  # /rpc/a2a 规范路径
app.include_router(well_known_router)
app.include_router(mcp_router)  # /admin/mcp 管控端点
app.include_router(gateway_router)  # /rpc 统一入口

# 注意: 插件路由（如/bidding）在lifespan中动态加载


# ACP JSON-RPC 2.0纯透传端点 — 所有agent统一走此端点
@app.websocket("/ws/acp")
async def ws_acp_route(websocket: WebSocket):
    await ws_acp_endpoint(websocket)


# A2A JSON-RPC 2.0 WebSocket长连接端点
@app.websocket("/ws/a2a")
async def ws_a2a_route(websocket: WebSocket):
    """A2A WebSocket长连接 — Agent间双向通信。"""
    from ws_a2a import ws_a2a_endpoint
    await ws_a2a_endpoint(websocket)


# MCP WebSocket长连接端点
@app.websocket("/ws/mcp")
async def ws_mcp_route(websocket: WebSocket):
    """MCP WebSocket长连接 — 底层管控通道。"""
    from ws_mcp import ws_mcp_endpoint
    await ws_mcp_endpoint(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "acp-proxy"}


@app.get("/plugins")
async def list_plugins():
    """列出所有已加载的插件（包含完整manifest）"""
    plugins = []
    if PLUGINS_DIR.exists():
        for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
            plugin_json = plugin_dir / "plugin.json"
            if plugin_json.exists():
                import json
                with open(plugin_json, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                plugins.append({
                    "name": manifest.get("name", plugin_dir.name),
                    "version": manifest.get("version", "0.0.0"),
                    "description": manifest.get("description", ""),
                    "status": "loaded",
                    "manifest": manifest  # 返回完整manifest供前端读取nav配置
                })
    return {"plugins": plugins, "count": len(plugins)}


# ============================================================
# ModelRouter 智能路由 REST API 端点
# ============================================================

from pydantic import BaseModel as PydanticBaseModel  # 请求体校验


class SetModeRequest(PydanticBaseModel):
    """设置路由模式的请求体"""
    mode: str  # auto / cost / balance / intelligence


@app.get("/api/model-router/config")
async def model_router_config():
    """获取当前路由配置 — 包含所有tier的模型列表和连接信息"""
    router = get_model_router()
    return router.get_config()


@app.post("/api/model-router/mode")
async def model_router_set_mode(req: SetModeRequest):
    """设置路由模式 — 支持热切换，无需重启服务

    请求体: {"mode": "auto"} / {"mode": "cost"} / {"mode": "balance"} / {"mode": "intelligence"}
    """
    router = get_model_router()
    success = router.set_mode(req.mode)
    if not success:
        return {"success": False, "error": f"未知模式: {req.mode}，可选: auto/cost/balance/intelligence"}
    return {"success": True, "mode": req.mode, "status": router.get_status()}


@app.get("/api/model-router/status")
async def model_router_status():
    """获取路由状态和统计 — 包含请求计数、模型使用分布、平均复杂度等"""
    router = get_model_router()
    return router.get_status()
