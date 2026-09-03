"""投标文档引擎 — Pydantic v2 数据模型

定义投标全流程的数据结构：项目信息、评分标准、技术参数、
大纲节点、解析结果、合规检查结果、项目实体。
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ── 枚举 ───────────────────────────────────────────────────────

class ProjectStatus(str, Enum):
    DRAFT = "draft"
    PARSED = "parsed"
    OUTLINED = "outlined"
    GENERATING = "generating"
    COMPLETED = "completed"
    EXPORTED = "exported"


class ScoringType(str, Enum):
    PRICE = "价格"
    TECH = "技术"
    SERVICE = "服务"
    QUALIFICATION = "资质"
    OTHER = "其他"


class ParamLevel(str, Enum):
    STAR = "★"       # 优于
    TRIANGLE = "▲"   # 满足
    NORMAL = "一般"   # 基本满足


class Severity(str, Enum):
    FATAL = "fatal"       # 废标
    HIGH = "high"         # 扣分（严重）
    MEDIUM = "medium"     # 扣分（一般）
    LOW = "low"           # 格式/建议
    INFO = "info"         # 提示


class CheckStatus(str, Enum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"


# ── 核心模型 ────────────────────────────────────────────────────

class ProjectInfo(BaseModel):
    """招标项目基本信息"""
    name: str = ""
    budget: str = ""
    deadline: str = ""
    method: str = ""          # 采购方式：公开招标/竞争性谈判/询价等
    status: str = ""          # 项目状态
    purchaser: str = ""       # 采购人
    agency: str = ""          # 代理机构
    location: str = ""        # 项目所在地
    bid_open_time: str = ""   # 开标时间
    bid_validity: str = ""    # 投标有效期
    margin: str = ""          # 保证金
    summary: str = ""         # 项目概述


class ScoringItem(BaseModel):
    """评分标准条目"""
    item: str = ""            # 评分项名称
    score: float = 0.0        # 分值
    type: ScoringType = ScoringType.TECH
    category: str = ""        # 子分类
    criteria: str = ""        # 评分细则
    level_desc: str = ""      # 各档次描述


class TechParam(BaseModel):
    """技术参数要求"""
    product: str = ""         # 产品名称
    param: str = ""           # 参数名
    value: str = ""           # 要求值
    level: ParamLevel = ParamLevel.NORMAL
    mandatory: bool = True    # 是否为★号参数（必须满足）


class OutlineNode(BaseModel):
    """大纲节点 — 递归树结构"""
    id: str = ""
    title: str = ""
    description: str = ""
    children: list["OutlineNode"] = Field(default_factory=list)
    content: str = ""         # 生成的内容（markdown）
    page_count: int = 0       # 预估页数
    # 配图配置
    has_table: bool = False
    has_mermaid: bool = False
    has_image: bool = False
    image_desc: str = ""      # 配图描述


class ParseResult(BaseModel):
    """文档解析结果"""
    project_info: ProjectInfo = Field(default_factory=ProjectInfo)
    scoring: list[ScoringItem] = Field(default_factory=list)
    params: list[TechParam] = Field(default_factory=list)
    clauses: list[str] = Field(default_factory=list)      # 关键条款原文
    templates: list[str] = Field(default_factory=list)     # 模板段落
    raw_text: str = ""                                     # 原始文本
    page_count: int = 0
    file_path: str = ""
    file_type: str = ""       # pdf / docx


class CheckResult(BaseModel):
    """合规检查结果"""
    rule_id: str = ""
    severity: Severity = Severity.INFO
    desc: str = ""
    suggestion: str = ""
    status: CheckStatus = CheckStatus.PENDING
    category: str = ""        # 废标/扣分/格式/价格/查重


class Project(BaseModel):
    """投标项目实体"""
    id: str = ""
    name: str = ""
    status: ProjectStatus = ProjectStatus.DRAFT
    parse_result: Optional[ParseResult] = None
    outline: Optional[OutlineNode] = None
    check_results: list[CheckResult] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
