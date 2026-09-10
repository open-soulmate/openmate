"""
AutoAnalysisSkill - 自动观察分析技能
定期分析 observations_unanalyzed 中的新观察记录，提取模式、洞察并更新内部知识库。
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from acp_proxy.skills.base_skill import BaseSkill
from acp_proxy.llm import LLMClient
from acp_proxy.memory import MemoryStore
from acp_proxy.utils.retry import retry_with_backoff

logger = logging.getLogger(__name__)


class AutoAnalysisSkill(BaseSkill):
    """
    自动观察分析技能
    
    功能：
    - 定期分析未处理的观察记录
    - 提取关键实体、情感、事件、用户偏好和潜在模式
    - 将分析结果整合到长期记忆或知识库
    - 智能调度和批量处理
    """

    # 技能元数据
    name = "auto_analysis"
    description = "自动观察分析技能 - 定期分析观察记录并更新知识库"
    version = "1.0.0"

    # 默认配置
    DEFAULT_CONFIG = {
        "batch_size": 10,                    # 每批处理的记录数
        "max_records_per_run": 100,          # 单次运行最大处理记录数
        "analysis_threshold": 5,             # 触发分析的数量阈值
        "max_concurrent_analyses": 3,        # 最大并发分析数
        "enable_deduplication": True,        # 启用知识去重
        "confidence_threshold": 0.6,         # 知识置信度阈值
        "store_raw_analysis": True,          # 存储原始分析结果
        "retry_attempts": 3,                 # 重试次数
        "retry_delay_seconds": 1,            # 重试延迟
    }

    # 分析提示模板
    ANALYSIS_PROMPT = """你是一个专业的观察分析系统。请分析以下观察记录，提取有价值的信息。

观察记录：
{observation}

请以JSON格式返回分析结果，包含以下字段：
{{
    "entities": ["提取的关键实体列表"],
    "sentiment": "positive/negative/neutral - 情感倾向",
    "event_type": "事件类型分类",
    "summary": "简要摘要",
    "user_preferences": ["用户偏好列表"],
    "patterns": ["识别的模式列表"],
    "insights": ["关键洞察列表"],
    "importance_score": 0.0-1.0 的重要性分数,
    "confidence": 0.0-1.0 的分析置信度
}}"""

    BATCH_ANALYSIS_PROMPT = """你是一个专业的观察分析系统。请批量分析以下观察记录，提取有价值的信息。

观察记录列表：
{observations}

请以JSON格式返回分析结果，包含一个results数组：
{{
    "results": [
        {{
            "record_index": 记录索引,
            "entities": ["提取的关键实体列表"],
            "sentiment": "positive/negative/neutral",
            "event_type": "事件类型",
            "summary": "简要摘要",
            "user_preferences": ["用户偏好"],
            "patterns": ["模式"],
            "insights": ["洞察"],
            "importance_score": 0.0-1.0,
            "confidence": 0.0-1.0
        }}
    ],
    "cross_record_patterns": ["跨记录的模式"],
    "aggregate_insights": ["聚合洞察"]
}}"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化 AutoAnalysisSkill
        
        Args:
            config: 可选配置字典，覆盖默认配置
        """
        super().__init__()
        self.config = {**self.DEFAULT_CONFIG, **(config or {})}
        
        # 初始化组件
        self.llm_client = LLMClient()
        self.memory_store = MemoryStore()
        
        # 状态跟踪
        self._processing_stats = {
            "total_processed": 0,
            "new_knowledge_count": 0,
            "updated_knowledge_count": 0,
            "errors": 0,
            "skipped_duplicates": 0,
            "last_run_time": None,
            "last_run_duration_seconds": 0,
            "is_running": False,
        }
        
        # 知识去重缓存
        self._knowledge_cache: Dict[str, str] = {}
        
        # 信号量控制并发
        self._semaphore = asyncio.Semaphore(self.config["max_concurrent_analyses"])

    async def initialize(self) -> None:
        """初始化技能，加载知识缓存"""
        try:
            # 加载现有知识库的哈希用于去重
            existing_knowledge = await self.memory_store.get_all("analyzed_knowledge_base")
            for entry in existing_knowledge:
                content_hash = self._compute_content_hash(entry.get("content", ""))
                if content_hash:
                    self._knowledge_cache[content_hash] = entry.get("id", "")
            
            logger.info(f"AutoAnalysisSkill initialized. Loaded {len(self._knowledge_cache)} knowledge entries for deduplication.")
        except Exception as e:
            logger.warning(f"Failed to load knowledge cache during initialization: {e}")

    async def execute(self, trigger_reason: str = "scheduled") -> Dict[str, Any]:
        """
        执行分析任务
        
        Args:
            trigger_reason: 触发原因 ("scheduled" | "threshold" | "manual")
            
        Returns:
            包含处理统计信息的结果字典
        """
        if self._processing_stats["is_running"]:
            logger.warning("AutoAnalysisSkill is already running, skipping execution.")
            return {"status": "skipped", "reason": "already_running"}

        self._processing_stats["is_running"] = True
        start_time = datetime.now()
        
        logger.info(f"AutoAnalysisSkill execution started. Trigger: {trigger_reason}")

        try:
            # 1. 获取未分析的观察记录
            unanalyzed_records = await self._fetch_unanalyzed_records()
            
            if not unanalyzed_records:
                logger.info("No unanalyzed records found.")
                return self._build_result("completed", "no_records", start_time)

            # 2. 限制处理数量
            records_to_process = unanalyzed_records[:self.config["max_records_per_run"]]
            total_records = len(records_to_process)
            
            logger.info(f"Processing {total_records} records (of {len(unanalyzed_records)} total unanalyzed).")

            # 3. 分批处理
            processed_count = 0
            new_knowledge_count = 0
            error_count = 0
            
            batches = self._create_batches(records_to_process, self.config["batch_size"])
            
            for batch_index, batch in enumerate(batches):
                logger.info(f"Processing batch {batch_index + 1}/{len(batches)} ({len(batch)} records)")
                
                batch_results = await self._process_batch(batch)
                
                for result in batch_results:
                    if result["success"]:
                        processed_count += 1
                        new_knowledge_count += result["new_knowledge_count"]
                    else:
                        error_count += 1

            # 4. 更新统计信息
            self._processing_stats["total_processed"] += processed_count
            self._processing_stats["new_knowledge_count"] += new_knowledge_count
            self._processing_stats["errors"] += error_count
            self._processing_stats["last_run_time"] = datetime.now().isoformat()
            
            duration = (datetime.now() - start_time).total_seconds()
            self._processing_stats["last_run_duration_seconds"] = duration

            status = "completed" if error_count == 0 else "completed_with_errors"
            logger.info(f"AutoAnalysisSkill execution completed. Processed: {processed_count}, New knowledge: {new_knowledge_count}, Errors: {error_count}, Duration: {duration:.2f}s")
            
            return self._build_result(status, "success", start_time)

        except Exception as e:
            logger.error(f"AutoAnalysisSkill execution failed: {e}", exc_info=True)
            return self._build_result("failed", str(e), start_time)
        
        finally:
            self._processing_stats["is_running"] = False
