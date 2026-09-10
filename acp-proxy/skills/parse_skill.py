# acp-proxy/skills/parse_skill.py
"""
JSON解析包装工具模块
统一处理所有技能中的JSON解析逻辑，提供健壮的解析能力
"""

import json
import re
import logging
from typing import Tuple, Optional, Any, Dict
from dataclasses import dataclass
from enum import Enum

# 设置日志
logger = logging.getLogger(__name__)


class ParseStrategy(Enum):
    """解析策略枚举"""
    STANDARD = "standard"
    CLEANED = "cleaned"
    LENIENT = "lenient"


@dataclass
class ParseResult:
    """解析结果包装类"""
    data: Optional[Any] = None
    error: Optional[str] = None
    success: bool = False
    strategy_used: Optional[ParseStrategy] = None
    raw_error: Optional[Exception] = None


class SafeJSONParser:
    """
    安全的JSON解析器
    
    支持多种解析策略：
    1. 标准解析
    2. 格式清理后解析
    3. 宽容解析器（json5或demjson3）
    """
    
    def __init__(self):
        self._lenient_parser = None
        self._initialize_lenient_parser()
    
    def _initialize_lenient_parser(self):
        """初始化宽容解析器"""
        try:
            import json5
            self._lenient_parser = json5.loads
            logger.info("Successfully imported json5 as lenient parser")
        except ImportError:
            try:
                import demjson3
                self._lenient_parser = demjson3.decode
                logger.info("Successfully imported demjson3 as lenient parser")
            except ImportError:
                logger.warning("No lenient JSON parser available (json5/demjson3)")
                self._lenient_parser = None
    
    def _clean_json_string(self, json_string: str) -> str:
        """
        清理常见的JSON格式问题
        
        Args:
            json_string: 原始JSON字符串
            
        Returns:
            清理后的JSON字符串
        """
        # 1. 移除BOM标记
        if json_string.startswith('\ufeff'):
            json_string = json_string[1:]
        
        # 2. 移除注释（行注释和块注释）
        json_string = re.sub(r'//.*?$', '', json_string, flags=re.MULTILINE)
        json_string = re.sub(r'/\*.*?\*/', '', json_string, flags=re.DOTALL)
        
        # 3. 修复尾随逗号
        json_string = re.sub(r',\s*([}\]])', r'\1', json_string)
        
        # 4. 修复单引号为双引号（简单情况）
        # 注意：这可能会在字符串内部替换引号，所以需要更复杂的处理
        # 这里只处理对象键值对的单引号
        json_string = re.sub(r"(:\s*)'([^']*?)'(\s*[,}\]])", r'\1"\2"\3', json_string)
        
        # 5. 修复未加引号的键
        json_string = re.sub(r'(\{|\,)\s*(\w+)\s*:', r'\1"\2":', json_string)
        
        # 6. 修复换行符和制表符
        json_string = json_string.replace('\n', '\\n').replace('\t', '\\t')
        
        return json_string.strip()
    
    def _try_parse(self, json_string: str, strategy: ParseStrategy) -> Tuple[Any, Optional[Exception]]:
        """
        尝试使用指定策略解析JSON
        
        Args:
            json_string: JSON字符串
            strategy: 解析策略
            
        Returns:
            (解析结果, 错误)
        """
        try:
            if strategy == ParseStrategy.STANDARD:
                return json.loads(json_string), None
            
            elif strategy == ParseStrategy.CLEANED:
                cleaned_string = self._clean_json_string(json_string)
                return json.loads(cleaned_string), None
            
            elif strategy == ParseStrategy.LENIENT:
                if self._lenient_parser:
                    return self._lenient_parser(json_string), None
                else:
                    return None, ValueError("No lenient parser available")
            
            return None, ValueError(f"Unknown strategy: {strategy}")
            
        except Exception as e:
            return None, e
    
    def safe_json_parse(
        self, 
        json_string: str, 
        context: Optional[str] = None,
        max_retries: int = 3
    ) -> ParseResult:
        """
        安全地解析JSON字符串
        
        Args:
            json_string: 要解析的JSON字符串
            context: 解析上下文（用于错误信息）
            max_retries: 最大重试次数
            
        Returns:
            ParseResult对象，包含解析结果和错误信息
        """
        if not json_string or not json_string.strip():
            return ParseResult(
                error="Empty or null JSON string",
                success=False,
                context=context
            )
        
        # 确保输入是字符串
        if not isinstance(json_string, str):
            return ParseResult(
                error=f"Expected string, got {type(json_string).__name__}",
                success=False,
                context=context
            )
        
        # 按顺序尝试不同策略
        strategies = [
            ParseStrategy.STANDARD,
            ParseStrategy.CLEANED,
            ParseStrategy.LENIENT
        ]
        
        last_error = None
        
        for attempt in range(max_retries):
            for strategy in strategies:
                try:
                    data, error = self._try_parse(json_string, strategy)
                    
                    if error is None:
                        logger.debug(f"Successfully parsed JSON using {strategy.value} strategy")
                        return ParseResult(
                            data=data,
                            success=True,
                            strategy_used=strategy,
                            context=context
                        )
                    else:
                        last_error = error
                        logger.debug(f"Strategy {strategy.value} failed: {error}")
                
                except Exception as e:
                    last_error = e
                    logger.debug(f"Unexpected error with {strategy.value}: {e}")
        
        # 所有尝试都失败