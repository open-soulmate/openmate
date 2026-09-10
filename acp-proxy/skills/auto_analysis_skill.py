#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AutoAnalysisSkill - 自动观察分析技能
定期分析未处理的观察记录，提取模式、洞察并更新知识库
"""

import time
import logging
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

# 假设存在基础技能类
try:
    from .base_skill import BaseSkill
except ImportError:
    # 兼容直接导入
    from base_skill import BaseSkill


class AutoAnalysisSkill(BaseSkill):
    """自动观察分析技能，用于定期处理未分析的观察记录"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化技能
        
        Args:
            config: 配置字典，包含以下可选键：
                - interval_minutes: 定时间隔（分钟），默认30
                - threshold: 数量阈值，超过则触发分析，默认10
                - batch_size: 批处理大小，默认5
                - llm_client: 大语言模型客户端实例
                - knowledge_base: 知识库存储对象
                - logger: 日志记录器
        """
        super().__init__(skill_name="auto_analysis_skill", config=config)
        
        # 配置参数
        self.interval_minutes = config.get('interval_minutes', 30) if config else 30
        self.threshold = config.get('threshold', 10) if config else 10
        self.batch_size = config.get('batch_size', 5) if config else 5
        
        # 依赖组件
        self.llm_client = config.get('llm_client') if config else None
        self.knowledge_base = config.get('knowledge_base') if config else None
        
        # 日志配置
        self.logger = config.get('logger') if config else logging.getLogger(__name__)
        
        # 状态管理
        self.last_execution_time = datetime.min
        self.processing_stats = {
            'total_processed': 0,
            'new_knowledge_added': 0,
            'errors_occurred': 0,
            'last_execution_duration': 0.0
        }
        
        # 知识去重缓存
        self.knowledge_hashes = set()
        
    def _check_trigger_conditions(self) -> Tuple[bool, str]:
        """
        检查触发条件
        
        Returns:
            Tuple[bool, str]: (是否触发, 触发原因)
        """
        now = datetime.now()
        
        # 检查时间间隔
        time_diff = (now - self.last_execution_time).total_seconds() / 60
        if time_diff >= self.interval_minutes:
            return True, f"定时触发（{self.interval_minutes}分钟间隔）"
        
        # 检查数量阈值
        unanalyzed_count = self._get_unanalyzed_count()
        if unanalyzed_count >= self.threshold:
            return True, f"数量阈值触发（当前{unanalyzed_count}条，阈值{self.threshold}）"
        
        return False, "未达到触发条件"
    
    def _get_unanalyzed_count(self) -> int:
        """获取未分析记录的数量"""
        try:
            # 这里假设数据存储在某个数据结构中
            # 实际实现中需要连接到具体的数据源
            observations = self.get_observations_unanalyzed()
            return len(observations)
        except Exception as e:
            self.logger.error(f"获取未分析记录数量失败: {str(e)}")
            return 0
    
    def _generate_knowledge_hash(self, content: Dict[str, Any]) -> str:
        """
        生成知识条目的哈希值用于去重
        
        Args:
            content: 知识内容
            
        Returns:
            str: 内容的MD5哈希值
        """
        # 对内容进行排序确保一致性
        content_str = str(sorted(content.items()))
        return hashlib.md5(content_str.encode('utf-8')).hexdigest()
    
    def _analyze_observation(self, observation: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        分析单条观察记录
        
        Args:
            observation: 观察记录字典
            
        Returns:
            List[Dict[str, Any]]: 提取的知识条目列表
        """
        try:
            # 构建分析提示
            prompt = f"""
请分析以下观察记录，提取关键信息：

观察记录：{observation.get('content', '')}
上下文：{observation.get('context', '无')}
时间：{observation.get('timestamp', '未知')}

请提取以下信息（如适用）：
1. 关键实体（人名、地点、组织等）
2. 情感倾向（正面、负面、中性）
3. 事件或活动
4. 用户偏好或习惯
5. 潜在的模式或规律

请以JSON格式返回，格式如下：
{{
    "entities": [...],
    "sentiment": "...",
    "events": [...],
    "preferences": [...],
    "patterns": [...],
    "summary": "简要总结"
}}
"""
            
            # 调用大语言模型进行分析
            if self.llm_client:
                response = self.llm_client.analyze(prompt)
                # 解析响应（假设返回JSON格式）
                analysis_result = self._parse_llm_response(response)
            else:
                # 如果没有LLM客户端，使用简单的规则分析
                analysis_result = self._simple_analysis(observation)
            
            # 将分析结果转换为知识条目
            knowledge_entries = self._convert_to_knowledge(observation, analysis_result)
            
            return knowledge_entries
            
        except Exception as e:
            self.logger.error(f"分析观察记录失败: {str(e)}")
            raise
    
    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """解析大语言模型的响应"""
        try:
            # 尝试解析JSON
            import json
            return json.loads(response)
        except:
            # 如果解析失败，返回基本结构
            return {
                "entities": [],
                "sentiment": "中性",
                "events": [],
                "preferences": [],
                "patterns": [],
                "summary": response[:200] if len(response) > 200 else response
            }
    
    def _simple_analysis(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """简单的规则分析（当没有LLM时使用）"""
        content = observation.get('content', '')
        
        # 简单的情感关键词检测
        positive_words = ['好', '棒', '优秀', '成功', '喜欢']