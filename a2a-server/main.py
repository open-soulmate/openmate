"""A2A Server — Agent-to-Agent 协议独立服务。

端口: 8093 (默认)
路由: 
  - HTTP: /rpc/a2a (JSON-RPC 2.0)
  - WebSocket: /ws/a2a
  - Well-Known: /.well-known/agent.json
"""
import argparse
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 导入A2A模块
from server import router as a2a_ws_router, rpc_router as a2a_rpc_router, well_known_router

logger = logging.getLogger("a2a-server")

app = FastAPI(
    title="A2A Server",
    description="Agent-to-Agent 协议服务 — 任务委派、能力发现、长生命周期任务管理",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册A2A路由
app.include_router(a2a_rpc_router)      # /rpc/a2a
app.include_router(a2a_ws_router)       # /ws/a2a
app.include_router(well_known_router)   # /.well-known/agent.json

@app.get("/")
async def root():
    return {
        "service": "A2A Server",
        "version": "1.0.0",
        "protocol": "Agent-to-Agent v1.0",
        "endpoints": {
            "rpc": "/rpc/a2a",
            "websocket": "/ws/a2a",
            "agent_cards": "/.well-known/agent.json"
        }
    }

@app.get("/health")
async def health():
    return {"status": "ok"}

def main():
    parser = argparse.ArgumentParser(description="A2A Server")
    parser.add_argument("--port", type=int, default=8093, help="监听端口 (默认 8093)")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认 0.0.0.0)")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    logger.info(f"Starting A2A Server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level.lower())

if __name__ == "__main__":
    main()
