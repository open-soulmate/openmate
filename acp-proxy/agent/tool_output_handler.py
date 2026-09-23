"""工具结果溢出处理 — goose large_response_handler + deepagents双策略 + AIHawk显式标记

解决P0-2差距：工具输出超限时直接塞入上下文导致context window溢出。
多方参照：
- goose large_response_handler.rs（~80行）：超阈值→落盘→stub引用
- deepagents双策略：proactive超阈值即外置 + reactive溢出裁尾 + stub教模型分段读回
- AIHawk SHOWN/SENT双预算：截断必须显式标记，不能静默丢数据
- kilocode Truncate服务：2000行/50KB双限→落盘+preview+分级提示
"""

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

from agent import retention

logger = logging.getLogger("acp-agent.tool-output")

# 默认阈值：字符数和行数双限（kilocode模式）
DEFAULT_CHAR_THRESHOLD = 50_000
DEFAULT_LINE_THRESHOLD = 2_000
# stub中保留的预览字符数
DEFAULT_PREVIEW_CHARS = 1_500


@dataclass
class SpillResult:
    """溢出处理结果"""
    processed_text: str          # 要放入context的文本（原始或stub）
    spilled: bool                # 是否发生了溢出外置
    spill_path: str = ""         # 落盘文件路径（未溢出时为空）
    original_size: int = 0       # 原始输出字符数
    shown_size: int = 0          # 实际展示给模型的字符数
    spill_id: str = ""           # 唯一标识（用于检索）
    removed_lines: int = 0       # kilocode #3方向感知：被截断省略的行数（显式报告）
    removed_bytes: int = 0       # kilocode #3方向感知：被截断省略的字节数（显式报告）


