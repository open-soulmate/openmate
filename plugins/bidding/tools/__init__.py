"""
招投标插件工具集

所有工具统一注册至全局Tool网关，供Agent/Skill调用。
调用链路：Skill/Agent → 网关鉴权 → 插件执行 → 日志埋点 → 返回
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("plugin.bidding.tools")


async def parse_bid_document(file_path: str) -> Dict[str, Any]:
    """
    解析招标文件
    
    功能：
    - 支持PDF和Word格式
    - 提取项目信息、评分标准、技术参数、废标条款
    - 返回结构化JSON
    
    参数：
        file_path: 招标文件路径
    
    返回：
        解析结果字典
    """
    from ..parser import parse_document
    logger.info("[tool:parse_bid_document] 解析文件: %s", file_path)
    result = parse_document(file_path)
    return {
        "success": True,
        "data": result,
        "message": "招标文件解析完成"
    }


async def generate_outline(project_id: str) -> Dict[str, Any]:
    """
    生成标书提纲
    
    功能：
    - 根据解析结果自动生成三级提纲
    - 覆盖所有评分得分点
    - 支持用户手动编辑
    
    参数：
        project_id: 项目ID
    
    返回：
        提纲树结构
    """
    from ..store import BiddingStore
    from ..outline import generate_outline as _generate_outline
    
    logger.info("[tool:generate_outline] 生成提纲: project=%s", project_id)
    store = BiddingStore()
    project = store.get_project(project_id)
    
    if not project:
        return {"success": False, "message": "项目不存在"}
    
    if not project.parse_result:
        return {"success": False, "message": "请先解析招标文件"}
    
    outline = await _generate_outline(project.parse_result)
    return {
        "success": True,
        "data": outline,
        "message": "提纲生成完成"
    }


async def generate_chapter(project_id: str, chapter_id: str, context: Optional[Dict] = None) -> Dict[str, Any]:
    """
    生成章节内容
    
    功能：
    - 逐章生成标书正文
    - 支持流式输出
    - 注入企业知识库
    - 配图预编排
    
    参数：
        project_id: 项目ID
        chapter_id: 章节ID
        context: 上下文信息（可选）
    
    返回：
        章节内容（markdown格式）
    """
    from ..store import BiddingStore
    from ..generator import generate_chapter as _generate_chapter
    from ..models import OutlineNode
    
    logger.info("[tool:generate_chapter] 生成章节: project=%s, chapter=%s", project_id, chapter_id)
    store = BiddingStore()
    project = store.get_project(project_id)
    
    if not project:
        return {"success": False, "message": "项目不存在"}
    
    # 查找章节节点
    chapter_node = _find_chapter_node(project.outline, chapter_id)
    if not chapter_node:
        return {"success": False, "message": f"章节 {chapter_id} 不存在"}
    
    content = await _generate_chapter(chapter_node, context)
    return {
        "success": True,
        "data": {"content": content, "chapter_id": chapter_id},
        "message": "章节生成完成"
    }


def _find_chapter_node(outline, chapter_id: str):
    """递归查找章节节点"""
    if not outline:
        return None
    
    if outline.id == chapter_id:
        return outline
    
    if outline.children:
        for child in outline.children:
            result = _find_chapter_node(child, chapter_id)
            if result:
                return result
    
    return None


async def check_compliance(project_id: str) -> Dict[str, Any]:
    """
    合规风控检查
    
    功能：
    - 70+规则自动检查
    - 废标风险检测
    - 评分覆盖验证
    - 格式规范检查
    
    参数：
        project_id: 项目ID
    
    返回：
        检查结果列表
    """
    from ..store import BiddingStore
    from ..compliance import check_project
    
    logger.info("[tool:check_compliance] 合规检查: project=%s", project_id)
    store = BiddingStore()
    project = store.get_project(project_id)
    
    if not project:
        return {"success": False, "message": "项目不存在"}
    
    results = check_project(project)
    return {
        "success": True,
        "data": {"results": results, "total": len(results)},
        "message": f"合规检查完成，发现 {len(results)} 个问题"
    }


async def export_to_word(project_id: str) -> Dict[str, Any]:
    """
    导出Word文档
    
    功能：
    - 生成标准格式Word文档
    - 标题样式：H1黑体二号、H2宋体三号、H3宋体四号
    - 自动插入TOC域
    - 横向页面自适应
    
    参数：
        project_id: 项目ID
    
    返回：
        下载链接
    """
    from ..store import BiddingStore
    from ..exporter import export_to_word as _export_to_word
    
    logger.info("[tool:export_to_word] 导出Word: project=%s", project_id)
    store = BiddingStore()
    project = store.get_project(project_id)
    
    if not project:
        return {"success": False, "message": "项目不存在"}
    
    output_path = f"/tmp/bidding_{project_id}.docx"
    _export_to_word(project, output_path)
    
    return {
        "success": True,
        "data": {"file_path": output_path, "download_url": f"/bidding/download/{project_id}"},
        "message": "Word文档导出完成"
    }
