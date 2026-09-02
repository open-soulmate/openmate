"""Telemetry v1.0 遥测观测模块 — 指标采集与聚合。"""
from __future__ import annotations
import time, threading
from dataclasses import dataclass, field
from typing import Any

@dataclass
class Metric:
    """指标数据点。"""
    name: str
    value: float
    tags: dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    metric_type: str = "gauge"  # counter/gauge/histogram

class MetricsCollector:
    """全局指标采集器（单例）。"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._metrics: dict[str, list[Metric]] = {}
                    cls._instance._counters: dict[str, float] = {}
        return cls._instance

    def inc_counter(self, name: str, value: float = 1, tags: dict[str, str] | None = None):
        """递增计数器。"""
        key = f"{name}:{tags or {}}"
        self._counters[key] = self._counters.get(key, 0) + value
        self._record(name, self._counters[key], tags or {}, "counter")

    def set_gauge(self, name: str, value: float, tags: dict[str, str] | None = None):
        """设置瞬时值。"""
        self._record(name, value, tags or {}, "gauge")

    def record_histogram(self, name: str, value: float, tags: dict[str, str] | None = None):
        """记录分布值。"""
        self._record(name, value, tags or {}, "histogram")

    def _record(self, name: str, value: float, tags: dict[str, str], mtype: str):
        """记录指标。"""
        if name not in self._metrics:
            self._metrics[name] = []
        self._metrics[name].append(Metric(name=name, value=value, tags=tags, metric_type=mtype))
        if len(self._metrics[name]) > 10000:
            self._metrics[name] = self._metrics[name][-5000:]

    def query(self, name: str, tags: dict[str, str] | None = None) -> list[Metric]:
        """查询指标，可按tags过滤。"""
        items = self._metrics.get(name, [])
        if tags:
            items = [m for m in items if all(m.tags.get(k) == v for k, v in tags.items())]
        return items

    def get_latest(self, name: str) -> float | None:
        """获取最新值。"""
        items = self._metrics.get(name, [])
        return items[-1].value if items else None

    def stats(self) -> dict[str, int]:
        """指标统计。"""
        return {name: len(vals) for name, vals in self._metrics.items()}
