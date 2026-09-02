"""投标文档引擎 — FastAPI 路由

提供完整的投标文档处理 API：
- 项目管理（CRUD）
- 文档解析
- 大纲生成
- 内容生成（流式）
- 合规检查
- Word 导出
"""

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from .models import (
    CheckResult, OutlineNode, ParseResult, Project, ProjectStatus,
)
from .store import BiddingStore
from .parser import parse_document
from .outline import generate_outline
from .generator import generate_chapter, generate_chapter_stream
from .compliance import check_project, get_rules_summary
from .dedup import find_duplicates, find_template_content
from .exporter import export_to_word

logger = logging.getLogger("acp-proxy.bidding.router")

router = APIRouter(prefix="/bidding", tags=["bidding"])

UPLOAD_DIR = Path(__file__).parent.parent / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── 请求/响应模型 ───────────────────────────────────────────────

class CreateProjectReq(BaseModel):
    name: str = ""


class GenerateReq(BaseModel):
    project_id: str
    chapter_id: Optional[str] = None  # None = 生成全部


class ExportReq(BaseModel):
    project_id: str
    output_path: Optional[str] = None


class CheckReq(BaseModel):
    project_id: str


# ── 项目管理 ────────────────────────────────────────────────────

@router.post("/project")
async def create_project(req: CreateProjectReq):
    """创建投标项目"""
    store = BiddingStore()
    project = store.create_project(name=req.name)
    return {"ok": True, "project": project.model_dump(mode="json")}


@router.get("/project/{project_id}")
async def get_project(project_id: str):
    """获取项目详情"""
    store = BiddingStore()
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    return {"ok": True, "project": project.model_dump(mode="json")}


@router.get("/projects")
async def list_projects():
    """列出所有项目"""
    store = BiddingStore()
    projects = store.list_projects()
    return {"ok": True, "projects": [p.model_dump(mode="json") for p in projects]}


@router.delete("/project/{project_id}")
async def delete_project(project_id: str):
    """删除项目"""
    store = BiddingStore()
    if not store.delete_project(project_id):
        raise HTTPException(404, "项目不存在")
    return {"ok": True}


# ── 文档解析 ────────────────────────────────────────────────────

@router.post("/parse")
async def parse_doc(project_id: str = Form(...), file: UploadFile = File(...)):
    """解析招标文件

    上传 PDF 或 Word 文件，自动提取项目信息、评分标准、技术参数等。
    """
    store = BiddingStore()
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    # 保存上传文件
    file_path = UPLOAD_DIR / f"{project_id}_{file.filename}"
    content = await file.read()
    file_path.write_bytes(content)

    # 解析
    try:
        result = await parse_document(str(file_path))
    except Exception as e:
        raise HTTPException(500, f"解析失败: {str(e)}")

    # 更新项目
    project.parse_result = result
    project.status = ProjectStatus.PARSED
    store.update_project(project)

    # 保存文档记录
    store.save_document(
        project_id=project_id,
        file_path=str(file_path),
        file_type=result.file_type,
        raw_text=result.raw_text[:10000],
        page_count=result.page_count,
    )

    return {
        "ok": True,
        "parse_result": result.model_dump(mode="json"),
    }


# ── 大纲生成 ────────────────────────────────────────────────────

@router.post("/outline")
async def outline_gen(project_id: str):
    """生成投标方案大纲

    根据解析结果自动生成3级大纲树，覆盖所有评分项。
    """
    store = BiddingStore()
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if not project.parse_result:
        raise HTTPException(400, "请先解析招标文件")

    try:
        outline = await generate_outline(project.parse_result)
    except Exception as e:
        raise HTTPException(500, f"大纲生成失败: {str(e)}")

    project.outline = outline
    project.status = ProjectStatus.OUTLINED
    store.update_project(project)

    # 保存大纲节点
    store.save_outline_nodes(project_id, outline.children)

    return {
        "ok": True,
        "outline": outline.model_dump(mode="json"),
    }


# ── 内容生成 ────────────────────────────────────────────────────

