"""熔断器实现 — closed → open → half_open 三态自动切换

保护下游LLM服务免受级联故障影响：
- closed（正常）：连续失败达到阈值后切换到open
- open（熔断）：拒绝所有请求，等待恢复超时后切换到half_open
- half_open（半开）：放行一个探测请求，成功则closed，失败则重新open
"""

from __future__ import annotations

import logging
import time
from enum import Enum
from typing import Any

logger = logging.getLogger("model_gateway.circuit_breaker")


class CircuitState(str, Enum):
    """熔断器三态枚举"""
    CLOSED = "closed"          # 正常状态，允许所有请求通过
    OPEN = "open"              # 熔断状态，拒绝所有请求
    HALF_OPEN = "half_open"    # 半开状态，放行探测请求


class CircuitBreaker:
    """熔断器实例 — 保护单个模型/Provider端点

    状态流转规则：
        closed → (连续失败达到阈值) → open
        open → (恢复超时到期) → half_open
        half_open → (探测成功) → closed
        half_open → (探测失败) → open

    Attributes:
        failure_threshold: 连续失败次数触发熔断，默认5次
        recovery_timeout: 熔断后等待恢复的秒数，默认60秒
        state: 当前熔断状态
        failure_count: 当前连续失败计数
        last_failure_time: 最后一次失败的时间戳
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
    ) -> None:
        """初始化熔断器

        Args:
            failure_threshold: 连续失败多少次触发熔断，默认5
            recovery_timeout: 熔断后多少秒尝试恢复（进入half_open），默认60
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.last_failure_time: float = 0.0
        self._half_open_probe: bool = False  # half_open状态下是否已有探测请求在飞

    # ── 状态检查 ──────────────────────────────────────────────────

    def is_available(self) -> bool:
        """检查当前是否允许发送请求

        Returns:
            True=允许发送（closed或half_open且无并发探测），False=熔断中拒绝
        """
        # closed状态：直接允许
        if self.state == CircuitState.CLOSED:
            return True

        # open状态：检查恢复超时是否已过
        if self.state == CircuitState.OPEN:
            elapsed = time.time() - self.last_failure_time
            if elapsed >= self.recovery_timeout:
                # 超时到期，转入half_open，允许一个探测请求
                logger.info(
                    f"熔断器恢复超时({self.recovery_timeout}s)，OPEN → HALF_OPEN，放行探测请求"
                )
                self.state = CircuitState.HALF_OPEN
                self._half_open_probe = True
                return True
            return False

        # half_open状态：只允许一个探测请求（防止并发探测）
        if self.state == CircuitState.HALF_OPEN:
            if not self._half_open_probe:
                self._half_open_probe = True
                return True
            return False

        return False

    # ── 结果记录 ──────────────────────────────────────────────────

    def record_success(self) -> None:
        """记录一次成功调用

        closed状态下重置失败计数；half_open状态下恢复到closed。
        """
        if self.state == CircuitState.HALF_OPEN:
            # 探测成功，恢复正常
            logger.info("熔断器探测成功，HALF_OPEN → CLOSED，恢复正常")
            self.state = CircuitState.CLOSED

        # 重置计数器
        self.failure_count = 0
        self._half_open_probe = False

    def record_failure(self) -> None:
        """记录一次失败调用

        closed状态下累加失败计数，达到阈值触发熔断；
        half_open状态下探测失败，重新回到open。
        """
        self.last_failure_time = time.time()

        if self.state == CircuitState.HALF_OPEN:
            # 探测失败，重新熔断
            logger.warning("熔断器探测失败，HALF_OPEN → OPEN，重新熔断")
            self.state = CircuitState.OPEN
            self.failure_count = 0
            self._half_open_probe = False
            return

        # closed状态下累加失败
        self.failure_count += 1
        logger.warning(
            f"熔断器失败计数: {self.failure_count}/{self.failure_threshold}"
        )

        if self.failure_count >= self.failure_threshold:
            # 达到阈值，触发熔断
            logger.error(
                f"连续失败{self.failure_count}次，达到阈值{self.failure_threshold}，"
                f"CLOSED → OPEN，熔断{self.recovery_timeout}秒"
            )
            self.state = CircuitState.OPEN
            self.failure_count = 0

    # ── 手动控制 ──────────────────────────────────────────────────

    def reset(self) -> None:
        """手动重置熔断器到closed状态"""
        logger.info("熔断器手动重置 → CLOSED")
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self._half_open_probe = False

    def force_open(self) -> None:
        """手动强制熔断（运维使用）"""
        logger.warning("熔断器手动强制 → OPEN")
        self.state = CircuitState.OPEN
        self.last_failure_time = time.time()
        self._half_open_probe = False

    # ── 序列化 ──────────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        """导出熔断器状态为字典，用于监控和统计"""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self.last_failure_time,
            "seconds_since_last_failure": (
                round(time.time() - self.last_failure_time, 1)
                if self.last_failure_time > 0
                else None
            ),
        }