class ToolOutputHandler:
    """工具结果溢出处理器

    双策略（deepagents模式）：
    - proactive: 工具返回结果超阈值 → 立即外置到磁盘 + 返回stub
    - reactive: 上下文构建时发现超长tool message → 裁尾+stub

    stub设计目标：模型看到stub后知道
    1. 数据在哪里（文件路径）
    2. 数据有多大（字符数/行数）
    3. 如何读回（read_file_segment工具，支持offset/limit）
    4. 预览头部和尾部（快速判断是否需要读全文）
    """

    def __init__(
        self,
        spill_dir: str = "",
        char_threshold: int = DEFAULT_CHAR_THRESHOLD,
        line_threshold: int = DEFAULT_LINE_THRESHOLD,
        preview_chars: int = DEFAULT_PREVIEW_CHARS,
        retention_days: float = retention.DEFAULT_RETENTION_DAYS,
        cleanup_interval: float = retention.DEFAULT_SWEEP_INTERVAL,
    ):
        if not spill_dir:
            spill_dir = str(Path.home() / ".hermes" / "soulmate" / "tool_spills")
        self.spill_dir = Path(spill_dir)
        self.spill_dir.mkdir(parents=True, exist_ok=True)
        self.char_threshold = char_threshold
        self.line_threshold = line_threshold
        self.preview_chars = preview_chars
        # kilocode #2保留策略：7天retention + 每小时cleanup（按mtime，ID回绕坑见retention.py）
        self.retention_days = retention_days
        self.cleanup_interval = cleanup_interval
        # AIHawk SHOWN/SENT双预算账本（JSONL）：agent子进程写、app.py读，跨进程可读。
        # "截断必须显式标记，不能静默丢数据"——每次工具结果处理（含未溢出）都记账。
        self.ledger_path = self.spill_dir / "spill_ledger.jsonl"

    def maybe_cleanup(self):
        """kilocode #2保留策略清扫入口：7天retention，每小时最多一次（进程内节流）。

        清扫对象：spill_dir下*.txt溢出文件（按mtime）+ spill_ledger.jsonl账本（按记录ts轮转）。
        失败仅日志绝不反噬工具流程。返回清扫结果dict或None（节流跳过）。
        """
        def _sweep():
            spills = retention.sweep_mtime(
                self.spill_dir, max_age_days=self.retention_days, patterns=("*.txt",))
            ledger = retention.compact_jsonl(
                self.ledger_path, max_age_days=self.retention_days)
            return {"spills": spills, "ledger": ledger}

        return retention.maybe_sweep(
            f"tool-spill:{self.spill_dir}", _sweep, interval_s=self.cleanup_interval)

    def _record(
        self,
        tool_name: str,
        tool_call_id: str,
        original_size: int,
        shown_size: int,
        spilled: bool,
        spill_id: str = "",
    ) -> None:
        """AIHawk双预算记账：SENT=原始字符数，SHOWN=实际进入context的字符数。失败不影响主流程。"""
        try:
            record = {
                "ts": time.time(),
                "tool_name": tool_name,
                "tool_call_id": tool_call_id,
                "sent_chars": original_size,
                "shown_chars": shown_size,
                "spilled": 1 if spilled else 0,
                "spill_id": spill_id,
            }
            with open(self.ledger_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.debug(f"spill ledger record failed (non-fatal): {e}")

    def _should_spill(self, text: str) -> bool:
        """判断是否需要溢出外置 — 双限（kilocode模式）"""
        if len(text) > self.char_threshold:
            return True
        line_count = text.count("\n") + 1
        if line_count > self.line_threshold:
            return True
        return False

    def _spill_reason(self, text: str) -> str:
        """触发原因（kilocode #3方向感知的'双单位择一'依据）：
        行数超限→"lines"（removed按行数报告）；字符/字节超限→"bytes"（removed按字节数报告）。"""
        if text.count("\n") + 1 > self.line_threshold:
            return "lines"
        return "bytes"

    def _spill_to_file(self, tool_name: str, text: str) -> tuple[str, str]:
        """将完整工具输出写入磁盘

        Returns:
            (file_path, spill_id)
        """
        timestamp = int(time.time() * 1000)
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
        spill_id = f"{tool_name}_{timestamp}_{content_hash}"
        file_path = self.spill_dir / f"{spill_id}.txt"

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(text)
            # 权限保护：仅owner可读（goose unix permission模式）
            try:
                os.chmod(file_path, 0o600)
            except OSError:
                pass
            return str(file_path), spill_id
        except Exception as e:
            logger.warning(f"Failed to spill tool output to file: {e}")
            return "", ""

    # ── kilocode #1按agent能力分级提示：工具面判定集合 ──
    _DELEGATE_TOOL_NAMES = ("task", "delegate", "spawn_agent", "dispatch_agent", "explore")
    _SEARCH_TOOL_NAMES = ("search_files", "grep", "search", "search_chat_history")

    def _readback_hint(self, spill_path: str, tool_names) -> list:
        """kilocode #1能力分级提示（truncate.ts"按agent能力分级提示"忠实泛化）：
        - 有task/派发类工具→"派子agent处理该文件，别自己整读"（kilocode原文语义）
        - 有search类工具→"先定位关键片段再按需分段读"
        - 否则→"用read_file_segment分段读取"（默认档，保持既有文案）
        """
        names = set(tool_names or ())
        if any(d in names for d in self._DELEGATE_TOOL_NAMES):
            return [
                "输出过大：建议派子agent（task/explore类工具）处理该文件，不要自己整读。",
                "如确需自己读，用 read_file_segment 工具分段读取:",
                f"  read_file_segment(path='{spill_path}', start_line=1, end_line=200)",
                f"  之后按需递增 start_line 继续读取后续段落。",
            ]
        if any(s in names for s in self._SEARCH_TOOL_NAMES):
            return [
                "输出过大：先用 search_files 定位关键片段（用pattern/command缩小范围），不要整读。",
                "再用 read_file_segment 工具按行范围读取需要的段落:",
                f"  read_file_segment(path='{spill_path}', start_line=1, end_line=200)",
                f"  之后按需递增 start_line 继续读取后续段落。",
            ]
        return [
            f"如需查看完整内容，请使用 read_file_segment 工具分段读取:",
            f"  read_file_segment(path='{spill_path}', start_line=1, end_line=200)",
            f"  之后按需递增 start_line 继续读取后续段落。",
        ]

    @staticmethod
    def _removed_marker(removed_lines: int, removed_bytes: int, reason: str) -> str:
        """kilocode #3方向感知：removed显式报告，'...347 lines truncated...'双单位择一——
        行数触发的截断按行数报告、字节触发的按字节数报告（不静默、不模糊）。"""
        if reason == "lines":
            return f"... [{removed_lines} 行已截断] ..."
        return f"... [{removed_bytes} 字节已截断] ..."

    def _build_stub(
        self,
        tool_name: str,
        original_size: int,
        line_count: int,
        spill_path: str,
        spill_id: str,
        head_text: str,
        tail_text: str,
        removed_lines: int = 0,
        removed_bytes: int = 0,
        reason: str = "bytes",
        tool_names=None,
    ) -> str:
        """构建溢出stub — 教模型数据在哪、多大、如何读回

        设计原则（AIHawk显式标记 + deepagents分段读回指引 + kilocode #1分级提示/#3方向感知）：
        1. 明确标注[TRUNCATED]，不静默
        2. 给出完整数据的位置和大小
        3. 告诉模型如何分段读回（按能力分级：派子agent > search定位 > 分段读取）
        4. 提供head+tail预览供快速判断（方向显式标注开头/结尾）
        5. removed行数/字节数显式报告（双单位择一，kilocode #3）
        """
        parts = [
            f"[TRUNCATED — 工具输出过大已外置]",
            f"工具 {tool_name} 返回了 {original_size} 字符（{line_count} 行），"
            f"超过处理阈值（{self.char_threshold}字符/{self.line_threshold}行）。",
            f"",
            f"完整输出已保存到: {spill_path}",
            f"Spill ID: {spill_id}",
            f"",
        ]
        parts += self._readback_hint(spill_path, tool_names)
        parts += [
            f"",
            f"=== 预览（开头/head，前 {min(len(head_text), self.preview_chars // 2)} 字符）===",
            head_text,
            self._removed_marker(removed_lines, removed_bytes, reason),
            f"=== 预览（结尾/tail，后 {min(len(tail_text), self.preview_chars // 2)} 字符）===",
            tail_text,
            f"[END PREVIEW — 完整内容见 {spill_path}]",
        ]
        return "\n".join(parts)

    def process(
        self,
        tool_name: str,
        tool_call_id: str,
        result: str,
        tool_names=None,
    ) -> SpillResult:
        """处理单个工具结果 — proactive溢出检测

        Args:
            tool_name: 工具名称
            tool_call_id: 工具调用ID（用于日志追踪）
            result: 工具返回的原始文本
            tool_names: 当前agent可用工具名集合（kilocode #1能力分级提示依据；None→默认档）

        Returns:
            SpillResult，processed_text字段即要放入context的内容
        """
        # kilocode #2保留策略：每次处理顺带触发（每小时最多一次）7天retention清扫
        try:
            self.maybe_cleanup()
        except Exception as _cleanup_err:
            logger.debug(f"retention cleanup skipped (non-fatal): {_cleanup_err}")
        original_size = len(result)
        line_count = result.count("\n") + 1

        if not self._should_spill(result):
            self._record(tool_name, tool_call_id, original_size, original_size, False)
            return SpillResult(
                processed_text=result,
                spilled=False,
                original_size=original_size,
                shown_size=original_size,
            )

        # 溢出：落盘 + 构建stub
        spill_path, spill_id = self._spill_to_file(tool_name, result)
        # kilocode #3方向感知：removed行数/字节数显式计算（head/tail预览之外的中段）
        half = self.preview_chars // 2
        head_text = result[:half]
        tail_text = result[-half:] if original_size > half else ""
        middle = result[half: original_size - half] if original_size > 2 * half else ""
        removed_bytes = len(middle.encode("utf-8"))
        removed_lines = middle.count("\n") + (1 if middle and not middle.endswith("\n") else 0)
        reason = self._spill_reason(result)

        if not spill_path:
            # 落盘失败 → 降级截断（goose降级模式：原文+warning），removed同样显式报告不静默
            removed_marker = self._removed_marker(removed_lines, removed_bytes, reason)
            degraded = (
                f"[Warning: 工具输出过大({original_size}字符/{line_count}行)且落盘失败，已截断显示]\n"
                f"{head_text}\n"
                f"{removed_marker} [数据未保存]\n"
                f"{tail_text}"
            )
            logger.warning(f"[{tool_call_id}] Spill failed for {tool_name}, degraded truncation")
            self._record(tool_name, tool_call_id, original_size, len(degraded), True)
            return SpillResult(
                processed_text=degraded,
                spilled=True,
                original_size=original_size,
                shown_size=len(degraded),
                removed_lines=removed_lines,
                removed_bytes=removed_bytes,
            )

        stub = self._build_stub(
            tool_name=tool_name,
            original_size=original_size,
            line_count=line_count,
            spill_path=spill_path,
            spill_id=spill_id,
            head_text=head_text,
            tail_text=tail_text,
            removed_lines=removed_lines,
            removed_bytes=removed_bytes,
            reason=reason,
            tool_names=tool_names,
        )

        logger.info(
            f"[{tool_call_id}] Tool output spilled: {tool_name} "
            f"({original_size} chars → {len(stub)} char stub, path={spill_path})"
        )
        self._record(tool_name, tool_call_id, original_size, len(stub), True, spill_id)

        return SpillResult(
            processed_text=stub,
            spilled=True,
            spill_path=spill_path,
            original_size=original_size,
            shown_size=len(stub),
            spill_id=spill_id,
            removed_lines=removed_lines,
            removed_bytes=removed_bytes,
        )

    def read_segment(
        self,
        spill_path: str,
        start_line: int = 1,
        end_line: int = 200,
    ) -> str:
        """分段读回溢出文件 — 配合stub中教给模型的读回方式

        deepagents模式：stub教模型用offset/limit分段读回。
        此方法实现读取逻辑。

        Args:
            spill_path: 溢出文件路径
            start_line: 起始行（1-indexed）
            end_line: 结束行（inclusive）

        Returns:
            指定行范围的内容，或错误信息
        """
        path = Path(spill_path)
        if not path.exists():
            return f"错误：溢出文件不存在 — {spill_path}"

        # 安全验证：必须在spill_dir内（防路径穿越）
        try:
            real_path = path.resolve()
            real_spill_dir = self.spill_dir.resolve()
            if not str(real_path).startswith(str(real_spill_dir)):
                return f"错误：路径安全验证失败 — 文件不在溢出存储目录内"
        except Exception as e:
            return f"错误：路径解析失败 — {e}"

        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception as e:
            return f"错误：读取溢出文件失败 — {e}"

        total_lines = len(lines)
        start_idx = max(0, start_line - 1)
        end_idx = min(total_lines, end_line)

        if start_idx >= total_lines:
            return f"错误：起始行 {start_line} 超出文件总行数 {total_lines}"

        segment = "".join(lines[start_idx:end_idx])
        remaining = total_lines - end_idx

        header = (
            f"[溢出文件分段读取: 行 {start_line}-{end_idx} / 共 {total_lines} 行]\n"
        )
        if remaining > 0:
            header += (
                f"[还有 {remaining} 行未读取，"
                f"下次调用: read_file_segment(path='{spill_path}', "
                f"start_line={end_idx + 1}, end_line={min(end_idx + 200, total_lines)})]\n"
            )
        else:
            header += "[已到达文件末尾]\n"

        return header + segment

    def get_stats(self) -> dict:
        """获取溢出统计 — 文件系统事实 + AIHawk SHOWN/SENT双预算账本聚合（跨进程可读）"""
        spill_files = list(self.spill_dir.glob("*.txt"))
        total_size = sum(f.stat().st_size for f in spill_files if f.exists())
        stats = {
            "spill_dir": str(self.spill_dir),
            "total_spills": len(spill_files),
            "total_size_bytes": total_size,
            "char_threshold": self.char_threshold,
            "line_threshold": self.line_threshold,
            # ── kilocode #2保留策略可观测（用户极度重视可观测性）──
            "retention_days": self.retention_days,
            "cleanup_interval_s": self.cleanup_interval,
            # ── AIHawk SHOWN/SENT双预算账本聚合 ──
            "total_calls": 0,
            "truncated_calls": 0,
            "sent_chars_total": 0,
            "shown_chars_total": 0,
            "by_tool": {},
            "recent_spills": [],
            "ledger_path": str(self.ledger_path),
        }
        try:
            if self.ledger_path.exists():
                with open(self.ledger_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()[-5000:]  # 防账本无限增长拖垮读取
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    stats["total_calls"] += 1
                    sent = int(rec.get("sent_chars", 0))
                    shown = int(rec.get("shown_chars", 0))
                    stats["sent_chars_total"] += sent
                    stats["shown_chars_total"] += shown
                    bt = stats["by_tool"].setdefault(
                        rec.get("tool_name", "unknown"),
                        {"calls": 0, "truncated": 0, "sent_chars": 0, "shown_chars": 0},
                    )
                    bt["calls"] += 1
                    bt["sent_chars"] += sent
                    bt["shown_chars"] += shown
                    if rec.get("spilled"):
                        stats["truncated_calls"] += 1
                        bt["truncated"] += 1
                        stats["recent_spills"].append({
                            "tool_name": rec.get("tool_name", ""),
                            "original_size": sent,
                            "shown_size": shown,
                            "spill_id": rec.get("spill_id", ""),
                            "ts": rec.get("ts", 0),
                        })
                stats["recent_spills"] = stats["recent_spills"][-10:]
        except Exception as e:
            stats["ledger_error"] = str(e)
        return stats
