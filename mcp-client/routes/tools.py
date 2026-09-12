"""工具操作 API"""

import logging
from fastapi import APIRouter, HTTPException

from models import CallToolRequest
from connection import MCPError

logger = logging.getLogger("mcp-client.routes.tools")

_registry = None


def init(registry):
    global _registry
    _registry = registry


router = APIRouter(prefix="/api/mcp", tags=["tools"])


@router.get("/tools/all")
async def list_all_tools():
    """聚合所有已连接 Server 的工具列表"""
    return {"tools": _registry.list_all_tools()}


@router.post("/tools/call")
async def call_tool(req: CallToolRequest):
    """调用工具"""
    try:
        result = await _registry.call_tool(req.server_id, req.tool_name, req.arguments)
        return result
    except MCPError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("工具调用失败")
        raise HTTPException(500, str(e))
