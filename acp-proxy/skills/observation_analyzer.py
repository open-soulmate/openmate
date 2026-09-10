from .base import BaseSkill
from ..memory.manager import MemoryManager
import json
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import re

class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能，解决观察数据未被有效分析的问题"""
    
    def __init__(self, memory_manager: MemoryManager):
        super().__init__(
            name="observation_analyzer",
            description="观察分析优化技能，解决观察数据未被有效分析的问题"
        )
        self.memory = memory_manager
        self.UNANALYZED_THRESHOLD = 2  # 可配置的分析阈值
        self.last_analysis_time = datetime.now()
        self.analysis_cache = {}  # 缓存分析结果
        
    def set_threshold(self, threshold: int):
        """设置分析阈值"""
        if threshold > 0:
            self.UNANALYZED_THRESHOLD = threshold
    
    def monitor_unanalyzed(self):
        """阈值监控器，追踪未分析观察数量，当超过2条时标记为需要处理"""
        observations = self.memory.get("observations", [])
        unanalyzed_count = 0
        
        for obs in observations:
            if not obs.get("analyzed", False):
                unanalyzed_count += 1
        
        # 更新内存中的监控状态
        monitor_status = {
            "unanalyzed_count": unanalyzed_count,
            "threshold_exceeded": unanalyzed_count > self.UNANALYZED_THRESHOLD,
            "last_check_time": datetime.now().isoformat(),
            "needs_analysis": unanalyzed_count > self.UNANALYZED_THRESHOLD
        }
        
        self.memory.update("observation_monitor", monitor_status)
        return monitor_status
    
    def auto_analyze(self):
        """自动分析器，对未分析的观察进行分类"""
        observations = self.memory.get("observations", [])
        analysis_results = {
            "error_patterns": [],
            "success_patterns": [],
            "resource_usage": [],
            "performance_metrics": [],
            "analysis_time": datetime.now().isoformat()
        }
        
        unanalyzed_observations = []
        for obs in observations:
            if not obs.get("analyzed", False):
                unanalyzed_observations.append(obs)
        
        for obs in unanalyzed_observations:
            # 分类观察数据
            category = self._categorize_observation(obs)
            observation_entry = {
                "observation_id": obs.get("id"),
                "content": obs.get("content"),
                "timestamp": obs.get("timestamp"),
                "category": category,
                "analysis_time": datetime.now().isoformat()
            }
            
            analysis_results[category].append(observation_entry)
            
            # 标记为已分析
            obs["analyzed"] = True
            obs["category"] = category
            obs["analysis_time"] = datetime.now().isoformat()
        
        # 更新内存中的观察数据
        self.memory.update("observations", observations)
        
        # 缓存分析结果
        self.analysis_cache = analysis_results
        
        return analysis_results
    
    def _categorize_observation(self, observation):
        """对观察进行分类"""
        content = observation.get("content", "").lower()
        
        # 错误模式识别
        error_keywords = ["error", "fail", "exception", "crash", "bug", "issue"]
        if any(keyword in content for keyword in error_keywords):
            return "error_patterns"
        
        # 成功模式识别
        success_keywords = ["success", "complete", "pass", "ok", "success"]
        if any(keyword in content for keyword in success_keywords):
            return "success_patterns"
        
        # 资源使用识别
        resource_keywords = ["memory", "cpu", "disk", "network", "resource", "usage", "utilization"]
        if any(keyword in content for keyword in resource_keywords):
            return "resource_usage"
        
        # 性能指标识别
        performance_keywords = ["time", "duration", "speed", "latency", "throughput", "performance"]
        if any(keyword in content for keyword in performance_keywords):
            return "performance_metrics"
        
        # 默认分类
        return "error_patterns"  # 默认为错误模式，以便进一步分析
    
    def extract_patterns(self, analysis_results=None):
        """模式提取器，从分析结果中识别可复用的模式"""
        if analysis_results is None:
            analysis_results = self.analysis_cache
        
        patterns = self.memory.get("patterns", [])
        new_patterns = []
        
        # 分析错误模式
        for error in analysis_results.get("error_patterns", []):
            pattern = self._extract_pattern_from_error(error)
            if pattern:
                new_patterns.append(pattern)
        
        # 分析成功模式
        for success in analysis_results.get("success_patterns", []):
            pattern = self._extract_pattern_from_success(success)
            if pattern:
                new_patterns.append(pattern)
        
        # 分析资源使用模式
        for resource in analysis_results.get("resource_usage", []):
            pattern = self._extract_pattern_from_resource(resource)
            if pattern:
                new_patterns.append(pattern)
        
        # 分析性能指标模式
        for performance in analysis_results.get("performance_metrics", []):
            pattern = self._extract_pattern_from_performance(performance)
            if pattern:
                new_patterns.append(pattern)
        
        # 更新内存中的模式
        for pattern in new_patterns:
            existing_pattern = self._find_existing_pattern(pattern, patterns)
            if existing_pattern:
                # 更新现有模式
                existing_pattern["frequency"] = existing_pattern.get("frequency", 0) + 1
                existing_pattern["last_seen"] = datetime.now().isoformat()
            else:
                # 添加新模式
                patterns.append(pattern)
        
        self.memory.update("patterns", patterns)
        
        return new_patterns
    
    def _extract_pattern_from_error(self, error):
        """从错误中提取模式"""
        content = error.get("content", "")
        
        # 提取错误模式的关键信息
        error_type = self._extract_error_type(content)
        frequency = 1
        last_seen = datetime.now().isoformat()
        
        return {
            "pattern_type": "error",
            "description": f"错误模式: {error_type}",
            "frequency": frequency,
            "last_seen": last_seen,
            "sample_observations": [error.get("observation_id")]
        }
    
    def _extract_pattern_from_success(self, success):
        """从成功中提取模式"""
        content = success.get("content", "")
        
        # 提取成功模式的关键信息
        success_type = self._extract_success_type(content)
        frequency = 1
        last_seen = datetime.now().isoformat()
        
        return {
            "pattern_type": "success",
            "description": f"成功模式: {success_type}",
            "frequency": frequency,
            "last_seen": last_seen,
            "sample_observations": [success.get("observation_id")]
        }
    
    def _extract_pattern_from_resource(self, resource):
        """从资源使用中提取模式"""
        content = resource.get("content", "")
        
        # 提取资源使用模式
        resource_type = self._extract_resource_type(content)
        frequency = 1
        last_seen = datetime.now().isoformat()
        
        return {
            "pattern_type": "resource",
            "description": f"资源使用模式: {resource_type}",
            "frequency": frequency,
            "last_seen": last_seen,
            "sample_observations": [resource.get("observation_id")]
        }
    
    def _extract_pattern_from_performance(self, performance):
        """从性能指标中提取模式"""
        content = performance.get("content", "")
        
        # 提取性能模式
        performance_type = self._extract_performance_type(content)
        frequency = 1