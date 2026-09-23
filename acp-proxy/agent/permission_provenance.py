"""kilocode #14 权限provenance — "为什么允许/为什么拒绝"消息级可审计

调研来源（kilocode-source-supplement3.md #14，🔴"HITL审计链缺的最后一环"）：
- kilocode tools.ts 682行：每次审批结果（含拒绝）写回tool part metadata：
  1. approval来源（哪一层放行/拦截：会话缓存/真人审批/引擎规则/降级本地）
  2. tagOutsideWorkspace标记（文件路径在workspace外的批准单独打标）
  3. classifyDenial（拒绝原因分类：哪条ruleset/permission/patterns/agent/origins）
- claude-code ProvenanceEntry/policyOrigin 7种（SUMMARY.md P0-3）：规则来源可追溯
- mem0 §1.1"失败必须可见，禁止静默降级"：provenance记录失败必须打日志，绝不静默

职责（纯函数+轻量recorder，无外部依赖）：
1. build_provenance()：一次门禁判定 → 一条tool part metadata记录（dict）
2. classify_denial()：拒绝分层分类（gate未自带denial_class时的推断回退）
3. approval_source()：放行/审批来源分类
4. outside_workspace_paths()：参数中的工作区外文件路径提取（tagOutsideWorkspace）
5. PermissionProvenanceRecorder：JSONL持久账本（data/permission_provenance.jsonl，
   每条判定含拒绝都落盘——"审批结果消息级可审计、JSON导出可解释"）

设计边界：
- provenance是纯观测数据，绝不影响门禁判定本身（记录失败仅日志，工具流程照常）
- 所有值str()强制序列化安全（MagicMock/自定义对象gate都不炸）
"""

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Optional

from agent import retention

logger = logging.getLogger("acp-agent.permission_provenance")

SCHEMA = "kilocode-#14-v1"

# 工具参数中承载文件路径的键（kilocode tagOutsideWorkspace的输入面）
_PATH_KEYS = (
    "path", "file", "filepath", "file_path", "filename", "target",
    "dir", "directory", "dest", "destination", "src", "source_path",
)

# command/script文本中的绝对路径提取（terminal类工具的文件面）
_ABS_PATH_RE = re.compile(r"(?:^|[\s'\"=(:])(/(?:[\w.\-~]+/)*[\w.\-~]+)")

_MAX_OUTSIDE_PATHS = 8


def _s(v) -> str:
    """任意值→安全字符串（MagicMock/None/自定义对象都不炸）"""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    try:
        return str(v)
    except Exception:
        return ""


def _b(v) -> bool:
    try:
        return bool(v)
    except Exception:
        return False


def classify_denial(behavior: str = "", rule_source: str = "",
                    rule_content: str = "", denial_class: str = "") -> str:
    """拒绝原因分类（kilocode classifyDenial：哪条ruleset/permission/patterns/agent/origins）

    优先用gate自带的denial_class（PermissionGate在构造处最清楚是哪一层拦的）；
    缺失时按behavior+rule_source推断回退（兼容旧gate/测试stub）。
    """
    if denial_class:
        return denial_class
    behavior = behavior or ""
    src = rule_source or ""
    content = rule_content or ""
    if behavior in ("deny", "ask-denied", "degraded-deny"):
        if src == "degraded-local":
            # 降级本地硬规则（patterns）：opensoul不可达时的本地灾难命令否决
            return "patterns:degraded-local"
        if "hard" in content.lower() or "hard" in src.lower():
            return "hard-ruleset:{}".format(src or "unknown")
        if src == "session-cache":
            return "session-cache"  # 理论上缓存只存approved，出现即异常，原样标注
        if behavior == "ask-denied":
            return "approval:unattended-or-rejected"
        return "ruleset:{}".format(src or "unknown")
    return ""


def approval_source(gate_result) -> str:
    """放行/审批来源分类（kilocode"approval来源"）：
    session-cache(人工批过缓存) / human-approval(ACP真人审批) /
    engine-rule(规则放行) / engine-default(默认放行) / degraded-local(降级)
    """
    behavior = _s(getattr(gate_result, "behavior", ""))
    src = _s(getattr(gate_result, "rule_source", ""))
    human = _b(getattr(gate_result, "human_approved", False))
    if behavior == "cached-allow" or src == "session-cache":
        return "session-cache"
    if human:
        return "human-approval"
    if src == "degraded-local":
        return "degraded-local"
    if src:
        return "engine-rule"
    return "engine-default"


