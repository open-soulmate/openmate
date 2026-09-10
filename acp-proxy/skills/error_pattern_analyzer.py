import os
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import re
from collections import Counter

class ErrorPatternAnalyzer:
    """错误模式分析器：分析系统失败模式，生成诊断报告和改进建议"""
    
    def __init__(self, memory_manager=None, llm_client=None, config=None):
        """
        初始化错误模式分析器
        
        Args:
            memory_manager: 记忆管理器实例，用于检索和存储记忆
            llm_client: LLM客户端实例，用于文本分析和归纳
            config: 配置字典，包含各种设置
        """
        self.memory_manager = memory_manager
        self.llm_client = llm_client
        self.config = config or {}
        
        # 默认配置
        self.error_keywords = self.config.get('error_keywords', [
            'error', 'failure', 'exception', 'failed', 'crash', 'bug', 
            'timeout', 'invalid', 'missing', 'null', 'undefined'
        ])
        
        self.error_log_path = self.config.get('error_log_path', 'logs/error_logs.json')
        self.max_errors_per_analysis = self.config.get('max_errors_per_analysis', 50)
        self.diagnosis_memory_tag = self.config.get('diagnosis_memory_tag', 'error_diagnosis')
    
    def analyze_recent_errors(self, time_window: str = 'last_24h') -> List[Dict]:
        """
        分析最近时间窗口内的错误
        
        Args:
            time_window: 时间窗口字符串，如 'last_1h', 'last_24h', 'last_7d', 'last_30d'
            
        Returns:
            分析结果列表，每个结果包含错误分类、频率、原因和建议
        """
        # 1. 检索错误相关记录
        error_records = self._collect_error_records(time_window)
        
        if not error_records:
            return []
        
        # 2. 对错误进行聚类和诊断
        analysis_results = self._cluster_and_diagnose(error_records)
        
        # 3. 生成结构化诊断报告
        structured_reports = self._generate_structured_reports(analysis_results)
        
        # 4. 存储分析结果到记忆系统
        self._store_analysis_results(structured_reports)
        
        return structured_reports
    
    def _collect_error_records(self, time_window: str) -> List[Dict]:
        """
        收集指定时间窗口内的错误记录
        
        Args:
            time_window: 时间窗口字符串
            
        Returns:
            错误记录列表
        """
        error_records = []
        
        # 1. 从记忆系统检索错误相关记录
        if self.memory_manager:
            error_records.extend(self._search_memory_errors(time_window))
        
        # 2. 从错误日志文件读取
        if os.path.exists(self.error_log_path):
            error_records.extend(self._read_error_log_file(time_window))
        
        # 限制最大数量
        if len(error_records) > self.max_errors_per_analysis:
            error_records = error_records[:self.max_errors_per_analysis]
        
        return error_records
    
    def _search_memory_errors(self, time_window: str) -> List[Dict]:
        """
        从记忆系统搜索错误相关记录
        
        Args:
            time_window: 时间窗口字符串
            
        Returns:
            错误记录列表
        """
        error_records = []
        
        try:
            # 构建时间范围
            time_range = self._parse_time_window(time_window)
            
            # 搜索错误关键词相关的记忆
            for keyword in self.error_keywords:
                results = self.memory_manager.search(
                    query=keyword,
                    tags=['error', 'failure', 'exception'],
                    time_range=time_range,
                    limit=20
                )
                
                for result in results:
                    # 提取错误信息
                    error_info = self._extract_error_info(result)
                    if error_info:
                        error_records.append(error_info)
        
        except Exception as e:
            print(f"从记忆系统检索错误记录失败: {e}")
        
        return error_records
    
    def _read_error_log_file(self, time_window: str) -> List[Dict]:
        """
        从错误日志文件读取记录
        
        Args:
            time_window: 时间窗口字符串
            
        Returns:
            错误记录列表
        """
        error_records = []
        
        try:
            with open(self.error_log_path, 'r', encoding='utf-8') as f:
                log_data = json.load(f)
                
                if not isinstance(log_data, list):
                    log_data = [log_data]
                
                # 根据时间窗口过滤
                time_threshold = self._get_time_threshold(time_window)
                
                for record in log_data:
                    try:
                        # 检查记录时间是否在时间窗口内
                        record_time = datetime.fromisoformat(record.get('timestamp', ''))
                        if record_time >= time_threshold:
                            error_info = self._extract_error_from_log(record)
                            if error_info:
                                error_records.append(error_info)
                    except:
                        continue
        
        except Exception as e:
            print(f"读取错误日志文件失败: {e}")
        
        return error_records
    
    def _extract_error_info(self, memory_record: Dict) -> Optional[Dict]:
        """
        从记忆记录中提取错误信息
        
        Args:
            memory_record: 记忆记录字典
            
        Returns:
            错误信息字典，或None
        """
        try:
            content = memory_record.get('content', '')
            if not content:
                return None
            
            # 检查是否包含错误相关关键词
            content_lower = content.lower()
            if not any(keyword in content_lower for keyword in self.error_keywords):
                return None
            
            return {
                'id': memory_record.get('id', ''),
                'content': content,
                'timestamp': memory_record.get('timestamp', ''),
                'source': 'memory',
                'tags': memory_record.get('tags', [])
            }
        
        except Exception:
            return None
    
    def _extract_error_from_log(self, log_record: Dict) -> Optional[Dict]:
        """
        从日志记录中提取错误信息
        
        Args:
            log_record: 日志记录字典
            
        Returns:
            错误信息字典，或None
        """
        try:
            # 提取错误消息
            error_message = log_record.get('message', '')
            if not error_message:
                error_message = log_record.get('error', '')
            
            if not error_message:
                return None
            
            return {
                'id': f"log_{log_record.get('timestamp', '')}",
                'content': error_message,
                'timestamp': log_record.get('timestamp', ''),
                'source': 'log_file',
                'metadata': {
                    'level': log_record.get('level', 'ERROR'),
                    'component': log_record.get('component', ''),
                    'stacktrace': log_record.get('stacktrace', '')
                }
            }
        
        except Exception:
            return None
    