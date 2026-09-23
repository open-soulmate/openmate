# -*- coding: utf-8 -*-
"""kilocode #19 MCP resource工具三件套 — agent侧注入安全层。

调研来源：kilocode-source-supplement3.md #19「MCP resource工具三件套（tools.ts）：
list/read resources + 10MB blob上限 + 附件MIME白名单（pdf/gif/jpeg/png/webp才可
作为附件注入）| 差距：OpenSoul MCP SDK三大能力闲置之一」。

逐行移植 ~/agent-research-src/kilocode/packages/opencode/src/session/tools.ts：
- MCP_RESOURCE_TOOLS 三工具命名（list_mcp_resources / list_mcp_resource_templates
  / read_mcp_resource）
- MAX_MCP_RESOURCE_BLOB_BYTES = 10 * 1024 * 1024（10MB blob上限）
- SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES（application/pdf、image/gif、image/jpeg、
  image/png、image/webp——只有这些MIME可以作为附件注入，其余显式省略）
- formatMcpResourceContent：text直进文本；blob双闸（MIME白名单 → 10MB上限）→
  通过者标 `[Binary MCP resource attached: ...]`，被拦者**显式**标注省略原因与
  大小（AIHawk SHOWN/SENT铁律：截断/省略必须显式标记，禁静默丢弃）
- base64Size / formatBytes（Math.ceil语义逐行对齐）
- formatMcpResource / formatMcpResourceTemplate（client→server键改写）

已知有意偏离（docstring如实声明，防后人误读为等价实现）：
- kilocode把通过双闸的blob作为消息FilePart（data URL）注入多模态上下文；本侧
  工具结果通道是纯文本字符串（llm_engine.chat text messages），无法注入FilePart。
  通过双闸的blob改为**落盘为附件文件**并显式标注路径（save_attachment），
  省略语义（白名单/10MB双闸+显式标记）与kilocode完全一致。data URL注入留待
  多模态工具结果通道落地后升级。
"""

import base64
import logging
import os
import re
import time

logger = logging.getLogger("acp.mcp_resources")

# kilocode session/tools.ts MCP_RESOURCE_TOOLS
MCP_RESOURCE_TOOLS = {
    "list": "list_mcp_resources",
    "listTemplates": "list_mcp_resource_templates",
    "read": "read_mcp_resource",
}
MCP_RESOURCE_TOOL_NAMES = (
    MCP_RESOURCE_TOOLS["list"],
    MCP_RESOURCE_TOOLS["listTemplates"],
    MCP_RESOURCE_TOOLS["read"],
)

# kilocode session/tools.ts MAX_MCP_RESOURCE_BLOB_BYTES
MAX_MCP_RESOURCE_BLOB_BYTES = 10 * 1024 * 1024
# kilocode session/tools.ts SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES
SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES = frozenset({
    "application/pdf",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
})


def base64_size(value: str) -> int:
    """kilocode base64Size逐行移植：剥空白→按padding折算解码后字节数。"""
    trimmed = re.sub(r"\s", "", str(value or ""))
    padding = 2 if trimmed.endswith("==") else (1 if trimmed.endswith("=") else 0)
    return max(0, (len(trimmed) * 3) // 4 - padding)


def format_bytes(value: int) -> str:
    """kilocode formatBytes逐行移植（Math.ceil语义）。"""
    value = int(value or 0)
    if value < 1024:
        return f"{value} B"
    if value < 1024 * 1024:
        return f"{-(-value // 1024)} KB"
    return f"{-(-value // (1024 * 1024))} MB"


def format_resource_entry(entry: dict) -> dict:
    """kilocode formatMcpResource：剔除client键，client→server（本侧server_name/server_id）。"""
    out = {k: v for k, v in dict(entry or {}).items() if k not in ("client", "_sort")}
    return out


def format_resource_template_entry(entry: dict) -> dict:
    """kilocode formatMcpResourceTemplate（uriTemplate语义同构）。"""
    return format_resource_entry(entry)


def format_resource_content(server: str, uri: str, content: dict) -> dict:
    """kilocode formatMcpResourceContent逐行移植。

    返回 {"contents": n, "text": str, "attachments": [{mime, uri, blob, size_bytes}]}。
    blob双闸顺序与kilocode一致：先MIME白名单，再10MB上限——顺序不可交换
    （超限但白名单内的省略文案是"exceeds"而非"not a supported attachment type"）。
    """
    raw = dict(content or {}).get("contents")
    items = [dict(x) for x in (raw if isinstance(raw, list) else [raw]) if isinstance(x, dict)]
    text: list[str] = []
    attachments: list[dict] = []

    for item in items:
        item_uri = item.get("uri") if isinstance(item.get("uri"), str) else uri
        mime = item.get("mimeType") if isinstance(item.get("mimeType"), str) else "application/octet-stream"
        if isinstance(item.get("text"), str):
            text.append(f"Resource: {item_uri}\nMIME: {mime}\n{item['text']}")
            continue
        if isinstance(item.get("blob"), str):
            size = base64_size(item["blob"])
            if mime not in SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES:
                text.append(
                    f"[Binary MCP resource omitted: {item_uri} ({mime}, {format_bytes(size)})"
                    f" is not a supported attachment type]"
                )
                continue
            if size > MAX_MCP_RESOURCE_BLOB_BYTES:
                text.append(
                    f"[Binary MCP resource omitted: {item_uri} ({mime}, {format_bytes(size)})"
                    f" exceeds {format_bytes(MAX_MCP_RESOURCE_BLOB_BYTES)}]"
                )
                continue
            text.append(f"[Binary MCP resource attached: {item_uri} ({mime})]")
            attachments.append({
                "mime": mime,
                "uri": item_uri,
                "blob": item["blob"],
                "size_bytes": size,
            })
            continue
        text.append(f"[MCP resource content without text or blob: {item_uri}]")

    return {
        "contents": len(items),
        "attachments": attachments,
        "text": "\n\n".join(text) or f"MCP resource {uri} from {server} returned no contents.",
    }


def _safe_basename(uri: str) -> str:
    name = os.path.basename(str(uri or "").split("?", 1)[0].split("#", 1)[0]) or "resource"
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80] or "resource"
    return name


