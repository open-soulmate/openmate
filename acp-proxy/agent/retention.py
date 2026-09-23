"""统一retention清扫 — kilocode truncate.ts cleanup移植（7天retention + 每小时节流）

调研来源：kilocode-source-supplement3.md #2「Truncate保留策略：7天retention+每小时cleanup扫mtime
（编码ID会回绕所以不看ID看mtime——注释即坑教材）」。
适用对象（本轮统一接线）：
- tool_spills/*.txt 工具溢出落盘文件（ToolOutputHandler）
- tool_spills/spill_ledger.jsonl AIHawk SHOWN/SENT双预算账本（ToolOutputHandler）
- data/permission_provenance.jsonl 权限provenance账本（PermissionProvenanceRecorder，上轮遗留
  "provenance账本retention轮转（kilocode #2同款7天mtime）"销账）
- ~/.hermes/soulmate/token_attribution/attribution_ledger.jsonl token归因账本
  （AttributionLedger，上轮遗留#4"token_attribution账本未接retention轮转"销账）

设计原则：
1. 文件新旧一律按mtime判定，绝不按文件名/ID判定（kilocode注释坑：时间有序编码ID会回绕）
2. JSONL账本轮转只删除"可证明超龄"的记录（ts可解析且早于cutoff）；坏行/ts缺失一律保留
   ——保守retention，不静默丢数据（mem0 §1.1失败必须可见，AIHawk截断必须显式标记同源）
3. 清扫失败仅WARNING日志、绝不反噬主流程（观测层/清理层不阻塞执行层）
4. 每小时最多清扫一次（进程内节流；多实例/多进程并发清扫安全——删除幂等，compact用原子替换）
"""

import json
import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger("acp-agent.retention")

# kilocode默认：7天retention
DEFAULT_RETENTION_DAYS = 7.0
# kilocode默认：每小时cleanup一次
DEFAULT_SWEEP_INTERVAL = 3600.0

# 进程内节流表：key → 上次清扫时间戳
_last_sweep: dict = {}
_sweep_lock = threading.Lock()


