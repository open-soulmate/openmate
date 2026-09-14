"""
配置热更新管理器 — 借鉴Nacos/Apollo配置中心 + pydantic-settings
核心思想：配置变更实时生效，支持版本化、灰度发布、回滚
"""

import logging
import json
import time
import hashlib
import sqlite3
import asyncio
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Optional, Callable, Awaitable
from datetime import datetime

logger = logging.getLogger("acp-proxy.config-manager")


@dataclass
class ConfigVersion:
    version_id: str
    config_key: str
    value: Any
    created_at: float
    created_by: str = "system"
    description: str = ""
    is_active: bool = False
    rollback_of: str = ""


@dataclass
class ConfigChange:
    change_id: str
    config_key: str
    old_value: Any
    new_value: Any
    timestamp: float
    changed_by: str = "system"
    reason: str = ""


class HotConfigManager:
    """配置热更新管理器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "config"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "config.db")
        self.db_path = db_path
        self._watchers: dict[str, list[Callable]] = {}
        self._cache: dict[str, Any] = {}
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config_versions (
                    version_id TEXT PRIMARY KEY,
                    config_key TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    created_by TEXT DEFAULT 'system',
                    description TEXT DEFAULT '',
                    is_active INTEGER DEFAULT 0,
                    rollback_of TEXT DEFAULT '',
                    created_at_str TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_config_key
                ON config_versions(config_key, is_active)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config_changes (
                    change_id TEXT PRIMARY KEY,
                    config_key TEXT NOT NULL,
                    old_value TEXT DEFAULT '',
                    new_value TEXT DEFAULT '',
                    timestamp REAL NOT NULL,
                    changed_by TEXT DEFAULT 'system',
                    reason TEXT DEFAULT ''
                )
            """)
            conn.commit()

    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值（优先缓存）"""
        if key in self._cache:
            return self._cache[key]

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT value_json FROM config_versions WHERE config_key = ? AND is_active = 1",
                (key,),
            ).fetchone()

        if row:
            value = json.loads(row["value_json"])
            self._cache[key] = value
            return value

        return default

    def set(
        self,
        key: str,
        value: Any,
        changed_by: str = "system",
        reason: str = "",
        description: str = "",
    ) -> ConfigVersion:
        """设置配置值（创建新版本）"""
        # 获取旧值
        old_value = self.get(key)

        # 创建新版本
        version_id = f"v_{hashlib.sha256(f'{key}:{time.time()}'.encode()).hexdigest()[:12]}"

        with sqlite3.connect(self.db_path) as conn:
            # 停用旧版本
            conn.execute(
                "UPDATE config_versions SET is_active = 0 WHERE config_key = ?",
                (key,),
            )

            # 插入新版本
            conn.execute(
                """INSERT INTO config_versions
                   (version_id, config_key, value_json, created_at,
                    created_by, description, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, 1)""",
                (version_id, key, json.dumps(value, ensure_ascii=False),
                 time.time(), changed_by, description),
            )

            # 记录变更
            conn.execute(
                """INSERT INTO config_changes
                   (change_id, config_key, old_value, new_value, timestamp, changed_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"chg_{uuid4_hex(8)}", key,
                 json.dumps(old_value, ensure_ascii=False) if old_value is not None else "",
                 json.dumps(value, ensure_ascii=False),
                 time.time(), changed_by, reason),
            )
            conn.commit()

        # 更新缓存
        self._cache[key] = value

        # 通知watchers
        self._notify_watchers(key, old_value, value)

        logger.info(f"Config updated: {key} = {json.dumps(value, ensure_ascii=False)[:100]}")

        return ConfigVersion(
            version_id=version_id,
            config_key=key,
            value=value,
            created_at=time.time(),
            created_by=changed_by,
            description=description,
            is_active=True,
        )

    def watch(self, key: str, callback: Callable[[str, Any, Any], Awaitable[None]]):
        """监听配置变更"""
        if key not in self._watchers:
            self._watchers[key] = []
        self._watchers[key].append(callback)
        logger.debug(f"Added watcher for config: {key}")

    def _notify_watchers(self, key: str, old_value: Any, new_value: Any):
        """通知所有watchers"""
        callbacks = self._watchers.get(key, [])
        for cb in callbacks:
            try:
                asyncio.create_task(cb(key, old_value, new_value))
            except Exception as e:
                logger.warning(f"Watcher callback error: {e}")

    def get_history(self, key: str, limit: int = 20) -> list[dict]:
        """获取配置变更历史"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT version_id, value_json, created_at, created_by,
                          description, is_active
                   FROM config_versions WHERE config_key = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (key, limit),
            ).fetchall()

        return [
            {
                "version_id": r["version_id"],
                "value": json.loads(r["value_json"]),
                "created_at": r["created_at"],
                "created_by": r["created_by"],
                "description": r["description"],
                "is_active": bool(r["is_active"]),
            }
            for r in rows
        ]

    def rollback(self, key: str, to_version_id: str, changed_by: str = "system") -> bool:
        """回滚到指定版本"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM config_versions WHERE version_id = ? AND config_key = ?",
                (to_version_id, key),
            ).fetchone()

            if not row:
                logger.warning(f"Version {to_version_id} not found for {key}")
                return False

            # 停用当前
            conn.execute(
                "UPDATE config_versions SET is_active = 0 WHERE config_key = ?",
                (key,),
            )

            # 创建回滚版本（复制目标版本的值）
            new_version_id = f"v_{hashlib.sha256(f'{key}:rollback:{time.time()}'.encode()).hexdigest()[:12]}"
            conn.execute(
                """INSERT INTO config_versions
                   (version_id, config_key, value_json, created_at,
                    created_by, description, is_active, rollback_of)
                   VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
                (new_version_id, key, row["value_json"], time.time(),
                 changed_by, f"Rollback to {to_version_id}", to_version_id),
            )

            # 记录变更
            old_value = self.get(key)
            conn.execute(
                """INSERT INTO config_changes
                   (change_id, config_key, old_value, new_value, timestamp, changed_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"chg_{uuid4_hex(8)}", key,
                 json.dumps(old_value, ensure_ascii=False) if old_value else "",
                 row["value_json"], time.time(), changed_by,
                 f"Rollback to {to_version_id}"),
            )
            conn.commit()

        # 更新缓存
        new_value = json.loads(row["value_json"])
        self._cache[key] = new_value
        self._notify_watchers(key, old_value, new_value)

        logger.info(f"Config {key} rolled back to {to_version_id}")
        return True

    def list_configs(self) -> list[dict]:
        """列出所有配置"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT config_key, value_json, created_at, created_by
                   FROM config_versions WHERE is_active = 1
                   ORDER BY config_key""",
            ).fetchall()

        return [
            {
                "key": r["config_key"],
                "value": json.loads(r["value_json"]),
                "updated_at": r["created_at"],
                "updated_by": r["created_by"],
            }
            for r in rows
        ]

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total_configs = conn.execute(
                "SELECT COUNT(DISTINCT config_key) FROM config_versions WHERE is_active = 1"
            ).fetchone()[0]
            total_versions = conn.execute(
                "SELECT COUNT(*) FROM config_versions"
            ).fetchone()[0]
            total_changes = conn.execute(
                "SELECT COUNT(*) FROM config_changes"
            ).fetchone()[0]

        return {
            "active_configs": total_configs,
            "total_versions": total_versions,
            "total_changes": total_changes,
            "watchers": sum(len(cbs) for cbs in self._watchers.values()),
            "cached_keys": len(self._cache),
        }


def uuid4_hex(n: int = 8) -> str:
    import uuid
    return uuid.uuid4().hex[:n]
