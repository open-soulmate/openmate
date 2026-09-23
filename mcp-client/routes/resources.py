"""MCP resource 操作 API（kilocode #19 resource三件套：list/read resources）

对应 kilocode session/tools.ts MCP_RESOURCE_TOOLS（list_mcp_resources /
list_mcp_resource_templates / read_mcp_resource）的服务侧资源面。
blob上限（10MB）与附件MIME白名单在agent侧注入层执行（kilocode同位：tools.ts格式化层），
本层只做JSON-RPC透传 + 未知Server的kilocode原文化错误契约。
"""

import logging
from fastapi import APIRouter, HTTPException, Query

from models import ReadResourceRequest
from connection import MCPError

logger = logging.getLogger("mcp-client.routes.resources")

_registry = None


def init(registry):
    global _registry
    _registry = registry


router = APIRouter(prefix="/api/mcp", tags=["resources"])


def _require_resource_server(server: str | None) -> list[str]:
    """kilocode session/tools.ts 未知Server错误契约原文：
    'MCP server "X" does not support resources[. Available resource servers: ...]'"""
    ids = _registry.resource_server_ids()
    if server and server not in ids:
        raise HTTPException(
            400,
            f'MCP server "{server}" does not support resources'
            + (f'. Available resource servers: {", ".join(ids)}' if ids else ""),
        )
    return ids


@router.get("/resources/servers")
async def list_resource_servers():
    """resource能力Server清单（agent侧工具面裁剪依据）"""
    out = []
    for sid in _registry.resource_server_ids():
        state = _registry.get_server(sid)
        out.append({"id": sid, "name": state.config.name if state else sid})
    return {"servers": out}


@router.get("/resources/all")
async def list_resources(server: str = Query(default="")):
    """聚合已连接Server的resources/list"""
    _require_resource_server(server or None)
    try:
        return await _registry.list_resources(server or None)
    except MCPError as e:
        raise HTTPException(400, str(e))


@router.get("/resources/templates")
async def list_resource_templates(server: str = Query(default="")):
    """聚合已连接Server的resources/templates/list"""
    _require_resource_server(server or None)
    try:
        return await _registry.list_resource_templates(server or None)
    except MCPError as e:
        raise HTTPException(400, str(e))


@router.post("/resources/read")
async def read_resource(req: ReadResourceRequest):
    """resources/read——原始contents透传（含blob），由agent侧做注入安全处理"""
    if not req.server_id or not req.uri:
        raise HTTPException(400, "server_id and uri are required")
    _require_resource_server(req.server_id)
    try:
        return await _registry.read_resource(req.server_id, req.uri)
    except MCPError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("资源读取失败")
        raise HTTPException(500, str(e))
