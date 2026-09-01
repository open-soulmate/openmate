"""
MCP客户端模块 — 通过JSON-RPC 2.0 over stdio连接MCP Server，调用工具。
支持文件读取、目录列表、通用工具调用等功能。
"""

import asyncio
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger("acp-agent.mcp")

# MCP JSON-RPC 请求ID自增计数器
_request_id_counter = 0


def _next_request_id() -> int:
    """生成下一个JSON-RPC请求ID"""
    global _request_id_counter
    _request_id_counter += 1
    return _request_id_counter


class MCPServerConnection:
    """单个MCP Server连接的状态管理"""

    def __init__(self, name: str, process: asyncio.subprocess.Process):
        """初始化Server连接，记录名称和子进程引用"""
        self.name = name
        self.process = process
        self._pending_requests: dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start_reading(self):
        """启动后台读取任务，持续从stdout读取JSON-RPC响应并分发给等待中的Future"""
        self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        """后台循环：从子进程stdout逐行读取JSON-RPC消息，匹配到pending请求则resolve其Future"""
        try:
            while self.process.stdout and not self.process.stdout.at_eof():
                line = await self.process.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode().strip())
                    msg_id = msg.get("id")
                    if msg_id is not None and msg_id in self._pending_requests:
                        future = self._pending_requests.pop(msg_id)
                        if not future.done():
                            if "error" in msg:
                                future.set_exception(
                                    MCPError(msg["error"].get("message", "Unknown error"),
                                             msg["error"].get("code", -1))
                                )
                            else:
                                future.set_result(msg.get("result"))
                except json.JSONDecodeError:
                    logger.warning("[%s] 无法解析MCP消息: %s", self.name, line[:200])
        except Exception as e:
            logger.error("[%s] 读取循环异常: %s", self.name, e)

    async def send_request(self, method: str, params: dict = None) -> dict:
        """发送JSON-RPC请求并等待响应。返回result字段内容"""
        request_id = _next_request_id()
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        if params is not None:
            payload["params"] = params

        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_requests[request_id] = future

        data = json.dumps(payload) + "\n"
        async with self._lock:
            if self.process.stdin:
                self.process.stdin.write(data.encode())
                await self.process.stdin.drain()

        return await asyncio.wait_for(future, timeout=30.0)

    async def send_notification(self, method: str, params: dict = None):
        """发送JSON-RPC通知（无id，不等待响应）"""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params is not None:
            payload["params"] = params

        data = json.dumps(payload) + "\n"
        async with self._lock:
            if self.process.stdin:
                self.process.stdin.write(data.encode())
                await self.process.stdin.drain()

    async def close(self):
        """关闭子进程连接，清理读取任务和pending请求"""
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        for future in self._pending_requests.values():
            if not future.done():
                future.set_exception(MCPError("连接已关闭", -1))
        self._pending_requests.clear()

        if self.process.returncode is None:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                self.process.kill()


class MCPError(Exception):
    """MCP协议错误"""
    def __init__(self, message: str, code: int = -1):
        """初始化MCP错误，记录错误码和消息"""
        super().__init__(message)
        self.code = code


