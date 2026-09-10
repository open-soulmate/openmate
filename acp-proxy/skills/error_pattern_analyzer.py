"""
Error Pattern Analyzer - 主动扫描和分析系统失败模式
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import json
import logging

from enum import Enum

logger = logging.getLogger(__name__)


class TimeWindow(Enum):
    """时间窗口枚举"""
    LAST_1H = "last_1h"
    LAST_6H = "last_6h"
    LAST_24H = "last_24h"
    LAST_7D = "last_7d"
    LAST_30D = "last_30d"


class ErrorCategory(Enum):
    """错误分类枚举"""
    TYPE_ERROR = "type_error"
    DEPENDENCY_ERROR = "dependency_error"
    LOGIC_ERROR = "logic_error"
    TIMEOUT_ERROR = "timeout_error"
    RESOURCE_ERROR = "resource_error"
    CONFIGURATION_ERROR = "configuration_error"
    INPUT_ERROR = "input_error"
    NETWORK_ERROR = "network_error"
    UNKNOWN = "unknown"


class ErrorPatternAnalyzer:
    """
    错误模式分析器 - 实现错误自修复和未分析观察转化
    """
    
    def __init__(self, 
                 memory_manager: Optional[Any] = None,
                 llm_service: Optional[Any] = None,
                 error_log_path: Optional[str] = None):
        """
        初始化错误模式分析器
        
        Args:
            memory_manager: 记忆管理器实例
            llm_service: LLM服务实例
            error_log_path: 错误日志文件路径
        """
        self.memory_manager = memory_manager
        self.llm_service = llm_service
        self.error_log_path = error_log_path
        
        # 错误统计缓存
        self._error_cache = {}
        self._last_analysis_time = None
        
        logger.info("ErrorPatternAnalyzer initialized")
    
    def analyze_recent_errors(self, 
                             time_window: str = "last_24h",
                             max_errors: int = 1000,
                             include_unanalyzed: bool = True) -> List[Dict]:
        """
        主分析方法 - 检索并分析指定时间窗口内的错误
        
        Args:
            time_window: 时间窗口
            max_errors: 最大错误数量限制
            include_unanalyzed: 是否包含未分析的观察
            
        Returns:
            分析结果列表
        """
        logger.info(f"Starting error analysis for time window: {time_window}")
        
        try:
            # 1. 计算时间窗口
            window_start = self._calculate_time_window(time_window)
            
            # 2. 检索错误相关记忆
            error_memories = self._retrieve_error_memories(window_start, max_errors)
            
            # 3. 检索错误日志
            error_logs = self._retrieve_error_logs(window_start)
            
            # 4. 合并所有错误数据
            all_errors = self._merge_error_data(error_memories, error_logs)
            
            if not all_errors:
                logger.info("No errors found for analysis")
                return []
            
            # 5. 聚类和诊断分析
            diagnosis = self._cluster_and_diagnose(all_errors)
            
            # 6. 生成结构化报告
            analysis_report = self._generate_analysis_report(diagnosis, time_window)
            
            # 7. 更新知识库
            if self.memory_manager:
                self._update_knowledge_base(analysis_report)
            
            # 8. 更新缓存和时间戳
            self._error_cache.update({
                time_window: {
                    "last_analysis": datetime.now().isoformat(),
                    "error_count": len(all_errors),
                    "report": analysis_report
                }
            })
            self._last_analysis_time = datetime.now()
            
            logger.info(f"Completed analysis. Found {len(all_errors)} errors, "
                       f"identified {len(diagnosis.get('clusters', []))} error patterns")
            
            return analysis_report
            
        except Exception as e:
            logger.error(f"Error during analysis: {str(e)}")
            return self._generate_error_report(str(e), time_window)
    
    def _calculate_time_window(self, time_window: str) -> datetime:
        """计算时间窗口的起始时间"""
        now = datetime.now()
        
        time_deltas = {
            TimeWindow.LAST_1H.value: timedelta(hours=1),
            TimeWindow.LAST_6H.value: timedelta(hours=6),
            TimeWindow.LAST_24H.value: timedelta(hours=24),
            TimeWindow.LAST_7D.value: timedelta(days=7),
            TimeWindow.LAST_30D.value: timedelta(days=30)
        }
        
        delta = time_deltas.get(time_window, timedelta(hours=24))
        return now - delta
    
    def _retrieve_error_memories(self, 
                                start_time: datetime,
                                max_results: int) -> List[Dict]:
        """从记忆管理器检索错误相关记忆"""
        if not self.memory_manager:
            logger.warning("Memory manager not available")
            return []
        