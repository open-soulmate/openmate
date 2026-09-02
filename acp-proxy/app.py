"""FastAPI app for ACP Proxy service."""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from proxy import get_acp_process
from ws_chat import router as ws_router
from ws_acp import ws_acp_endpoint  # ACP JSON-RPC 2.0纯透传端点
from a2a.server import router as a2a_router, rpc_router as a2a_rpc_router, well_known_router
from mcp.server import router as mcp_router
from gateway.router import router as gateway_router
from bidding.router import router as bidding_router

logger = logging.getLogger("acp-proxy.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """ACP Proxy生命周期 — 只启动FastAPI服务，Agent Engine独立运行"""
    logger.info("ACP Proxy starting (Agent Engine managed separately)")
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

app.include_router(ws_router)
app.include_router(a2a_router)
app.include_router(a2a_rpc_router)  # /rpc/a2a 规范路径
app.include_router(well_known_router)
app.include_router(mcp_router)  # /admin/mcp 管控端点
app.include_router(gateway_router)  # /rpc 统一入口
app.include_router(bidding_router)  # /bidding 投标文档引擎


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
