"""
Agent工具调用审计器 — 借鉴LangSmith trace audit + OpenTelemetry spans
核心思想：审计每次工具调用的安全性、合规性、性能，生成审计报告
"""

import logging
import json
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.tool-auditor")


@dataclass
class AuditEntry:
    entry_id: str
    session_id: str
    tool_name: str
    arguments: dict
    result_summary: str
    duration_ms: float
    success: bool
    risk_level: str = "low"  # "low", "medium", "high", "critical"
    flags: list[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)


class ToolAuditor:
    """工具调用审计器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "audit"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "audit.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    entry_id TEXT PRIMARY KEY,
                    session_id TEXT DEFAULT '',
                    tool_name TEXT NOT NULL,
                    arguments TEXT DEFAULT '{}',
                    result_summary TEXT DEFAULT '',
                    duration_ms REAL DEFAULT 0,
                    success INTEGER DEFAULT 1,
                    risk_level TEXT DEFAULT 'low',
                    flags TEXT DEFAULT '[]',
                    timestamp REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_audit_time
                ON audit_log(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_audit_tool
                ON audit_log(tool_name, timestamp)
            """)
            conn.commit()

    def audit_call(
        self,
        session_id: str,
        tool_name: str,
        arguments: dict,
        result: str,
        duration_ms: float,
        success: bool,
    ) -> AuditEntry:
        """审计一次工具调用"""
        flags = []
        risk = "low"

        # 检查风险
        if tool_name == "terminal":
            cmd = str(arguments.get("command", ""))
            if any(danger in cmd for danger in ["rm -rf", "sudo", "chmod 777", "mkfs"]):
                risk = "critical"
                flags.append("dangerous_command")
            elif any(danger in cmd for danger in ["rm ", "mv ", "kill", "shutdown"]):
                risk = "high"
                flags.append("destructive_command")
            elif "curl" in cmd or "wget" in cmd:
                risk = "medium"
                flags.append("network_access")

        if tool_name == "write_file":
            path = str(arguments.get("path", ""))
            if "/etc/" in path or "/root/" in path:
                risk = "high"
                flags.append("system_file_write")

        if not success:
            flags.append("tool_failed")

        if duration_ms > 30000:
            flags.append("slow_execution")

        entry = AuditEntry(
            entry_id=f"audit_{int(time.time() * 1000)}",
            session_id=session_id,
            tool_name=tool_name,
            arguments=arguments,
            result_summary=result[:200] if result else "",
            duration_ms=duration_ms,
            success=success,
            risk_level=risk,
            flags=flags,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO audit_log
                   (entry_id, session_id, tool_name, arguments,
                    result_summary, duration_ms, success, risk_level, flags, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (entry.entry_id, session_id, tool_name,
                 json.dumps(arguments, ensure_ascii=False),
                 entry.result_summary, duration_ms, 1 if success else 0,
                 risk, json.dumps(flags), time.time()),
            )
            conn.commit()

        if risk in ("high", "critical"):
            logger.warning(f"AUDIT: {risk} risk call: {tool_name} flags={flags}")

        return entry

    def get_risk_report(self, hours: int = 24) -> dict:
        """获取风险报告"""
        cutoff = time.time() - hours * 3600

        with sqlite3.connect(self.db_path) as conn:
            high_risk = conn.execute(
                """SELECT COUNT(*) FROM audit_log
                   WHERE risk_level IN ('high', 'critical') AND timestamp > ?""",
                (cutoff,),
            ).fetchone()[0]

            by_tool = conn.execute(
                """SELECT tool_name, COUNT(*), AVG(duration_ms), SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)
                   FROM audit_log WHERE timestamp > ?
                   GROUP BY tool_name ORDER BY COUNT(*) DESC""",
                (cutoff,),
            ).fetchall()

            all_flags = conn.execute(
                """SELECT flags FROM audit_log
                   WHERE flags != '[]' AND timestamp > ?""",
                (cutoff,),
            ).fetchall()

        # 统计flags
        flag_counts: dict[str, int] = {}
        for row in all_flags:
            for flag in json.loads(row[0] or "[]"):
                flag_counts[flag] = flag_counts.get(flag, 0) + 1

        return {
            "period_hours": hours,
            "high_risk_calls": high_risk,
            "by_tool": {
                t[0]: {
                    "calls": t[1],
                    "avg_duration_ms": round(t[2], 1),
                    "failures": t[3],
                }
                for t in by_tool
            },
            "flags": flag_counts,
        }

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
            critical = conn.execute(
                "SELECT COUNT(*) FROM audit_log WHERE risk_level = 'critical'"
            ).fetchone()[0]
            failed = conn.execute(
                "SELECT COUNT(*) FROM audit_log WHERE success = 0"
            ).fetchone()[0]

        return {
            "total_entries": total,
            "critical_risk": critical,
            "failed_calls": failed,
        }
