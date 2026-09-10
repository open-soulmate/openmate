import json
import re
import time
import logging
from typing import Dict, List, Any, Optional, Union, Tuple
from dataclasses import dataclass
from enum import Enum

# 假设的基类和注册机制，实际实现中需要根据现有系统调整
class BasePlugin:
    """插件基类"""
    def __init__(self, name: str):
        self.name = name
        self.enabled = True
        self.logger = logging.getLogger(f"plugin.{name}")
    
    def get_info(self) -> Dict[str, Any]:
        return {"name": self.name, "enabled": self.enabled}

class PluginManager:
    """插件管理器单例"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.plugins = {}
        return cls._instance
    
    def register_plugin(self, plugin: BasePlugin):
        self.plugins[plugin.name] = plugin
        return True
    
    def get_plugin(self, name: str) -> Optional[BasePlugin]:
        return self.plugins.get(name)
    
    def run_before_skill(self, skill_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        for plugin in self.plugins.values():
            if plugin.enabled and hasattr(plugin, 'before_skill'):
                context = plugin.before_skill(skill_name, context)
        return context


class ValidationMode(Enum):
    """验证模式枚举"""
    STRICT = "strict"  # 标准JSON
    LENIENT = "lenient"  # 宽松模式，允许常见格式问题
    HEURISTIC = "heuristic"  # 启发式修复模式


@dataclass
class ValidationResult:
    """验证结果数据类"""
    is_valid: bool
    mode: ValidationMode
    original_text: str
    parsed_json: Optional[Dict[str, Any]]
    errors: List[Dict[str, Any]]
    warnings: List[Dict[str, Any]]
    fixed_text: Optional[str]
    confidence_score: float
    processing_time_ms: float
    suggestions: List[str]
    schema_validation: Optional[Dict[str, Any]] = None


class JSONValidatorPlugin(BasePlugin):
    """JSON验证插件"""
    
    def __init__(self):
        super().__init__("json_validator")
        self.mode = ValidationMode.LENIENT
        self.auto_run = True
        self.enabled_skills = []  # 启用此插件的技能列表，空表示全部
        self.disabled_skills = []  # 禁用此插件的技能列表
        
        # 缓存修复规则
        self.fix_cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
        
        # 性能监控
        self.total_validations = 0
        self.total_time_ms = 0
        
        # 配置JSON Schema
        self.json_schemas = {}
        
        self.logger.info("JSONValidatorPlugin初始化完成")
    
    def configure(self, config: Dict[str, Any]):
        """配置插件"""
        if "mode" in config:
            try:
                self.mode = ValidationMode(config["mode"])
            except ValueError:
                self.logger.warning(f"无效的验证模式: {config['mode']}，使用默认模式")
        
        if "auto_run" in config:
            self.auto_run = bool(config["auto_run"])
        
        if "enabled_skills" in config:
            self.enabled_skills = list(config["enabled_skills"])
        
        if "disabled_skills" in config:
            self.disabled_skills = list(config["disabled_skills"])
        
        if "json_schemas" in config:
            self.json_schemas.update(config["json_schemas"])
    
    def before_skill(self, skill_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """技能调用前的预处理"""
        if not self._should_process_skill(skill_name):
            return context
        
        # 检查上下文中的JSON输入
        input_data = context.get("input", {})
        
        if isinstance(input_data, str):
            # 如果是字符串，尝试解析
            result = self.validate_and_fix(input_data, skill_name=skill_name)
            if result.is_valid:
                context["input"] = result.parsed_json
                context["json_validator"] = {
                    "validated": True,
                    "original": input_data,
                    "mode": result.mode.value,
                    "confidence": result.confidence_score,
                    "warnings": result.warnings
                }
            else:
                # 记录错误但不阻塞
                self.logger.warning(f"技能 {skill_name} 的JSON输入验证失败: {result.errors}")
                context["json_validator"] = {
                    "validated": False,
                    "errors": result.errors,
                    "suggestions": result.suggestions
                }
        
        return context
    
    def _should_process_skill(self, skill_name: str) -> bool:
        """判断是否应该处理指定技能"""
        if not self.enabled:
            return False
        
        if not self.auto_run:
            return False
        
        # 如果指定了启用列表且技能不在列表中
        if self.enabled_skills and skill_name not in self.enabled_skills:
            return False
        
        # 如果技能在禁用列表中
        if skill_name in self.disabled_skills:
            return False
        
        return True
    
    def validate_and_fix(self, text: str, mode: Optional[ValidationMode] = None, 
                        skill_name: str = "", schema_key: str = "") -> ValidationResult:
        """验证并修复JSON文本"""
        start_time = time.time()
        mode = mode or self.mode
        
        # 性能监控
        self.total_validations += 1
        
        result = ValidationResult(
            is_valid=False,
            mode=mode,
            original_text=text,
            parsed_json=None,
            errors=[],
            warnings=[],
            fixed_text=None,
            confidence_score=0.0,
            processing_time_ms=0.0,
            suggestions=[]
        )
        
        try:
            if mode == ValidationMode.STRICT:
                self._strict_validate(text, result)
            elif mode == ValidationMode.LENIENT:
                self._lenient_validate(text, result)
            elif mode == ValidationMode.HEURISTIC:
                self._heuristic_validate(text, result)
            
            # 应用Schema验证（如果指定）
            if schema_key and schema_key in self.json_schemas:
                self._validate_schema(result.parsed_json, schema_key, result)
            
            # 计算置信度
            self._calculate_confidence(result)
            
        except Exception as e:
            self.logger.error(f"JSON验证异常: {str(e)}")
            result.errors.append({
                "type": "validation_error",
                "message": f"验证过程出错: {str(e)}",
                "position": None
            })
        
        # 计算处理时间
        end_time = time.time()
        processing_time = (end_time - start_time) * 1000
        result.processing_time_ms = processing_time
        self.total_time_ms += processing_time
        
        return result
    
    def _strict_validate(self, text: str, result: ValidationResult):
        """严格JSON验证"""
        try:
            parsed = json.loads(text)
            result.is_valid = True
            result.parsed_json = parsed
            result.fixed_text = text
            result.confidence_score = 1.0
        except json.JSONDecodeError as e:
            result.errors.append({
                "type": "invalid_json",
                "message": f"JSON解析错误: {e.msg}",
                "position": {"line": e.lineno, "column": e.colno},
                "context": self._get_error_context(text, e.pos)
            })
            result.suggestions.append("使用标准JSON格式，避免注释和尾逗号")
    
    def _lenient_validate(self, text: str, result: ValidationResult):
        """宽松模式验证"""
        fixed_text = text
        warnings = []
        
        # 移除单行注释
        fixed_text = re.sub(r'//.*$', '', fixed_text, flags=re.MULTILINE)
        
        # 移除多行注释
        fixed_text = re.sub(r'/\*.*?\*/', '', fixed_text, flags=re.DOTALL)
        
        # 移除尾逗号
        fixed_text = re.sub(r',\s*([}\]])', r'\1', fixed_text)
        
        # 尝试修复缺少引号的键
        fixed_text = re.sub(r'(?<=[\{,\s])\s*(\w+)\s*:', r' "\1":', fixed_text)
        