"""
自适应观察分析器技能
自动处理和分析堆积的未分析观察记录，将其转化为可操作见解
"""

import time
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

# 使用项目内的日志系统
logger = logging.getLogger(__name__)


class AdaptiveObservationAnalyzer:
    """
    自适应观察分析器技能实现
    自动处理未分析的观察记录，提取可操作见解，支持知识积累
    """
    
    # 技能元数据
    SKILL_NAME = "自适应观察分析器"
    SKILL_VERSION = "1.0.0"
    SKILL_DESCRIPTION = "自动分析堆积的未分析观察记录，提取可操作见解，支持知识积累"
    
    # 预定义的启发式分析规则
    HEURISTIC_RULES = [
        # (关键词, 见解模板, 建议动作, 置信度, 关联目标)
        ("错误", "检测到错误相关观察", "记录错误详情并设置自动修复任务", 0.8, "错误自修复"),
        ("性能", "检测到性能相关观察", "进行性能分析和优化", 0.7, "性能优化"),
        ("用户偏好", "检测到用户偏好相关观察", "记录到用户画像", 0.9, "知识积累"),
        ("异常", "检测到异常行为观察", "分析异常模式并设置监控", 0.8, "系统稳定性"),
        ("资源", "检测到资源使用观察", "优化资源配置", 0.6, "性能优化"),
        ("安全", "检测到安全相关观察", "安全评估和加固", 0.9, "安全加固"),
    ]
    
    def __init__(self, memory_manager):
        """
        初始化自适应观察分析器
        
        Args:
            memory_manager: 记忆管理器实例，用于读取和写入记忆数据
        """
        self.memory_manager = memory_manager
        self.analysis_history = []
        
    def analyze_pending_observations(self) -> Dict[str, Any]:
        """
        主分析入口：处理所有待分析的观察记录
        
        Returns:
            分析结果字典，包含处理统计信息
        """
        start_time = time.time()
        session_id = f"analysis_session_{int(start_time)}"
        
        # 1. 获取未分析的观察记录
        unanalyzed_observations = self._get_unanalyzed_observations()
        
        if not unanalyzed_observations:
            logger.info(f"[{session_id}] 没有待分析的观察记录")
            return {
                'analyzed_count': 0,
                'new_insights_generated': 0,
                'processing_time_ms': 0.0,
                'errors': [],
                'session_id': session_id
            }
        
        analyzed_count = 0
        new_insights_count = 0
        errors = []
        
        logger.info(f"[{session_id}] 开始分析 {len(unanalyzed_observations)} 条观察记录")
        
        # 2. 逐条分析观察记录
        for observation in unanalyzed_observations:
            try:
                insight = self._analyze_single_observation(observation)
                
                if insight:
                    # 3. 保存分析结果
                    self._save_analysis_result(observation, insight)
                    new_insights_count += 1
                    logger.debug(f"[{session_id}] 成功分析观察 {observation.get('id')}")
                
                analyzed_count += 1
                
            except Exception as e:
                error_msg = f"分析观察记录失败: {str(e)}"
                logger.error(f"[{session_id}] {error_msg}")
                errors.append({
                    'observation_id': observation.get('id', 'unknown'),
                    'error': error_msg,
                    'timestamp': datetime.now().isoformat()
                })
                # 继续处理其他观察，不中断整个流程
        
        # 4. 记录性能监控
        end_time = time.time()
        processing_time_ms = (end_time - start_time) * 1000
        
        self._record_performance_monitoring(
            start_time, end_time, analyzed_count, errors, session_id
        )
        
        # 5. 更新分析历史
        analysis_record = {
            'session_id': session_id,
            'analyzed_count': analyzed_count,
            'new_insights_count': new_insights_count,
            'errors_count': len(errors),
            'processing_time_ms': processing_time_ms,
            'timestamp': datetime.now().isoformat()
        }
        self.analysis_history.append(analysis_record)
        
        logger.info(
            f"[{session_id}] 分析完成: "
            f"分析了 {analyzed_count} 条记录, "
            f"生成 {new_insights_count} 条见解, "
            f"耗时 {processing_time_ms:.2f}ms"
        )
        
        return {
            'analyzed_count': analyzed_count,
            'new_insights_generated': new_insights_count,
            'processing_time_ms': processing_time_ms,
            'errors': errors,
            'session_id': session_id
        }
    
    def _get_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """
        从记忆系统获取未分析的观察记录
        
        Returns:
            未分析观察记录列表
        """
        try:
            # 尝试从记忆管理器获取观察队列
            if hasattr(self.memory_manager, 'get_observations_unanalyzed'):
                return self.memory_manager.get_observations_unanalyzed()
            
            # 备用方案：从观察队列分区读取
            observations = self.memory_manager.get_memory_partition('observations_unanalyzed')
            return observations if observations else []
            
        except Exception as e:
            logger.error(f"获取未分析观察记录失败: {str(e)}")
            return []
    
    def _analyze_single_observation(self, observation_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        分析单条观察记录，提取可操作见解
        
        Args:
            observation_data: 观察记录数据
            
        Returns:
            见解字典或None（如果无法分析）
        """
        observation_id = observation_data.get('id', 'unknown')