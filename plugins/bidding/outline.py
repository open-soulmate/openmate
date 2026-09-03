"""投标文档引擎 — 大纲生成器

根据解析结果生成 3 级大纲树。
短文档（<50页）：单次 LLM 调用生成完整大纲。
长文档（≥50页）：分步生成，先骨架再填充。
"""

import json
import logging
import re

import httpx

from .models import OutlineNode, ParseResult

logger = logging.getLogger("acp-proxy.bidding.outline")

MIMO_BASE = "https://token-plan-cn.xiaomimimo.com/v1"
MIMO_MODEL = "xiaomi/mimo-v2.5-pro"

OUTLINE_PROMPT = """你是投标方案大纲设计专家。根据以下招标文件解析结果，生成一个完整的3级投标方案大纲。

要求：
1. 大纲必须覆盖所有评分项，每个评分项都要在大纲中有对应章节
2. 技术方案部分按产品/模块分章，每章含：概述、技术架构、功能说明、实施方案、保障措施
3. 商务部分含：报价说明、售后方案、培训方案、项目管理
4. 资质部分含：公司概况、资质证书、业绩案例、团队介绍

返回JSON数组格式（3级树结构）：
[
  {
    "id": "1",
    "title": "第一章 项目理解与需求分析",
    "description": "对招标项目的理解和需求分析",
    "children": [
      {"id": "1.1", "title": "项目背景", "description": "...", "children": [
        {"id": "1.1.1", "title": "行业背景", "description": "...", "children": []}
      ]}
    ]
  }
]

只返回JSON数组，不要其他文字。

解析结果：
"""

LONG_DOC_OUTLINE_PROMPT = """你是投标方案大纲设计专家。根据以下信息，生成第{part}部分的大纲（3级）。

{context}

返回JSON数组格式，只返回该部分的子大纲。只返回JSON，不要其他文字。"""


async def _llm_generate_outline(prompt: str) -> list[dict]:
    """调用 LLM 生成大纲 JSON"""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{MIMO_BASE}/chat/completions",
            json={
                "model": MIMO_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 8000,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        # 提取JSON数组
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(content)


def _dicts_to_nodes(items: list[dict]) -> list[OutlineNode]:
    """将 LLM 返回的 dict 列表转换为 OutlineNode 树"""
    nodes = []
    for item in items:
        children = _dicts_to_nodes(item.get("children", []))
        nodes.append(OutlineNode(
            id=item.get("id", ""),
            title=item.get("title", ""),
            description=item.get("description", ""),
            children=children,
        ))
    return nodes


def _build_summary(pr: ParseResult) -> str:
    """构建解析结果摘要（用于 LLM prompt）"""
    parts = []
    if pr.project_info.name:
        parts.append(f"项目名称：{pr.project_info.name}")
    if pr.project_info.budget:
        parts.append(f"预算：{pr.project_info.budget}")
    if pr.project_info.summary:
        parts.append(f"概述：{pr.project_info.summary}")

    if pr.scoring:
        parts.append("\n评分标准：")
        for s in pr.scoring:
            parts.append(f"  - {s.item} ({s.score}分, {s.type.value})")

    if pr.params:
        parts.append(f"\n技术参数要求：共{len(pr.params)}项")
        for p in pr.params[:10]:
            parts.append(f"  - {p.param}: {p.value} [{p.level.value}]")

    if pr.clauses:
        parts.append(f"\n关键条款：{len(pr.clauses)}条")

    return "\n".join(parts)


async def generate_outline(parse_result: ParseResult) -> OutlineNode:
    """根据解析结果生成大纲

    Args:
        parse_result: 文档解析结果

    Returns:
        OutlineNode 根节点（children 为各章大纲）
    """
    summary = _build_summary(parse_result)

    if parse_result.page_count < 50 or parse_result.page_count == 0:
        # 短文档：单次调用
        prompt = OUTLINE_PROMPT + summary
        items = await _llm_generate_outline(prompt)
        children = _dicts_to_nodes(items)
    else:
        # 长文档：分步生成
        # Step 1: 生成骨架
        skeleton_prompt = OUTLINE_PROMPT + summary + "\n\n只需生成1级大纲（章标题），不需要子节点。返回JSON数组。"
        skeleton = await _llm_generate_outline(skeleton_prompt)

        # Step 2: 对每章生成子大纲
        children = []
        for ch in skeleton:
            ch_prompt = LONG_DOC_OUTLINE_PROMPT.format(
                part=ch.get("title", ""),
                context=f"章节：{ch.get('title', '')}\n描述：{ch.get('description', '')}\n\n{summary}",
            )
            try:
                sub_items = await _llm_generate_outline(ch_prompt)
                sub_children = _dicts_to_nodes(sub_items)
            except Exception as e:
                logger.warning(f"章节 {ch.get('title')} 子大纲生成失败: {e}")
                sub_children = []

            children.append(OutlineNode(
                id=ch.get("id", ""),
                title=ch.get("title", ""),
                description=ch.get("description", ""),
                children=sub_children,
            ))

    root = OutlineNode(
        id="root",
        title="投标方案",
        description=parse_result.project_info.name or "投标方案大纲",
        children=children,
    )

    return root
