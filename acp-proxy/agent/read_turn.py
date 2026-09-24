# -*- coding: utf-8 -*-
"""kilocode supplement3 #4 readTurn快照diff + #6 toolSummary工具动作轮廓。

调研来源：kilocode-source-supplement3.md
- #4（kilo-memory ports.ts 334行）："readTurn提取user文本+assistant输出+**快照diff**
  （本轮改动了哪些文件进记忆）+recent 8轮trace | 差距：hippo缺diff输入——
  '记忆看得到文件diff'=能记住'改了什么'而非只'说了什么'"
- #6（MemoryRedact）："工具摘要只留command/file/pattern/query+exit code+
  error brief(220字符)"——记忆不需要全output，需要动作轮廓（源码亮点：
  `Tool bash completed | command=... | exit=0` 一行式）。

此前状态：MemoryDigestCollector的digest载荷只有
`用户: user_text[:200]\\n助手: full_response[:200]`——纯对话文本。本轮工具改了
哪些文件、执行了什么动作，记忆里完全没有（hippo"缺diff输入"缺口）。

本模块 = readTurn的"工具动作轮廓+文件快照diff"采集端：
1. TurnReadView：per-session收集两类记忆输入——
   - toolSummary（#6）：每次工具调用一行轮廓，**只留** command/file/path/
     pattern/query/url 参数 + exit code + error brief(220字符)。工具全量参数
     （可能含大段代码/文件内容）绝不进记忆（MemoryRedact精神）。
   - 快照diff（#4）：write_file/patch等文件变更按路径聚合，行级diff统计
     （difflib opcodes：+新增/-删除行数）——"改了什么"进记忆。
2. 显式截断铁律（AIHawk SHOWN/SENT）：工具行/文件条目超上限时**显式标注**
   "…(另有N条未列出)"，绝不静默丢弃。
3. 记忆入口卫生：record_* / render / clear 全部 fail-safe 不抛出——
   采集端故障绝不反噬宿主会话流（kilocode turn.ts订阅器纪律同款）。
"""

from __future__ import annotations

import difflib
import logging

logger = logging.getLogger("acp.read_turn")

# kilocode MemoryRedact toolSummary白名单："只留command/file/pattern/query"
# （url为web_extract同族动作参数，一并保留；其余参数——代码/文件内容/整段
# prompt——绝不进记忆）
SUMMARY_ARG_KEYS = ("command", "file", "path", "pattern", "query", "url")

# kilocode："error brief(220字符)"
ARG_VALUE_MAX = 220
ERROR_BRIEF_MAX = 220

# 显式截断上限（超限必须标注，禁静默丢弃——AIHawk铁律）
TOOL_LINE_CAP = 20
FILE_CAP = 20
# 快照diff只读此大小以内的旧文件内容（超大文件不算行diff，显式标注）
DIFF_MAX_BYTES = 500_000

# kilocode #4第4输入源：recent 8轮trace（ports.ts trace(messages, 8)）
RECENT_TRACE_MAX = 8
# 近期对话每条brief上限（kilocode hidden()=MemoryShared.brief(220)同源上限；
# kilocode trace()的body不截断，本侧digest载荷有界化——超限显式"…"标注，
# 见render_trace docstring"有意偏离"声明）
TRACE_BRIEF_MAX = 220


def summarize_args(name: str, args: dict | None) -> str:
    """kilocode toolSummary参数轮廓：白名单键 + 值截断220字符。"""
    parts = []
    for key in SUMMARY_ARG_KEYS:
        if not isinstance(args, dict) or key not in args:
            continue
        value = str(args.get(key) or "")
        if not value:
            continue
        if len(value) > ARG_VALUE_MAX:
            value = value[:ARG_VALUE_MAX] + "…"
        parts.append(f"{key}={value}")
    return " ".join(parts)


def _error_brief(error: str) -> str:
    text = str(error or "").strip().replace("\n", " ")
    if len(text) > ERROR_BRIEF_MAX:
        text = text[:ERROR_BRIEF_MAX] + "…"
    return text


# 工具结果失败形态（各工具分支统一用「错误:/失败:/[被拦截/超时」等前缀报错）
_FAIL_MARKERS = ("错误", "失败", "[被拦截", "超时", "异常", "⚠️", "❌")


