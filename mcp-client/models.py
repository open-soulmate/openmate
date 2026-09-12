"""MCP Client 数据模型"""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid


class TransportType(str, Enum):
    STDIO = "stdio"
    STREAMABLE_HTTP = "streamable_http"


class ServerStatus(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class Tool(BaseModel):
    """MCP 工具定义"""
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    inputSchema: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """MCP 工具调用结果"""
    content: list[dict[str, Any]] = Field(default_factory=list)
    is_error: bool = False


class ServerConfig(BaseModel):
    """MCP Server 配置"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    transport: TransportType = TransportType.STDIO
    command: str = ""  # stdio 用
    url: str = ""  # streamable_http 用
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    auto_connect: bool = False


class ServerState(BaseModel):
    """Server 运行时状态（配置 + 状态 + 缓存工具）"""
    config: ServerConfig
    status: ServerStatus = ServerStatus.DISCONNECTED
    tools: list[Tool] = Field(default_factory=list)
    error: Optional[str] = None


class CallToolRequest(BaseModel):
    """工具调用请求"""
    server_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