@router.post("/generate")
async def generate_content(req: GenerateReq):
    """生成投标方案内容（流式）

    支持生成单个章节或全部章节。
    返回 SSE 流，每个 chunk 包含一个章节的内容片段。
    """
    store = BiddingStore()
    project = store.get_project(req.project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if not project.outline:
        raise HTTPException(400, "请先生成大纲")

    project.status = ProjectStatus.GENERATING
    store.update_project(project)

    async def stream_all():
        """流式生成所有章节"""
        context = {
            "parse_result": project.parse_result,
            "parent_chapters": [],
            "sibling_summaries": [],
            "knowledge": [],
        }

        async def process_node(node: OutlineNode, depth: int = 0):
            if node.id != "root":
                # 发送章节开始标记
                yield f"data: {json.dumps({'type': 'chapter_start', 'id': node.id, 'title': node.title}, ensure_ascii=False)}\n\n"

                # 流式生成内容
                async for chunk in generate_chapter_stream(node, context):
                    yield f"data: {json.dumps({'type': 'chunk', 'id': node.id, 'content': chunk}, ensure_ascii=False)}\n\n"

                # 更新上下文
                if node.content:
                    context["sibling_summaries"].append(f"{node.title}: {node.content[:100]}")

                yield f"data: {json.dumps({'type': 'chapter_end', 'id': node.id}, ensure_ascii=False)}\n\n"

            # 递归处理子节点
            for child in node.children:
                async for item in process_node(child, depth + 1):
                    yield item

        try:
            async for item in process_node(project.outline):  # type: ignore[arg-type]
                yield item

            # 保存结果
            project.status = ProjectStatus.COMPLETED
            store.update_project(project)
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        stream_all(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/generate/chapter")
async def generate_single_chapter(project_id: str, chapter_id: str):
    """生成单个章节"""
    store = BiddingStore()
    project = store.get_project(project_id)
    if not project or not project.outline:
        raise HTTPException(400, "项目或大纲不存在")

    # 查找章节节点
    node = _find_node(project.outline, chapter_id)
    if not node:
        raise HTTPException(404, f"章节 {chapter_id} 不存在")

    context = {"parse_result": project.parse_result}
    content = await generate_chapter(node, context)

    store.update_project(project)
    return {"ok": True, "chapter_id": chapter_id, "content": content}


def _find_node(root: OutlineNode, node_id: str) -> Optional[OutlineNode]:
    """递归查找大纲节点"""
    if root.id == node_id:
        return root
    for child in root.children:
        found = _find_node(child, node_id)
        if found:
            return found
    return None


# ── 合规检查 ────────────────────────────────────────────────────

@router.post("/check")
async def compliance_check(req: CheckReq):
    """合规检查

    检查投标项目的合规性，返回问题列表。
    """
    store = BiddingStore()
    project = store.get_project(req.project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    results = check_project(project)
    project.check_results = results
    store.update_project(project)

    # 统计
    stats = {}
    for r in results:
        key = r.severity.value
        stats[key] = stats.get(key, 0) + 1

    return {
        "ok": True,
        "total": len(results),
        "stats": stats,
        "results": [r.model_dump(mode="json") for r in results],
    }


@router.get("/rules")
async def get_rules():
    """获取规则库统计"""
    return {"ok": True, "summary": get_rules_summary()}


# ── 查重 ────────────────────────────────────────────────────────

@router.post("/dedup")
async def dedup_check(project_id: str, threshold: float = 0.3):
    """查重检查

    检查项目内章节间的重复内容。
    """
    store = BiddingStore()
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    duplicates = find_duplicates(project, threshold)
    templates = find_template_content(project)

    return {
        "ok": True,
        "duplicates": duplicates,
        "template_content": templates,
    }


# ── 导出 ────────────────────────────────────────────────────────

@router.post("/export")
async def export_doc(req: ExportReq):
    """导出为 Word 文档

    生成符合格式要求的 .docx 文件。
    """
    store = BiddingStore()
    project = store.get_project(req.project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    try:
        output = export_to_word(project, req.output_path)
    except Exception as e:
        raise HTTPException(500, f"导出失败: {str(e)}")

    project.status = ProjectStatus.EXPORTED
    store.update_project(project)

    return {"ok": True, "file_path": output}
