"""ACP WebSocket Server — 使用官方 acp 库 + WebSocket 传输

通过 WebSocket 传输 ACP v1.0 标准协议（官方 acp Python SDK）。
每个 WebSocket 连接对应一个 acp.AgentSideConnection 实例。

传输适配：WebSocket ↔ asyncio StreamReader/StreamWriter
"""

import asyncio
import json
import logging
import os
import sys

import websockets
import acp

from agent.soulmate_agent import SoulMateAgent
from agent.llm_engine import LLMEngine

logger = logging.getLogger("acp-agent.server")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)


async def _create_ws_streams(ws):
    """为 WebSocket 创建 asyncio StreamReader 和 StreamWriter

    使用 os.pipe() 创建真正的文件描述符对，
    然后用 asyncio.open_connection 连接到它们。
    但实际上更简单的方式是直接创建 StreamReader + 自定义 transport。

    返回 (reader, writer) 其中：
    - reader: asyncio.StreamReader (从 WebSocket 读取)
    - writer: asyncio.StreamWriter (写入 WebSocket)
    """
    reader = asyncio.StreamReader()

    # 创建自定义 transport，将 write 数据通过 WebSocket 发送
    class WSTransport(asyncio.Transport):
        def __init__(self):
            super().__init__()
            self._ws = ws
            self._buffer = b""
            self._closing = False

        def write(self, data):
            if not self._closing:
                self._buffer += data

        def writelines(self, data):
            for d in data:
                self.write(d)

        def write_eof(self):
            pass

        def can_write_eof(self):
            return False

        def is_closing(self):
            return self._closing

        def close(self):
            self._closing = True

        def get_extra_info(self, key, default=None):
            if key == "peername":
                return ws.remote_address
            return default

        async def flush(self):
            """将缓冲区数据通过 WebSocket 发送"""
            if self._buffer and ws.open:
                try:
                    msg = self._buffer.decode("utf-8").strip()
                    if msg:
                        await ws.send(msg)
                except websockets.ConnectionClosed:
                    pass
                self._buffer = b""

    transport = WSTransport()

    # 创建一个最小的 protocol
    class DummyProtocol(asyncio.Protocol):
        def connection_made(self, transport):
            pass
        def connection_lost(self, exc):
            pass
        def pause_writing(self):
            pass
        def resume_writing(self):
            pass

    protocol = DummyProtocol()
    protocol.connection_made(transport)

    # 创建 StreamWriter（需要 transport, protocol, reader, loop）
    writer = asyncio.StreamReader  # placeholder
    # 直接用构造函数创建
    writer = asyncio.StreamWriter(transport, protocol, reader, asyncio.get_event_loop())

    return reader, writer, transport


class ACPServer:
    """ACP WebSocket Server — 使用官方 acp 库处理 ACP v1.0 协议"""

    def __init__(self, host: str = "0.0.0.0", port: int = 8787):
        self.host = host
        self.port = port
        self.llm_engine = LLMEngine()
        self._running = False

    async def serve(self):
        """启动 WebSocket 服务器"""
        self._running = True
        logger.info(f"ACP Server starting on ws://{self.host}:{self.port}")
        async with websockets.serve(
            self._handle_client,
            self.host,
            self.port,
            ping_interval=10,
            ping_timeout=15,
            max_size=10 * 1024 * 1024,
        ) as server:
            logger.info(f"ACP Server ready on ws://{self.host}:{self.port}")
            await asyncio.Future()

    async def _handle_client(self, ws):
        """处理单个 WebSocket 连接"""
        client_addr = ws.remote_address
        logger.info(f"Client connected: {client_addr}")

        agent = SoulMateAgent(llm_engine=self.llm_engine)

        reader, writer, transport = await _create_ws_streams(ws)

        # 启动消息喂入任务：WebSocket → StreamReader
        async def feed_from_ws():
            try:
                async for raw_msg in ws:
                    data = raw_msg if isinstance(raw_msg, bytes) else raw_msg.encode("utf-8")
                    if not data.endswith(b"\n"):
                        data += b"\n"
                    reader.feed_data(data)
            except websockets.ConnectionClosed:
                pass
            finally:
                reader.feed_eof()

        # 启动 flush 任务：transport 缓冲区 → WebSocket
        async def flush_loop():
            try:
                while ws.open:
                    await transport.flush()
                    await asyncio.sleep(0.01)
            except websockets.ConnectionClosed:
                pass

        feed_task = asyncio.create_task(feed_from_ws())
        flush_task = asyncio.create_task(flush_loop())

        try:
            conn = acp.AgentSideConnection(
                to_agent=lambda client: agent,
                input_stream=writer,
                output_stream=reader,
            )
            await conn.listen()
        except Exception as e:
            logger.error(f"Agent error for {client_addr}: {e}", exc_info=True)
        finally:
            feed_task.cancel()
            flush_task.cancel()
            try:
                await transport.flush()
            except Exception:
                pass
            logger.info(f"Client disconnected: {client_addr}")
