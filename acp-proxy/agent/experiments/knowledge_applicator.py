"""
knowledge_applicator.py
Knowledge Applicator Plugin - 自动将积累的知识应用到任务决策中
"""

import asyncio
import json
import logging
import re
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

import numpy as np
from sentence_transformers import SentenceTransformer
import faiss

from acp_proxy.plugin_base import PluginBase
from acp_proxy.memory.memory_store import MemoryStore

logger = logging.getLogger(__name__)

class KnowledgeApplicator(PluginBase):
    """
    知识应用器插件 - 将积累的知识主动应用到当前任务决策中
    实现"记忆驱动的决策"，提升知识积累的实用性和质量
    """
    
    def __init__(self):
        super().__init__(
            name="knowledge_applicator",
            description="将积累的知识应用到任务决策中",
            version="1.0.0",
            priority=100,  # 高优先级，确保在其他插件之前执行
            trigger_condition="pre_task"  # 任务前触发
        )
        
        # 插件配置
        self.enabled = True
        self.timeout = 5.0  # 检索超时时间（秒）
        self.max_knowledge_items = 5  # 最大检索知识条数
        self.similarity_threshold = 0.3  # 相似度阈值
        self.knowledge_formats = {
            "user_preference": "## 用户偏好\n{content}",
            "success_pattern": "## 成功模式\n{content}",
            "failure_pattern": "## 避免模式\n{content}",
            "historical_context": "## 历史上下文\n{content}",
            "technical_constraint": "## 技术约束\n{content}"
        }
        
        # 初始化向量模型和索引
        self.embedding_model = None
        self.faiss_index = None
        self.memory_store = MemoryStore()
        self._initialize_components()
        
        logger.info("KnowledgeApplicator插件已初始化")
    
    def _initialize_components(self):
        """初始化向量检索组件"""
        try:
            # 初始化句子嵌入模型
            self.embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            
            # 加载FAISS索引（如果存在）
            index_path = self.memory_store.get_index_path()
            if index_path and index_path.exists():
                self.faiss_index = faiss.read_index(str(index_path))
                logger.info(f"已加载FAISS索引，包含 {self.faiss_index.ntotal} 个向量")
            else:
                # 创建新的FAISS索引
                embedding_size = 384  # MiniLM模型的向量维度
                self.faiss_index = faiss.IndexFlatIP(embedding_size)  # 内积相似度
                logger.info("创建了新的FAISS索引")
                
        except Exception as e:
            logger.warning(f"向量检索组件初始化失败: {e}，将使用文本匹配回退方案")
            self.embedding_model = None
            self.faiss_index = None
    
    async def pre_process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        主处理函数 - 在主任务开始前自动触发
        
        Args:
            context: 当前任务上下文，包含用户查询、任务类型等信息
            
        Returns:
            修改后的上下文，注入了相关知识
        """
        if not self.enabled:
            logger.debug("知识应用器已禁用，跳过执行")
            return context
        
        try:
            # 设置超时机制
            knowledge_context = await asyncio.wait_for(
                self._retrieve_relevant_knowledge(context),
                timeout=self.timeout
            )
            
            if knowledge_context:
                # 将知识注入到LLM提示词中
                context = self._inject_knowledge_context(context, knowledge_context)
                logger.info(f"已注入 {len(knowledge_context)} 条相关知识到任务上下文")
            
        except asyncio.TimeoutError:
            logger.warning("知识检索超时，跳过本次知识注入")
        except Exception as e:
            logger.error(f"知识应用器执行失败: {e}")
        
        return context
    