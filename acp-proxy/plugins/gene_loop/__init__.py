"""gene-loop插件 — Heredity回流管道（架构v2.1砖1，Phase A产物）

闭环: evo_feedback/audit → Propose(提案) → Hermes审核(权限引擎) → Promote(Gene dev_norm)
      → evo_feedback扩展 → planner下轮注入 —— 首个全Agent可用的规范回流管道

插件契约（13-Plugin规范v1.1 + acp-proxy/plugin/loader.py实测）:
  get_manifest() / register_routes(app) / register_tools(tool_gateway)
  / on_enable() / on_disable() / on_uninstall()

目录注记（任务书S0附录）:
- 目录名gene_loop（Python标识符约束，importlib要求），plugin.json id="gene-loop"（规范kebab-case）
- 路由当前由app.py直挂routes/gene_loop.py（PluginLoader框架未接线，见S0附录gap②）；
  本__init__.py完整实现契约，供loader接线后无缝切换
"""
from __future__ import annotations

import json
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent

try:
    from routes.gene_loop import router as gene_loop_router
except ImportError:  # loader接线前的独立导入场景
    gene_loop_router = None


def get_manifest() -> dict:
    return json.loads((PLUGIN_DIR / "plugin.json").read_text(encoding="utf-8"))


def register_routes(app) -> None:
    if gene_loop_router is not None:
        app.include_router(gene_loop_router)


def _propose_handler(limit: int = 5) -> dict:
    from plugins.gene_loop.tools.propose import propose
    return propose(limit=int(limit))


def _digest_handler() -> dict:
    from plugins.gene_loop.cron_review import digest
    return json.loads(digest())


def register_tools(tool_gateway) -> int:
    """注册gene-loop工具到工具网关（13规范§4：Skill/Agent→网关→插件执行）。"""
    tools = [
        {
            "name": "gene_propose",
            "description": "从evo反馈/audit生成Gene规范提案（去重，入审核队列）",
            "parameters": {"limit": {"type": "integer", "default": 5}},
            "handler": _propose_handler,
        },
        {
            "name": "gene_review_digest",
            "description": "Gene提案队列确定性摘要（计数/待审/待拍板）",
            "parameters": {},
            "handler": _digest_handler,
        },
    ]
    registered = 0
    for t in tools:
        try:
            tool_gateway.register_tool(
                t["name"], t["description"], t["parameters"], t["handler"],
                plugin_id="gene-loop")
            registered += 1
        except Exception:
            continue
    return registered


def on_enable() -> None:
    """启用：确保DB迁移就绪（幂等）。"""
    try:
        from plugins.gene_loop.schema import connect, migrate
        conn = connect(None)
        migrate(conn)
        conn.close()
    except Exception:
        pass


def on_disable() -> None:
    """停用：无副作用（cron如在跑仍可读写数据，仅摘除路由/工具）。"""


def on_uninstall() -> None:
    """卸载：数据保留——gene_loop.db/escalations是治理审计记录，不删除。"""
