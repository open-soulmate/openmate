"""分层超时体系 — 四层超时管理

借鉴自：
- OpenClaw 的分层超时（runtime/model/provider/wait）
- LangGraph 的 step_timeout
- Dify 的节点级超时

核心思想：不同层级的超时应该独立配置和监控，
一个慢的provider不应该导致整个runtime挂起。
"""

import asyncio
import time
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger("acp-agent.timeouts")


class TimeoutLayer(str, Enum):
    RUNTIME = "runtime"    # 整个runtime生命周期
    MODEL = "model"        # 单次LLM调用
    PROVIDER = "provider"  # 单次provider HTTP调用
    WAIT = "wait"          # 等待用户输入/工具结果


@dataclass
class TimeoutConfig:
    """各层超时配置（秒）"""
    runtime: float = 3600.0     # 1小时
    model: float = 120.0        # 2分钟
    provider: float = 30.0      # 30秒
    wait: float = 600.0         # 10分钟
    
    # 各层的重试次数
    model_retries: int = 2
    provider_retries: int = 3
    
    # 退避策略
    backoff_base: float = 1.0
    backoff_max: float = 30.0


@dataclass
class TimeoutEvent:
    """超时事件记录"""
    layer: TimeoutLayer
    operation: str
    duration: float
    limit: float
    session_id: str | None = None
    retried: bool = False
    timestamp: float = field(default_factory=time.time)


