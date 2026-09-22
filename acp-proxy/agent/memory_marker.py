# -*- coding: utf-8 -*-
"""kilocode 记忆marker留痕——"本回复用了记忆"消息级可审计数据源。

调研来源：kilocode-source-supplement3.md #9（源码级精读，本地clone：
~/agent-research-src/kilocode/packages/opencode/src/kilocode/memory/marker.ts +
packages/kilo-memory/src/marker-meta.ts）：

- recall命中后在assistant消息插**空文本synthetic+ignored part**携带
  metadata(kiloMemory:{type,bytes,tokens,count,files})——synthetic+ignored
  语义=不进LLM上下文，但消息级可审计，UI可显示"本回复用了记忆"badge
- Info={type,bytes,tokens,count,files,items}；items受verbose门控（kilocode
  metadata(marker, verbose)：默认不落内容片段，只落计数与来源id——记忆内容
  不随消息元数据二次扩散）
- LIMIT=5 / CHARS=120：items最多5条、每条按码点截120字符（kilocode
  Array.from(input).slice(0,CHARS)语义，防CJK/emoji代理对切半）
- fromRecall：sources空→不打标记（return undefined）；count默认=去重后
  sources数，显式count优先

本模块是写侧（acp-proxy真实消息路径）：from_recall构造Info →
metadata()/metadata_json()产出kiloMemory元数据 → soulmate_agent._save_message
落agent_messages.metadata列。读侧解码在opensoul
src/api/sessions_api.py _decode_memory_marker（同schema，sources回退兼容）。
"""

import json
import logging

from agent.token_attribution import estimate_tokens

logger = logging.getLogger("acp.memory_marker")

LIMIT = 5  # kilocode marker-meta.ts items上限
CHARS = 120  # 每条item按码点截断

TYPE_RECALL = "recall"
TYPE_STARTUP = "startup"


def _clip(text: str) -> str:
    """按码点截断（kilocode Array.from().slice(0, CHARS)——防surrogate切半）。"""
    return "".join(list(str(text))[:CHARS])


def _list(items) -> list[str]:
    """kilocode list()：去空+截断+上限5条。"""
    return [_clip(i) for i in (items or []) if i][:LIMIT]


def from_recall(sources, texts, count=None, tokens=None) -> dict | None:
    """kilocode MemoryMarkerMeta.fromRecall——召回命中后的marker信息。

    Args:
        sources: 本回合召回的记忆id/来源标识（kilocode metadata.sources→files）
        texts: 实际注入上下文的召回内容（items片段+bytes/tokens统计来源）
        count: 显式计数（优先）；缺省=去重后sources数
        tokens: 显式token数；缺省=CJK感知估算（agent.token_attribution）

    Returns:
        Info dict；sources全空→None（不打标记，kilocode return undefined）。
    """
    files: list[str] = []
    for s in sources or []:
        s = str(s) if s else ""
        if s and s not in files:
            files.append(s)
    if not files:
        return None
    joined = "\n".join(t for t in (texts or []) if t)
    return {
        "type": TYPE_RECALL,
        "bytes": len(joined.encode("utf-8")),
        "tokens": int(tokens) if tokens is not None else estimate_tokens(joined),
        "count": int(count) if count is not None else len(files),
        "files": files,
        "items": _list(texts),
    }


def metadata(marker: dict | None, verbose: bool = False) -> dict:
    """kilocode MemoryMarkerMeta.metadata——kiloMemory元数据dict。

    items仅verbose且type=recall时输出（kilocode原语义：内容片段默认不外泄）。
    """
    if not marker:
        return {}
    km: dict = {
        "type": marker.get("type", TYPE_RECALL),
        "bytes": marker.get("bytes", 0),
        "tokens": marker.get("tokens", 0),
        "count": marker.get("count", 0),
        "files": list(marker.get("files") or []),
    }
    if verbose and marker.get("type") == TYPE_RECALL:
        km["items"] = list(marker.get("items") or [])
    return {"kiloMemory": km}


def metadata_json(marker: dict | None, verbose: bool = False) -> str | None:
    """落盘形态（agent_messages.metadata列）：无marker→None不打标。"""
    if not marker:
        return None
    return json.dumps(metadata(marker, verbose=verbose), ensure_ascii=False)
