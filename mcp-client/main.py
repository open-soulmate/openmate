"""
MCP Client 独立服务 — FastAPI 入口
端口 8094，与 ACP Proxy(8092)、A2A Server(8093) 平级。
"""

import argparse
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn

import persistence
from registry import MCPRegistry
from routes import servers as servers_routes
from routes import tools as tools_routes
from routes import resources as resources_routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("mcp-client")

# ── 全局注册表 ──────────────────────────────────────────────────
registry = MCPRegistry(persist_path=persistence.registry_path())

# 注入 registry 到路由模块
servers_routes.init(registry)
tools_routes.init(registry)
resources_routes.init(registry)

# ── FastAPI 应用 ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """启动即恢复持久化的Server注册（kilocode Storage模式，supplement3 #19遗留#5）。

    后台任务恢复（不阻塞监听）：重连走30s超时握手，坏快照/重连失败绝不拦截启动。
    """
    asyncio.ensure_future(registry.restore())
    yield


app = FastAPI(title="MCP Client", version="1.0.0", lifespan=lifespan)

app.include_router(servers_routes.router)
app.include_router(tools_routes.router)
app.include_router(resources_routes.router)


@app.get("/api/mcp/health")
async def health():
    return {"status": "ok", "component": "mcp-client"}


@app.get("/api/mcp/status")
async def status():
    return {"servers": registry.get_status(), "persist": registry.persist_info()}


# ── 启动 ────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="MCP Client Service")
    parser.add_argument("--port", type=int, default=8094)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    logger.info("MCP Client 启动于 %s:%d", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