class MCPClient:
    """MCP客户端 — 连接MCP Server，调用工具（文件读取、qpdf、7z等）"""

    def __init__(self, workspace: str = "/home/climbing"):
        """初始化MCP客户端，server连接池为空，设置工作目录白名单"""
        self.servers: dict[str, MCPServerConnection] = {}
        self.workspace = workspace
        self._tools_cache: Optional[list[dict]] = None

    async def connect_server(self, name: str, command: str, args: list[str] = None, env: dict = None):
        """连接一个MCP Server（通过stdio子进程），完成MCP初始化握手"""
        full_args = [command] + (args or [])
        merged_env = {**os.environ, **(env or {})}

        logger.info("[%s] 启动MCP Server: %s %s", name, command, " ".join(args or []))

        process = await asyncio.create_subprocess_exec(
            *full_args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=merged_env,
        )

        conn = MCPServerConnection(name, process)
        await conn.start_reading()

        try:
            # MCP握手步骤1: 发送initialize请求
            init_result = await conn.send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "openmate-agent",
                    "version": "0.1.0",
                },
            })
            logger.info("[%s] MCP Server已初始化: %s", name, init_result)

            # MCP握手步骤2: 发送initialized通知
            await conn.send_notification("notifications/initialized")

            self.servers[name] = conn
            self._tools_cache = None  # 清除工具缓存
            logger.info("[%s] MCP Server连接成功", name)

        except Exception as e:
            logger.error("[%s] MCP握手失败: %s", name, e)
            await conn.close()
            raise

    async def disconnect_all(self):
        """断开所有MCP Server连接，清理资源"""
        for name, conn in list(self.servers.items()):
            logger.info("断开MCP Server: %s", name)
            await conn.close()
        self.servers.clear()
        self._tools_cache = None

    async def list_tools(self) -> list[dict]:
        """列出所有已连接Server提供的工具列表，结果缓存"""
        if self._tools_cache is not None:
            return self._tools_cache

        all_tools = []
        for name, conn in self.servers.items():
            try:
                result = await conn.send_request("tools/list")
                tools = result.get("tools", [])
                for tool in tools:
                    tool["_server"] = name
                all_tools.extend(tools)
            except Exception as e:
                logger.error("[%s] 获取工具列表失败: %s", name, e)

        self._tools_cache = all_tools
        return all_tools

    async def call_tool(self, server_name: str, tool_name: str, arguments: dict) -> Any:
        """调用指定Server的指定工具，返回结果"""
        conn = self.servers.get(server_name)
        if not conn:
            raise MCPError(f"未找到MCP Server: {server_name}")

        logger.info("[%s] 调用工具: %s(%s)", server_name, tool_name, list(arguments.keys()))
        result = await conn.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })
        return result

    async def read_file(self, path: str) -> str:
        """读取本地文件内容（通过filesystem MCP或直接读取），带路径安全检查"""
        abs_path = os.path.abspath(path)

        # 安全检查：路径必须在workspace内
        if not self._is_safe_path(abs_path):
            raise PermissionError(f"路径不在工作目录范围内: {abs_path}")

        # 优先通过filesystem MCP Server读取
        if "filesystem" in self.servers:
            try:
                result = await self.call_tool("filesystem", "read_file", {"path": abs_path})
                # MCP返回格式通常是 {content: [{type: "text", text: "..."}]}
                if isinstance(result, dict) and "content" in result:
                    parts = result["content"]
                    if isinstance(parts, list):
                        return "".join(p.get("text", "") for p in parts)
                return str(result)
            except Exception as e:
                logger.warning("MCP文件读取失败，回退到直接读取: %s", e)

        # 回退：直接读取文件
        with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    async def list_directory(self, path: str, max_depth: int = 2) -> str:
        """列出目录结构（tree格式），带深度限制和路径安全检查"""
        abs_path = os.path.abspath(path)

        if not self._is_safe_path(abs_path):
            raise PermissionError(f"路径不在工作目录范围内: {abs_path}")

        if not os.path.isdir(abs_path):
            raise FileNotFoundError(f"目录不存在: {abs_path}")

        lines = [abs_path]
        self._build_tree(abs_path, "", max_depth, 0, lines)
        return "\n".join(lines)

    def _build_tree(self, base: str, prefix: str, max_depth: int, current_depth: int, lines: list):
        """递归构建目录树文本"""
        if current_depth >= max_depth:
            return
        try:
            entries = sorted(os.listdir(base))
        except PermissionError:
            return

        dirs = [e for e in entries if os.path.isdir(os.path.join(base, e))]
        files = [e for e in entries if not os.path.isdir(os.path.join(base, e))]
        all_entries = dirs + files

        for i, entry in enumerate(all_entries):
            full = os.path.join(base, entry)
            is_last = (i == len(all_entries) - 1)
            connector = "└── " if is_last else "├── "
            lines.append(f"{prefix}{connector}{entry}")
            if os.path.isdir(full):
                extension = "    " if is_last else "│   "
                self._build_tree(full, prefix + extension, max_depth, current_depth + 1, lines)

    def _is_safe_path(self, path: str) -> bool:
        """路径安全验证：必须在workspace内，防止目录遍历攻击"""
        abs_workspace = os.path.abspath(self.workspace)
        abs_path = os.path.abspath(path)
        return abs_path.startswith(abs_workspace + os.sep) or abs_path == abs_workspace
