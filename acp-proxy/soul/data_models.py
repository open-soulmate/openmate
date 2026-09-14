"""
OpenSoul — 数据模型定义

全部使用dataclass做类型约束。TaskContext作为上下文载体贯穿全链路。
"""

from dataclasses import dataclass, field
from typing import Optional, Literal, List
from datetime import datetime


# ── 意图 ──

@dataclass
class Intent:
    """用户意图解析结果"""
    user_prompt: str
    target_files: List[str]
    modify_scope: Literal["single_method", "single_file", "multi_file", "project_wide"]
    goal: str  # "fix_bug" / "add_feature" / "refactor" / "create" / "rewrite"
    change_size: Literal["small", "medium", "large"]


# ── 风险 ──

@dataclass
class Risk:
    """单个风险项"""
    title: str
    level: Literal["low", "medium", "high", "critical"]
    desc: str


@dataclass
class RiskAssessment:
    """风险评估结果"""
    risks: List[Risk]
    overall_level: Literal["low", "medium", "high", "critical"]
    recommendation: str


# ── 决策 ──

@dataclass
class Decision:
    """执行决策"""
    intent: Intent
    risk: RiskAssessment
    edit_mode: Literal["patch", "full", "stepwise"]
    execute_mode: Literal["auto", "confirm_required", "deny"]
    confirm_prompt: Optional[str] = None


# ── 验证 ──

@dataclass
class CheckItem:
    """单个检查项"""
    name: str
    passed: bool
    error: Optional[str] = None


@dataclass
class Verification:
    """验证结果"""
    success: bool
    checks: List[CheckItem]
    error: Optional[str] = None
    fix: Optional[str] = None


# ── 项目信息 ──

@dataclass
class FileInfo:
    """文件元信息"""
    path: str
    language: str  # "python" / "typescript" / "json" / ...
    lines: int
    size_bytes: int
    last_modified: datetime
    is_core: bool = False


@dataclass
class ImpactAnalysis:
    """修改影响分析"""
    direct_impact: List[str]  # 直接依赖此文件的文件列表
    indirect_impact: List[str]  # 间接依赖（传递依赖）
    risk_level: Literal["low", "medium", "high", "critical"]


# ── 任务上下文 ──

@dataclass
class TaskContext:
    """单次任务的完整状态，贯穿think → assess → decide → verify全链路"""
    task_id: str = ""
    user_input: str = ""
    intent: Optional[Intent] = None
    risk: Optional[RiskAssessment] = None
    decision: Optional[Decision] = None
    tool_result: Optional[dict] = None
    verification: Optional[Verification] = None
    history: List[dict] = field(default_factory=list)


# ── 经验 ──

@dataclass
class Experience:
    """一条经验记录"""
    action: str
    intent_summary: str
    outcome: Literal["success", "failure", "partial"]
    error: Optional[str] = None
    fix: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    relevance_score: float = 1.0  # 用于老化衰减

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "intent_summary": self.intent_summary,
            "outcome": self.outcome,
            "error": self.error,
            "fix": self.fix,
            "timestamp": self.timestamp.isoformat(),
            "relevance_score": self.relevance_score,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Experience":
        return cls(
            action=data["action"],
            intent_summary=data["intent_summary"],
            outcome=data["outcome"],
            error=data.get("error"),
            fix=data.get("fix"),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            relevance_score=data.get("relevance_score", 1.0),
        )
