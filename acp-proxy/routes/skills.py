"""技能管理 REST API — CRUD + 搜索

路由前缀: /api/skills
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from skill_manager import SkillManager

router = APIRouter(prefix="/api/skills", tags=["skills"])
manager = SkillManager()


# ── 请求模型 ────────────────────────────────────────────────

class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    triggers: list[str] = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    code_template: str = ""
    tags: list[str] = Field(default_factory=list)


class UpdateSkillRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    triggers: Optional[list[str]] = None
    content: Optional[str] = None
    code_template: Optional[str] = None
    tags: Optional[list[str]] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=5, ge=1, le=20)


# ── CRUD 端点 ───────────────────────────────────────────────

@router.get("")
async def list_skills():
    """列出所有技能（按使用次数降序）"""
    skills = manager.list_skills()
    return {"skills": skills, "count": len(skills)}


@router.post("", status_code=201)
async def create_skill(req: CreateSkillRequest):
    """创建新技能"""
    skill = manager.create_skill(**req.model_dump())
    return skill


@router.get("/{skill_id}")
async def get_skill(skill_id: str):
    """获取技能详情"""
    skill = manager.get_skill(skill_id)
    if not skill:
        raise HTTPException(404, detail=f"Skill {skill_id} not found")
    return skill


@router.put("/{skill_id}")
async def update_skill(skill_id: str, req: UpdateSkillRequest):
    """更新技能"""
    skill = manager.update_skill(skill_id, **req.model_dump(exclude_none=True))
    if not skill:
        raise HTTPException(404, detail=f"Skill {skill_id} not found")
    return skill


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """删除技能"""
    if not manager.delete_skill(skill_id):
        raise HTTPException(404, detail=f"Skill {skill_id} not found")
    return {"ok": True, "deleted": skill_id}


# ── 搜索端点 ───────────────────────────────────────────────

@router.post("/search")
async def search_skills(req: SearchRequest):
    """搜索技能 — 按 triggers、description、tags 匹配"""
    results = manager.search_skills(req.query, limit=req.limit)
    return {"skills": results, "count": len(results), "query": req.query}
