# acp-proxy/skills/observation_bundler.py
"""
Observation Bundler Skill - 批量处理低优先级观察数据

[Evolution-Milestone] Skill: observation_bundler - First self-programmed module for handling 
low-priority data backlog. Implemented as part of the 'Self-Programming Capability' goal 
(progress 0% -> 0.1%).

Module Purpose: 主动从系统观察队列中拉取标记为'可缓存'或'低优先级'的未分析观察数据，
执行标准化处理流程后整合进系统的长期记忆或知识库。

Author: MiMo Self-Programming System
Created: 2024-01-XX
Version: 0.1.0 (Milestone Release)
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# ============================================================================
# 依赖声明 (Dependency Declaration)
# ============================================================================
# 本模块依赖以下系统插件/接口，调用时需确保它们已正确初始化：
#
# 1. observation_manager_plugin (观察管理器插件)
#    - get_observations(obs_type: str, limit: int) -> List[Dict]
#    - mark_as_processed(observation_id: str) -> bool
#
# 2. memory_manager_plugin (记忆管理器插件)  
#    - add_memory(content: str, tags: List[str], metadata: Dict) -> str
#
# 3. analysis_plugin (分析插件，可选)
#    - analyze_observation_simple(text: str) -> Dict[str, Any]
#
# 如果这些接口不可用，本模块将使用内置的降级实现。
# ============================================================================

# 配置日志格式
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('ObservationBundler')


class ObservationBundler:
    """
    观察数据批量处理器
    
    专门用于处理系统标记为'可缓存'或'低优先级'的未分析观察数据。
    作为系统自编程能力的第一个实践案例，实现了对数据积压问题的最小化响应。
    """
    
    # 类常量：技能元数据
    SKILL_NAME = "observation_bundler"
    SKILL_VERSION = "0.1.0"
    EVOLUTION_MILESTONE = True
    PROCESSING_CATEGORY = "low_priority"  # 保守策略：仅处理低优先级
    
    def __init__(
        self,
        observation_manager=None,
        memory_manager=None,
        analysis_plugin=None,
        batch_size: int = 5,
        dry_run: bool = False
    ):
        """
        初始化观察数据批量处理器
        
        Args:
            observation_manager: 观察管理器插件实例，用于获取和标记观察
            memory_manager: 记忆管理器插件实例，用于存储分析结果
            analysis_plugin: 分析插件实例，用于处理观察文本
            batch_size: 默认批处理大小
            dry_run: 是否为试运行模式（不实际修改系统状态）
        """
        self.observation_manager = observation_manager
        self.memory_manager = memory_manager
        self.analysis_plugin = analysis_plugin
        self.default_batch_size = batch_size
        self.dry_run = dry_run
        
        # 统计计数器
        self.stats = {
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'last_run': None,
            'last_run_duration': None
        }
        
        logger.info(f"ObservationBundler initialized | batch_size={batch_size} | dry_run={dry_run}")
    
    def _get_observations(self, batch_size: int) -> List[Dict[str, Any]]:
        """
        从观察队列获取低优先级未分析观察
        
        Args:
            batch_size: 最多获取的观察数量
            
        Returns:
            观察数据列表
        """
        try:
            # 尝试使用外部插件获取观察
            if self.observation_manager and hasattr(self.observation_manager, 'get_observations'):
                observations = self.observation_manager.get_observations(
                    obs_type=self.PROCESSING_CATEGORY,
                    limit=batch_size
                )
                logger.info(f"Retrieved {len(observations)} observations from observation_manager plugin")
                return observations
            
            # 降级实现：返回模拟数据用于测试
            logger.warning("observation_manager not available, using fallback mock data")
            return self._get_mock_observations(batch_size)
            
        except Exception as e:
            logger.error(f"Failed to get observations: {type(e).__name__}: {e}")
            return []
    
    def _get_mock_observations(self, count: int) -> List[Dict[str, Any]]:
        """降级实现：生成模拟观察数据用于测试和开发"""
        mock_observations = []
        for i in range(min(count, 3)):  # 最多返回3条模拟数据
            mock_observations.append({
                'id': f'obs_mock_{i+1}_{datetime.now().strftime("%Y%m%d%H%M%S")}',
                'text': f'[Mock] 这是一条低优先级观察数据 #{i+1}，用于测试批处理功能。',
                'category': 'low_priority',
                'timestamp': datetime.now().isoformat(),
                'source': 'mock_data',
                'metadata': {'priority': 'low', 'cacheable': True}
            })
        return mock_observations
    
    def _analyze_observation(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """
        对单个观察进行分析处理
        
        Args:
            observation: 观察数据字典，需包含 'text' 字段
            
        Returns:
            包含分析结果的字典（category, summary, keywords）
        """
        observation_text = observation.get('text', '')
        observation_id = observation.get('id', 'unknown')
        
        try:
            # 尝试使用外部分析插件
            if self.analysis_plugin and hasattr(self.analysis_plugin, 'analyze_observation_simple'):
                analysis_result = self.analysis_plugin.analyze_observation_simple(observation_text)
                logger.debug(f"Analyzed observation {observation_id} using plugin")
                return analysis_result
            
            # 降级实现：基础分析
            logger.debug(f"Using fallback analysis for observation {observation_id}")
            return self._analyze_observation_fallback(observation_text)
            
        except Exception as e:
            logger.error(f"Analysis failed for observation {observation_id}: {e}")
            return self._analyze_observation_fallback(observation_text)
    
    def _analyze_observation_fallback(self, text: str) -> Dict[str, Any]:
        """
        降级分析实现：生成基础分类和摘要
        
        当外部分析插件不可用时使用此方法。
        """
        # 基础关键词提取（简单实现）
        common_keywords = ['系统', '数据', '处理', '观察', '状态', '错误', '成功', '警告']
        keywords = [kw for kw in common_keywords if kw in text]
        
        # 生成一句话摘要（截取前50个字符）
        summary = text[:50].strip()
        if len(text) > 50:
            summary += '...'
        
        # 基础分类
        category = 'general_observation'
        if any(word in text.lower() for word in ['错误', 'error', '失败']):
            category = 'error_related'