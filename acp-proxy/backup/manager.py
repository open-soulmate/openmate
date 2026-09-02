"""Backup v1.0 快照备份管理器 — session/workspace/消息快照。"""
from __future__ import annotations
import time, copy, threading
from dataclasses import dataclass, field

@dataclass
class Snapshot:
    """快照。"""
    snapshot_id: str
    session_id: str
    trigger: str  # "freeze"/"restart"/"scheduled"
    metadata: dict = field(default_factory=dict)
    messages: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

class BackupManager:
    """备份管理器（单例）。"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._snapshots: dict[str, Snapshot] = {}
        return cls._instance

    def create_snapshot(self, session_id: str, trigger: str, metadata: dict = None, messages: list = None) -> Snapshot:
        """创建快照。"""
        sid = f"snap-{session_id}-{int(time.time()*1000)}"
        snap = Snapshot(snapshot_id=sid, session_id=session_id, trigger=trigger, metadata=metadata or {}, messages=copy.deepcopy(messages or []))
        self._snapshots[sid] = snap
        return snap

    def list_snapshots(self, session_id: str = None) -> list[Snapshot]:
        """列出快照。"""
        snaps = list(self._snapshots.values())
        if session_id:
            snaps = [s for s in snaps if s.session_id == session_id]
        return sorted(snaps, key=lambda s: s.created_at, reverse=True)

    def restore_snapshot(self, snapshot_id: str) -> Snapshot | None:
        """恢复快照。"""
        return self._snapshots.get(snapshot_id)

    def cleanup_old(self, max_age_seconds: int = 86400):
        """清理过期快照。"""
        cutoff = time.time() - max_age_seconds
        old_ids = [sid for sid, s in self._snapshots.items() if s.created_at < cutoff]
        for sid in old_ids:
            del self._snapshots[sid]
        return len(old_ids)
