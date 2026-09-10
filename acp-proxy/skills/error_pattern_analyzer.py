# acp-proxy/skills/error_pattern_analyzer.py
"""
ErrorPatternAnalyzer - 系统错误模式分析技能
主动扫描、分析错误模式，转化为可操作的改进知识，支持错误自修复
"""

import asyncio
import json
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict

from acp_proxy.core.base_skill import BaseSkill
from acp_proxy.utils.time_utils import parse_time_window
from acp_proxy.models.memory import MemoryQuery, MemoryItem


class ErrorPatternAnalyzer(BaseSkill):
    """
    错误模式分析器：直接回应反思中'将未分析观察转化为目标行动'和'错误自修复'目标
    功能：定期扫描错误日志，识别根本原因，生成诊断报告，积累自修复知识
    """

    SKILL_NAME = "error_pattern_analyzer"
    SKILL_DESCRIPTION = "分析系统错误模式，生成诊断报告，支持错误自修复"
    SKILL_VERSION = "1.0.0"
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        
        # 配置参数
        self.config = config or {}
        self.llm_client = self.config.get('llm_client')
        self.memory_manager = self.config.get('memory_manager')
        self.error_log_path = self.config.get('error_log_path', '/var/log/acp/errors.log')
        self.max_errors_per_analysis = self.config.get('max_errors_per_analysis', 100)
        self.diagnosis_cache_ttl = self.config.get('diagnosis_cache_ttl', 3600)  # 1小时
        
        # 错误关键词
        self.error_keywords = ['error', 'failure', 'exception', 'failed', 'error:', 'traceback']
        
        # 诊断结果缓存
        self.diagnosis_cache: Dict[str, Dict] = {}
        
        # 错误分类规则
        self.error_categories = {
            'parameter_error': ['typeerror', 'valueerror', 'keyerror', 'indexerror'],
            'dependency_error': ['importerror', 'modulenotfounderror', 'filenotfounderror'],
            'logic_error': ['assertionerror', 'runtimeerror', 'attributeerror'],
            'system_error': ['memoryerror', 'timeouterror', 'connectionerror'],
            'unknown': []
        }

    async def analyze_recent_errors(self, time_window: str = 'last_24h') -> List[Dict]:
        """
        主入口：分析指定时间窗口内的错误
        
        Args:
            time_window: 时间窗口，如 'last_24h', 'last_7d', '2024-01-01_to_2024-01-15'
            
        Returns:
            诊断报告列表，每个报告包含错误分类、频率、原因和建议
        """
        try:
            # 解析时间窗口
            start_time, end_time = parse_time_window(time_window)
            
            # 收集错误数据
            errors = await self._collect_errors(start_time, end_time)
            
            if not errors:
                return [{
                    'status': 'no_errors',
                    'time_window': time_window,
                    'message': f'在{time_window}内未发现错误',
                    'timestamp': datetime.now().isoformat()
                }]
            
            # 分析错误模式
            analysis_result = await self._cluster_and_diagnose(errors)
            
            # 生成诊断报告
            reports = await self._generate_reports(analysis_result, time_window)
            
            # 存储到知识库
            await self._store_diagnoses(reports)
            
            return reports
            
        except Exception as e:
            return [{
                'status': 'analysis_error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }]

    async def _collect_errors(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """收集错误数据"""
        errors = []
        
        # 从记忆系统收集
        memory_errors = await self._collect_from_memory(start_time, end_time)
        errors.extend(memory_errors)
        
        # 从日志文件收集
        log_errors = await self._collect_from_logs(start_time, end_time)
        errors.extend(log_errors)
        
        # 去重和清理
        cleaned_errors = self._clean_and_deduplicate(errors)
        
        return cleaned_errors[:self.max_errors_per_analysis]

    async def _collect_from_memory(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """从记忆系统收集错误相关记录"""
        try:
            query = MemoryQuery(
                keywords=self.error_keywords,
                start_time=start_time,
                end_time=end_time,
                limit=50,
                sort_by='timestamp',
                sort_order='desc'
            )
            
            memories = await self.memory_manager.search(query)
            
            errors = []
            for mem in memories:
                if self._is_error_content(mem.content):
                    errors.append({
                        'source': 'memory',
                        'id': mem.id,
                        'content': mem.content,
                        'timestamp': mem.timestamp,
                        'metadata': mem.metadata
                    })
            
            return errors
            
        except Exception as e:
            self.logger.warning(f"从记忆系统收集错误时出错: {e}")
            return []

    async def _collect_from_logs(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """从日志文件收集错误"""
        errors = []
        
        try:
            # 这里应该根据实际日志格式解析
            # 简化实现：假设日志文件每行是一个错误记录
            log_pattern = re.compile(
                r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (ERROR|Exception|Failure): (.*?)(?:\n|$)',
                re.IGNORECASE
            )
            
            with open(self.error_log_path, 'r', encoding='utf-8') as f:
                for line in f:
                    match = log_pattern.search(line)
                    if match:
                        timestamp_str = match.group(1)
                        error_type = match.group(2)
                        error_content = match.group(3)
                        
                        try:
                            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                            if start_time <= timestamp <= end_time:
                                errors.append({
                                    'source': 'log',
                                    'timestamp': timestamp,
                                    'type': error_type,
                                    'content': error_content,
                                    'raw_log': line.strip()
                                })
                        except ValueError:
                            continue
                            
        except FileNotFoundError:
            self.logger.info(f"错误日志文件不存在: {self.error_log_path}")
        except Exception as e:
            self.logger.warning(f"读取错误日志时出错: {e}")
        
        return errors

    def _clean_and_deduplicate(self, errors: List[Dict]) -> List[Dict]:
        """清理和去重错误记录"""
        unique_errors = []
        seen_contents = set()
        
        for error in errors:
            # 简单去重：基于错误内容的哈希
            content_hash = hash(str(error.get('content', '')))
            if content_hash not in seen_contents:
                seen_contents.add(content_hash)
                unique_errors.append(error)
        
        return unique_errors

    def _is_error_content(self, content: str) -> bool:
        """判断内容是否包含错误信息"""
        if not content:
            return False
        
        content_lower = content.lower()
        return any(keyword in content_lower for keyword in self.error_keywords)