def save_attachment(att: dict, save_dir: str) -> str | None:
    """通过双闸的blob落盘为附件文件（kilocode FilePart注入的本侧替代，见模块docstring）。

    返回落盘路径；失败返回None（调用方显式标注保存失败，禁静默丢数据）。
    """
    try:
        blob = str(att.get("blob", ""))
        raw = base64.b64decode(re.sub(r"\s", "", blob), validate=False)
        os.makedirs(save_dir, exist_ok=True)
        fname = f"{int(time.time() * 1000)}_{_safe_basename(att.get('uri', ''))}"
        path = os.path.join(save_dir, fname)
        with open(path, "wb") as f:
            f.write(raw)
        return path
    except Exception as e:
        logger.warning("[mcp-resource] 附件落盘失败: %s", e)
        return None


def build_read_text(server: str, uri: str, content: dict, save_dir: str) -> str:
    """read_mcp_resource最终工具结果文本：格式化 + 附件落盘 + 显式标注（fail-safe绝不抛出）。"""
    try:
        formatted = format_resource_content(server, uri, content)
    except Exception as e:
        return f"[MCP resource格式化失败] {server}/{uri}: {e}"
    lines = [formatted["text"]]
    for att in formatted["attachments"]:
        path = save_attachment(att, save_dir)
        if path:
            lines.append(f"[MCP resource attachment saved: {path}]")
        else:
            lines.append(
                f"[MCP resource attachment save failed: {att.get('uri', '')} "
                f"({att.get('mime', '')}, {format_bytes(att.get('size_bytes', 0))})]"
            )
    return "\n\n".join(lines)


def resource_tool_defs() -> list[dict]:
    """三工具的OpenAI function calling定义（kilocode description/参数原文对齐）。

    kilocode session/tools.ts：工具面只在有resource能力Server时暴露
    （hasMcpResourceServer门）——调用方负责该门，本函数只出定义。
    """
    return [
        {
            "type": "function",
            "function": {
                "name": MCP_RESOURCE_TOOLS["list"],
                "description": (
                    "Lists resources provided by connected MCP servers. Resources provide"
                    " context such as files, database schemas, or application-specific information."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server": {
                            "type": "string",
                            "description": (
                                "Optional MCP server name. When omitted, lists resources"
                                " from every connected server."
                            ),
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": MCP_RESOURCE_TOOLS["listTemplates"],
                "description": (
                    "Lists resource templates provided by connected MCP servers. Resource"
                    " templates are parameterized resources that can be read after filling"
                    " in their URI template."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server": {
                            "type": "string",
                            "description": (
                                "Optional MCP server name. When omitted, lists resource"
                                " templates from every connected server."
                            ),
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": MCP_RESOURCE_TOOLS["read"],
                "description": (
                    "Read a specific resource from an MCP server using the server name and"
                    " resource URI. The URI is an MCP identifier and does not need to be a"
                    " file URL."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server": {
                            "type": "string",
                            "description": "MCP server name exactly as returned by list_mcp_resources.",
                        },
                        "uri": {
                            "type": "string",
                            "description": "Resource URI to read. Use the exact URI string returned by list_mcp_resources.",
                        },
                    },
                    "required": ["server", "uri"],
                    "additionalProperties": False,
                },
            },
        },
    ]
