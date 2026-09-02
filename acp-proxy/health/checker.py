"""Health v1.0 健康检查器 — 组件状态聚合。"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Callable, Any

class HealthStatus:
    """健康状态。"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

@dataclass
class ComponentHealth:
    """单组件健康状态。"""
    name: str
    status: str = HealthStatus.HEALTHY
    message: str = ""
    latency_ms: float = 0
    checked_at: float = field(default_factory=time.time)

class HealthChecker:
    """健康检查器（单例）。"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._checks: dict[str, Callable] = {}
        return cls._instance

    def register_check(self, name: str, check_fn: Callable[[], bool]):
        """注册健康检查函数。"""
        self._checks[name] = check_fn

    def check_all(self) -> dict[str, Any]:
        """执行所有健康检查，返回聚合结果。"""
        components = []
        has_unhealthy = False
        has_degraded = False
        for name, fn in self._checks.items():
            start = time.time()
            try:
                ok = fn()
                latency = (time.time() - start) * 1000
                status = HealthStatus.HEALTHY if ok else HealthStatus.DEGRADED
                if not ok:
                    has_degraded = True
                components.append(ComponentHealth(name=name, status=status, latency_ms=round(latency, 2)))
            except Exception as e:
                has_unhealthy = True
                components.append(ComponentHealth(name=name, status=HealthStatus.UNHEALTHY, message=str(e)))
        if has_unhealthy:
            overall = HealthStatus.UNHEALTHY
        elif has_degraded:
            overall = HealthStatus.DEGRADED
        else:
            overall = HealthStatus.HEALTHY
        return {
            "status": overall,
            "components": [{"name": c.name, "status": c.status, "message": c.message, "latency_ms": c.latency_ms} for c in components],
            "timestamp": time.time(),
        }
