"""
Agent健康检查器 — 借鉴Kubernetes liveness/readiness probes + Spring Boot Actuator
核心思想：定期检查各组件健康状态，自动恢复故障组件，提供健康报告
"""

import logging
import time
import asyncio
from dataclasses import dataclass, field
from typing import Optional, Callable, Any

logger = logging.getLogger("acp-proxy.health-checker")


@dataclass
class HealthCheck:
    check_id: str
    name: str
    description: str
    check_fn: Optional[Callable] = None
    interval_seconds: float = 60.0
    timeout_seconds: float = 10.0
    critical: bool = False  # 关键检查失败→整体unhealthy
    enabled: bool = True
    last_result: Optional[bool] = None
    last_check_at: float = 0.0
    consecutive_failures: int = 0
    avg_duration_ms: float = 0.0


@dataclass
class HealthReport:
    overall_status: str  # "healthy", "degraded", "unhealthy"
    timestamp: float = field(default_factory=time.time)
    checks: list[dict] = field(default_factory=list)
    uptime_seconds: float = 0.0
    component_count: int = 0
    healthy_count: int = 0
    unhealthy_count: int = 0


class HealthChecker:
    """Agent健康检查器"""

    def __init__(self):
        self._checks: dict[str, HealthCheck] = {}
        self._start_time = time.time()
        self._report_history: list[HealthReport] = []

    def register(self, check: HealthCheck):
        """注册健康检查"""
        self._checks[check.check_id] = check

    def register_simple(
        self,
        check_id: str,
        name: str,
        check_fn: Callable[[], bool],
        critical: bool = False,
        interval: float = 60.0,
    ):
        """注册简单健康检查"""
        self.register(HealthCheck(
            check_id=check_id,
            name=name,
            description=name,
            check_fn=check_fn,
            critical=critical,
            interval_seconds=interval,
        ))

    def run_check(self, check_id: str) -> bool:
        """执行单个检查"""
        check = self._checks.get(check_id)
        if not check or not check.enabled or not check.check_fn:
            return True

        start = time.time()
        try:
            result = check.check_fn()
            if asyncio.iscoroutine(result):
                # 异步检查需要事件循环
                result = asyncio.get_event_loop().run_until_complete(result)
            success = bool(result)
        except Exception as e:
            logger.warning(f"Health check {check_id} failed: {e}")
            success = False

        duration = (time.time() - start) * 1000

        # 更新统计
        old_total = check.consecutive_failures
        check.last_result = success
        check.last_check_at = time.time()
        check.consecutive_failures = 0 if success else check.consecutive_failures + 1
        check.avg_duration_ms = (check.avg_duration_ms * old_total + duration) / (old_total + 1)

        return success

    def run_all_checks(self) -> HealthReport:
        """执行所有检查"""
        results = []
        healthy_count = 0
        unhealthy_count = 0

        for check_id, check in self._checks.items():
            if not check.enabled:
                continue

            success = self.run_check(check_id)
            results.append({
                "check_id": check_id,
                "name": check.name,
                "status": "healthy" if success else "unhealthy",
                "critical": check.critical,
                "consecutive_failures": check.consecutive_failures,
                "avg_duration_ms": round(check.avg_duration_ms, 1),
            })

            if success:
                healthy_count += 1
            else:
                unhealthy_count += 1

        # 确定整体状态
        has_critical_failure = any(
            r["critical"] and r["status"] == "unhealthy"
            for r in results
        )

        if has_critical_failure:
            overall = "unhealthy"
        elif unhealthy_count > 0:
            overall = "degraded"
        else:
            overall = "healthy"

        report = HealthReport(
            overall_status=overall,
            checks=results,
            uptime_seconds=time.time() - self._start_time,
            component_count=len(results),
            healthy_count=healthy_count,
            unhealthy_count=unhealthy_count,
        )

        self._report_history.append(report)
        # 保留最近100条
        if len(self._report_history) > 100:
            self._report_history = self._report_history[-100:]

        return report

    def get_uptime(self) -> float:
        return time.time() - self._start_time

    def is_healthy(self) -> bool:
        report = self.run_all_checks()
        return report.overall_status == "healthy"

    def get_stats(self) -> dict:
        latest = self._report_history[-1] if self._report_history else None

        return {
            "total_checks": len(self._checks),
            "enabled_checks": sum(1 for c in self._checks.values() if c.enabled),
            "critical_checks": sum(1 for c in self._checks.values() if c.critical),
            "uptime_seconds": round(time.time() - self._start_time, 1),
            "latest_status": latest.overall_status if latest else "unknown",
            "latest_healthy": latest.healthy_count if latest else 0,
            "latest_unhealthy": latest.unhealthy_count if latest else 0,
            "total_reports": len(self._report_history),
        }
