"""
观察分析优化技能
解决观察数据未被有效分析的问题
"""

import time
from typing import Dict, List, Any, Optional
from collections import Counter
from datetime import datetime

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能类"""
    
    # 可配置的分析阈值
    UNANALYZED_THRESHOLD: int = 2
    
    # 观察模式分类常量
    PATTERN_TYPES = {
        "error": "错误模式",
        "success": "成功模式",
        "resource": "资源使用",
        "performance": "性能指标"
    }
    
    def __init__(
        self,
        memory_manager: MemoryManager,
        threshold: Optional[int] = None,
        planning_loop: Optional[Any] = None
    ):
        """
        初始化观察分析器
        
        Args:
            memory_manager: 内存管理器实例
            threshold: 未分析观察数量阈值，默认使用类常量
            planning_loop: PlanningExecutionLoop实例，用于集成
        """
        super().__init__(name="observation_analyzer", description="观察分析优化技能")
        self.memory_manager = memory_manager
        self.threshold = threshold if threshold is not None else self.UNANALYZED_THRESHOLD
        self.planning_loop = planning_loop
        
    def get_observations(self) -> List[Dict[str, Any]]:
        """从memory的observations字段读取数据"""
        memory = self.memory_manager.get_all()
        return memory.get("observations", [])
    
    def monitor_unanalyzed(self) -> Dict[str, Any]:
        """
        阈值监控器
        追踪未分析观察数量，当超过阈值时标记为需要处理
        
        Returns:
            监控结果，包含未分析数量和是否需要处理
        """
        observations = self.get_observations()
        unanalyzed = [obs for obs in observations if not obs.get("analyzed", False)]
        unanalyzed_count = len(unanalyzed)
        needs_processing = unanalyzed_count > self.threshold
        
        return {
            "total_observations": len(observations),
            "unanalyzed_count": unanalyzed_count,
            "threshold": self.threshold,
            "needs_processing": needs_processing,
            "unanalyzed_observations": unanalyzed if needs_processing else []
        }
    
    def auto_analyze(self, observations: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """
        自动分析器
        对未分析的观察进行分类：错误模式、成功模式、资源使用、性能指标
        
        Args:
            observations: 可选的观察列表，如果未提供则从memory获取未分析的观察
            
        Returns:
            分析结果列表
        """
        if observations is None:
            observations = self.get_observations()
        
        unanalyzed = [obs for obs in observations if not obs.get("analyzed", False)]
        analysis_results = []
        
        for obs in unanalyzed:
            category = self._classify_observation(obs)
            analysis = {
                "observation_id": obs.get("id", str(time.time())),
                "original": obs,
                "category": category,
                "category_name": self.PATTERN_TYPES.get(category, "未知"),
                "analyzed_at": datetime.now().isoformat(),
                "details": self._extract_details(obs, category)
            }
            analysis_results.append(analysis)
            
            # 标记原始观察为已分析
            obs["analyzed"] = True
            obs["analysis_category"] = category
        
        # 更新memory中的observations
        if analysis_results:
            all_observations = self.get_observations()
            self.memory_manager.update("observations", all_observations)
        
        return analysis_results
    
    def _classify_observation(self, observation: Dict[str, Any]) -> str:
        """
        对单个观察进行分类
        
        Args:
            observation: 观察数据
            
        Returns:
            分类类别标识
        """
        content = str(observation).lower()
        
        # 错误模式检测
        error_keywords = ["error", "fail", "exception", "bug", "错误", "失败", "异常"]
        if any(keyword in content for keyword in error_keywords):
            return "error"
        
        # 成功模式检测
        success_keywords = ["success", "complete", "achieve", "完成", "成功", "达成"]
        if any(keyword in content for keyword in success_keywords):
            return "success"
        
        # 资源使用检测
        resource_keywords = ["memory", "cpu", "disk", "network", "内存", "磁盘", "网络", "资源"]
        if any(keyword in content for keyword in resource_keywords):
            return "resource"
        
        # 性能指标检测
        performance_keywords = ["latency", "throughput", "performance", "speed", "延迟", "吞吐", "性能", "速度"]
        if any(keyword in content for keyword in performance_keywords):
            return "performance"
        
        # 默认返回资源使用
        return "resource"
    
    def _extract_details(self, observation: Dict[str, Any], category: str) -> Dict[str, Any]:
        """
        提取观察的详细信息
        
        Args:
            observation: 观察数据
            category: 分类类别
            
        Returns:
            详细信息字典
        """
        details = {
            "timestamp": observation.get("timestamp", datetime.now().isoformat()),
            "source": observation.get("source", "unknown"),
            "content": observation.get("content", str(observation))
        }
        
        if category == "error":
            details["error_type"] = observation.get("error_type", "unknown")
            details["severity"] = observation.get("severity", "medium")
        elif category == "performance":
            details["metric_type"] = observation.get("metric_type", "unknown")
            details["value"] = observation.get("value", None)
        
        return details
    
    def extract_patterns(self, analysis_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        模式提取器
        从分析结果中识别可复用的模式，存入memory的patterns字段
        
        Args:
            analysis_results: 分析结果列表
            
        Returns:
            提取的模式列表
        """
        if not analysis_results:
            return []
        
        # 按类别分组统计
        category_counter = Counter(result["category"] for result in analysis_results)
        content_patterns = Counter()
        
        # 提取内容模式
        for result in analysis_results:
            content = str(result.get("details", {}).get("content", ""))
            # 简化内容提取关键特征
            key = f"{result['category']}:{content[:50]}"
            content_patterns[key] += 1
        
        patterns = []
        now = datetime.now().isoformat()
        
        # 为每个类别创建模式
        for category, frequency in category_counter.items():
            pattern = {
                "pattern_type": category,
                "description": f"出现{self.PATTERN_TYPES.get(category, category)}类型观察{frequency}次",
                "frequency": frequency,
                "last_seen": now
            }
            patterns.append(pattern)
        
        # 为重复出现的内容模式创建详细模式
        for key, frequency in content_patterns.items():
            if frequency > 1:
                category, content = key.split(":", 1)
                pattern = {
                    "pattern_type": category,
                    "description": f"重复观察模式: {content}...",
                    "frequency": frequency,
                    "last_seen": now
                }
                patterns.append(pattern)
        
        # 更新memory中的patterns
        existing_patterns = self.memory_manager.get("patterns", [])
        existing_patterns.extend(patterns)
        self.memory_manager.update("patterns", existing_patterns)
        
        return patterns
    
    def link_to_knowledge(self, analysis_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        知识关联器
        将分析结果关联到知识积累目标，更新goal_progress
        
        Args:
            analysis_results: 分析结果列表
            
        Returns:
            知识关联结果
        """
        # 按类别统计
        category_stats = Counter(result["category"] for result in analysis_results)
        