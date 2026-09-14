"""架构监控API — 实时查看所有P0组件状态

提供REST API端点，让前端可以实时监控：
- Writer Fence: 当前活跃的写入锁、等待队列
- Lane Queue: 队列深度、各lane等待数、运行中任务
- Timeouts: 各层超时统计、活跃操作
- Tool Errors: 错误统计、doom loop检测
- Edit Guard: 编辑统计、快照数量

端点：
- GET /api/architecture/stats — 全局统计
- GET /api/architecture/stats/{session_id} — 会话级统计
- GET /api/architecture/health — 健康检查
"""

import logging
from typing import Any

logger = logging.getLogger("acp-agent.arch-monitor")

# 全局架构实例（由soulmate_agent初始化时设置）
_arch_instance = None


def set_architecture(arch):
    """设置全局架构实例"""
    global _arch_instance
    _arch_instance = arch


def get_architecture():
    """获取全局架构实例"""
    return _arch_instance


def get_full_stats() -> dict:
    """获取完整统计"""
    if _arch_instance is None:
        return {"error": "Architecture not initialized"}
    return _arch_instance.get_full_stats()


def get_session_stats(session_id: str) -> dict:
    """获取会话级统计"""
    if _arch_instance is None:
        return {"error": "Architecture not initialized"}
    return _arch_instance.get_session_stats(session_id)


def get_health() -> dict:
    """健康检查"""
    if _arch_instance is None:
        return {"status": "not_initialized", "healthy": False}
    
    stats = _arch_instance.get_full_stats()
    
    # 检查各组件健康状态
    checks = {}
    
    # Writer Fence: 不应该有太多等待
    fence_stats = stats.get("writer_fence", {})
    waiting = fence_stats.get("waiting", {})
    total_waiting = sum(waiting.values())
    checks["writer_fence"] = {
        "healthy": total_waiting < 10,
        "waiting": total_waiting,
        "active_claims": len(fence_stats.get("active_claims", {})),
    }
    
    # Lane Queue: 队列不应该太深
    queue_stats = stats.get("lane_queue", {})
    depth = queue_stats.get("queue_depth", 0)
    checks["lane_queue"] = {
        "healthy": depth < 50,
        "depth": depth,
        "running": queue_stats.get("running", 0),
    }
    
    # Timeouts: 最近超时不应该太多
    timeout_stats = stats.get("timeouts", {})
    recent_timeouts = timeout_stats.get("recent_timeouts", 0)
    checks["timeouts"] = {
        "healthy": recent_timeouts < 20,
        "recent": recent_timeouts,
    }
    
    # Tool Errors: doom loop不应该活跃
    error_stats = stats.get("tool_errors", {})
    doom = error_stats.get("doom_loop", {})
    checks["tool_errors"] = {
        "healthy": doom.get("consecutive_failures", 0) < 5,
        "recent_errors": error_stats.get("recent_errors", 0),
    }
    
    all_healthy = all(c.get("healthy", True) for c in checks.values())
    
    return {
        "status": "healthy" if all_healthy else "degraded",
        "healthy": all_healthy,
        "checks": checks,
        "uptime": stats.get("uptime", "unknown"),
        "total_operations": stats.get("total_operations", 0),
    }
