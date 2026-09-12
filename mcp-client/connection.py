"""
MCP 单连接管理 — stdio 子进程 / Streamable HTTP + JSON-RPC 2.0 请求/响应匹配
从 acp-proxy/agent/mcp_client.py 迁移，精简为纯连接层。
"""

import asyncio
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger("mcp-client.connection")

# JSON-RPC 请求 ID 自增计数器
_request_id_counter = 0


def _next_request_id() -> int:
    global _request_id_counter
    _request_id_counter += 1
    return _request_id_counter


class MCPError(Exception):
    """MCP 协议错误"""
    def __init__(self, message: str, code: int = -1):
        super().__init__(message)
        self.code = code


class MCPServerConnection:
    """单个 MCP Server 连接（stdio 子进程）"""

    def __init__(self, name: str, process: asyncio.subprocess.Process):
        self.name = name
        self.process = process
        self._pending_requests: dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start_reading(self):
        """启动后台读取任务"""
        self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        """从子进程 stdout 逐行读取 JSON-RPC 消息"""
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
                                    MCPError(
                                        msg["error"].get("message", "Unknown error"),
                                        msg["error"].get("code", -1),
                                    )
                                )
                            else:
                                future.set_result(msg.get("result"))
                except json.JSONDecodeError:
                    logger.warning("[%s] 无法解析MCP消息: %s", self.name, line[:200])
        except Exception as e:
            logger.error("[%s] 读取循环异常: %s", self.name, e)

    async def send_request(self, method: str, params: dict = None) -> dict:
        """发送 JSON-RPC 请求并等待响应（超时30s）"""
        request_id = _next_request_id()
        payload = {"jsonrpc": "2.0", "id": request_id, "method": method}
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
        """发送 JSON-RPC 通知（无 id，不等待响应）"""
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params

        data = json.dumps(payload) + "\n"
        async with self._lock:
            if self.process.stdin:
                self.process.stdin.write(data.encode())
                await self.process.stdin.drain()

    async def close(self):
        """关闭子进程，清理资源"""
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

    @property
    def is_alive(self) -> bool:
        return self.process.returncode is None


class StreamableHTTPConnection:
    """MCP Server 连接（Streamable HTTP 传输）

    每个 JSON-RPC 消息通过独立 HTTP POST 发送。
    响应可能是 application/json 或 text/event-stream（SSE）。
    """

    def __init__(self, name: str, url: str, headers: dict = None):
        self.name = name
        self.url = url.rstrip("/")
        self._extra_headers = headers or {}
        self._session_id: Optional[str] = None
        self._protocol_version = "2025-06-18"
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _ensure_client(self):
        """懒初始化 httpx 异步客户端"""
        if not self._http_client:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0)
            )

    def _build_headers(self) -> dict:
        """构建请求头"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": self._protocol_version,
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        headers.update(self._extra_headers)
        return headers

    async def send_request(self, method: str, params: dict = None) -> dict:
        """发送 JSON-RPC 请求并等待响应。

        支持两种响应格式：
        - application/json → 直接解析
        - text/event-stream → 从 SSE 流中提取匹配 id 的响应
        """
        await self._ensure_client()
        request_id = _next_request_id()
        payload = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            payload["params"] = params

        headers = self._build_headers()
        logger.debug("[%s] HTTP POST %s (id=%d)", self.name, method, request_id)

        try:
            response = await self._http_client.post(
                self.url, json=payload, headers=headers
            )
        except httpx.TimeoutException as e:
            raise MCPError(f"HTTP 请求超时: {e}", -1)
        except httpx.HTTPError as e:
            raise MCPError(f"HTTP 请求失败: {e}", -1)

        # 404 通常意味着 Session 过期
        if response.status_code == 404:
            raise MCPError("Session 已过期或服务器未找到 (404)", -1)

        if response.status_code >= 400:
            raise MCPError(
                f"HTTP 错误 {response.status_code}: {response.text[:500]}",
                response.status_code,
            )

        # 保存 Session ID（服务器可能在任意响应中返回）
        session_id = response.headers.get("mcp-session-id")
        if session_id:
            self._session_id = session_id

        content_type = response.headers.get("content-type", "")

        # SSE 流式响应
        if "text/event-stream" in content_type:
            return await self._parse_sse_response(response, request_id)

        # JSON 单条响应
        try:
            data = response.json()
        except Exception as e:
            raise MCPError(f"响应 JSON 解析失败: {e}", -1)

        if "error" in data:
            raise MCPError(
                data["error"].get("message", "Unknown error"),
                data["error"].get("code", -1),
            )
        return data.get("result")

    async def send_notification(self, method: str, params: dict = None):
        """发送 JSON-RPC 通知（无 id，期望 202 Accepted）"""
        await self._ensure_client()
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params

        headers = self._build_headers()
        logger.debug("[%s] HTTP POST notification: %s", self.name, method)

        try:
            response = await self._http_client.post(
                self.url, json=payload, headers=headers
            )
        except (httpx.TimeoutException, httpx.HTTPError) as e:
            logger.warning("[%s] 通知发送失败: %s", self.name, e)
            return

        # 保存 Session ID
        session_id = response.headers.get("mcp-session-id")
        if session_id:
            self._session_id = session_id

        if response.status_code not in (200, 202):
            logger.warning(
                "[%s] 通知响应 %d: %s",
                self.name, response.status_code, response.text[:200],
            )

    async def _parse_sse_response(
        self, response: httpx.Response, request_id: int
    ) -> dict:
        """从 SSE 流中提取匹配 id 的 JSON-RPC 响应。

        SSE 格式：
            event: message
            data: {"jsonrpc":"2.0","id":1,"result":{...}}
        """
        async for line in response.aiter_lines():
            if not line.startswith("data: "):
                continue
            raw = line[6:].strip()
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.debug("[%s] SSE 跳过非 JSON 行: %s", self.name, raw[:100])
                continue

            # 只关心匹配当前请求 id 的响应
            if data.get("id") != request_id:
                continue

            if "error" in data:
                raise MCPError(
                    data["error"].get("message", "Unknown error"),
                    data["error"].get("code", -1),
                )
            return data.get("result")

        raise MCPError("SSE 流结束未收到匹配响应", -1)

    async def close(self):
        """关闭 HTTP 客户端"""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    @property
    def is_alive(self) -> bool:
        return self._http_client is not None and not self._http_client.is_closed
