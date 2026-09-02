"""投标文档引擎 — 内容生成器

逐章生成投标方案内容（markdown格式）。
上下文包括：项目概述、父章节、兄弟摘要、知识库。
支持配图预规划（表格/流程图/图片）。
"""

import json
import logging
import re
from typing import Optional

import httpx

from .models import OutlineNode, ParseResult

logger = logging.getLogger("acp-proxy.bidding.generator")

MIMO_BASE = "https://token-plan-cn.xiaomimimo.com/v1"
MIMO_MODEL = "xiaomi/mimo-v2.5-pro"

CHAPTER_PROMPT = """你是资深投标方案撰写专家。请根据以下信息撰写投标方案的指定章节。

## 写作要求
1. 语言正式、专业，符合投标文件规范
2. 内容详实，每个要点至少3-5句话展开
3. 适当使用表格对比、流程描述、要点列举
4. 紧扣评分标准，确保该章节能拿到对应分值
5. 使用 markdown 格式输出

## 配图规划
如果章节内容适合用以下方式呈现，请在对应位置插入标记：
- 表格对比：插入 <!--TABLE: 表格标题 --> 后跟 markdown 表格
- 流程图：插入 <!--MERMAID: 流程描述 --> 后跟 mermaid 代码块
- 配图说明：插入 <!--IMAGE: 图片描述 -->

## 项目信息
{project_overview}

## 当前章节
标题：{chapter_title}
描述：{chapter_desc}

## 上下文
{context}

请撰写该章节的完整内容（markdown格式，1500-3000字）：
"""


def _build_project_overview(pr: Optional[ParseResult]) -> str:
    if not pr:
        return "暂无项目信息"
    parts = []
    if pr.project_info.name:
        parts.append(f"项目名称：{pr.project_info.name}")
    if pr.project_info.budget:
        parts.append(f"预算：{pr.project_info.budget}")
    if pr.project_info.summary:
        parts.append(f"概述：{pr.project_info.summary}")
    return "\n".join(parts) or "暂无项目信息"


def _build_context(
    parent_chapters: list[str],
    sibling_summaries: list[str],
    knowledge: list[str],
) -> str:
    parts = []
    if parent_chapters:
        parts.append("### 上级章节内容（摘要）")
        for i, ch in enumerate(parent_chapters[-3:], 1):  # 最多取最近3个
            parts.append(f"上级章节{i}：{ch[:300]}...")

    if sibling_summaries:
        parts.append("\n### 已完成的同级章节摘要")
        for s in sibling_summaries:
            parts.append(f"- {s}")

    if knowledge:
        parts.append("\n### 相关知识库内容")
        for k in knowledge[:5]:
            parts.append(f"- {k[:200]}")

    return "\n".join(parts) or "（无额外上下文）"


async def generate_chapter(
    chapter_node: OutlineNode,
    context: dict | None = None,
) -> str:
    """生成单个章节内容

    Args:
        chapter_node: 大纲节点
        context: 上下文信息
            - project_overview: 项目概述
            - parent_chapters: 父章节内容列表
            - sibling_summaries: 兄弟章节摘要列表
            - knowledge: 知识库相关内容

    Returns:
        章节内容（markdown格式）
    """
    ctx = context or {}
    pr = ctx.get("parse_result")
    project_overview = ctx.get("project_overview") or _build_project_overview(pr)
    context_text = _build_context(
        parent_chapters=ctx.get("parent_chapters", []),
        sibling_summaries=ctx.get("sibling_summaries", []),
        knowledge=ctx.get("knowledge", []),
    )

    prompt = CHAPTER_PROMPT.format(
        project_overview=project_overview,
        chapter_title=chapter_node.title,
        chapter_desc=chapter_node.description or chapter_node.title,
        context=context_text,
    )

    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{MIMO_BASE}/chat/completions",
            json={
                "model": MIMO_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 4000,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

    # 解析配图标记
    has_table = "<!--TABLE:" in content
    has_mermaid = "<!--MERMAID:" in content or "```mermaid" in content
    has_image = "<!--IMAGE:" in content

    chapter_node.content = content
    chapter_node.has_table = has_table
    chapter_node.has_mermaid = has_mermaid
    chapter_node.has_image = has_image

    return content


async def generate_chapter_stream(
    chapter_node: OutlineNode,
    context: dict | None = None,
):
    """流式生成章节内容（yield chunks）"""
    ctx = context or {}
    pr = ctx.get("parse_result")
    project_overview = ctx.get("project_overview") or _build_project_overview(pr)
    context_text = _build_context(
        parent_chapters=ctx.get("parent_chapters", []),
        sibling_summaries=ctx.get("sibling_summaries", []),
        knowledge=ctx.get("knowledge", []),
    )

    prompt = CHAPTER_PROMPT.format(
        project_overview=project_overview,
        chapter_title=chapter_node.title,
        chapter_desc=chapter_node.description or chapter_node.title,
        context=context_text,
    )

    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream(
            "POST",
            f"{MIMO_BASE}/chat/completions",
            json={
                "model": MIMO_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 4000,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            full_content = ""
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        full_content += text
                        yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

    chapter_node.content = full_content