class LayeredTimeoutManager:
    """分层超时管理器
    
    Usage:
        tm = LayeredTimeoutManager(config=TimeoutConfig())
        
        # LLM调用（model层超时）
        result = await tm.call(
            layer=TimeoutLayer.MODEL,
            operation="llm_chat",
            fn=llm_engine.chat,
            session_id=sid,
            messages=messages,
        )
        
        # Provider HTTP调用（provider层超时+重试）
        resp = await tm.call(
            layer=TimeoutLayer.PROVIDER,
            operation="http_get",
            fn=http_client.get,
            url="...",
            retries=3,
        )
    """
    
    def __init__(self, config: TimeoutConfig | None = None):
        self.config = config or TimeoutConfig()
        self._events: list[TimeoutEvent] = []
        self._active: dict[str, dict] = {}  # operation_key -> {start, layer}
        self._abort_flags: dict[str, asyncio.Event] = {}
    
    def _get_timeout(self, layer: TimeoutLayer) -> float:
        return getattr(self.config, layer.value, 30.0)
    
    def _get_retries(self, layer: TimeoutLayer) -> int:
        return getattr(self.config, f"{layer.value}_retries", 0)
    
    async def call(
        self,
        layer: TimeoutLayer,
        operation: str,
        fn: Callable[..., Coroutine],
        *,
        session_id: str | None = None,
        retries: int | None = None,
        timeout: float | None = None,
        **kwargs,
    ) -> Any:
        """执行一个带分层超时和重试的操作"""
        effective_timeout = timeout or self._get_timeout(layer)
        effective_retries = retries if retries is not None else self._get_retries(layer)
        
        op_key = f"{session_id or 'global'}:{operation}:{id(fn)}"
        last_error = None
        
        for attempt in range(effective_retries + 1):
            start = time.time()
            self._active[op_key] = {"start": start, "layer": layer, "attempt": attempt}
            
            # 注册abort flag
            abort = asyncio.Event()
            self._abort_flags[op_key] = abort
            
            try:
                # 创建带超时的任务
                task = asyncio.create_task(fn(**kwargs))
                
                # 同时等待：任务完成 或 超时 或 abort
                done, pending = await asyncio.wait(
                    [task, asyncio.create_task(abort.wait())],
                    timeout=effective_timeout,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                
                # 清理pending任务
                for p in pending:
                    p.cancel()
                
                if not done:
                    # 超时
                    task.cancel()
                    elapsed = time.time() - start
                    event = TimeoutEvent(
                        layer=layer,
                        operation=operation,
                        duration=elapsed,
                        limit=effective_timeout,
                        session_id=session_id,
                        retried=attempt < effective_retries,
                    )
                    self._events.append(event)
                    logger.warning(
                        f"[timeout] {layer.value}/{operation} timed out "
                        f"after {elapsed:.1f}s (limit={effective_timeout}s, "
                        f"attempt={attempt+1}/{effective_retries+1})"
                    )
                    
                    if attempt < effective_retries:
                        # 指数退避
                        backoff = min(
                            self.config.backoff_base * (2 ** attempt),
                            self.config.backoff_max,
                        )
                        logger.info(f"[timeout] Retrying in {backoff:.1f}s...")
                        await asyncio.sleep(backoff)
                        continue
                    else:
                        raise TimeoutError(
                            f"{layer.value}/{operation} timed out after "
                            f"{effective_timeout}s (all {effective_retries+1} attempts exhausted)"
                        )
                
                # 检查是哪个task完成了
                result_task = None
                for d in done:
                    if d is not task:
                        continue
                    result_task = d
                
                if result_task is None:
                    # abort被触发
                    task.cancel()
                    raise asyncio.CancelledError(f"Operation {operation} aborted")
                
                # 成功
                elapsed = time.time() - start
                if elapsed > effective_timeout * 0.8:
                    logger.warning(
                        f"[timeout] {layer.value}/{operation} took {elapsed:.1f}s "
                        f"(limit={effective_timeout}s) — close to timeout"
                    )
                return task.result()
                
            except asyncio.TimeoutError:
                last_error = TimeoutError(
                    f"{layer.value}/{operation} timed out after {effective_timeout}s"
                )
                if attempt < effective_retries:
                    backoff = min(
                        self.config.backoff_base * (2 ** attempt),
                        self.config.backoff_max,
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise last_error
            except Exception as e:
                last_error = e
                if attempt < effective_retries and self._should_retry(e):
                    backoff = min(
                        self.config.backoff_base * (2 ** attempt),
                        self.config.backoff_max,
                    )
                    logger.info(
                        f"[timeout] {layer.value}/{operation} failed ({e}), "
                        f"retrying in {backoff:.1f}s..."
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise
            finally:
                self._active.pop(op_key, None)
                self._abort_flags.pop(op_key, None)
        
        raise last_error or RuntimeError("Unexpected: no result and no error")
    
    def _should_retry(self, error: Exception) -> bool:
        """判断错误是否值得重试"""
        # 连接错误、临时错误可以重试
        retryable = (
            ConnectionError,
            ConnectionResetError,
            asyncio.IncompleteReadError,
        )
        # HTTP 5xx 可以重试
        if hasattr(error, "status_code") and isinstance(getattr(error, "status_code", None), int):
            return 500 <= error.status_code < 600
        return isinstance(error, retryable)
    
    def abort(self, session_id: str, operation: str):
        """主动中止一个操作"""
        for key in list(self._abort_flags.keys()):
            if key.startswith(f"{session_id}:{operation}:"):
                self._abort_flags[key].set()
                logger.info(f"[timeout] Aborted {key}")
                return
    
    def abort_session(self, session_id: str):
        """中止一个session的所有操作"""
        count = 0
        for key in list(self._abort_flags.keys()):
            if key.startswith(f"{session_id}:"):
                self._abort_flags[key].set()
                count += 1
        if count:
            logger.info(f"[timeout] Aborted {count} operations for session {session_id}")
    
    def get_stats(self) -> dict:
        """超时统计"""
        now = time.time()
        recent_events = [
            e for e in self._events
            if now - e.timestamp < 3600  # 最近1小时
        ]
        
        by_layer = {}
        for layer in TimeoutLayer:
            layer_events = [e for e in recent_events if e.layer == layer]
            by_layer[layer.value] = {
                "timeouts": len(layer_events),
                "limit": self._get_timeout(layer),
                "retries": self._get_retries(layer),
            }
        
        return {
            "active_operations": [
                {
                    "key": k,
                    "layer": v["layer"].value,
                    "running_for": f"{now - v['start']:.1f}s",
                    "attempt": v["attempt"] + 1,
                }
                for k, v in list(self._active.items())[:10]
            ],
            "recent_timeouts": len(recent_events),
            "by_layer": by_layer,
            "total_events": len(self._events),
        }
