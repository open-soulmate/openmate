"""
观察分析技能模块
用于消除观察数据积压问题，在每个进化周期中自动分析未处理的观察。
"""

import json
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

# 导入基础技能类
try:
    from .base import BaseSkill
except ImportError:
    # 兼容直接运行测试的情况
    class BaseSkill:
        """基础技能类占位符"""
        def __init__(self, name: str, config: Dict[str, Any] = None):
            self.name = name
            self.config = config or {}
            self.logger = logging.getLogger(name)
        
        def execute(self, *args, **kwargs) -> Dict[str, Any]:
            raise NotImplementedError


# 配置日志
logger = logging.getLogger(__name__)


@dataclass
class Observation:
    """观察数据类"""
    id: str
    content: str
    timestamp: str
    importance_score: float = 0.5
    analyzed: bool = False
    analysis_result: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalysisReport:
    """分析报告数据类"""
    cycle_count: int
    analyzed_count: int
    skipped_count: int
    failed_count: int
    remaining_unanalyzed: int
    analysis_results: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[Dict[str, str]] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class ObservationAnalysisSkill(BaseSkill):
    """
    自动化观察分析技能
    
    功能：
    - 在每个进化周期自动检查并分析未处理的观察
    - 优先处理高价值观察（基于时间戳或重要性评分）
    - 限制每周期分析数量，避免资源过度使用
    - 记录分析结果到记忆系统，支持知识积累
    """
    
    # 默认配置
    DEFAULT_CONFIG = {
        "max_analysis_per_cycle": 3,
        "priority_rule": "timestamp",  # 可选: "timestamp", "importance", "hybrid"
        "analysis_timeout_seconds": 5,
        "observations_file": "acp-proxy/data/observations.json",
        "memory_dir": "acp-proxy/memory/",
        "enable_pattern_recognition": True,
        "enable_data_integration": True,
        "log_level": "INFO"
    }
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        初始化观察分析技能
        
        Args:
            config: 配置字典，覆盖默认配置
        """
        # 合并配置
        merged_config = {**self.DEFAULT_CONFIG, **(config or {})}
        super().__init__(name="ObservationAnalysisSkill", config=merged_config)
        
        # 应用配置
        self.max_analysis_per_cycle = self.config.get("max_analysis_per_cycle", 3)
        self.priority_rule = self.config.get("priority_rule", "timestamp")
        self.analysis_timeout = self.config.get("analysis_timeout_seconds", 5)
        self.observations_file = Path(self.config.get("observations_file", "acp-proxy/data/observations.json"))
        self.memory_dir = Path(self.config.get("memory_dir", "acp-proxy/memory/"))
        
        # 确保目录存在
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.observations_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 初始化观察存储
        self._initialize_storage()
        
        logger.info(f"ObservationAnalysisSkill 初始化完成，配置: max={self.max_analysis_per_cycle}, priority={self.priority_rule}")
    
    def _initialize_storage(self):
        """初始化观察数据存储"""
        if not self.observations_file.exists():
            self._save_observations({"observations": [], "unanalyzed_count": 0})
            logger.info(f"创建观察存储文件: {self.observations_file}")
    
    def execute(self, cycle_count: int = 0) -> Dict[str, Any]:
        """
        执行观察分析任务
        
        Args:
            cycle_count: 当前进化周期计数
            
        Returns:
            分析报告字典
        """
        logger.info(f"开始执行观察分析，周期: {cycle_count}")
        
        # 加载观察数据
        observations_data = self._load_observations()
        unanalyzed_count = observations_data.get("unanalyzed_count", 0)
        
        # 初始化报告
        report = AnalysisReport(
            cycle_count=cycle_count,
            analyzed_count=0,
            skipped_count=0,
            failed_count=0,
            remaining_unanalyzed=unanalyzed_count
        )
        
        # 检查是否有未分析的观察
        if unanalyzed_count <= 0:
            logger.info("无未分析的观察，跳过分析")
            return self._report_to_dict(report)
        
        # 确定本周期要分析的数量
        analysis_count = min(self.max_analysis_per_cycle, unanalyzed_count)
        logger.info(f"计划分析 {analysis_count} 个观察（未处理: {unanalyzed_count}）")
        
        # 获取并排序未分析的观察
        observations = observations_data.get("observations", [])
        unanalyzed_observations = [obs for obs in observations if not obs.get("analyzed", False)]
        prioritized_observations = self._prioritize_observations(unanalyzed_observations)
        
        # 分析观察
        for i in range(min(analysis_count, len(prioritized_observations))):
            observation = prioritized_observations[i]
            
            try:
                # 带超时的分析
                analysis_result = self._analyze_observation_with_timeout(observation)
                
                if analysis_result:
                    # 更新观察状态
                    self._update_observation_status(observation["id"], analysis_result)
                    
                    # 记录到记忆系统
                    self._save_to_memory(observation, analysis_result, cycle_count)
                    
                    report.analyzed_count += 1
                    report.analysis_results.append({
                        "observation_id": observation["id"],
                        "result": analysis_result
                    })
                    
                    logger.debug(f"成功分析观察: {observation['id']}")
                else:
                    report.skipped_count += 1
                    logger.warning(f"跳过观察: {observation['id']}")
                    
            except TimeoutError:
                report.failed_count += 1
                report.errors.append({
                    "observation_id": observation["id"],
                    "error": "分析超时"
                })
                logger.error(f"分析超时: {observation['id']}")
                
            except Exception as e:
                report.failed_count += 1
                report.errors.append({
                    "observation_id": observation["id"],
                    "error": str(e)
                })
                logger.error(f"分析失败: {observation['id']}, 错误: {e}")
        
        # 更新未分析计数
        observations_data = self._load_observations()
        report.remaining_unanalyzed = observations_data.get("unanalyzed_count", 0)
        
        logger.info(f"分析完成: 成功={report.analyzed_count}, 跳过={report.skipped_count}, "
                    f"失败={report.failed_count}, 剩余={report.remaining_unanalyzed}")
        
        return self._report_to_dict(report)
    
    def _load_observations(self) -> Dict[str, Any]:
        """
        加载观察数据
        
        Returns:
            观察数据字典
        """
        try:
            if self.observations_file.exists():
                with open(self.observations_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"加载观察数据失败: {e}")
        
        return {"observations": [], "unanalyzed_count": 0}
    
    def _save_observations(self, data: Dict[str, Any]):
        """
        保存观察数据
        
        Args:
            data: 观察数据字典
        """
        try:
            # 计算未分析数量
            observations = data.get("observations", [])
            unanalyzed_count = sum(1 for obs in observations if not obs.get("analyzed", False))
            data["unanalyzed_count"] = unanalyzed_count
            
            with open(self.observations_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
        except IOError as e:
            logger.error(f"保存观察数据失败: {e}")
            raise
    