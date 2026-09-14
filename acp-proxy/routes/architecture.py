"""架构监控API路由 — 暴露P0组件状态给前端"""

import logging
from fastapi import APIRouter, HTTPException
from agent import arch_monitor

logger = logging.getLogger("acp-proxy.arch-routes")

router = APIRouter(prefix="/api/architecture", tags=["architecture"])


@router.get("/stats")
async def get_architecture_stats():
    """获取所有P0组件的完整统计"""
    try:
        stats = arch_monitor.get_full_stats()
        if "error" in stats:
            raise HTTPException(status_code=503, detail=stats["error"])
        return stats
    except Exception as e:
        logger.error(f"[arch-routes] Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{session_id}")
async def get_session_stats(session_id: str):
    """获取特定会话的统计"""
    try:
        stats = arch_monitor.get_session_stats(session_id)
        if "error" in stats:
            raise HTTPException(status_code=503, detail=stats["error"])
        return stats
    except Exception as e:
        logger.error(f"[arch-routes] Failed to get session stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def get_architecture_health():
    """健康检查"""
    try:
        health = arch_monitor.get_health()
        return health
    except Exception as e:
        logger.error(f"[arch-routes] Failed to get health: {e}")
        raise HTTPException(status_code=500, detail=str(e))
