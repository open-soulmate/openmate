#!/usr/bin/env python3
"""
观察分析优化技能
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
from collections import defaultdict

from .base import BaseSkill
from ..memory.manager import MemoryManager


@dataclass
class ObservationPattern:
    """观察模式数据结构"""
    pattern_type: str
    description: str
    frequency: int = 0
    last_seen: str = ""
    examples: List[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class AnalysisResult:
    """分析结果"""
    observation_id: str
    category: str  # error_pattern, success_pattern, resource_usage, performance_metric
    details: Dict[str, Any]
    pattern_candidates: List[Dict[str, Any]]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class ObservationAnalyzer(BaseSkill):
    """
    观察分析优化技能
    解决观察数据未被有效分析的问题
    """
    
    def __init__(self, memory_manager: MemoryManager, config: Optional[Dict] = None):
        super().__init__(name="observation_analyzer", config=config or {})
        self.memory_manager = memory_manager
        self.unanalyzed_threshold = self.config.get("unanalyzed_threshold", 2)
        self.patterns = []
        self.analysis_results = []
        self.requires_processing = False
        
        # 分类规则
        self.category_rules = {
            "error_pattern": ["error", "fail", "exception", "crash", "bug"],
            "success_pattern": ["success", "achieved", "complete", "improve"],
            "resource_usage": ["cpu", "memory", "disk", "network", "usage"],
            "performance_metric": ["time", "speed", "latency", "throughput", "performance"]
        }
        
        # 模式识别阈值
        self.pattern_threshold = self.config.get("pattern_threshold", 3)
        self._last_pattern_extraction_time = None
        
    async def initialize(self):
        """初始化技能"""
        await super().initialize()
        # 从内存中加载已有的模式
        patterns_data = await self.memory_manager.get("patterns", [])
        self.patterns = [
            ObservationPattern(**p) for p in patterns_data
        ] if patterns_data else []
    
    async def monitor_unanalyzed(self) -> Dict[str, Any]:
        """
        阈值监控器
        追踪未分析观察数量，当超过2条时标记为需要处理
        
        Returns:
            Dict: 包含未分析数量和是否需要处理的状态
        """
        observations = await self.memory_manager.get("observations", [])
        unanalyzed_count = 0
        
        for obs in observations:
            if not obs.get("analyzed", False):
                unanalyzed_count += 1
        
        self.requires_processing = unanalyzed_count > self.unanalyzed_threshold
        
        return {
            "unanalyzed_count": unanalyzed_count,
            "requires_processing": self.requires_processing,
            "threshold": self.unanalyzed_threshold,
            "timestamp": datetime.now().isoformat()
        }
    
    async def auto_analyze(self) -> List[AnalysisResult]:
        """
        自动分析器
        对未分析的观察进行分类（错误模式、成功模式、资源使用、性能指标）
        
        Returns:
            List[AnalysisResult]: 分析结果列表
        """
        observations = await self.memory_manager.get("observations", [])
        unanalyzed = [obs for obs in observations if not obs.get("analyzed", False)]
        
        results = []
        
        for obs in unanalyzed:
            # 进行分类分析
            category = await self._categorize_observation(obs)
            
            # 提取模式候选
            pattern_candidates = await self._extract_pattern_candidates(obs, category)
            
            # 创建分析结果
            result = AnalysisResult(
                observation_id=obs.get("id", ""),
                category=category,
                details=obs,
                pattern_candidates=pattern_candidates
            )
            
            results.append(result)
            
            # 标记为已分析
            obs["analyzed"] = True
            obs["analysis_category"] = category
            obs["analysis_timestamp"] = result.timestamp
        
        # 更新内存中的观察数据
        if unanalyzed:
            await self.memory_manager.set("observations", observations)
        
        self.analysis_results.extend(results)
        
        # 如果是错误模式，触发改进项生成
        error_results = [r for r in results if r.category == "error_pattern"]
        if error_results:
            await self._trigger_improvement_items(error_results)
        
        return results
    
    async def extract_patterns(self) -> List[ObservationPattern]:
        """
        模式提取器
        从分析结果中识别可复用的模式，存入memory的patterns字段
        
        Returns:
            List[ObservationPattern]: 提取的模式列表
        """
        new_patterns = []
        pattern_groups = defaultdict(list)
        
        # 按类别和详情分组
        for result in self.analysis_results:
            key = f"{result.category}:{self._generate_pattern_key(result.details)}"
            pattern_groups[key].append(result)
        
        # 从分组中提取模式
        for key, group in pattern_groups.items():
            if len(group) >= self.pattern_threshold:
                category, pattern_key = key.split(":", 1)
                
                # 计算频率
                frequency = len(group)
                
                # 查找最后一次出现时间
                last_seen = max(r.timestamp for r in group)
                
                # 查找现有模式
                existing_pattern = None
                for p in self.patterns:
                    if p.pattern_type == category and p.description == pattern_key:
                        existing_pattern = p
                        break
                
                if existing_pattern:
                    # 更新现有模式
                    existing_pattern.frequency += frequency
                    existing_pattern.last_seen = last_seen
                    existing_pattern.examples.extend([
                        r.observation_id for r in group[-5:]  # 保留最近5个例子
                    ])
                    existing_pattern.examples = list(set(existing_pattern.examples))[-10:]  # 限制为10个
                else:
                    # 创建新模式
                    pattern = ObservationPattern(
                        pattern_type=category,
                        description=pattern_key,
                        frequency=frequency,
                        last_seen=last_seen,
                        examples=[r.observation_id for r in group[-5:]],
                        confidence=min(1.0, frequency / 10.0)  # 置信度计算
                    )
                    self.patterns.append(pattern)
                    new_patterns.append(pattern)
        
        # 更新内存中的模式
        patterns_data = [
            {
                "pattern_type": p.pattern_type,
                "description": p.description,
                "frequency": p.frequency,
                "last_seen": p.last_seen,
                "examples": p.examples,
                "confidence": p.confidence
            }
            for p in self.patterns
        ]
        await self.memory_manager.set("patterns", patterns_data)
        
        self._last_pattern_extraction_time = datetime.now().isoformat()
        
        return new_patterns
    
    async def link_to_knowledge(self) -> Dict[str, Any]:
        """
        知识关联器
        将分析结果关联到知识积累目标，更新goal_progress
        
        Returns:
            Dict: 关联结果和进度更新
        """
        # 获取知识积累目标