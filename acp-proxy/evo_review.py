#!/usr/bin/env python3
"""Hermes审核脚本 — 审核evo自动开发的产出（用户指示：evo开发的代码提交给Hermes审核）

流程：
1. 扫描data/hermes_review_queue.json中未审核条目
2. 对每条执行验证：import测试 + 标识符异常检测 + ruff lint + 核心文件加强验证
3. 通过 → push GitHub；不通过 → git revert + 写evo_feedback.json（evo下轮学习）
4. 输出JSON报告（hermes cron收集）
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ACPPROXY_DIR = Path(__file__).parent
OPENMATE_ROOT = ACPPROXY_DIR.parent
QUEUE_FILE = ACPPROXY_DIR / "data" / "hermes_review_queue.json"
FEEDBACK_FILE = ACPPROXY_DIR / "data" / "evo_feedback.json"

# 核心文件清单（与evolution_pipeline.py的KERNEL_FILES对齐）
KERNEL_FILES = [
    "acp-proxy/app.py",
    "acp-proxy/main.py",
    "acp-proxy/dna_evolution.py",
    "acp-proxy/ws_acp.py",
    "acp-proxy/ws_chat.py",
    "acp-proxy/agent/soulmate_agent.py",
    "acp-proxy/agent/llm_engine.py",
    "acp-proxy/gateway_proxy.py",
    "acp-proxy/supervisor.sh",
]

# 标识符异常模式（历史事故特征）
SUSPICIOUS_PATTERNS = [
    (re.compile(r"\b[A-Za-z_]{45,}\b"), "超长标识符(>45字符)——疑似拼接残片"),
    (re.compile(r"\bimport\s+[A-Z]\b"), "截断import（如import P）"),
    (re.compile(r"__DEBUG_VALIDATION__\s*="), "历史事故模式：__DEBUG_VALIDATION__伪代码"),
]


def log(msg: str):
    print(f"[hermes-review] {msg}", flush=True)


def load_queue() -> list[dict]:
    if not QUEUE_FILE.exists():
        return []
    try:
        return json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_queue(entries: list[dict]):
    QUEUE_FILE.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def append_feedback(entry: dict, verdict: str, reason: str, issues: list[str]):
    items = []
    if FEEDBACK_FILE.exists():
        try:
            items = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            items = []
    items.append({
        "round_id": entry["round_id"],
        "verdict": verdict,
        "reason": reason,
        "issues": issues[:10],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    })
    # 只保留最近50条反馈
    items = items[-50:]
    FEEDBACK_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def run_cmd(cmd: list[str], cwd: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd, check=False)


def review_entry(entry: dict) -> tuple[bool, str, list[str]]:
    """审核单个evo产出条目。返回(通过, 原因, issues列表)"""
    issues: list[str] = []
    files = entry.get("files", [])
    has_core = entry.get("has_core_file", False)

    if not files:
        return False, "队列条目无文件列表", ["empty_files"]

    # ── ① import测试：改动的python文件逐个真实import ──
    # evo的target_file格式是repo相对路径（如acp-proxy/agent/soulmate_agent.py），
    # acp-proxy不是合法python包名（含连字符），import时去掉acp-proxy/前缀，cwd=ACPPROXY_DIR
    for f in files:
        if not f.endswith(".py"):
            continue
        rel = f[len("acp-proxy/"):] if f.startswith("acp-proxy/") else f
        # 文件真实位置校验
        full = ACPPROXY_DIR / rel
        if not full.exists():
            full = OPENMATE_ROOT / f
        if not full.exists():
            issues.append(f"file_not_found:{f}")
            continue
        module_path = rel.replace("/", ".").replace(".py", "")
        try:
            result = run_cmd(["python3", "-c", f"import {module_path}"], str(ACPPROXY_DIR), timeout=15)
            if result.returncode != 0:
                is_core = any(f.endswith(k.split("/")[-1]) or k.endswith(f) for k in KERNEL_FILES)
                err = result.stderr[:200].replace("\n", " ")
                if is_core:
                    return False, f"核心文件import失败：{f}: {err}", [f"core_import_failed:{f}:{err}"]
                issues.append(f"import_failed:{f}:{err}")
        except subprocess.TimeoutExpired:
            issues.append(f"import_timeout:{f}")
        except Exception as e:
            issues.append(f"import_error:{f}:{e}")

    # ── ② 标识符异常检测：扫描改动文件当前内容 ──
    for f in files:
        full = ACPPROXY_DIR / f if f.startswith("acp-proxy/") else OPENMATE_ROOT / f
        # KERNEL_FILES带acp-proxy/前缀，evo的target_file可能是相对acp-proxy的路径
        if not full.exists():
            full = ACPPROXY_DIR / f
        if not full.exists():
            continue
        try:
            content = full.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for pattern, desc in SUSPICIOUS_PATTERNS:
            matches = pattern.findall(content)
            if matches:
                is_core = any(f.endswith(k.split("/")[-1]) or k.endswith(f) for k in KERNEL_FILES)
                sample = str(matches[0])[:60]
                if is_core:
                    return False, f"核心文件含异常模式({desc}): {sample}", [f"suspicious:{f}:{desc}:{sample}"]
                issues.append(f"suspicious:{f}:{desc}:{sample}")

    # ── ③ ruff lint（可用时） ──
    py_files = [f for f in files if f.endswith(".py")]
    if py_files:
        resolved = []
        for f in py_files:
            p = ACPPROXY_DIR / f
            if not p.exists():
                p = OPENMATE_ROOT / f
            if p.exists():
                resolved.append(str(p))
        if resolved:
            try:
                result = run_cmd([sys.executable, "-m", "ruff", "check", "--no-cache", *resolved], str(OPENMATE_ROOT), timeout=30)
                if result.returncode != 0:
                    lint_out = result.stdout[:400].replace("\n", "; ")
                    issues.append(f"ruff:{lint_out}")
            except Exception:
                pass  # ruff不可用不阻塞审核

    # ── ④ 判定 ──
    # import失败/异常模式/核心文件问题已在上面return False
    # issues里的非致命项（ruff警告、非核心import失败）：数量少可通过，多则驳回
    fatal_prefixes = ("import_failed:", "import_timeout:", "import_error:", "suspicious:", "core_")
    fatal_issues = [i for i in issues if i.startswith(fatal_prefixes)]
    if fatal_issues:
        return False, f"发现{len(fatal_issues)}个致命问题", issues
    if len(issues) > 5:
        return False, f"非致命问题过多({len(issues)}个)——代码质量不达标", issues

    return True, f"审核通过（{len(files)}个文件, {'含核心文件' if has_core else '非核心'}, issues={len(issues)}）", issues


def push_github() -> tuple[bool, str]:
    """审核通过后push到GitHub"""
    try:
        result = run_cmd(["git", "push", "origin", "main"], str(OPENMATE_ROOT), timeout=120)
        if result.returncode == 0:
            return True, "push成功"
        return False, f"push失败: {result.stderr[:200]}"
    except subprocess.TimeoutExpired:
        return False, "push超时"


def revert_commit(commit_hash: str) -> tuple[bool, str]:
    """审核不通过：revert evo的commit"""
    if commit_hash == "unknown":
        return False, "commit hash未知，无法revert（需人工处理）"
    try:
        result = run_cmd(["git", "revert", "--no-edit", commit_hash], str(OPENMATE_ROOT), timeout=30)
        if result.returncode == 0:
            return True, f"已revert {commit_hash}"
        # revert可能因冲突失败——此时硬reset到commit前
        return False, f"revert失败: {result.stderr[:200]}"
    except Exception as e:
        return False, f"revert异常: {e}"


def main():
    queue = load_queue()
    pending = [e for e in queue if not e.get("reviewed")]

    if not pending:
        print(json.dumps({"status": "idle", "pending": 0}))
        return

    log(f"发现{len(pending)}个待审核条目")
    report = []

    for entry in pending:
        round_id = entry.get("round_id", "?")
        log(f"审核 {round_id}: files={entry.get('files')}, core={entry.get('has_core_file')}")

        passed, reason, issues = review_entry(entry)

        if passed:
            entry["reviewed"] = True
            entry["review_result"] = {"verdict": "approved", "reason": reason, "issues": issues,
                                       "reviewed_at": datetime.now(timezone.utc).isoformat()}
            push_ok, push_msg = push_github()
            entry["review_result"]["push"] = {"ok": push_ok, "msg": push_msg}
            log(f"✅ {round_id} 通过 — {push_msg}")
            report.append({"round_id": round_id, "verdict": "approved", "push": push_ok})
        else:
            entry["reviewed"] = True
            entry["review_result"] = {"verdict": "rejected", "reason": reason, "issues": issues,
                                       "reviewed_at": datetime.now(timezone.utc).isoformat()}
            revert_ok, revert_msg = revert_commit(entry.get("commit_hash", "unknown"))
            entry["review_result"]["revert"] = {"ok": revert_ok, "msg": revert_msg}
            append_feedback(entry, "rejected", reason, issues)
            log(f"❌ {round_id} 驳回 — {reason} | {revert_msg}")
            report.append({"round_id": round_id, "verdict": "rejected", "reverted": revert_ok, "reason": reason})

    save_queue(queue)
    print(json.dumps({"status": "done", "reviewed": len(pending), "report": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
