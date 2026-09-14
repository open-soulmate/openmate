"""
工具调用并行执行器 — 借鉴Claude Code/Hermes的parallel tool execution
核心思想：无依赖的工具调用并行执行，有依赖的按序执行
支持：依赖图分析、并发控制、结果合并
"""

import logging
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional, Callable, Awaitable
from enum import Enum

logger = logging.getLogger("acp-proxy.parallel-exec")


class DependencyType(str, Enum):
    NONE = "none"          # 无依赖，可并行
    SEQUENTIAL = "sequential"  # 必须在前一个完成后
    DATA = "data"          # 需要前一个的输出作为输入


@dataclass
class ToolCallSpec:
    """工具调用规格"""
    call_id: str
    tool_name: str
    arguments: dict
    dependency_type: DependencyType = DependencyType.NONE
    depends_on: list[str] = field(default_factory=list)  # 依赖的call_id列表
    timeout_seconds: float = 60.0
    retry_count: int = 0
    max_retries: int = 2


@dataclass
class ToolCallResult:
    """工具调用结果"""
    call_id: str
    tool_name: str
    success: bool
    result: str = ""
    error: str = ""
    duration_ms: float = 0.0
    attempts: int = 1


class ParallelToolExecutor:
    """并行工具执行器"""

    def __init__(self, max_concurrency: int = 5):
        self.max_concurrency = max_concurrency
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._stats = {
            "total_batches": 0,
            "total_calls": 0,
            "parallel_calls": 0,
            "sequential_calls": 0,
            "avg_batch_time_ms": 0.0,
        }
        self._batch_times: list[float] = []

    async def execute_batch(
        self,
        calls: list[ToolCallSpec],
        executor_func: Callable[[str, dict], Awaitable[str]],
    ) -> list[ToolCallResult]:
        """执行一批工具调用 — 自动分析依赖，无依赖的并行"""
        if not calls:
            return []

        batch_start = time.time()
        self._stats["total_batches"] += 1
        self._stats["total_calls"] += len(calls)

        # 构建依赖图
        dep_graph = self._build_dependency_graph(calls)
        results: dict[str, ToolCallResult] = {}

        # 按拓扑序执行，同层的并行
        levels = self._topological_levels(dep_graph)

        for level in levels:
            # 同一层的调用可以并行
            parallel_calls = [c for c in level if c.dependency_type == DependencyType.NONE]
            sequential_calls = [c for c in level if c.dependency_type != DependencyType.NONE]

            self._stats["parallel_calls"] += len(parallel_calls)
            self._stats["sequential_calls"] += len(sequential_calls)

            # 并行执行无依赖的
            if parallel_calls:
                tasks = [
                    self._execute_single(call, executor_func, results)
                    for call in parallel_calls
                ]
                level_results = await asyncio.gather(*tasks, return_exceptions=True)
                for call, result in zip(parallel_calls, level_results):
                    if isinstance(result, Exception):
                        results[call.call_id] = ToolCallResult(
                            call_id=call.call_id,
                            tool_name=call.tool_name,
                            success=False,
                            error=str(result),
                        )
                    elif isinstance(result, ToolCallResult):
                        results[call.call_id] = result

            # 顺序执行有依赖的
            for call in sequential_calls:
                result = await self._execute_single(call, executor_func, results)
                results[call.call_id] = result

        batch_time = (time.time() - batch_start) * 1000
        self._batch_times.append(batch_time)
        if len(self._batch_times) > 50:
            self._batch_times = self._batch_times[-50:]
        self._stats["avg_batch_time_ms"] = sum(self._batch_times) / len(self._batch_times)

        logger.info(
            f"Batch executed: {len(calls)} calls in {batch_time:.0f}ms "
            f"({self._stats['parallel_calls']} parallel, {self._stats['sequential_calls']} sequential)"
        )

        return [results[call.call_id] for call in calls if call.call_id in results]

    async def _execute_single(
        self,
        call: ToolCallSpec,
        executor_func: Callable[[str, dict], Awaitable[str]],
        previous_results: dict[str, ToolCallResult],
    ) -> ToolCallResult:
        """执行单个工具调用（带重试）"""
        async with self._semaphore:
            start = time.time()
            arguments = dict(call.arguments)

            # 处理数据依赖：从依赖的调用结果中注入数据
            if call.dependency_type == DependencyType.DATA:
                for dep_id in call.depends_on:
                    if dep_id in previous_results and previous_results[dep_id].success:
                        arguments[f"_dep_{dep_id}"] = previous_results[dep_id].result

            for attempt in range(call.max_retries + 1):
                try:
                    result = await asyncio.wait_for(
                        executor_func(call.tool_name, arguments),
                        timeout=call.timeout_seconds,
                    )
                    duration = (time.time() - start) * 1000
                    return ToolCallResult(
                        call_id=call.call_id,
                        tool_name=call.tool_name,
                        success=True,
                        result=result,
                        duration_ms=duration,
                        attempts=attempt + 1,
                    )
                except asyncio.TimeoutError:
                    if attempt == call.max_retries:
                        return ToolCallResult(
                            call_id=call.call_id,
                            tool_name=call.tool_name,
                            success=False,
                            error=f"Timeout after {call.timeout_seconds}s",
                            duration_ms=(time.time() - start) * 1000,
                            attempts=attempt + 1,
                        )
                except Exception as e:
                    if attempt == call.max_retries:
                        return ToolCallResult(
                            call_id=call.call_id,
                            tool_name=call.tool_name,
                            success=False,
                            error=str(e),
                            duration_ms=(time.time() - start) * 1000,
                            attempts=attempt + 1,
                        )
                    await asyncio.sleep(0.5 * (attempt + 1))  # 指数退避

            return ToolCallResult(
                call_id=call.call_id,
                tool_name=call.tool_name,
                success=False,
                error="Max retries exceeded",
                attempts=call.max_retries + 1,
            )

    def _build_dependency_graph(self, calls: list[ToolCallSpec]) -> dict[str, list[str]]:
        """构建依赖图"""
        graph = {}
        for call in calls:
            graph[call.call_id] = call.depends_on
        return graph

    def _topological_levels(self, graph: dict[str, list[str]]) -> list[list[ToolCallSpec]]:
        """拓扑排序，返回可并行的层级"""
        # 简化实现：按依赖深度分层
        depth: dict[str, int] = {}

        def get_depth(node_id: str, visited: Optional[set] = None) -> int:
            if visited is None:
                visited = set()
            if node_id in visited:
                return 0  # 循环依赖保护
            if node_id in depth:
                return depth[node_id]
            visited.add(node_id)
            deps = graph.get(node_id, [])
            if not deps:
                depth[node_id] = 0
            else:
                depth[node_id] = 1 + max(get_depth(d, visited) for d in deps if d in graph)
            return depth[node_id]

        # 这里简化处理，实际需要完整的拓扑排序
        # 暂时返回单层（全部并行）
        return [[]]  # placeholder

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "max_concurrency": self.max_concurrency,
            "current_semaphore": self._semaphore._value,
        }
