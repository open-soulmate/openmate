# acp-proxy/skills/observation_analysis.py

import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from concurrent.futures import TimeoutError

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory import memory_manager

logger = logging.getLogger(__name__)


class ObservationAnalysisSkill(BaseSkill):
    """
    自动化观察分析技能，用于消除观察数据积压问题。
    在每个进化周期中自动检查未分析的观察，分析最多2-3个，优先处理高价值观察。
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.skill_name = "observation_analysis"
        self.version = "1.0.0"
        self.description = "自动化观察分析技能，消除观察数据积压问题"
        
        # 默认配置
        self.default_config = {
            "max_analysis_per_cycle": 3,
            "priority_rule": "importance",
            "priority_rules": ["timestamp", "importance"],
            "analysis_timeout_seconds": 5,
            "observations_file": "data/observations.json",
            "memory_prefix": "observation_analysis",
            "enable_logging": True,
            "max_retry_count": 2,
        }
        
        # 合并配置
        self.config = {**self.default_config, **(config or {})}
        
        # 初始化路径
        self.observations_file = Path(self.config["observations_file"])
        self.memory_prefix = self.config["memory_prefix"]
        
        # 性能统计
        self.stats = {
            "total_analyzed": 0,
            "total_errors": 0,
            "total_skipped": 0,
            "last_execution_time": None,
        }
        
        logger.info(f"ObservationAnalysisSkill initialized with config: {self.config}")
    
    def execute(self, cycle_count: int) -> Dict[str, Any]:
        """
        执行观察分析技能
        
        Args:
            cycle_count: 当前进化周期数
            
        Returns:
            分析报告，包含成功分析数量、未处理数量等信息
        """
        start_time = datetime.now()
        report = {
            "cycle_count": cycle_count,
            "start_time": start_time.isoformat(),
            "analyzed_count": 0,
            "skipped_count": 0,
            "error_count": 0,
            "remaining_unanalyzed": 0,
            "analysis_details": [],
            "execution_time_seconds": 0,
        }
        
        try:
            # 1. 读取观察数据
            observations_data = self._load_observations()
            if not observations_data:
                report["status"] = "no_observations"
                logger.info(f"Cycle {cycle_count}: No observations found")
                return report
            
            # 2. 获取未分析的观察
            unanalyzed_observations = self._get_unanalyzed_observations(observations_data)
            if not unanalyzed_observations:
                report["status"] = "all_analyzed"
                report["remaining_unanalyzed"] = 0
                logger.info(f"Cycle {cycle_count}: All observations already analyzed")
                return report
            
            # 3. 按优先级排序
            prioritized_observations = self._prioritize_observations(unanalyzed_observations)
            
            # 4. 分析观察（最多分析指定数量）
            max_to_analyze = min(
                self.config["max_analysis_per_cycle"],
                len(prioritized_observations)
            )
            
            analyzed_details = []
            errors = []
            skipped = []
            
            for i, observation in enumerate(prioritized_observations[:max_to_analyze]):
                observation_id = observation.get("id", f"obs_{i}")
                analysis_result = self._analyze_single_observation(observation, cycle_count, i)
                
                if analysis_result["success"]:
                    # 更新观察状态
                    self._update_observation_status(observations_data, observation_id, "analyzed")
                    analyzed_details.append({
                        "observation_id": observation_id,
                        "analysis_result": analysis_result["result"],
                        "analysis_time": analysis_result["analysis_time"]
                    })
                else:
                    if analysis_result.get("error_type") == "timeout":
                        skipped.append(observation_id)
                        logger.warning(f"Observation {observation_id} analysis timed out")
                    else:
                        errors.append({
                            "observation_id": observation_id,
                            "error": analysis_result.get("error", "Unknown error")
                        })
                        logger.error(f"Failed to analyze observation {observation_id}: {analysis_result.get('error')}")
            
            # 5. 保存更新后的观察数据
            self._save_observations(observations_data)
            
            # 6. 更新统计信息
            self.stats["total_analyzed"] += len(analyzed_details)
            self.stats["total_errors"] += len(errors)
            self.stats["total_skipped"] += len(skipped)
            self.stats["last_execution_time"] = datetime.now().isoformat()
            
            # 7. 生成报告
            remaining_unanalyzed = len(unanalyzed_observations) - len(analyzed_details) - len(errors) - len(skipped)
            report.update({
                "status": "completed",
                "analyzed_count": len(analyzed_details),
                "skipped_count": len(skipped),
                "error_count": len(errors),
                "remaining_unanalyzed": max(0, remaining_unanalyzed),
                "analysis_details": analyzed_details,
                "errors": errors,
                "skipped_observations": skipped,
                "execution_time_seconds": (datetime.now() - start_time).total_seconds(),
            })
            
            logger.info(
                f"Cycle {cycle_count}: Analyzed {len(analyzed_details)} observations, "
                f"Errors: {len(errors)}, Skipped: {len(skipped)}, "
                f"Remaining: {remaining_unanalyzed}"
            )
            
            return report
            
        except Exception as e:
            logger.error(f"Observation analysis skill failed in cycle {cycle_count}: {str(e)}", exc_info=True)
            report.update({
                "status": "failed",
                "error": str(e),
                "execution_time_seconds": (datetime.now() - start_time).total_seconds(),
            })
            return report
    
    def _load_observations(self) -> Dict[str, Any]:
        """加载观察数据"""
        try:
            if self.observations_file.exists():
                with open(self.observations_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                # 创建默认结构
                default_data = {
                    "observations": [],
                    "metadata": {
                        "created_at": datetime.now().isoformat(),
                        "total_count": 0,
                        "unanalyzed_count": 0
                    }
                }
                return default_data
        except Exception as e:
            logger.error(f"Failed to load observations from {self.observations_file}: {e}")
            return {"observations": [], "metadata": {"unanalyzed_count": 0}}
    
    def _save_observations(self, data: Dict[str, Any]) -> bool:
        """保存观察数据"""
        try:
            # 确保目录存在
            self.observations_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.observations_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to save observations to {self.observations_file}: {e}")
            return False
    
    def _get_unanalyzed_observations(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """获取未分析的观察列表"""
        observations = data.get("observations", [])
        unanalyzed = []
        
        for obs in observations:
            if not obs.get("analyzed", False):
                unanalyzed.append(obs)
        
        # 更新元数据中的未分析计数
        if "metadata" in data:
            data["metadata"]["unanalyzed_count"] = len(unanalyzed)
        
        return unanalyzed
    