def epoch_from_ts(value) -> Optional[float]:
    """把账本记录的ts字段解析为epoch秒。解析不了返回None（调用方必须保留该记录）。

    兼容三种形态：
    - 浮点/整数epoch秒（spill_ledger.jsonl的ts=time.time()）
    - ISO 8601带时区（permission_provenance.jsonl的ts=strftime %Y-%m-%dT%H:%M:%S%z，如2026-09-23T12:30:00+0800）
    - ISO 8601不带时区（历史/手写记录，按本地时间解析）
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    try:
        return float(s)
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).timestamp()
        except ValueError:
            continue
    return None


def sweep_mtime(
    directory,
    max_age_days: float = DEFAULT_RETENTION_DAYS,
    patterns: tuple = ("*.txt",),
    now: Optional[float] = None,
    dry_run: bool = False,
) -> dict:
    """按mtime清扫超龄文件（kilocode #2：不看ID只看mtime——编码ID会回绕）。

    Args:
        directory: 要清扫的目录（不存在→直接返回零结果）
        max_age_days: 保留天数（mtime早于now-该窗口的文件删除）
        patterns: 只清扫匹配的glob模式（默认*.txt=溢出文件，账本不在此列）
        now: 注入时间（测试用）
        dry_run: 只统计不删除

    Returns:
        {"removed_files", "removed_bytes", "kept", "errors", "dry_run"}
    """
    result = {"removed_files": 0, "removed_bytes": 0, "kept": 0, "errors": 0, "dry_run": bool(dry_run)}
    try:
        d = Path(directory)
        if not d.is_dir():
            return result
        cutoff = (now if now is not None else time.time()) - float(max_age_days) * 86400.0
        for pattern in patterns:
            for f in d.glob(pattern):
                try:
                    if not f.is_file():
                        continue
                    # ★ kilocode注释坑教材：新旧按mtime判定，绝不能按文件名里的编码ID判定（ID会回绕）
                    if f.stat().st_mtime < cutoff:
                        size = f.stat().st_size
                        if not dry_run:
                            f.unlink()
                        result["removed_files"] += 1
                        result["removed_bytes"] += size
                    else:
                        result["kept"] += 1
                except OSError as e:
                    result["errors"] += 1
                    logger.warning("[retention] 清扫文件失败（跳过，不影响其余）: %s (%s)", f, e)
        if result["removed_files"]:
            logger.info(
                "[retention] %s 清扫完成：删除%d个超龄文件（%.1f天窗口），释放%d字节",
                directory, result["removed_files"], float(max_age_days), result["removed_bytes"],
            )
    except Exception as e:
        result["errors"] += 1
        logger.warning("[retention] sweep_mtime失败（主流程照常）: %s", e)
    return result


def compact_jsonl(
    path,
    max_age_days: float = DEFAULT_RETENTION_DAYS,
    ts_key: str = "ts",
    now: Optional[float] = None,
    dry_run: bool = False,
) -> dict:
    """JSONL账本轮转：删除可证明超龄的记录，原子替换（tmp+os.replace）。

    保守retention原则（mem0 §1.1不静默丢数据）：
    - 只删"ts可解析且早于cutoff"的记录
    - 坏行/JSON损坏/ts缺失或无法解析 → 一律保留（无法证明超龄就不删）
    - 文件不存在→零结果；全程异常→返回带error的结果并WARNING，绝不抛出

    Returns:
        {"removed_records", "kept", "compacted", "errors", "error"?, "dry_run"}
    """
    result = {"removed_records": 0, "kept": 0, "compacted": False, "errors": 0, "dry_run": bool(dry_run)}
    try:
        p = Path(path)
        if not p.exists():
            return result
        cutoff = (now if now is not None else time.time()) - float(max_age_days) * 86400.0
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
        kept_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue  # 空行不算记录
            try:
                rec = json.loads(stripped)
            except json.JSONDecodeError:
                kept_lines.append(line)  # 坏行保留（无法证明超龄）
                result["kept"] += 1
                continue
            epoch = epoch_from_ts(rec.get(ts_key)) if isinstance(rec, dict) else None
            if epoch is not None and epoch < cutoff:
                result["removed_records"] += 1  # 可证明超龄→删除
            else:
                kept_lines.append(line)  # 落在窗口内或无法判龄→保留
                result["kept"] += 1
        if result["removed_records"] and not dry_run:
            tmp = p.with_suffix(p.suffix + ".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(kept_lines)
            os.replace(tmp, p)  # 原子替换，并发读方永远看到完整文件
            result["compacted"] = True
            logger.info(
                "[retention] 账本轮转 %s：删除%d条超龄记录（%.1f天窗口），保留%d条",
                p, result["removed_records"], float(max_age_days), result["kept"],
            )
    except Exception as e:
        result["errors"] += 1
        result["error"] = str(e)
        logger.warning("[retention] compact_jsonl失败（主流程照常）: %s", e)
    return result


def maybe_sweep(key: str, fn: Callable, interval_s: float = DEFAULT_SWEEP_INTERVAL,
                now: Optional[float] = None):
    """每小时最多执行一次清扫（kilocode"每小时cleanup"语义的进程内节流实现）。

    - 同key在interval_s内重复调用→直接返回None（节流）
    - 到期→执行fn()并返回其结果；fn异常→WARNING吞掉返回None（清扫绝不反噬主流程）
    - 多进程各自节流各自扫：删除/轮转幂等，安全
    """
    t = now if now is not None else time.time()
    with _sweep_lock:
        last = _last_sweep.get(key, 0.0)
        if (t - last) < float(interval_s):
            return None
        _last_sweep[key] = t
    try:
        return fn()
    except Exception as e:
        logger.warning("[retention] 清扫任务失败（key=%s，主流程照常）: %s", key, e)
        return None
