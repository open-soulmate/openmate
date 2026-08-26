"""FastAPI app for ACP Proxy service."""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from proxy import get_acp_process
from ws_chat import router as ws_router

logger = logging.getLogger("acp-proxy.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start ACP process on startup, stop on shutdown."""
    acp = get_acp_process()
    try:
        await acp.start()
        logger.info(f"ACP Proxy started (pid={acp._proc.pid if acp._proc else 'unknown'})")
    except Exception as e:
        logger.error(f"ACP Proxy startup failed: {e}")
        raise
    yield
    await acp.stop()
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "acp-proxy"}
