"""路由配置API — 管理自动路由策略配置"""

import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("acp-proxy.routing_api")

router = APIRouter(prefix="/api/routing", tags=["routing"])

CONFIG_FILE = Path(__file__).parent / "data" / "routing_config.json"


class RoutingRule(BaseModel):
    id: str
    name: str
    description: str
    localModel: str
    onlineModel: str
    complexityThreshold: float


class AutoParams(BaseModel):
    shortTextThreshold: int = 50
    codeDetection: bool = True
    questionDetection: bool = True
    imageAnalysis: bool = True


class RoutingConfig(BaseModel):
    enabled: bool = True
    mode: str = "auto"  # auto, manual, hybrid
    defaultStrategy: str = "local-first"  # local-first, online-first, cost-optimal, quality-optimal
    rules: list[RoutingRule] = []
    autoParams: AutoParams = AutoParams()


# 默认配置
DEFAULT_CONFIG = RoutingConfig(
    enabled=True,
    mode="auto",
    defaultStrategy="local-first",
    rules=[
        RoutingRule(
            id="simple-chat",
            name="简单对话",
            description="日常聊天、问候、简单问答",
            localModel="mimo-auto",
            onlineModel="gpt-4o-mini",
            complexityThreshold=0.3,
        ),
        RoutingRule(
            id="code-gen",
            name="代码生成",
            description="编程、代码分析、调试",
            localModel="qwen2.5-coder",
            onlineModel="claude-sonnet-4-20250514",
            complexityThreshold=0.6,
        ),
        RoutingRule(
            id="complex-reasoning",
            name="复杂推理",
            description="数学、逻辑、多步推理",
            localModel="deepseek-r1",
            onlineModel="gpt-4o",
            complexityThreshold=0.8,
        ),
        RoutingRule(
            id="creative-writing",
            name="创意写作",
            description="文章、故事、文案创作",
            localModel="qwen2.5",
            onlineModel="claude-opus-4-20250514",
            complexityThreshold=0.5,
        ),
    ],
    autoParams=AutoParams(),
)


def load_config() -> RoutingConfig:
    """加载路由配置"""
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return RoutingConfig(**data)
    except Exception as e:
        logger.error(f"Failed to load routing config: {e}")
    return DEFAULT_CONFIG


def save_config(config: RoutingConfig):
    """保存路由配置"""
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config.model_dump(), f, ensure_ascii=False, indent=2)
        logger.info("Routing config saved")
    except Exception as e:
        logger.error(f"Failed to save routing config: {e}")
        raise


@router.get("/config")
async def get_routing_config():
    """获取路由配置"""
    return load_config().model_dump()


@router.post("/config")
async def update_routing_config(config: RoutingConfig):
    """更新路由配置"""
    save_config(config)
    return {"status": "ok", "message": "路由配置已保存"}


@router.post("/test")
async def test_routing(message: str, config: Optional[RoutingConfig] = None):
    """测试路由规则"""
    if config is None:
        config = load_config()
    
    # 复杂度评估逻辑
    complexity = estimate_complexity(message, config.autoParams)
    
    # 根据复杂度和策略选择模型
    if config.mode == "manual":
        # 手动模式：使用默认策略
        model_type = "local" if config.defaultStrategy in ["local-first", "cost-optimal"] else "online"
        model = config.rules[0].localModel if model_type == "local" else config.rules[0].onlineModel
    else:
        # 自动模式：根据复杂度选择
        if complexity < 0.3:
            model_type = "local"
            model = config.rules[0].localModel
        elif complexity < 0.6:
            model_type = "local"
            model = config.rules[1].localModel if len(config.rules) > 1 else config.rules[0].localModel
        else:
            model_type = "online"
            model = config.rules[2].onlineModel if len(config.rules) > 2 else config.rules[0].onlineModel
    
    reason = f"复杂度 {complexity:.2f}，{'低于' if complexity < 0.5 else '高于'}阈值，选择{model_type}模型"
    
    return {
        "model": model,
        "type": model_type,
        "complexity": complexity,
        "reason": reason,
        "message_length": len(message),
    }


def estimate_complexity(message: str, params: AutoParams) -> float:
    """估算消息复杂度 (0-1)"""
    score = 0.0
    
    # 1. 文本长度
    length_score = min(len(message) / 500, 1.0) * 0.3
    score += length_score
    
    # 2. 短文本检测
    if len(message) < params.shortTextThreshold:
        score = min(score, 0.2)
    
    # 3. 代码检测
    if params.codeDetection:
        code_indicators = ['def ', 'class ', 'import ', 'function', 'SELECT', 'CREATE', 
                          '{', '}', '()', '=>', '```', 'python', 'javascript', 'java']
        if any(indicator in message.lower() for indicator in code_indicators):
            score += 0.3
    
    # 4. 问题类型检测
    if params.questionDetection:
        complex_indicators = ['为什么', '如何', '分析', '设计', '实现', '优化', '解释',
                            'why', 'how', 'analyze', 'design', 'implement', 'optimize']
        if any(indicator in message.lower() for indicator in complex_indicators):
            score += 0.2
    
    # 5. 多步骤推理
    if any(word in message for word in ['首先', '然后', '接着', '最后', '步骤', '流程']):
        score += 0.2
    
    return min(score, 1.0)
