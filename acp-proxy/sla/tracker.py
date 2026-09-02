"""SLA v1.0 可用性追踪器 — 服务等级计算。"""
from __future__ import annotations
import time, threading
from dataclasses import dataclass

@dataclass
class SLAConfig:
    """SLA等级配置。"""
    P0 = 99.99  # 金融级
    P1 = 99.9   # 企业级
    P2 = 99.5   # 标准级
    P3 = 99.0   # 基础级

class SLATracker:
    """SLA可用性追踪器（单例）。"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._success = 0
                    cls._instance._failure = 0
                    cls._instance._timeout = 0
                    cls._instance._start_time = time.time()
        return cls._instance

    def record_request(self, success: bool, timeout: bool = False):
        """记录一次请求结果。"""
        if timeout:
            self._timeout += 1
        elif success:
            self._success += 1
        else:
            self._failure += 1

    def get_availability(self) -> float:
        """计算可用性百分比。"""
        total = self._success + self._failure + self._timeout
        if total == 0:
            return 100.0
        return round(self._success / total * 100, 4)

    def get_sla_level(self) -> str:
        """判断满足的SLA等级。"""
        avail = self.get_availability()
        if avail >= SLAConfig.P0:
            return "P0"
        elif avail >= SLAConfig.P1:
            return "P1"
        elif avail >= SLAConfig.P2:
            return "P2"
        elif avail >= SLAConfig.P3:
            return "P3"
        return "BELOW_SLA"

    def stats(self) -> dict:
        """SLA统计。"""
        return {
            "availability": self.get_availability(),
            "sla_level": self.get_sla_level(),
            "success": self._success,
            "failure": self._failure,
            "timeout": self._timeout,
            "uptime_seconds": round(time.time() - self._start_time),
        }