def result_ok(result) -> bool:
    """工具结果成败启发式：只看开头60字符（错误都是结果前缀报出的——
    正文里出现'错误'二字不算失败）。与ToolAuditor的success判定同族。"""
    text = str(result or "").lstrip()[:60]
    return not any(m in text for m in _FAIL_MARKERS)


def diff_line_stats(old_text: str | None, new_text: str | None) -> tuple[int, int] | None:
    """行级diff统计（kilocode readTurn快照diff）：(added, removed)。

    old_text=None = 旧内容不可得（超大文件等）→ 返回None=增量未知（调用方
    必须显式标注，不得假装0改动）。
    """
    if old_text is None or new_text is None:
        return None
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    added = removed = 0
    matcher = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag in ("replace", "delete"):
            removed += i2 - i1
        if tag in ("replace", "insert"):
            added += j2 - j1
    return added, removed


def _trace_body(content) -> str:
    """提取消息正文（str / OpenAI parts列表 / 兼容text键dict）；其余形态返回空串。"""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and p.get("text"):
                parts.append(str(p["text"]))
        return "\n".join(parts).strip()
    return ""


def render_trace(entries, max_entries: int = RECENT_TRACE_MAX) -> str:
    """kilocode #4第4输入源：recent 8轮trace（ports.ts trace(messages, 8)逐行移植）。

    移植语义（与ports.ts trace/text逐条对应）：
    - user条目 → `User: {body}`；assistant条目 → `Assistant: {body}`
    - assistant带 error / summary 标记的跳过（原文 `item.info.summary === true
      || item.info.error` → return []）
    - synthetic / ignored 条目跳过（原文 text(): `!part.synthetic && !part.ignored`）
    - 只留最后 max_entries 条（原文 `.slice(-max)`），`\\n\\n`拼接（原文 join）

    有意偏离（如实声明）：kilocode trace()的body不截断；本侧digest载荷有界化，
    每条body过 TRACE_BRIEF_MAX(220) brief并显式"…"标注（kilocode hidden()=
    MemoryShared.brief(220)同源上限；AIHawk截断必须显式标记铁律）。

    输入：[(role, body), ...] 或 [{"role", "content"/"text", ...}, ...] 混容；
    全程 fail-safe 绝不抛出（采集端异常不反噬宿主会话流）。
    """
    try:
        lines: list[str] = []
        raw = list(entries or [])
        for item in raw:
            role = body = ""
            flags: dict = {}
            if isinstance(item, dict):
                role = str(item.get("role") or "").strip().lower()
                body = _trace_body(item.get("content", item.get("text")))
                flags = item
            elif isinstance(item, (tuple, list)) and len(item) >= 2:
                role = str(item[0] or "").strip().lower()
                body = _trace_body(item[1])
            else:
                continue  # 未知形态条目跳过（fail-safe）
            if role not in ("user", "assistant") or not body:
                continue
            if flags.get("synthetic") or flags.get("ignored"):
                continue  # kilocode text()：synthetic/ignored part绝不进trace
            if role == "assistant" and (flags.get("error") or flags.get("summary") is True):
                continue  # kilocode trace()：错误/摘要assistant消息跳过
            if len(body) > TRACE_BRIEF_MAX:
                body = body[:TRACE_BRIEF_MAX] + "…"  # 显式截断标注（AIHawk）
            label = "User" if role == "user" else "Assistant"
            lines.append(f"{label}: {body}")
        return "\n\n".join(lines[-int(max_entries):])
    except Exception as e:
        logger.debug(f"[read-turn] render_trace failed (non-fatal): {e}")
        return ""


