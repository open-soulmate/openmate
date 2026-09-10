# acp-proxy/skills/observation_analyzer.py

import json
from datetime import datetime
from typing import Dict, List, Any, Optional

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能，用于有效分析观察数据并提取模式"""
    
    UNANALYZED_THRESHOLD = 2  # 可配置的分析阈值
    
    def __init__(self, memory_manager: MemoryManager):
        """初始化观察分析器
        
        Args:
            memory_manager: 内存管理器实例
        """
        super().__init__(name="observation_analyzer")
        self.memory_manager = memory_manager
        self.last_report = None
        
    def monitor_unanalyzed(self) -> Dict[str, Any]:
        """监控未分析的观察数量，当超过阈值时标记为需要处理
        
        Returns:
            监控结果字典
        """
        observations = self.memory_manager.get("observations", [])
        unanalyzed_count = sum(1 for obs in observations if not obs.get("analyzed", False))
        
        needs_processing = unanalyzed_count > self.UNANALYZED_THRESHOLD
        
        result = {
            "unanalyzed_count": unanalyzed_count,
            "needs_processing": needs_processing,
            "threshold": self.UNANALYZED_THRESHOLD,
            "timestamp": datetime.now().isoformat()
        }
        
        if needs_processing:
            self._trigger_processing_needed(unanalyzed_count)
            
        return result
    
    def auto_analyze(self) -> List[Dict[str, Any]]:
        """自动分析未分析的观察，进行分类
        
        Returns:
            分析结果列表
        """
        observations = self.memory_manager.get("observations", [])
        analysis_results = []
        
        for i, obs in enumerate(observations):
            if not obs.get("analyzed", False):
                # 分析观察并分类
                analysis = self._analyze_single_observation(obs)
                
                # 标记为已分析
                observations[i]["analyzed"] = True
                observations[i]["analysis_time"] = datetime.now().isoformat()
                
                analysis_results.append({
                    "observation_index": i,
                    "observation": obs,
                    "analysis": analysis
                })
        
        # 更新内存中的观察
        self.memory_manager.set("observations", observations)
        
        return analysis_results
    
    def _analyze_single_observation(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """分析单个观察，进行分类
        
        Args:
            observation: 观察数据
            
        Returns:
            分析结果，包含类别和特征
        """
        content = observation.get("content", "").lower()
        observation_type = observation.get("type", "unknown")
        
        # 简单的分类逻辑，实际实现可能需要更复杂的NLP或模式匹配
        categories = {
            "error_pattern": any(keyword in content for keyword in ["error", "failed", "exception", "crash"]),
            "success_pattern": any(keyword in content for keyword in ["success", "completed", "achieved", "passed"]),
            "resource_usage": any(keyword in content for keyword in ["memory", "cpu", "disk", "network", "resource"]),
            "performance_metrics": any(keyword in content for keyword in ["latency", "throughput", "response time", "performance"])
        }
        
        # 找出匹配的类别（可以是多个）
        matched_categories = [cat for cat, match in categories.items() if match]
        
        # 如果没有匹配，使用默认类别
        if not matched_categories:
            matched_categories = ["general"]
            
        return {
            "categories": matched_categories,
            "keywords": self._extract_keywords(content),
            "observation_type": observation_type,
            "confidence": 0.8  # 示例置信度
        }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """从文本中提取关键词（简单实现）
        
        Args:
            text: 输入文本
            
        Returns:
            关键词列表
        """
        # 简单实现：基于常见关键词的分割
        stop_words = {"the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for"}
        words = text.split()
        return [word for word in words if word.isalpha() and word.lower() not in stop_words][:5]  # 最多返回5个关键词
    
    def extract_patterns(self) -> List[Dict[str, Any]]:
        """从分析结果中识别可复用的模式，存入memory的patterns字段
        
        Returns:
            提取的模式列表
        """
        analysis_results = self.auto_analyze()
        patterns = self.memory_manager.get("patterns", [])
        new_patterns = []
        
        # 基于分析结果生成模式
        for result in analysis_results:
            analysis = result["analysis"]
            observation = result["observation"]
            
            # 检查是否已存在相似模式
            pattern_id = f"pattern_{hash(frozenset(analysis['categories']))}"
            existing_pattern = next((p for p in patterns if p.get("pattern_id") == pattern_id), None)
            
            if existing_pattern:
                # 更新现有模式
                existing_pattern["frequency"] += 1
                existing_pattern["last_seen"] = datetime.now().isoformat()
                existing_pattern["description"] = f"重复观察到{', '.join(analysis['categories'])}模式"
            else:
                # 创建新模式
                new_pattern = {
                    "pattern_id": pattern_id,
                    "pattern_type": analysis["categories"][0] if analysis["categories"] else "unknown",
                    "description": f"新发现的{', '.join(analysis['categories'])}模式",
                    "frequency": 1,
                    "last_seen": datetime.now().isoformat(),
                    "keywords": analysis["keywords"],
                    "examples": [observation.get("content", "")[:100]]
                }
                new_patterns.append(new_pattern)
        
        # 合并模式
        all_patterns = patterns + new_patterns
        self.memory_manager.set("patterns", all_patterns)
        
        return all_patterns
    
    def link_to_knowledge(self) -> Dict[str, Any]:
        """将分析结果关联到知识积累目标，更新goal_progress
        
        Returns:
            更新结果
        """
        analysis_results = self.auto_analyze()
        patterns = self.extract_patterns()
        
        # 计算分析指标
        total_observations = len(self.memory_manager.get("observations", []))
        analyzed_count = sum(1 for obs in self.memory_manager.get("observations", []) if obs.get("analyzed", False))
        analysis_coverage = analyzed_count / total_observations if total_observations > 0 else 0
        
        # 更新目标进度
        current_goals = self.memory_manager.get("goals", [])