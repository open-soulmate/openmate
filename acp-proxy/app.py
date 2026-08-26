"""FastAPI app for ACP Proxy service."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from proxy import get_acp_process
from ws_chat import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start ACP process on startup, stop on shutdown."""
    acp = get_acp_process()
    await acp.start()
    print(f"ACP Proxy started (pid={acp._proc.pid})", flush=True)
    yield
    await acp.stop()
    print("ACP Proxy stopped", flush=True)


app = FastAPI(title="ACP Proxy", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "acp-proxy"}
