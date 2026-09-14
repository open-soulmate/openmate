"""
智能重试与回退策略 — 借鉴tenacity + LangChain retry + exponential backoff
核心思想：根据错误类型自动选择重试策略，支持circuit breaker模式
"""

import logging
import asyncio
import time
import random
from dataclasses import dataclass, field
from typing import Optional, Callable, Any, Awaitable
from enum import Enum
from functools import wraps

logger = logging.getLogger("acp-proxy.smart-retry")


class RetryStrategy(str, Enum):
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    LINEAR_BACKOFF = "linear_backoff"
    FIXED_DELAY = "fixed_delay"
    FIBONACCI = "fibonacci"


class CircuitState(str, Enum):
    CLOSED = "closed"        # 正常
    OPEN = "open"            # 熔断，拒绝请求
    HALF_OPEN = "half_open"  # 尝试恢复


@dataclass
class RetryConfig:
    max_retries: int = 3
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF
    base_delay: float = 1.0
    max_delay: float = 30.0
    jitter: bool = True
    retryable_exceptions: tuple = (Exception,)
    non_retryable_exceptions: tuple = (KeyboardInterrupt, SystemExit)


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    half_open_max_calls: int = 3
    success_threshold: int = 2


@dataclass
class RetryStats:
    total_attempts: int = 0
    successful_attempts: int = 0
    failed_attempts: int = 0
    retries_performed: int = 0
    circuit_opens: int = 0
    total_delay_seconds: float = 0.0


