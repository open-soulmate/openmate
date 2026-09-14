"""Lane-aware Command Queue — 分级消息队列

借鉴自：
- n8n 的 Queue Mode（main → Redis → worker）
- DeerFlow 2.0 的租约心跳 + worker takeover
- Hermes 的消息优先级

核心思想：不是所有消息都平等。用户的新消息 > 系统通知 > 后台任务。
分Lane处理，高优先级可以插队，低优先级不阻塞高优先级。
"""

import asyncio
import time
import logging
import heapq
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Callable, Coroutine

logger = logging.getLogger("acp-agent.lane-queue")


class Lane(IntEnum):
    """消息通道优先级（数字越小优先级越高）"""
    CRITICAL = 0    # 用户显式操作（发送消息、取消）
    HIGH = 1        # 用户等待的响应
    NORMAL = 2      # 常规任务
    LOW = 3         # 后台任务（标题生成、摘要）
    BACKGROUND = 4  # 清理、统计等


@dataclass(order=True)
class QueuedTask:
    """排队中的任务"""
    priority: int
    enqueue_time: float = field(compare=False)
    task_id: str = field(compare=False)
    lane: Lane = field(compare=False)
    session_id: str = field(compare=False)
    fn: Callable = field(compare=False)
    args: tuple = field(compare=False, default=())
    kwargs: dict = field(compare=False, default_factory=dict)
    future: asyncio.Future | None = field(compare=False, default=None)
    
    def age_seconds(self) -> float:
        return time.time() - self.enqueue_time


class LaneQueue:
    """分级命令队列
    
    特性：
    1. 按Lane优先级调度
    2. 同Lane内FIFO
    3. 每个session每lane有并发上限
    4. 队列深度监控
    5. 超时任务自动取消
    """
    
    def __init__(
        self,
        max_workers: int = 4,
        max_per_session_per_lane: int = 2,
        task_timeout: float = 300.0,  # 5分钟超时
    ):
        self.max_workers = max_workers
        self.max_per_session_per_lane = max_per_session_per_lane
        self.task_timeout = task_timeout
        
        self._heap: list[QueuedTask] = []
        self._running: dict[str, QueuedTask] = {}  # task_id -> task
        self._session_lane_count: dict[tuple[str, Lane], int] = {}
        self._workers: list[asyncio.Task] = []
        self._dispatch_event = asyncio.Event()
        self._shutdown = False
        self._task_counter = 0
        
        # 统计
        self._stats = {
            "enqueued": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
            "timeout": 0,
        }
    
    async def start(self):
        """启动worker池"""
        self._shutdown = False
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker_loop(i))
            self._workers.append(worker)
        logger.info(f"[lane-queue] Started {self.max_workers} workers")
    
    async def stop(self):
        """优雅关闭"""
        self._shutdown = True
        self._dispatch_event.set()
        for w in self._workers:
            w.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        logger.info("[lane-queue] Stopped")
    
    async def submit(
        self,
        fn: Callable[..., Coroutine],
        *,
        lane: Lane = Lane.NORMAL,
        session_id: str = "global",
        task_id: str | None = None,
        **kwargs,
    ) -> Any:
        """提交任务到队列，返回结果（会等待完成）"""
        self._task_counter += 1
        task_id = task_id or f"task-{self._task_counter}"
        
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        
        qt = QueuedTask(
            priority=int(lane),
            enqueue_time=time.time(),
            task_id=task_id,
            lane=lane,
            session_id=session_id,
            fn=fn,
            kwargs=kwargs,
            future=future,
        )
        
        heapq.heappush(self._heap, qt)
        self._stats["enqueued"] += 1
        self._dispatch_event.set()
        
        logger.debug(
            f"[lane-queue] Enqueued {task_id} lane={lane.name} "
            f"session={session_id} depth={len(self._heap)}"
        )
        
        return await future
    
    def _try_claim(self, task: QueuedTask) -> bool:
        """尝试认领任务（检查并发限制）"""
        key = (task.session_id, task.lane)
        current = self._session_lane_count.get(key, 0)
        if current >= self.max_per_session_per_lane:
            return False
        self._session_lane_count[key] = current + 1
        return True
    
    def _release_claim(self, task: QueuedTask):
        """释放并发计数"""
        key = (task.session_id, task.lane)
        self._session_lane_count[key] = max(0, self._session_lane_count.get(key, 1) - 1)
    
    async def _worker_loop(self, worker_id: int):
        """Worker主循环"""
        while not self._shutdown:
            # 等待有任务可执行
            if not self._heap:
                self._dispatch_event.clear()
                try:
                    await asyncio.wait_for(self._dispatch_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if self._shutdown:
                    break
            
            # 找一个可以执行的任务（按优先级）
            task = None
            skipped = []
            while self._heap:
                candidate = heapq.heappop(self._heap)
                if candidate.future.cancelled():
                    self._stats["cancelled"] += 1
                    continue
                if self._try_claim(candidate):
                    task = candidate
                    break
                else:
                    skipped.append(candidate)
            
            # 把没执行的放回去
            for s in skipped:
                heapq.heappush(self._heap, s)
            
            if not task:
                await asyncio.sleep(0.1)
                continue
            
            # 执行任务
            self._running[task.task_id] = task
            try:
                result = await asyncio.wait_for(
                    task.fn(**task.kwargs),
                    timeout=self.task_timeout,
                )
                if not task.future.cancelled():
                    task.future.set_result(result)
                self._stats["completed"] += 1
            except asyncio.TimeoutError:
                logger.warning(
                    f"[lane-queue] Task {task.task_id} timed out "
                    f"after {self.task_timeout}s"
                )
                if not task.future.cancelled():
                    task.future.set_exception(
                        TimeoutError(f"Task timed out after {self.task_timeout}s")
                    )
                self._stats["timeout"] += 1
            except Exception as e:
                if not task.future.cancelled():
                    task.future.set_exception(e)
                self._stats["failed"] += 1
                logger.error(f"[lane-queue] Task {task.task_id} failed: {e}")
            finally:
                del self._running[task.task_id]
                self._release_claim(task)
    
    def get_stats(self) -> dict:
        """队列状态监控"""
        now = time.time()
        return {
            **self._stats,
            "queue_depth": len(self._heap),
            "running": len(self._running),
            "running_detail": [
                {
                    "task_id": t.task_id,
                    "lane": t.lane.name,
                    "session": t.session_id,
                    "running_for": f"{now - t.enqueue_time:.1f}s",
                }
                for t in list(self._running.values())[:10]
            ],
            "waiting_by_lane": {
                lane.name: sum(1 for t in self._heap if t.lane == lane)
                for lane in Lane
            },
            "oldest_wait": f"{self._heap[0].age_seconds():.1f}s" if self._heap else "0s",
        }
