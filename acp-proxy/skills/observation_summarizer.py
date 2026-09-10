import asyncio
import json
import time
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Protocol
from abc import ABC, abstractmethod
import uuid

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BaseSkill(ABC):
    """基础技能类，所有技能都需要继承此类"""
    
    @abstractmethod
    async def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行技能的抽象方法"""
        pass


class ObservationStorage(Protocol):
    """观测存储的接口协议"""
    
    async def get_unanalyzed_observations(self, batch_size: int = 10) -> List[Dict[str, Any]]:
        """获取未分析的观测数据"""
        pass
    
    async def mark_as_analyzed(self, observation_ids: List[str]) -> bool:
        """将观测标记为已分析"""
        pass
    
    async def get_pending_count(self) -> int:
        """获取待处理观测数量"""
        pass


class MemoryStorage(Protocol):
    """记忆存储的接口协议"""
    
    async def save_memory(self, memory_entry: Dict[str, Any]) -> bool:
        """保存记忆条目"""
        pass
    
    async def search_related_memories(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """搜索相关记忆"""
        pass


class LLMInterface(Protocol):
    """LLM接口协议"""
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """生成文本"""
        pass


class ObservationSummarizer(BaseSkill):
    """观测总结器技能：处理未分析的观测数据并生成结构化洞察"""
    
    def __init__(
        self,
        observation_storage: ObservationStorage,
        memory_storage: MemoryStorage,
        llm: LLMInterface,
        batch_size: int = 10,
        confidence_threshold: float = 0.7
    ):
        """
        初始化观测总结器
        
        Args:
            observation_storage: 观测存储实现
            memory_storage: 记忆存储实现
            llm: LLM接口实现
            batch_size: 每次处理的观测批次大小
            confidence_threshold: 置信度阈值
        """
        self.observation_storage = observation_storage
        self.memory_storage = memory_storage
        self.llm = llm
        self.batch_size = batch_size
        self.confidence_threshold = confidence_threshold
        self.processing_stats = {
            "processed": 0,
            "generated_memories": 0,
            "errors": 0,
            "skipped": 0
        }
        
    async def execute(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        执行观测总结处理
        
        Args:
            context: 执行上下文（可选）
            
        Returns:
            执行结果摘要
        """
        start_time = time.time()
        logger.info("开始执行观测总结处理")
        
        try:
            # 重置统计信息
            self._reset_stats()
            
            # 获取待处理观测数量
            pending_count = await self.observation_storage.get_pending_count()
            logger.info(f"发现 {pending_count} 条待处理观测")
            
            if pending_count == 0:
                return self._generate_summary_report(
                    message="没有待处理的观测数据",
                    duration=time.time() - start_time
                )
            
            # 分批处理
            total_processed = 0
            while total_processed < pending_count:
                batch_count = min(self.batch_size, pending_count - total_processed)
                
                try:
                    # 获取一批未分析的观测
                    observations = await self.observation_storage.get_unanalyzed_observations(batch_count)
                    
                    if not observations:
                        logger.warning("获取观测数据为空，跳过本次处理")
                        break
                    
                    # 处理这一批观测
                    result = await self._process_batch(observations)
                    
                    # 更新统计
                    self.processing_stats["processed"] += result["processed"]
                    self.processing_stats["generated_memories"] += result["memories_generated"]
                    self.processing_stats["errors"] += result["errors"]
                    self.processing_stats["skipped"] += result["skipped"]
                    
                    total_processed += len(observations)
                    
                    # 避免过于频繁的处理
                    if total_processed < pending_count:
                        await asyncio.sleep(1)
                        
                except Exception as e:
                    logger.error(f"处理观测批次时出错: {str(e)}")
                    self.processing_stats["errors"] += 1
                    # 继续处理下一批
                    continue
            
            # 生成摘要报告
            report = self._generate_summary_report(
                message=f"成功处理 {self.processing_stats['processed']} 条观测数据",
                duration=time.time() - start_time
            )
            
            logger.info(f"观测总结处理完成: {report}")
            return report
            
        except Exception as e:
            logger.error(f"观测总结技能执行失败: {str(e)}")
            return self._generate_summary_report(
                message=f"执行失败: {str(e)}",
                duration=time.time() - start_time,
                success=False
            )
    
    async def _process_batch(self, observations: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        处理一批观测数据
        
        Args:
            observations: 观测数据列表
            
        Returns:
            处理结果统计
        """
        result = {
            "processed": 0,
            "memories_generated": 0,
            "errors": 0,
            "skipped": 0,
            "observation_ids": []
        }
        
        for observation in observations:
            try:
                # 检查观测数据有效性
                if not self._validate_observation(observation):
                    logger.warning(f"跳过无效观测数据: {observation.get('id')}")
                    result["skipped"] += 1
                    continue
                
                # 生成分析提示
                prompt = self._create_analysis_prompt(observation)
                
                # 调用LLM进行分析
                analysis = await self._analyze_with_llm(prompt)
                
                if not analysis:
                    logger.warning(f"LLM分析失败，跳过观测 {observation.get('id')}")
                    result["errors"] += 1
                    continue
                
                # 解析和格式化分析结果
                knowledge_entries = self._parse_analysis_response(analysis, observation)
                
                # 保存到记忆存储
                saved_count = await self._save_to_memory(knowledge_entries)
                
                if saved_count > 0:
                    result["memories_generated"] += saved_count
                    result["observation_ids"].append(observation.get("id"))
                
                result["processed"] += 1
                
            except Exception as e:
                logger.error(f"处理观测 {observation.get('id')} 时出错: {str(e)}")
                result["errors"] += 1
                continue
        
        # 将已处理的观测标记为已分析
        if result["observation_ids"]:
            try:
                await self.observation_storage.mark_as_analyzed(result["observation_ids"])
                logger.info(f"已标记 {len(result['observation_ids'])} 条观测为已分析")
            except Exception as e:
                logger.error(f"标记观测为已分析时失败: {str(e)}")
        
        return result
    
    def _validate_observation(self, observation: Dict[str, Any]) -> bool:
        """验证观测数据有效性"""
        required_fields = ["id", "content", "timestamp", "source"]