class SmartRetryManager:
    """智能重试管理器"""

    def __init__(
        self,
        retry_config: Optional[RetryConfig] = None,
        circuit_config: Optional[CircuitBreakerConfig] = None,
    ):
        self.retry_config = retry_config or RetryConfig()
        self.circuit_config = circuit_config or CircuitBreakerConfig()
        self._circuit_state: dict[str, CircuitState] = {}
        self._failure_counts: dict[str, int] = {}
        self._success_counts: dict[str, int] = {}
        self._last_failure_time: dict[str, float] = {}
        self._stats = RetryStats()

    async def execute_with_retry(
        self,
        func: Callable[..., Awaitable[Any]],
        *args,
        circuit_name: str = "",
        **kwargs,
    ) -> Any:
        """执行带重试的函数调用"""
        # 检查熔断器
        if circuit_name and self._is_circuit_open(circuit_name):
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{circuit_name}' is OPEN"
            )

        last_exception = None
        total_delay = 0.0

        for attempt in range(self.retry_config.max_retries + 1):
            self._stats.total_attempts += 1

            try:
                result = await func(*args, **kwargs)

                # 成功
                self._stats.successful_attempts += 1
                if circuit_name:
                    self._record_success(circuit_name)

                if attempt > 0:
                    logger.info(
                        f"Retry succeeded on attempt {attempt + 1} "
                        f"(total delay: {total_delay:.1f}s)"
                    )

                return result

            except self.retry_config.non_retryable_exceptions:
                raise

            except self.retry_config.retryable_exceptions as e:
                last_exception = e
                self._stats.failed_attempts += 1

                if circuit_name:
                    self._record_failure(circuit_name)

                # 检查是否还有重试机会
                if attempt >= self.retry_config.max_retries:
                    logger.error(
                        f"Max retries ({self.retry_config.max_retries}) exceeded: {e}"
                    )
                    break

                # 计算延迟
                delay = self._calculate_delay(attempt)
                total_delay += delay
                self._stats.retries_performed += 1
                self._stats.total_delay_seconds += delay

                logger.warning(
                    f"Attempt {attempt + 1} failed: {e}. "
                    f"Retrying in {delay:.1f}s..."
                )

                await asyncio.sleep(delay)

        # 所有重试都失败了
        raise last_exception or RuntimeError("Retry failed with no exception recorded")

    def _calculate_delay(self, attempt: int) -> float:
        """根据策略计算延迟"""
        config = self.retry_config

        if config.strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
            delay = config.base_delay * (2 ** attempt)
        elif config.strategy == RetryStrategy.LINEAR_BACKOFF:
            delay = config.base_delay * (attempt + 1)
        elif config.strategy == RetryStrategy.FIXED_DELAY:
            delay = config.base_delay
        elif config.strategy == RetryStrategy.FIBONACCI:
            fib = [1, 1]
            for i in range(attempt):
                fib.append(fib[-1] + fib[-2])
            delay = config.base_delay * fib[min(attempt + 1, len(fib) - 1)]
        else:
            delay = config.base_delay

        # 应用上限
        delay = min(delay, config.max_delay)

        # 添加抖动（避免thundering herd）
        if config.jitter:
            delay *= (0.5 + random.random() * 0.5)

        return delay

    def _is_circuit_open(self, name: str) -> bool:
        """检查熔断器是否打开"""
        state = self._circuit_state.get(name, CircuitState.CLOSED)

        if state == CircuitState.OPEN:
            # 检查是否到了恢复时间
            last_failure = self._last_failure_time.get(name, 0)
            if time.time() - last_failure > self.circuit_config.recovery_timeout:
                self._circuit_state[name] = CircuitState.HALF_OPEN
                self._success_counts[name] = 0
                logger.info(f"Circuit '{name}' moved to HALF_OPEN")
                return False
            return True

        return False

    def _record_success(self, name: str):
        """记录成功"""
        self._failure_counts[name] = 0

        state = self._circuit_state.get(name, CircuitState.CLOSED)
        if state == CircuitState.HALF_OPEN:
            self._success_counts[name] = self._success_counts.get(name, 0) + 1
            if self._success_counts[name] >= self.circuit_config.success_threshold:
                self._circuit_state[name] = CircuitState.CLOSED
                logger.info(f"Circuit '{name}' CLOSED (recovered)")

    def _record_failure(self, name: str):
        """记录失败"""
        self._failure_counts[name] = self._failure_counts.get(name, 0) + 1
        self._last_failure_time[name] = time.time()

        state = self._circuit_state.get(name, CircuitState.CLOSED)
        if state == CircuitState.HALF_OPEN:
            # HALF_OPEN状态下失败，立即回到OPEN
            self._circuit_state[name] = CircuitState.OPEN
            self._stats.circuit_opens += 1
            logger.warning(f"Circuit '{name}' back to OPEN (failed during recovery)")
        elif (state == CircuitState.CLOSED and
              self._failure_counts[name] >= self.circuit_config.failure_threshold):
            self._circuit_state[name] = CircuitState.OPEN
            self._stats.circuit_opens += 1
            logger.warning(
                f"Circuit '{name}' OPENED "
                f"(failures: {self._failure_counts[name]})"
            )

    def get_circuit_state(self, name: str) -> CircuitState:
        return self._circuit_state.get(name, CircuitState.CLOSED)

    def reset_circuit(self, name: str):
        """手动重置熔断器"""
        self._circuit_state[name] = CircuitState.CLOSED
        self._failure_counts[name] = 0
        self._success_counts[name] = 0
        logger.info(f"Circuit '{name}' manually reset to CLOSED")

    def get_stats(self) -> dict:
        return {
            "total_attempts": self._stats.total_attempts,
            "successful_attempts": self._stats.successful_attempts,
            "failed_attempts": self._stats.failed_attempts,
            "retries_performed": self._stats.retries_performed,
            "circuit_opens": self._stats.circuit_opens,
            "total_delay_seconds": f"{self._stats.total_delay_seconds:.1f}",
            "success_rate": (
                f"{self._stats.successful_attempts / max(self._stats.total_attempts, 1) * 100:.1f}%"
            ),
            "circuit_states": {
                name: state.value for name, state in self._circuit_state.items()
            },
        }


class CircuitBreakerOpenError(Exception):
    """熔断器打开异常"""
    pass


def with_retry(
    retry_config: Optional[RetryConfig] = None,
    circuit_name: str = "",
):
    """装饰器：为异步函数添加重试能力"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            manager = SmartRetryManager(retry_config=retry_config)
            return await manager.execute_with_retry(
                func, *args, circuit_name=circuit_name, **kwargs
            )
        return wrapper
    return decorator
