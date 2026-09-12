"""Server 管理 API"""

import logging
from fastapi import APIRouter, HTTPException

from models import ServerConfig, ServerState
from connection import MCPError

logger = logging.getLogger("mcp-client.routes.servers")

# registry 实例由 main.py 注入
_registry = None


def init(registry):
    global _registry
    _registry = registry


router = APIRouter(prefix="/api/mcp/servers", tags=["servers"])


@router.get("")
async def list_servers():
    """列出所有已配置的 MCP Server"""
    servers = _registry.list_servers()
    return {
        "servers": [
            {
                "id": s.config.id,
                "name": s.config.name,
                "transport": s.config.transport.value,
                "command": s.config.command,
                "args": s.config.args,
                "status": s.status.value,
                "tools_count": len(s.tools),
                "error": s.error,
            }
            for s in servers
        ]
    }


@router.post("", status_code=201)
async def add_server(config: ServerConfig):
    """添加 Server 配置"""
    state = _registry.add_server(config)
    return {
        "id": state.config.id,
        "name": state.config.name,
        "status": state.status.value,
    }


@router.get("/{server_id}")
async def get_server(server_id: str):
    """获取单个 Server 详情"""
    state = _registry.get_server(server_id)
    if not state:
        raise HTTPException(404, f"Server not found: {server_id}")
    return {
        "id": state.config.id,
        "name": state.config.name,
        "transport": state.config.transport.value,
        "command": state.config.command,
        "args": state.config.args,
        "env": state.config.env,
        "auto_connect": state.config.auto_connect,
        "status": state.status.value,
        "tools": [t.model_dump() for t in state.tools],
        "error": state.error,
    }


@router.delete("/{server_id}")
async def delete_server(server_id: str):
    """删除 Server 配置"""
    if not _registry.remove_server(server_id):
        raise HTTPException(404, f"Server not found: {server_id}")
    return {"ok": True}


@router.post("/{server_id}/connect")
async def connect_server(server_id: str):
    """连接 Server（启动子进程 + MCP 握手 + 工具发现）"""
    state = _registry.get_server(server_id)
    if not state:
        raise HTTPException(404, f"Server not found: {server_id}")
    try:
        state = await _registry.connect(server_id)
        return {
            "id": state.config.id,
            "name": state.config.name,
            "status": state.status.value,
            "tools_count": len(state.tools),
        }
    except MCPError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        logger.exception("连接失败")
        raise HTTPException(500, str(e))


@router.post("/{server_id}/disconnect")
async def disconnect_server(server_id: str):
    """断开 Server 连接"""
    state = _registry.get_server(server_id)
    if not state:
        raise HTTPException(404, f"Server not found: {server_id}")
    try:
        state = await _registry.disconnect(server_id)
        return {
            "id": state.config.id,
            "status": state.status.value,
        }
    except MCPError as e:
        raise HTTPException(502, str(e))


@router.get("/{server_id}/tools")
async def list_server_tools(server_id: str):
    """列出该 Server 的工具"""
    state = _registry.get_server(server_id)
    if not state:
        raise HTTPException(404, f"Server not found: {server_id}")
    return {
        "server_id": server_id,
        "server_name": state.config.name,
        "tools": [t.model_dump() for t in state.tools],
    }
