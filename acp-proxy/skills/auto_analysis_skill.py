import logging
import time
import threading
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from collections import defaultdict
import json
import hashlib

# 假设存在基础技能类
try:
    from .base_skill import BaseSkill
except ImportError:
    # 如果导入失败，创建一个基础的替代类
    class BaseSkill:
        def __init__(self, *args, **kwargs):
            pass
        
        def log(self, level: str, message: str):
            getattr(logging, level.lower(), logging.info)(f"[{self.__class__.__name__}] {message}")
        
        def get_state(self) -> Dict[str, Any]:
            return {}

logger = logging.getLogger(__name__)


class AutoAnalysisSkill(BaseSkill):
    """
    自动观察分析技能
    
    定期分析observations_unanalyzed中的新观察记录，提取模式、洞察并更新内部知识库。
    支持定时触发和阈值触发，具备批量处理、错误恢复和性能优化功能。
    """
    
    def __init__(self, 
                 config: Dict[str, Any] = None,
                 observations_unanalyzed: Optional[List] = None,
                 observations_analyzed: Optional[List] = None,
                 knowledge_base: Optional[Dict] = None,
                 llm_client=None,
                 **kwargs):
        """
        初始化自动分析技能
        
        Args:
            config: 技能配置参数
            observations_unanalyzed: 未分析的观察记录存储
            observations_analyzed: 已分析的观察记录存储
            knowledge_base: 知识库存储
            llm_client: 大语言模型客户端
            **kwargs: 其他参数
        """
        super().__init__(**kwargs)
        
        self.config = config or {}
        
        # 存储引用 - 如果未提供，使用本地字典模拟
        self.observations_unanalyzed = observations_unanalyzed if observations_unanalyzed is not None else []
        self.observations_analyzed = observations_analyzed if observations_analyzed is not None else []
        self.knowledge_base = knowledge_base if knowledge_base is not None else {}
        
        # LLM客户端
        self.llm_client = llm_client
        
        # 配置参数
        self.batch_size = self.config.get('batch_size', 10)
        self.analysis_timeout = self.config.get('analysis_timeout', 30)  # 单条分析超时秒数
        self.max_concurrent = self.config.get('max_concurrent', 5)
        self.analysis_interval = self.config.get('analysis_interval', 1800)  # 30分钟
        self.threshold_trigger = self.config.get('threshold_trigger', 50)  # 阈值触发数量
        
        # 状态管理
        self.is_running = False
        self.processing_lock = threading.RLock()
        self.stats = {
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'knowledge_added': 0,
            'knowledge_updated': 0,
            'last_run': None,
            'next_run': None
        }
        
        # 分析缓存 - 避免重复分析
        self.analysis_cache = {}
        self.cache_expiry = self.config.get('cache_expiry', 3600)  # 1小时
        
        # 错误记录
        self.error_log = []
        
        logger.info(f"AutoAnalysisSkill initialized with batch_size={self.batch_size}")
    
    def execute(self, trigger_type: str = 'scheduled', **kwargs) -> Dict[str, Any]:
        """
        执行分析任务的主要方法
        
        Args:
            trigger_type: 触发类型 ('scheduled' 或 'threshold')
            **kwargs: 其他参数
            
        Returns:
            处理结果统计信息
        """
        if self.is_running:
            logger.warning("Analysis task is already running")
            return self.get_status()
        
        with self.processing_lock:
            self.is_running = True
            self.stats['last_run'] = datetime.now().isoformat()
            
            try:
                logger.info(f"Starting analysis task (trigger: {trigger_type}, pending: {len(self.observations_unanalyzed)})")
                
                # 检查是否需要执行
                if trigger_type == 'threshold' and len(self.observations_unanalyzed) < self.threshold_trigger:
                    logger.info(f"Below threshold ({len(self.observations_unanalyzed)} < {self.threshold_trigger})")
                    return self.get_status()
                
                # 分批处理
                batch_results = self._process_batches()
                
                # 更新统计
                self.stats['total_processed'] += batch_results['processed']
                self.stats['successful'] += batch_results['successful']
                self.stats['failed'] += batch_results['failed']
                self.stats['knowledge_added'] += batch_results['knowledge_added']
                self.stats['knowledge_updated'] += batch_results['knowledge_updated']
                
                # 清理过期缓存
                self._cleanup_cache()
                
                # 计算下次运行时间
                if trigger_type == 'scheduled':
                    self.stats['next_run'] = datetime.fromtimestamp(
                        time.time() + self.analysis_interval
                    ).isoformat()
                
                logger.info(f"Analysis completed: {batch_results}")
                return self.get_status()
                
            except Exception as e:
                logger.error(f"Analysis task failed: {str(e)}", exc_info=True)
                self.error_log.append({
                    'timestamp': datetime.now().isoformat(),
                    'error': str(e),
                    'type': 'task_failure'
                })
                return self.get_status()
            finally:
                self.is_running = False
    
    def _process_batches(self) -> Dict[str, int]:
        """
        分批处理观察记录
        
        Returns:
            处理统计信息
        """
        results = {
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'knowledge_added': 0,
            'knowledge_updated': 0,
            'errors': []
        }
        
        # 获取当前批次的观察记录
        batch_start = 0
        total_observations = len(self.observations_unanalyzed)
        
        while batch_start < total_observations:
            batch_end = min(batch_start + self.batch_size, total_observations)
            current_batch = self.observations_unanalyzed[batch_start:batch_end]
            