def outside_workspace_paths(tool_args: dict, working_dir: str) -> list:
    """提取工具参数中位于工作区外的文件路径（kilocode tagOutsideWorkspace）。

    - 路径类键（path/file/target…）：字符串值按路径解析
    - command/script类键：正则提取绝对路径
    - working_dir为空/不可解析 → 返回空（不瞎标）
    - 相对路径按working_dir解析；~展开user home
    """
    if not working_dir or not isinstance(tool_args, dict):
        return []
    try:
        base = os.path.realpath(os.path.expanduser(str(working_dir)))
    except Exception:
        return []
    if not base or not os.path.isdir(base):
        # working_dir不存在时仍按前缀比较（会话目录可能尚未创建）
        base = os.path.abspath(os.path.expanduser(str(working_dir)))
    candidates = []
    for key, val in tool_args.items():
        if not isinstance(val, str) or not val.strip():
            continue
        if key in _PATH_KEYS:
            candidates.append(val.strip())
        elif key in ("command", "cmd", "script", "code"):
            candidates.extend(_ABS_PATH_RE.findall(val))
    outside = []
    for p in candidates:
        if len(outside) >= _MAX_OUTSIDE_PATHS:
            break
        try:
            resolved = os.path.realpath(os.path.expanduser(p if os.path.isabs(p) or p.startswith("~") else os.path.join(base, p)))
        except Exception:
            continue
        if resolved == base:
            continue
        try:
            in_base = os.path.commonpath([resolved, base]) == base
        except ValueError:
            in_base = False  # 不同盘符/异常 → 视为outside
        if not in_base and resolved not in outside:
            outside.append(resolved)
    return outside


def build_provenance(tool_name: str, tool_args: dict, gate_result,
                     working_dir: str = "", session_id: str = "",
                     via: str = "main_loop", cached: bool = False) -> dict:
    """一次门禁判定 → tool part metadata（kilocode #14三要素齐全）。

    返回dict：
      schema/tool/decision/allowed/approval_source/rule_source/rule_content/
      mode/decision_id/human_approved/denial_class/tag_outside_workspace/
      outside_paths/session_id/via/cached/ts
    """
    behavior = _s(getattr(gate_result, "behavior", ""))
    rule_source = _s(getattr(gate_result, "rule_source", ""))
    rule_content = _s(getattr(gate_result, "rule_content", ""))[:200]
    try:
        outside = outside_workspace_paths(tool_args or {}, working_dir)
    except Exception as e:
        logger.debug("[perm-provenance] outside_workspace提取失败(非致命): %s", e)
        outside = []
    allowed = _b(getattr(gate_result, "allowed", False))
    return {
        "schema": SCHEMA,
        "tool": _s(tool_name),
        "decision": behavior,
        "allowed": allowed,
        "approval_source": approval_source(gate_result),
        "rule_source": rule_source,
        "rule_content": rule_content,
        "mode": _s(getattr(gate_result, "mode", "")),
        "decision_id": _s(getattr(gate_result, "decision_id", "")),
        "human_approved": _b(getattr(gate_result, "human_approved", False)),
        # kilocode：文件路径在workspace外的批准单独打标（拒绝也照标，审计完整性）
        "denial_class": ("" if allowed else classify_denial(
            behavior, rule_source, rule_content,
            _s(getattr(gate_result, "denial_class", "")))),
        "tag_outside_workspace": bool(outside),
        "outside_paths": outside,
        "session_id": _s(session_id),
        "via": _s(via) or "main_loop",
        "cached": bool(cached),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


class PermissionProvenanceRecorder:
    """权限provenance JSONL持久账本（跨进程可读，"JSON导出可解释"）。

    - 每条门禁判定（含拒绝）追加一行JSON到data/permission_provenance.jsonl
    - 记录失败仅WARNING日志、绝不中断工具流程（观测层不反噬执行层）
    - kilocode #2同款retention：7天窗口轮转（每小时最多一次，只删可证超龄行，见agent/retention.py）
    """

    def __init__(self, ledger_path: Optional[str] = None,
                 retention_days: float = 7.0, cleanup_interval: float = 3600.0):
        if ledger_path:
            self.ledger_path = Path(ledger_path)
        else:
            self.ledger_path = (Path(__file__).resolve().parent.parent
                                / "data" / "permission_provenance.jsonl")
        # 上轮遗留"provenance账本retention轮转"销账：与tool_spills同款7天mtime语义
        self.retention_days = retention_days
        self.cleanup_interval = cleanup_interval
        self.written = 0
        self.errors = 0

    def maybe_cleanup(self):
        """账本7天窗口轮转入口：每小时最多一次（进程内节流），失败仅日志不反噬。"""
        return retention.maybe_sweep(
            f"perm-prov:{self.ledger_path}",
            lambda: retention.compact_jsonl(
                self.ledger_path, max_age_days=self.retention_days),
            interval_s=self.cleanup_interval,
        )

    def record(self, entry: dict) -> bool:
        """追加一条provenance记录。成功True/失败False（失败必有日志，不静默）"""
        if not isinstance(entry, dict) or not entry:
            return False
        try:
            self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            line = json.dumps(entry, ensure_ascii=False, default=_s)
            with open(self.ledger_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
            self.written += 1
            # kilocode #2同款retention：写入顺带触发（每小时最多一次）账本轮转
            try:
                self.maybe_cleanup()
            except Exception as _c_err:
                logger.debug(f"[perm-provenance] 账本轮转跳过（非致命）: {_c_err}")
            return True
        except Exception as e:
            self.errors += 1
            logger.warning("[perm-provenance] 账本写入失败（工具流程照常）: %s", e)
            return False

    def read_recent(self, limit: int = 50) -> list:
        """读取最近N条（审计/测试用，跨进程可读）"""
        try:
            if not self.ledger_path.exists():
                return []
            lines = self.ledger_path.read_text(encoding="utf-8").splitlines()
            out = []
            for line in lines[-limit:]:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            return out
        except Exception as e:
            logger.warning("[perm-provenance] 账本读取失败: %s", e)
            return []
