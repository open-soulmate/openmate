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
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

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
    ):
        if not spill_dir:
            spill_dir = str(Path.home() / ".hermes" / "soulmate" / "tool_spills")
        self.spill_dir = Path(spill_dir)
        self.spill_dir.mkdir(parents=True, exist_ok=True)
        self.char_threshold = char_threshold
        self.line_threshold = line_threshold
        self.preview_chars = preview_chars
        # AIHawk SHOWN/SENT双预算账本（JSONL）：agent子进程写、app.py读，跨进程可读。
        # "截断必须显式标记，不能静默丢数据"——每次工具结果处理（含未溢出）都记账。
        self.ledger_path = self.spill_dir / "spill_ledger.jsonl"

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

    def _build_stub(
        self,
        tool_name: str,
        original_size: int,
        line_count: int,
        spill_path: str,
        spill_id: str,
        head_text: str,
        tail_text: str,
    ) -> str:
        """构建溢出stub — 教模型数据在哪、多大、如何读回

        设计原则（AIHawk显式标记 + deepagents分段读回指引）：
        1. 明确标注[TRUNCATED]，不静默
        2. 给出完整数据的位置和大小
        3. 告诉模型如何分段读回（read_file_segment）
        4. 提供head+tail预览供快速判断
        """
        parts = [
            f"[TRUNCATED — 工具输出过大已外置]",
            f"工具 {tool_name} 返回了 {original_size} 字符（{line_count} 行），"
            f"超过处理阈值（{self.char_threshold}字符/{self.line_threshold}行）。",
            f"",
            f"完整输出已保存到: {spill_path}",
            f"Spill ID: {spill_id}",
            f"",
            f"如需查看完整内容，请使用 read_file_segment 工具分段读取:",
            f"  read_file_segment(path='{spill_path}', start_line=1, end_line=200)",
            f"  之后按需递增 start_line 继续读取后续段落。",
            f"",
            f"=== 预览（前 {min(len(head_text), self.preview_chars // 2)} 字符）===",
            head_text,
            f"... [{original_size - len(head_text) - len(tail_text)} 字符省略] ...",
            f"=== 预览（后 {min(len(tail_text), self.preview_chars // 2)} 字符）===",
            tail_text,
            f"[END PREVIEW — 完整内容见 {spill_path}]",
        ]
        return "\n".join(parts)

    def process(
        self,
        tool_name: str,
        tool_call_id: str,
        result: str,
    ) -> SpillResult:
        """处理单个工具结果 — proactive溢出检测

        Args:
            tool_name: 工具名称
            tool_call_id: 工具调用ID（用于日志追踪）
            result: 工具返回的原始文本

        Returns:
            SpillResult，processed_text字段即要放入context的内容
        """
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

        if not spill_path:
            # 落盘失败 → 降级截断（goose降级模式：原文+warning）
            half = self.preview_chars // 2
            head = result[:half]
            tail = result[-half:] if original_size > half else ""
            degraded = (
                f"[Warning: 工具输出过大({original_size}字符)且落盘失败，已截断显示]\n"
                f"{head}\n"
                f"... [{original_size - len(head) - len(tail)} 字符省略，数据未保存] ...\n"
                f"{tail}"
            )
            logger.warning(f"[{tool_call_id}] Spill failed for {tool_name}, degraded truncation")
            self._record(tool_name, tool_call_id, original_size, len(degraded), True)
            return SpillResult(
                processed_text=degraded,
                spilled=True,
                original_size=original_size,
                shown_size=len(degraded),
            )

        # 构建head+tail预览
        half = self.preview_chars // 2
        head_text = result[:half]
        tail_text = result[-half:] if original_size > half else ""

        stub = self._build_stub(
            tool_name=tool_name,
            original_size=original_size,
            line_count=line_count,
            spill_path=spill_path,
            spill_id=spill_id,
            head_text=head_text,
            tail_text=tail_text,
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
