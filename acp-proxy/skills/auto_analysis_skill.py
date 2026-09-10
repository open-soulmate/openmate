import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from collections import defaultdict

from ..skills.base import BaseSkill
from ..memory.knowledge_manager import KnowledgeManager
from ..analysis.observation_analyzer import ObservationAnalyzer

logger = logging.getLogger(__name__)


class AutoAnalysisSkill(BaseSkill):
    """
    自动观察分析技能，定期分析未处理的观察记录，提取模式和洞察，
    更新内部知识库以优化学习循环和减少数据处理积压。
    """

    def __init__(
        self,
        knowledge_manager: KnowledgeManager,
        observation_analyzer: ObservationAnalyzer,
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(name="auto_analysis", version="1.0.0")
        self.knowledge_manager = knowledge_manager
        self.observation_analyzer = observation_analyzer
        self.config = config or {}
        
        # 默认配置
        self.batch_size = self.config.get("batch_size", 50)
        self.min_observations_trigger = self.config.get("min_observations_trigger", 10)
        self.time_interval_minutes = self.config.get("time_interval_minutes", 30)
        self.last_run_time = None
        
        # 处理状态统计
        self.stats = {
            "total_processed": 0,
            "new_knowledge_items": 0,
            "failed_records": 0,
            "last_run": None,
            "batch_runs": 0
        }

    async def execute(
        self,
        observations: Optional[List[Dict[str, Any]]] = None,
        force_run: bool = False
    ) -> Dict[str, Any]:
        """
        主要执行方法，由调度器定期调用。
        
        Args:
            observations: 可选的观察列表，如果提供则处理这些；否则从待处理队列获取
            force_run: 是否强制执行（忽略时间间隔和阈值）
            
        Returns:
            处理状态字典
        """
        try:
            # 检查是否应该运行
            if not force_run and not self._should_run(observations):
                logger.info("分析技能跳过执行：未达到触发条件")
                return {"status": "skipped", "stats": self.stats}

            logger.info("开始自动观察分析")
            
            # 获取观察数据
            observations_to_process = observations or await self._fetch_observations()
            if not observations_to_process:
                logger.info("没有待处理的观察记录")
                return {"status": "completed", "stats": self.stats}
            
            # 批量处理
            batch_results = await self._process_in_batches(observations_to_process)
            
            # 更新统计信息
            self._update_stats(batch_results)
            
            logger.info(
                f"自动分析完成: 处理 {batch_results['processed']} 条观察记录, "
                f"新增 {batch_results['new_knowledge']} 条知识, "
                f"失败 {batch_results['failed']} 条"
            )
            
            return {"status": "completed", "stats": self.stats, "batch_results": batch_results}
            
        except Exception as e:
            logger.error(f"自动分析技能执行失败: {str(e)}", exc_info=True)
            return {"status": "error", "error": str(e), "stats": self.stats}

    def _should_run(self, observations: Optional[List[Dict[str, Any]]]) -> bool:
        """判断是否应该运行分析"""
        current_time = datetime.now()
        
        # 如果提供了观察数据，总是运行
        if observations:
            return True
        
        # 检查时间间隔
        if self.last_run_time:
            time_since_last = (current_time - self.last_run_time).total_seconds() / 60
            if time_since_last < self.time_interval_minutes:
                return False
        
        return True

    async def _fetch_observations(self) -> List[Dict[str, Any]]:
        """从待处理队列获取观察记录"""
        # 这里应该从实际的数据源获取未分析的观察记录
        # 实现取决于系统的数据管理方式
        # 临时实现：假设有一个全局的观察队列
        try:
            # 实际实现应调用数据管理器获取未分析观察
            # observations = await self.data_manager.get_unanalyzed_observations(
            #     limit=self.batch_size * 2  # 获取足够多的数据用于批量处理
            # )
            
            # 临时示例实现
            observations = []
            logger.debug(f"获取到 {len(observations)} 条待处理观察记录")
            return observations
        except Exception as e:
            logger.error(f"获取观察记录失败: {str(e)}")
            return []

    async def _process_in_batches(
        self, observations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """批量处理观察记录"""
        results = {
            "processed": 0,
            "new_knowledge": 0,
            "failed": 0,
            "batches_processed": 0,
            "errors": []
        }
        
        # 分割成批次
        batches = [
            observations[i:i + self.batch_size] 
            for i in range(0, len(observations), self.batch_size)
        ]
        
        for batch_idx, batch in enumerate(batches, 1):
            try:
                logger.info(f"处理批次 {batch_idx}/{len(batches)}: {len(batch)} 条记录")
                
                # 批量分析
                batch_results = await self._analyze_batch(batch)
                
                # 知识整合
                knowledge_results = await self._integrate_knowledge(batch_results)
                
                # 更新状态
                await self._update_observation_status(batch, knowledge_results)
                
                # 更新统计
                results["processed"] += len(batch)
                results["new_knowledge"] += knowledge_results["new_items"]
                results["failed"] += len(batch) - len(batch_results.get("successful", []))
                results["batches_processed"] += 1
                
                if batch_results.get("errors"):
                    results["errors"].extend(batch_results["errors"])
                    
            except Exception as e:
                logger.error(f"批次 {batch_idx} 处理失败: {str(e)}")