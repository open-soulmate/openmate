"""MCP Server 注册持久化 — kilocode Storage 模式（filesystem JSON + 原子替换）

调研来源：kilocode AGENTS.md「Storage: Filesystem-based JSON, not a database...
Storage.write(["session", projectID, sessionID], data)」的本地 JSON 快照持久化模式
+ retention.py 同款原子替换（tmp+os.replace）并发安全语义。
背景（kilocode-source-supplement3 #19 轮遗留#5销账）：mcp-client registry 此前纯
内存态——服务重启后已配置 Server 全部丢失需 API 重新注册，MCP 消费面配置资产
不随服务存活（mcp-client.service 本轮才 systemd 托管，重启即丢配置实盘可复现）。

设计：
1. 快照式全量持久化（kilocode Storage.write 同构）：每次配置/连接态变化写全量
   快照 {"version": 1, "servers": [{"config": {...}, "connected": bool}]}
   ——全量快照天然幂等，多实例/并发写不会产生增量漂移
2. 原子替换（tmp+os.replace）——并发读方永远看到完整文件
3. 文件权限 0600 ——ServerConfig.env 可能含 API 密钥，快照含敏感配置
4. 恢复容错：坏 JSON/非列表→按空快照处理（WARNING，绝不阻塞服务启动）；
   单条 config 非法→跳过该条其余照常恢复（部分失败可见，mem0 §1.1 不静默）
5. 持久化失败绝不反噬注册/连接主流程（WARNING 日志，观测/持久化层不阻塞执行层）
6. connected=真实连接态快照：恢复时重连；auto_connect=True 也重连（两个入口
   同一恢复目标：重启后工具面/资源面自动回到重启前状态）
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("mcp-client.persistence")

SNAPSHOT_VERSION = 1


def registry_path() -> str:
    """快照文件路径：MCP_REGISTRY_PATH 可覆盖，默认 ~/.hermes/mcp-client/servers.json。"""
    override = os.environ.get("MCP_REGISTRY_PATH", "").strip()
    if override:
        return override
    return os.path.join(str(Path.home()), ".hermes", "mcp-client", "servers.json")


def save_snapshot(servers: list, path: Optional[str] = None) -> bool:
    """全量快照原子落盘（kilocode Storage.write 语义）。

    Returns:
        True=落盘成功；False=失败（仅WARNING，绝不抛出——持久化不反噬主流程）
    """
    target = Path(path or registry_path())
    tmp = target.with_suffix(target.suffix + ".tmp")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": SNAPSHOT_VERSION, "servers": list(servers)}
        # 0600：快照含 ServerConfig.env（可能有密钥），不允许组/其他用户读
        fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(str(tmp), str(target))  # 原子替换
        return True
    except Exception as e:
        logger.warning("[persist] 注册快照落盘失败 %s: %s", target, e)
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def load_snapshot(path: Optional[str] = None) -> list:
    """读取快照的 servers 列表。容错契约：任何异常→[]（WARNING），绝不抛出。"""
    target = Path(path or registry_path())
    try:
        if not target.exists():
            return []
        data = json.loads(target.read_text(encoding="utf-8", errors="replace"))
        if not isinstance(data, dict):
            logger.warning("[persist] 快照根节点非dict，按空快照处理: %s", target)
            return []
        servers = data.get("servers")
        if not isinstance(servers, list):
            logger.warning("[persist] 快照servers非列表，按空快照处理: %s", target)
            return []
        return servers
    except Exception as e:
        logger.warning("[persist] 注册快照读取失败（按空快照处理）%s: %s", target, e)
        return []
