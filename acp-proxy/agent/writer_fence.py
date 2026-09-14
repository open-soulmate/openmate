"""Writer Claim Fencing — 防止同一会话并发写入互相破坏

借鉴自：
- 数据库的 fencing token 模式（Kafka/etcd）
- Claude Code 的 session lock
- OpenHands 的 event stream 串行化

核心思想：每个 session 同时只允许一个写入者（prompt处理），
后来的写入者要么排队等待，要么被拒绝并返回明确错误。
"""

import asyncio
import time
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("acp-agent.writer-fencing")


class WriteAction(str, Enum):
    QUEUE = "queue"      # 排队等待前一个完成
    REJECT = "reject"    # 直接拒绝，返回busy
    PREEMPT = "preempt"  # 抢占（中断前一个，慎用）


@dataclass
class WriterClaim:
    """一个写入者的claim"""
    claim_id: str
    session_id: str
    writer_id: str
    acquired_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)


class SessionWriterFence:
    """会话级写入栅栏
    
    Usage:
        fence = SessionWriterFence(action=WriteAction.QUEUE, timeout=30)
        
        async with fence.write(session_id, writer_id="prompt"):
            # 只有一个协程能进入这个块
            ... do write operations ...
    """
    
    def __init__(
        self,
        action: WriteAction = WriteAction.QUEUE,
        timeout: float = 30.0,
        stale_after: float = 120.0,
    ):
        self.action = action
        self.timeout = timeout
        self.stale_after = stale_after  # heartbeat超过这个秒数认为writer已死
        self._claims: dict[str, WriterClaim] = {}  # session_id -> claim
        self._locks: dict[str, asyncio.Lock] = {}  # session_id -> lock
        self._waiters: dict[str, int] = {}  # session_id -> waiting count
    
    def _get_lock(self, session_id: str) -> asyncio.Lock:
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]
    
    def _is_stale(self, claim: WriterClaim) -> bool:
        return (time.time() - claim.last_heartbeat) > self.stale_after
    
    def heartbeat(self, session_id: str):
        """长任务中定期调用，证明writer还活着"""
        claim = self._claims.get(session_id)
        if claim:
            claim.last_heartbeat = time.time()
    
    def _try_steal_stale(self, session_id: str) -> bool:
        """尝试从已死的writer手中抢回claim"""
        claim = self._claims.get(session_id)
        if claim and self._is_stale(claim):
            logger.warning(
                f"[fence] Stealing stale claim from {claim.writer_id} "
                f"(idle {time.time() - claim.last_heartbeat:.0f}s) on {session_id}"
            )
            del self._claims[session_id]
            return True
        return False
    
    async def _acquire(self, session_id: str, writer_id: str) -> WriterClaim | None:
        """尝试获取claim，根据action决定行为"""
        
        # 检查是否有活跃的claim
        existing = self._claims.get(session_id)
        if existing:
            if existing.writer_id == writer_id:
                # 同一个writer重复获取（re-entrant），更新heartbeat
                existing.last_heartbeat = time.time()
                return existing
            
            if not self._try_steal_stale(session_id):
                existing = self._claims.get(session_id)
                if existing:
                    if self.action == WriteAction.REJECT:
                        logger.info(
                            f"[fence] REJECT {writer_id} on {session_id} "
                            f"(held by {existing.writer_id})"
                        )
                        return None
                    elif self.action == WriteAction.QUEUE:
                        # 排队等待
                        self._waiters[session_id] = self._waiters.get(session_id, 0) + 1
                        wait_start = time.time()
                        try:
                            # 等待现有claim释放（通过lock实现）
                            lock = self._get_lock(session_id)
                            await asyncio.wait_for(
                                lock.acquire(),
                                timeout=self.timeout,
                            )
                            lock.release()
                        except asyncio.TimeoutError:
                            logger.warning(
                                f"[fence] QUEUE timeout for {writer_id} on {session_id} "
                                f"after {self.timeout}s"
                            )
                            return None
                        finally:
                            self._waiters[session_id] = self._waiters.get(session_id, 1) - 1
                        
                        waited = time.time() - wait_start
                        if waited > 5:
                            logger.info(
                                f"[fence] {writer_id} waited {waited:.1f}s for {session_id}"
                            )
        
        # 获取claim
        claim = WriterClaim(
            claim_id=f"{session_id}:{writer_id}:{time.time():.0f}",
            session_id=session_id,
            writer_id=writer_id,
        )
        self._claims[session_id] = claim
        return claim
    
    def _release(self, session_id: str, writer_id: str):
        """释放claim"""
        claim = self._claims.get(session_id)
        if claim and claim.writer_id == writer_id:
            del self._claims[session_id]
            logger.debug(f"[fence] Released {session_id} by {writer_id}")
    
    def write(self, session_id: str, writer_id: str = "default"):
        """返回一个async context manager，在其中安全地写入"""
        return _WriteContext(self, session_id, writer_id)
    
    def get_stats(self) -> dict:
        """获取当前fence状态（用于监控）"""
        now = time.time()
        return {
            "active_claims": {
                sid: {
                    "writer_id": c.writer_id,
                    "held_for": f"{now - c.acquired_at:.1f}s",
                    "last_hb": f"{now - c.last_heartbeat:.1f}s ago",
                    "stale": self._is_stale(c),
                }
                for sid, c in self._claims.items()
            },
            "waiting": dict(self._waiters),
        }


class _WriteContext:
    """async context manager for fence.write()"""
    
    def __init__(self, fence: SessionWriterFence, session_id: str, writer_id: str):
        self.fence = fence
        self.session_id = session_id
        self.writer_id = writer_id
        self.claim: WriterClaim | None = None
    
    async def __aenter__(self) -> bool:
        self.claim = await self._fence_acquire()
        return self.claim is not None
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.claim:
            self.fence._release(self.session_id, self.writer_id)
        return False
    
    async def _fence_acquire(self):
        lock = self.fence._get_lock(self.session_id)
        async with lock:
            return await self.fence._acquire(self.session_id, self.writer_id)
