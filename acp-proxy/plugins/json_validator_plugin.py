import json
import re
import time
import logging
from typing import Any, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
from functools import lru_cache
from abc import ABC, abstractmethod
import hashlib

# 导入插件系统基类
try:
    from acp_proxy.plugin_system import BasePlugin
except ImportError:
    # 如果无法导入，定义简化版基类用于测试
    class BasePlugin:
        def __init__(self, plugin_config: Dict[str, Any] = None):
            self.plugin_config = plugin_config or {}
        
        def pre_process(self, skill_name: str, input_data: Any) -> Any:
            """技能调用前的预处理"""
            return input_data
        
        def post_process(self, skill_name: str, output_data: Any) -> Any:
            """技能调用后的后处理"""
            return output_data
        
        def get_plugin_info(self) -> Dict[str, Any]:
            """获取插件信息"""
            return {
                'name': self.__class__.__name__,
                'description': '',
                'version': '1.0.0',
                'enabled': True
            }

# 设置日志
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class ValidationMode(Enum):
    """验证模式枚举"""
    STRICT = "strict"  # 严格模式：标准JSON
    LENIENT = "lenient"  # 宽松模式：允许注释、尾逗号等
    HEURISTIC = "heuristic"  # 启发式修复模式：尝试自动修复


@dataclass
class ValidationError:
    """验证错误信息"""
    position: Optional[Tuple[int, int]] = None  # (行, 列)
    message: str = ""
    suggestion: str = ""
    confidence: float = 1.0  # 置信度评分 0-1
    code: str = ""  # 错误代码
    path: Optional[List[Union[str, int]]] = None  # JSON路径


@dataclass
class ValidationReport:
    """验证报告"""
    is_valid: bool = False
    original_content: str = ""
    processed_content: Optional[str] = None
    errors: List[ValidationError] = None
    warnings: List[ValidationError] = None
    repair_suggestions: List[str] = None
    processing_time: float = 0.0
    validation_mode: str = ValidationMode.STRICT.value
    schema_errors: List[Dict[str, Any]] = None
    confidence_score: float = 1.0  # 整体置信度
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.warnings is None:
            self.warnings = []
        if self.repair_suggestions is None:
            self.repair_suggestions = []
        if self.schema_errors is None:
            self.schema_errors = []
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return asdict(self)


@dataclass
class PluginConfig:
    """插件配置"""
    default_mode: str = ValidationMode.STRICT.value
    auto_validate: bool = True
    enabled_skills: Optional[List[str]] = None  # 为空则对所有技能启用
    disabled_skills: Optional[List[str]] = None
    max_content_size: int = 10 * 1024 * 1024  # 10MB
    enable_caching: bool = True
    cache_size: int = 1000
    timeout: float = 5.0  # 验证超时时间（秒）


class JSONRepairer:
    """JSON修复器"""
    
    def __init__(self):
        # 编译常用正则表达式，提高性能
        self._compile_regex_patterns()
        # 缓存修复规则
        self._repair_cache = {}
        
    def _compile_regex_patterns(self):
        """编译正则表达式模式"""
        # 移除单行注释 (//...)
        self.comment_pattern = re.compile(r'//.*$', re.MULTILINE)
        # 移除多行注释 (/*...*/)
        self.multi_comment_pattern = re.compile(r'/\*.*?\*/', re.DOTALL)
        # 修复尾逗号
        self.trailing_comma_pattern = re.compile(r',\s*([\]}])')
        # 修复字符串中的单引号为双引号
        self.single_quote_pattern = re.compile(r"'([^']*)'")
        # 修复无引号的键
        self.unquoted_keys_pattern = re.compile(r'(?<=[{,])\s*(\w+)\s*:(?!=)')
        # 移除JSON中的控制字符
        self.control_char_pattern = re.compile(r'[\x00-\x1f\x7f-\x9f]')
        
    def remove_comments(self, json_str: str) -> str:
        """移除JSON中的注释"""
        # 先移除多行注释，再移除单行注释
        result = self.multi_comment_pattern.sub('', json_str)
        result = self.comment_pattern.sub('', result)
        return result
    
    def fix_trailing_commas(self, json_str: str) -> str:
        """修复尾逗号"""
        return self.trailing_comma_pattern.sub(r'\1', json_str)
    
    def fix_single_quotes(self, json_str: str) -> str:
        """将单引号替换为双引号"""
        return self.single_quote_pattern.sub(r'"\1"', json_str)
    
    def fix_unquoted_keys(self, json_str: str) -> str:
        """为无引号的键添加双引号"""
        return self.unquoted_keys_pattern.sub(r' "\1":', json_str)
    
    def remove_control_chars(self, json_str: str) -> str:
        """移除控制字符"""
        return self.control_char_pattern.sub('', json_str)
    
    def get_cached_repair(self, content_hash: str, mode: str) -> Optional[str]:
        """获取缓存的修复结果"""
        cache_key = f"{content_hash}_{mode}"
        return self._repair_cache.get(cache_key)
    
    def set_cached_repair(self, content_hash: str, mode: str, repaired: str):
        """设置缓存的修复结果"""
        cache_key = f"{content_hash}_{mode}"
        # 简单的LRU缓存策略