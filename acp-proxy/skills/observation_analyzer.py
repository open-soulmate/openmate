import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from .base import BaseSkill
from ..memory.manager import MemoryManager

class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能"""
    
    UNANALYZED_THRESHOLD = 2  # 可配置的未分析观察阈值
    
    def __init__(self, memory_manager: MemoryManager, loop=None):
        """
        初始化观察分析器
        
        Args:
            memory_manager: 内存管理器实例
            loop: 计划执行循环实例，用于集成
        """
        super().__init__(
            name="observation_analyzer",
            description="观察分析优化技能，解决观察数据未被有效分析的问题"
        )
        self.memory_manager = memory_manager
        self.loop = loop  # 计划执行循环实例
        
    def _get_observations(self) -> List[Dict[str, Any]]:
        """从内存中获取观察数据"""
        memory = self.memory_manager.get_memory()
        return memory.get("observations", [])
    
    def _save_patterns(self, patterns: List[Dict[str, Any]]):
        """将提取的模式保存到内存"""
        memory = self.memory_manager.get_memory()
        memory.setdefault("patterns", []).extend(patterns)
        self.memory_manager.save_memory(memory)
    
    def monitor_unanalyzed(self) -> Dict[str, Any]:
        """
        阈值监控器：追踪未分析观察数量，当超过阈值时标记为需要处理
        
        Returns:
            监控结果，包含未分析数量和是否需要处理
        """
        observations = self._get_observations()
        unanalyzed = [obs for obs in observations if not obs.get("analyzed", False)]
        unanalyzed_count = len(unanalyzed)
        
        result = {
            "unanalyzed_count": unanalyzed_count,
            "threshold": self.UNANALYZED_THRESHOLD,
            "needs_attention": unanalyzed_count > self.UNANALYZED_THRESHOLD,
            "unanalyzed_observations": unanalyzed[:5]  # 只返回前5条，避免数据过多
        }
        
        # 如果超过阈值且有循环实例，触发集成
        if result["needs_attention"] and self.loop:
            self._integrate_with_loop(unanalyzed_count)
            
        return result
    
    def auto_analyze(self) -> List[Dict[str, Any]]:
        """
        自动分析器：对未分析的观察进行分类
        
        Returns:
            分析结果列表
        """
        observations = self._get_observations()
        analysis_results = []
        
        for obs in observations:
            if obs.get("analyzed", False):
                continue
                
            content = obs.get("content", "")
            timestamp = obs.get("timestamp", datetime.now().isoformat())
            
            # 分类逻辑
            category = self._classify_observation(content)
            
            result = {
                "observation_id": obs.get("id"),
                "content": content,
                "timestamp": timestamp,
                "category": category,
                "analyzed_at": datetime.now().isoformat(),
                "analysis_version": "1.0"
            }
            
            analysis_results.append(result)
            
            # 更新原始观察为已分析
            obs["analyzed"] = True
            obs["analysis"] = result
            
        # 保存更新后的观察数据
        memory = self.memory_manager.get_memory()
        memory["observations"] = observations
        self.memory_manager.save_memory(memory)
        
        # 提取模式
        if analysis_results:
            patterns = self.extract_patterns(analysis_results)
            self._save_patterns(patterns)
            
            # 关联到知识积累目标
            self.link_to_knowledge(analysis_results)
            
        return analysis_results
    
    def _classify_observation(self, content: str) -> str:
        """
        对观察内容进行分类
        
        Args:
            content: 观察内容
            
        Returns:
            分类结果
        """
        content_lower = content.lower()
        
        # 错误模式
        if any(keyword in content_lower for keyword in ["error", "错误", "失败", "异常", "故障", "失败"]):
            return "error_pattern"
        
        # 成功模式
        if any(keyword in content_lower for keyword in ["success", "成功", "完成", "正常", "通过"]):
            return "success_pattern"
        
        # 资源使用
        if any(keyword in content_lower for keyword in ["memory", "内存", "cpu", "disk", "磁盘", "资源"]):
            return "resource_usage"
        
        # 性能指标
        if any(keyword in content_lower for keyword in ["performance", "性能", "time", "时间", "speed", "速度"]):
            return "performance_metric"
        
        return "unknown"
    
    def extract_patterns(self, analysis_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        模式提取器：从分析结果中识别可复用的模式
        
        Args:
            analysis_results: 分析结果列表
            
        Returns:
            提取的模式列表
        """
        patterns = []
        pattern_map = {}  # 用于合并相似模式
        
        for result in analysis_results:
            pattern_key = f"{result['category']}_{hash(result['content'][:100])}"
            
            if pattern_key in pattern_map:
                # 更新现有模式
                pattern_map[pattern_key]["frequency"] += 1
                pattern_map[pattern_key]["last_seen"] = result["timestamp"]
                # 更新描述（取最新内容）
                pattern_map[pattern_key]["description"] = result["content"]
            else:
                # 创建新模式
                new_pattern = {
                    "pattern_type": result["category"],
                    "description": result["content"],
                    "frequency": 1,
                    "last_seen": result["timestamp"],
                    "first_seen": result["timestamp"],
                    "examples": [result["observation_id"]]
                }