class TurnReadView:
    """per-turn记忆采集输入视图（kilocode readTurn：工具动作轮廓+文件快照diff）。

    - record_tool()：工具调用一行轮廓（toolSummary规格）
    - record_file_change()：文件变更按路径聚合（同文件多次编辑合并计数）
    - render()：生成digest用的两段文本（无内容时为空串——空段不进记忆）
    - clear()：turn收尾后清空（防跨turn泄漏）
    所有方法 fail-safe：采集端异常只记debug日志，绝不抛出。
    """

    def __init__(
        self,
        max_tool_lines: int = TOOL_LINE_CAP,
        max_files: int = FILE_CAP,
    ):
        self.max_tool_lines = int(max_tool_lines)
        self.max_files = int(max_files)
        self._tools: dict[str, list[str]] = {}
        self._tool_overflow: dict[str, int] = {}
        self._files: dict[str, dict] = {}
        self._file_overflow: dict[str, int] = {}

    # ── 采集 ─────────────────────────────────────────────────────
    def record_tool(
        self,
        session_id: str,
        name: str,
        args: dict | None,
        ok: bool = True,
        error: str = "",
        via: str = "main_loop",
    ) -> None:
        """一次工具调用 = 一行动作轮廓（kilocode：`Tool bash completed |
        command=... | exit=0`）。"""
        try:
            sid = str(session_id)
            kv = summarize_args(str(name), args)
            status = "completed" if ok else "failed"
            line = f"Tool {name} {status}"
            if kv:
                line += f" | {kv}"
            line += f" | exit={0 if ok else 1}"
            if via != "main_loop":
                line += f" | via={via}"
            brief = _error_brief(error)
            if brief and not ok:
                line += f" | error={brief}"
            bucket = self._tools.setdefault(sid, [])
            if len(bucket) < self.max_tool_lines:
                bucket.append(line)
            else:
                self._tool_overflow[sid] = self._tool_overflow.get(sid, 0) + 1
        except Exception as e:  # 采集端绝不反噬宿主会话流
            logger.debug(f"[read-turn] record_tool failed (non-fatal): {e}")

    def record_file_change(
        self,
        session_id: str,
        path: str,
        action: str,
        old_text: str | None,
        new_text: str | None,
    ) -> None:
        """文件变更进快照diff（kilocode #4：'本轮改动了哪些文件进记忆'）。

        old_text=None（旧内容不可得）→ 该次编辑增量未知，条目显式标注。
        """
        try:
            sid = str(session_id)
            key = str(path or "(unknown)")
            stats = diff_line_stats(old_text, new_text)
            entry = self._files.setdefault(sid, {}).get(key)
            if entry is None:
                if len(self._files[sid]) >= self.max_files:
                    self._file_overflow[sid] = self._file_overflow.get(sid, 0) + 1
                    return
                entry = {
                    "edits": 0, "added": 0, "removed": 0,
                    "actions": [], "unknown_delta": 0,
                    "created": bool(old_text == "" and new_text is not None),
                }
                self._files[sid][key] = entry
            entry["edits"] += 1
            if action not in entry["actions"]:
                entry["actions"].append(str(action))
            if stats is None:
                entry["unknown_delta"] += 1
            else:
                entry["added"] += stats[0]
                entry["removed"] += stats[1]
            if old_text == "" and new_text is not None:
                entry["created"] = True
        except Exception as e:
            logger.debug(f"[read-turn] record_file_change failed (non-fatal): {e}")

    # ── 输出 ─────────────────────────────────────────────────────
    def render(self, session_id: str) -> dict:
        """生成digest输入两段文本：{file_changes, tool_actions}（空=不进记忆）。"""
        try:
            sid = str(session_id)
            fc_lines = []
            for path, entry in self._files.get(sid, {}).items():
                actions = "/".join(entry.get("actions") or ["change"])
                seg = f"- {path}: {actions} x{entry.get('edits', 1)}"
                if entry.get("created"):
                    seg = f"- {path}: 新建({actions}) x{entry.get('edits', 1)}"
                delta = f" +{entry.get('added', 0)}/-{entry.get('removed', 0)}行"
                seg += delta
                if entry.get("unknown_delta"):
                    seg += f"（{entry['unknown_delta']}次改动增量未知）"
                fc_lines.append(seg)
            overflow_files = self._file_overflow.get(sid, 0)
            if overflow_files:
                # 显式截断标注（AIHawk：绝不静默丢弃）
                fc_lines.append(f"…(另有{overflow_files}个文件改动未列出)")

            ta_lines = list(self._tools.get(sid, []))
            tool_overflow = self._tool_overflow.get(sid, 0)
            if tool_overflow:
                ta_lines.append(f"…(另有{tool_overflow}条工具调用未列出)")

            return {
                "file_changes": "\n".join(fc_lines),
                "tool_actions": "\n".join(ta_lines),
            }
        except Exception as e:
            logger.debug(f"[read-turn] render failed (non-fatal): {e}")
            return {"file_changes": "", "tool_actions": ""}

    def clear(self, session_id: str) -> None:
        try:
            sid = str(session_id)
            self._tools.pop(sid, None)
            self._tool_overflow.pop(sid, None)
            self._files.pop(sid, None)
            self._file_overflow.pop(sid, None)
        except Exception as e:
            logger.debug(f"[read-turn] clear failed (non-fatal): {e}")
