"""
MCP Server 连接池 + 工具发现缓存
管理多个 MCP Server 连接，提供工具聚合。
"""

import asyncio
import logging
import os
from typing import Optional, Union

from connection import MCPServerConnection, StreamableHTTPConnection, MCPError
from models import ServerConfig, ServerState, ServerStatus, Tool, TransportType

logger = logging.getLogger("mcp-client.registry")


class MCPRegistry:
    """多 Server 连接池管理器"""

    def __init__(self):
        # server_id -> ServerState
        self._servers: dict[str, ServerState] = {}
        # server_id -> MCPServerConnection | StreamableHTTPConnection (仅已连接的)
        self._connections: dict[str, Union[MCPServerConnection, StreamableHTTPConnection]] = {}

    # ── Server 配置管理 ──────────────────────────────────────────

    def add_server(self, config: ServerConfig) -> ServerState:
        """添加 Server 配置（不连接）"""
        state = ServerState(config=config)
        self._servers[config.id] = state
        logger.info("添加 Server 配置: %s (%s)", config.name, config.id)
        return state

    def remove_server(self, server_id: str) -> bool:
        """删除 Server 配置（调用方应先断开连接）"""
        if server_id not in self._servers:
            return False
        # 关闭连接（如果还存在）
        conn = self._connections.pop(server_id, None)
        if conn:
            # 标记为待清理，close 会在后台执行
            asyncio.ensure_future(conn.close())
        del self._servers[server_id]
        logger.info("删除 Server: %s", server_id)
        return True

    def get_server(self, server_id: str) -> Optional[ServerState]:
        return self._servers.get(server_id)

    def list_servers(self) -> list[ServerState]:
        return list(self._servers.values())

    # ── 连接管理 ─────────────────────────────────────────────────

    async def connect(self, server_id: str) -> ServerState:
        """连接 Server：根据 transport 类型选择 stdio 或 Streamable HTTP"""
        state = self._servers.get(server_id)
        if not state:
            raise MCPError(f"未找到 Server: {server_id}")

        if server_id in self._connections:
            logger.info("Server %s 已连接，跳过", server_id)
            return state

        config = state.config
        state.status = ServerStatus.CONNECTING
        state.error = None

        try:
            if config.transport == TransportType.STREAMABLE_HTTP:
                return await self._connect_streamable_http(server_id, state)
            else:
                return await self._connect_stdio(server_id, state)
        except Exception as e:
            state.status = ServerStatus.ERROR
            state.error = str(e)
            logger.error("[%s] 连接失败: %s", config.name, e)
            raise

    async def _connect_stdio(self, server_id: str, state: ServerState) -> ServerState:
        """通过 stdio 子进程连接 MCP Server"""
        config = state.config

        full_args = [config.command] + config.args
        # 环境变量：仅传显式配置的，不继承父进程全部 env
        merged_env = {**os.environ, **config.env} if config.env else os.environ.copy()

        logger.info("启动 MCP Server: %s %s", config.command, " ".join(config.args))
        process = await asyncio.create_subprocess_exec(
            *full_args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=merged_env,
        )

        conn = MCPServerConnection(config.name, process)
        await conn.start_reading()

        # MCP 握手
        init_result = await conn.send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "openmate-mcp-client", "version": "1.0.0"},
        })
        logger.info("[%s] MCP 初始化完成: %s", config.name, init_result)
        # kilocode #19：捕获server能力声明（resources能力门，getServerCapabilities()?同构）
        state.capabilities = (init_result or {}).get("capabilities") or {}

        await conn.send_notification("notifications/initialized")

        # 工具发现
        tools_result = await conn.send_request("tools/list")
        tools = [Tool(**t) for t in tools_result.get("tools", [])]
        logger.info("[%s] 发现 %d 个工具", config.name, len(tools))

        # 保存
        self._connections[server_id] = conn
        state.status = ServerStatus.CONNECTED
        state.tools = tools
        state.error = None

        # 监听子进程退出
        asyncio.create_task(self._watch_process(server_id, process))

        return state

    async def _connect_streamable_http(
        self, server_id: str, state: ServerState
    ) -> ServerState:
        """通过 Streamable HTTP 连接远程 MCP Server"""
        config = state.config

        if not config.url:
            raise MCPError("Streamable HTTP 传输需要配置 url")

        logger.info("连接远程 MCP Server: %s (%s)", config.name, config.url)

        conn = StreamableHTTPConnection(config.name, config.url)

        # MCP 握手（Streamable HTTP 协议版本 2025-06-18）
        init_result = await conn.send_request("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "openmate-mcp-client", "version": "1.0.0"},
        })
        logger.info("[%s] MCP 初始化完成: %s", config.name, init_result)
        # kilocode #19：捕获server能力声明（resources能力门，getServerCapabilities()?同构）
        state.capabilities = (init_result or {}).get("capabilities") or {}

        await conn.send_notification("notifications/initialized")

        # 工具发现
        tools_result = await conn.send_request("tools/list")
        tools = [Tool(**t) for t in tools_result.get("tools", [])]
        logger.info("[%s] 发现 %d 个工具", config.name, len(tools))

        # 保存
        self._connections[server_id] = conn
        state.status = ServerStatus.CONNECTED
        state.tools = tools
        state.error = None

        return state

    async def disconnect(self, server_id: str) -> ServerState:
        """断开 Server 连接"""
        state = self._servers.get(server_id)
        if not state:
            raise MCPError(f"未找到 Server: {server_id}")
        await self._disconnect_internal(server_id)
        return state

    async def _disconnect_internal(self, server_id: str):
        conn = self._connections.pop(server_id, None)
        if conn:
            await conn.close()
        state = self._servers.get(server_id)
        if state:
            state.status = ServerStatus.DISCONNECTED
            state.tools = []
            state.capabilities = {}
            state.error = None

    async def _watch_process(self, server_id: str, process: asyncio.subprocess.Process):
        """监控子进程退出"""
        await process.wait()
        state = self._servers.get(server_id)
        if state and state.status == ServerStatus.CONNECTED:
            logger.warning("[%s] 子进程退出 (code=%s)", state.config.name, process.returncode)
            state.status = ServerStatus.ERROR
            state.error = f"子进程退出 (code={process.returncode})"
            state.capabilities = {}
            self._connections.pop(server_id, None)

    # ── 工具操作 ─────────────────────────────────────────────────

    def get_tools(self, server_id: str) -> list[Tool]:
        """获取指定 Server 的缓存工具列表"""
        state = self._servers.get(server_id)
        if not state:
            raise MCPError(f"未找到 Server: {server_id}")
        return state.tools

    def list_all_tools(self) -> list[dict]:
        """聚合所有已连接 Server 的工具列表"""
        all_tools = []
        for server_id, state in self._servers.items():
            if state.status == ServerStatus.CONNECTED:
                for tool in state.tools:
                    all_tools.append({
                        **tool.model_dump(),
                        "server_id": server_id,
                        "server_name": state.config.name,
                    })
        return all_tools

    async def call_tool(self, server_id: str, tool_name: str, arguments: dict) -> dict:
        """调用指定 Server 的工具"""
        conn = self._connections.get(server_id)
        if not conn:
            raise MCPError(f"Server 未连接: {server_id}")

        logger.info("[%s] 调用工具: %s", server_id, tool_name)
        result = await conn.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })
        return result

    # ── Resources（kilocode #19 MCP resource三件套）─────────────────

    def _resource_connections(self, server_id: Optional[str] = None) -> dict:
        """connected + resources能力的连接。

        kilocode session/tools.ts 能力门同构（getServerCapabilities()?.resources）：
        无resources能力的Server不进resource面。server_id指定时只返回该Server。
        注意：MCP能力声明形如 "resources": {}——**空dict也是合法声明**（JS里
        `?.resources`对空对象是truthy），能力判定必须用键存在性，禁用真值判断。
        """
        out = {}
        for sid, conn in self._connections.items():
            state = self._servers.get(sid)
            if not state or state.status != ServerStatus.CONNECTED:
                continue
            if "resources" not in (state.capabilities or {}):
                continue
            if server_id and sid != server_id:
                continue
            out[sid] = conn
        return out

    def resource_server_ids(self) -> list[str]:
        """resource能力Server清单（工具面裁剪依据——无能力不暴露resource工具）"""
        return sorted(self._resource_connections().keys())

    def _annotate_resource(self, entry: dict, server_id: str, server_name: str, uri_key: str) -> dict:
        """资源条目加server归属 + 按(server_name, name, uri)排序键（kilocode formatMcpResource）"""
        return {
            **entry,
            "server_id": server_id,
            "server_name": server_name,
            "_sort": (server_name, str(entry.get("name", "")), str(entry.get(uri_key, ""))),
        }

    @staticmethod
    def _finish_resource_entries(entries: list[dict]) -> list[dict]:
        entries.sort(key=lambda e: e.pop("_sort", ("", "", "")))
        return entries

    async def list_resources(self, server_id: Optional[str] = None) -> dict:
        """聚合resources/list（kilocode list_mcp_resources）。

        单Server失败不拖垮聚合（错误显式进errors，mem0 §1.1失败可见不静默）。
        """
        resources: list[dict] = []
        errors: list[dict] = []
        for sid, conn in sorted(self._resource_connections(server_id).items()):
            state = self._servers[sid]
            try:
                result = await conn.send_request("resources/list", {})
                for r in (result or {}).get("resources", []) or []:
                    resources.append(self._annotate_resource(r, sid, state.config.name, "uri"))
            except MCPError as e:
                errors.append({"server_id": sid, "error": str(e)})
            except Exception as e:
                errors.append({"server_id": sid, "error": str(e)})
        return {"resources": self._finish_resource_entries(resources), "errors": errors}

    async def list_resource_templates(self, server_id: Optional[str] = None) -> dict:
        """聚合resources/templates/list（kilocode list_mcp_resource_templates）"""
        templates: list[dict] = []
        errors: list[dict] = []
        for sid, conn in sorted(self._resource_connections(server_id).items()):
            state = self._servers[sid]
            try:
                result = await conn.send_request("resources/templates/list", {})
                for t in (result or {}).get("resourceTemplates", []) or []:
                    templates.append(self._annotate_resource(t, sid, state.config.name, "uriTemplate"))
            except MCPError as e:
                errors.append({"server_id": sid, "error": str(e)})
            except Exception as e:
                errors.append({"server_id": sid, "error": str(e)})
        return {"resourceTemplates": self._finish_resource_entries(templates), "errors": errors}

    async def read_resource(self, server_id: str, uri: str) -> dict:
        """resources/read（kilocode read_mcp_resource）——原始contents透传，
        blob上限/附件MIME白名单在agent侧注入层执行（kilocode同位：tools.ts格式化层）。"""
        conn = self._connections.get(server_id)
        if not conn:
            raise MCPError(f"Server 未连接: {server_id}")
        state = self._servers.get(server_id)
        # 能力判定=键存在性（"resources": {}是合法声明，空dict不可当无能力）
        if not state or "resources" not in (state.capabilities or {}):
            raise MCPError(f'MCP server "{server_id}" does not support resources')
        logger.info("[%s] 读取资源: %s", server_id, uri)
        return await conn.send_request("resources/read", {"uri": uri})

    # ── 状态查询 ─────────────────────────────────────────────────

    def get_status(self) -> list[dict]:
        """所有 Server 连接状态"""
        return [
            {
                "id": sid,
                "name": state.config.name,
                "status": state.status.value,
                "tools_count": len(state.tools),
                "error": state.error,
            }
            for sid, state in self._servers.items()
        ]
