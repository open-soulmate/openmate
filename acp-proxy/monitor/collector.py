"""Monitor v1.0 运行监控 — 进程/Agent/请求指标采集。"""
from __future__ import annotations
import time
from dataclasses import dataclass, field

@dataclass
class ProcessMetrics:
    """进程资源指标。"""
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    memory_mb: float = 0.0
    disk_percent: float = 0.0
    timestamp: float = field(default_factory=time.time)

@dataclass
class AgentMetrics:
    """Agent状态指标。"""
    running: int = 0
    idle: int = 0
    failed: int = 0
    total: int = 0
    timestamp: float = field(default_factory=time.time)

@dataclass
class RequestMetrics:
    """请求统计指标。"""
    qps: float = 0.0
    avg_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    error_rate: float = 0.0
    total_requests: int = 0
    total_errors: int = 0
    timestamp: float = field(default_factory=time.time)

class MonitorCollector:
    """监控数据采集器（单例）。"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._latencies: list[float] = []
            cls._instance._request_count = 0
            cls._instance._error_count = 0
            cls._instance._start_time = time.time()
        return cls._instance

    def collect_process(self) -> ProcessMetrics:
        """采集进程资源指标。"""
        try:
            import psutil
            proc = psutil.Process()
            mem = proc.memory_info()
            return ProcessMetrics(
                cpu_percent=proc.cpu_percent(interval=0.1),
                memory_percent=proc.memory_percent(),
                memory_mb=mem.rss / 1024 / 1024,
            )
        except ImportError:
            return ProcessMetrics()

    def collect_agents(self, sessions: dict) -> AgentMetrics:
        """从session字典采集Agent状态。"""
        running = sum(1 for s in sessions.values() if getattr(s, "state", None) and str(getattr(s, "state", "")).upper() == "ACTIVE")
        total = len(sessions)
        return AgentMetrics(running=running, idle=total - running, total=total)

    def record_request(self, latency_ms: float, is_error: bool = False):
        """记录一次请求。"""
        self._request_count += 1
        self._latencies.append(latency_ms)
        if is_error:
            self._error_count += 1
        if len(self._latencies) > 10000:
            self._latencies = self._latencies[-5000:]

    def collect_requests(self) -> RequestMetrics:
        """采集请求统计。"""
        elapsed = time.time() - self._start_time or 1
        lats = sorted(self._latencies) if self._latencies else [0]
        return RequestMetrics(
            qps=round(self._request_count / elapsed, 2),
            avg_latency_ms=round(sum(lats) / len(lats), 2),
            p99_latency_ms=round(lats[int(len(lats) * 0.99)] if len(lats) > 1 else lats[0], 2),
            error_rate=round(self._error_count / max(self._request_count, 1) * 100, 2),
            total_requests=self._request_count,
            total_errors=self._error_count,
        )
