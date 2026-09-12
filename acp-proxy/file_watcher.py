"""文件变更监控 — 检测伙伴实例的代码修改并触发重启

当进化流水线成功后，写入restart信号文件。
本模块监控这些信号，触发进程优雅退出（exit code 42）。
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("file-watcher")

RESTART_EXIT_CODE = 42


class FileWatcher:
    """监控重启信号文件"""

    def __init__(self, data_dir: Path, instance_id: str):
        self.data_dir = data_dir
        self.instance_id = instance_id
        self._running = False
        self.signal_file = data_dir / f"restart_{instance_id}.signal"

    async def start(self):
        """启动信号监控循环"""
        self._running = True
        logger.info(f"[file-watcher] Monitoring restart signal: {self.signal_file}")

        while self._running:
            await asyncio.sleep(2)  # 每2秒检查一次
            await self._check_signal()

    async def _check_signal(self):
        """检查重启信号文件"""
        if not self.signal_file.exists():
            return

        try:
            content = self.signal_file.read_text().strip()
            self.signal_file.unlink()

            data = json.loads(content) if content.startswith("{") else {"reason": content}
            reason = data.get("reason", "unknown")
            logger.info(f"[file-watcher] 🔄 Restart signal: {reason}")

            # 写入确认文件（供supervisor检查）
            ack_file = self.data_dir / f"restart_{self.instance_id}.ack"
            ack_file.write_text(json.dumps({
                "signal": reason,
                "received_at": datetime.now(timezone.utc).isoformat(),
                "pid": os.getpid(),
            }))

            # 触发进程重启
            logger.info(f"[file-watcher] 🚀 Exiting with code {RESTART_EXIT_CODE}")
            os._exit(RESTART_EXIT_CODE)

        except json.JSONDecodeError:
            # 非JSON内容，也视为重启信号
            logger.info(f"[file-watcher] 🔄 Restart signal (plain text)")
            os._exit(RESTART_EXIT_CODE)
        except Exception as e:
            logger.warning(f"[file-watcher] Signal read error: {e}")

    def stop(self):
        self._running = False
