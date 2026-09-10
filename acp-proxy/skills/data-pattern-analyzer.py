#!/usr/bin/env python3
"""
数据模式分析器技能
Data Pattern Analyzer Skill

主动处理反思中指出的`observations_unanalyzed`数据，将其转化为结构化知识。
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import json

# 内部依赖声明
# 注意：实际导入路径可能需要根据项目结构调整
try:
    from acp_proxy.memory import MemoryStore
except ImportError:
    # 模拟导入，实际使用时替换为真实模块
    class MemoryStore:
        def query_observations(self, *args, **kwargs):
            return []
        def add_memory(self, *args, **kwargs):
            pass
        def update_observation_status(self, *args, **kwargs):
            pass

# 配置日志
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class DataPatternAnalyzer:
    """
    数据模式分析器技能
    
    分析未处理的观察数据，识别模式，并生成结构化知识。
    """
    
    def __init__(self, config: Optional[Dict] = None):
        """
        初始化数据模式分析器
        
        Args:
            config: 配置字典，可选参数覆盖默认值
        """
        self.memory_store = MemoryStore()
        self.config = self._load_config(config)
        
        logger.info(f"数据模式分析器已初始化，配置: {self.config}")
    
    def _load_config(self, config: Optional[Dict] = None) -> Dict:
        """加载配置，优先级：传入参数 > 环境变量 > 默认值"""
        default_config = {
            "analysis_window_days": 7,  # 分析过去7天的数据
            "min_pattern_frequency": 3,  # 模式最小出现次数阈值
            "max_clusters": 10,  # 最大聚类数
            "enable_time_series_analysis": True,
            "enable_clustering": True
        }
        
        if config:
            default_config.update(config)
        
        # 从环境变量覆盖
        env_mapping = {
            "ANALYSIS_WINDOW_DAYS": ("analysis_window_days", int),
            "MIN_PATTERN_FREQUENCY": ("min_pattern_frequency", int),
            "MAX_CLUSTERS": ("max_clusters", int),
        }
        
        for env_var, (config_key, type_func) in env_mapping.items():
            env_value = os.getenv(env_var)
            if env_value:
                try:
                    default_config[config_key] = type_func(env_value)
                    logger.info(f"从环境变量 {env_var} 加载配置: {config_key}={env_value}")
                except ValueError as e:
                    logger.warning(f"解析环境变量 {env_var} 失败: {e}")
        
        return default_config
    
    def analyze_unprocessed_observations(self) -> Dict[str, Any]:
        """
        主入口方法：协调整个分析流程
        
        Returns:
            分析结果报告字典
        """
        logger.info("开始分析未处理的观察数据")
        start_time = datetime.now()
        
        try:
            # 步骤1: 获取未处理的观察数据
            observations = self._fetch_unprocessed_observations()
            
            if not observations:
                logger.info("没有找到未处理的观察数据")
                return {
                    "analysis_timestamp": start_time.isoformat(),
                    "summary": "没有找到未处理的观察数据",
                    "patterns": [],
                    "suggested_actions": []
                }
            
            logger.info(f"获取到 {len(observations)} 条未处理的观察数据")
            
            # 步骤2: 执行模式分析
            analysis_results = self._analyze_patterns(observations)
            
            # 步骤3: 生成结构化报告
            report = self._generate_report(analysis_results, start_time)
            
            # 步骤4: 存储知识并更新数据状态
            self._store_knowledge_and_update_status(report, observations)
            
            logger.info(f"分析完成，发现 {len(report['patterns'])} 个模式")
            
            return report
            
        except Exception as e:
            logger.error(f"分析过程中发生错误: {str(e)}", exc_info=True)
            error_report = {
                "analysis_timestamp": start_time.isoformat(),
                "error": str(e),
                "status": "failed",
                "summary": f"分析失败: {str(e)}"
            }
            return error_report
    
    def _fetch_unprocessed_observations(self) -> List[Dict]:
        """获取未处理的观察数据"""
        logger.info("正在获取未处理的观察数据")
        
        # 计算时间窗口
        analysis_window = timedelta(days=self.config["analysis_window_days"])
        since_time = datetime.now() - analysis_window
        
        # 调用数据访问层获取数据
        # 注意：这里假设MemoryStore有相应的方法，实际实现可能不同
        try:
            # 尝试获取未处理的观察数据
            observations = self.memory_store.query_observations(
                status="unprocessed",
                since=since_time.isoformat()
            )
            
            # 如果查询结果为空，尝试获取标记为observations_unanalyzed的数据
            if not observations:
                observations = self.memory_store.query_observations(
                    counter_name="observations_unanalyzed",
                    since=since_time.isoformat()
                )
            
            return observations
            
        except AttributeError as e:
            logger.warning(f"MemoryStore方法调用失败，使用模拟数据: {e}")
            # 返回模拟数据用于演示
            return self._get_mock_observations()
    
    def _get_mock_observations(self) -> List[Dict]:
        """获取模拟观察数据（用于演示）"""
        return [
            {
                "id": "obs_001",
                "type": "user_query",
                "content": "如何实现一个REST API?",
                "timestamp": "2024-01-15T10:30:00Z",
                "status": "unprocessed",
                "metadata": {"user_id": "user_123"}
            },
            {
                "id": "obs_002",
                "type": "error",
                "content": "TypeError: Cannot read property 'id' of undefined",
                "timestamp": "2024-01-15T11:20:00Z",
                "status": "unprocessed",
                "metadata": {"module": "user_service"}
            },
            {
                "id": "obs_003",
                "type": "tool_call",
                "content": "Called external API /api/v1/data",
                "timestamp": "2024-01-15T12:15:00Z",
                "status": "unprocessed",
                "metadata": {"response_time": "450ms"}
            },
            {
                "id": "obs_004",
                "type": "user_query",
                "content": "这个错误怎么解决？",
                "timestamp": "2024-01-16T09:45:00Z",
                "status": "unprocessed",
                "metadata": {"user_id": "user_456"}
            },
            {
                "id": "obs_005",
                "type": "error",
                "content": "TypeError: Cannot read property 'id' of undefined",
                "timestamp": "2024-01-16T10:30:00Z",
                "status": "unprocessed",
                "metadata": {"module": "user_service"}
            }
        ]
    
    def _analyze_patterns(self, observations: List[Dict]) -> Dict[str, Any]:
        """执行模式分析"""
        logger.info("开始执行模式分析")
        
        analysis_results = {
            "frequency_analysis": {},
            "time_series_analysis": {},
            "cluster_analysis": {}
        }
        
        # 频率分析
        analysis_results["frequency_analysis"] = self._frequency_analysis(observations)
        
        # 时间序列分析（如果启用）
        if self.config["enable_time_series_analysis"]:
            analysis_results["time_series_analysis"] = self._time_series_analysis(observations)
        