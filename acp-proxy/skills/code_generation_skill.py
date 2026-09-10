"""
代码生成技能模块

使agent能够根据自然语言描述生成Python代码片段并保存为文件。
支持需求解析、代码生成、代码优化和文件保存功能。
"""

import os
import re
import ast
import logging
import textwrap
from typing import Dict, Any, Optional, List, Tuple, Union
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class CodeType(Enum):
    """代码类型枚举"""
    FUNCTION = "function"
    CLASS = "class"
    SCRIPT = "script"
    MODULE = "module"


class CodeStyle(Enum):
    """代码风格枚举"""
    PEP8 = "pep8"
    GOOGLE = "google"
    NUMPY = "numpy"


@dataclass
class Parameter:
    """函数/方法参数描述"""
    name: str
    type_hint: str = "Any"
    default_value: Optional[str] = None
    description: str = ""


@dataclass
class CodeSpec:
    """代码规格描述"""
    code_type: CodeType = CodeType.FUNCTION
    name: str = ""
    description: str = ""
    parameters: List[Parameter] = field(default_factory=list)
    return_type: str = "None"
    return_description: str = ""
    imports: List[str] = field(default_factory=list)
    class_name: Optional[str] = None
    parent_classes: List[str] = field(default_factory=list)
    methods: List['CodeSpec'] = field(default_factory=list)
    attributes: List[Dict[str, str]] = field(default_factory=list)
    body_hint: str = ""
    decorators: List[str] = field(default_factory=list)


@dataclass
class GenerationResult:
    """代码生成结果"""
    code: str
    summary: str
    spec: CodeSpec
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class CodeGenerationSkill:
    """
    代码生成技能类
    
    使agent能够根据自然语言描述生成Python代码片段并保存为文件。
    支持生成函数、类和完整模块。
    """
    
    # 类型关键词映射
    TYPE_KEYWORDS = {
        "整数": "int", "数字": "int", "int": "int", "整型": "int",
        "浮点": "float", "浮点数": "float", "小数": "float", "float": "float",
        "字符串": "str", "文本": "str", "str": "str",
        "布尔": "bool", "bool": "bool", "真假": "bool",
        "列表": "List", "list": "List", "数组": "List",
        "字典": "Dict", "dict": "Dict", "映射": "Dict",
        "集合": "Set", "set": "Set",
        "元组": "Tuple", "tuple": "Tuple",
        "任意": "Any", "any": "Any", "any": "Any",
        "无": "None", "none": "None", "void": "None",
        "文件": "TextIO", "路径": "str",
    }
    
    # 动作关键词映射
    ACTION_KEYWORDS = {
        "计算": "calculate", "求": "calculate", "算": "calculate",
        "创建": "create", "新建": "create", "生成": "generate",
        "读取": "read", "读": "read", "获取": "get",
        "写入": "write", "写": "write", "保存": "save", "存储": "save",
        "删除": "delete", "移除": "remove", "清除": "clear",
        "更新": "update", "修改": "update", "改变": "update",
        "查找": "find", "搜索": "search", "查询": "query",
        "验证": "validate", "检查": "check", "校验": "verify",
        "转换": "convert", "变换": "transform",
        "打印": "print", "输出": "display", "显示": "display",
        "连接": "connect", "链接": "link",
        "发送": "send", "接收": "receive",
        "解析": "parse", "分析": "analyze",
        "排序": "sort", "过滤": "filter", "筛选": "filter",
        "求和": "sum", "求平均": "average", "求最大": "max", "求最小": "min",
    }
    
    # 类型推断关键词
    TYPE_INFERENCE = {
        "和": "int", "求和": "int", "总和": "int", "累加": "int",
        "平均": "float", "均值": "float",
        "名字": "str", "姓名": "str", "标题": "str",
        "列表": "List", "数组": "List", "集合": "List",
        "是否": "bool", "判断": "bool", "检查": "bool",
    }
    
    def __init__(
        self,
        code_style: CodeStyle = CodeStyle.PEP8,
        template_dir: Optional[str] = None,
        default_output_dir: str = "generated_code",
        enable_logging: bool = True,
        enable_type_hints: bool = True,
        enable_docstrings: bool = True,
    ):
        """
        初始化代码生成技能
        
        Args:
            code_style: 代码风格，默认PEP8
            template_dir: 模板目录路径
            default_output_dir: 默认输出目录
            enable_logging: 是否启用日志装饰器
            enable_type_hints: 是否启用类型提示
            enable_docstrings: 是否启用文档字符串
        """
        self.code_style = code_style
        self.template_dir = template_dir
        self.default_output_dir = default_output_dir
        self.enable_logging = enable_logging
        self.enable_type_hints = enable_type_hints
        self.enable_docstrings = enable_docstrings
        
        # 初始化日志
        self._setup_logging()
        
        logger.info(f"CodeGenerationSkill 初始化完成，风格: {code_style.value}")
    
    def _setup_logging(self) -> None:
        """配置日志"""
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
    
    def parse_requirement(self, text: str) -> CodeSpec:
        """
        解析自然语言需求，提取关键信息
        
        Args:
            text: 自然语言描述，如 '创建一个计算两个数和的函数'
            
        Returns:
            CodeSpec: 结构化的代码规格描述
            
        Examples:
            >>> skill = CodeGenerationSkill()
            >>> spec = skill.parse_requirement("创建一个计算两个数和的函数")
            >>> spec.name
            'calculate_sum'
            >>> spec.code_type
            CodeType.FUNCTION
        """
        text = text.strip().lower()
        spec = CodeSpec()
        
        # 1. 检测代码类型
        spec.code_type = self._detect_code_type(text)
        
        # 2. 提取名称
        spec.name = self._extract_name(text, spec.code_type)
        
        # 3. 提取描述
        spec.description = text
        
        # 4. 提取参数
        spec.parameters = self._extract_parameters(text)
        
        # 5. 推断返回类型
        spec.return_type = self._infer_return_type(text, spec.parameters)
        
        # 6. 提取导入
        spec.imports = self._extract_imports(text)
        
        # 7. 提取类相关信息（如果是类）
        if spec.code_type == CodeType.CLASS:
            spec.parent_classes = self._extract_parent_classes(text)
            spec.methods = self._extract_class_methods(text)
            spec.attributes = self._extract_class_attributes(text)
        
        # 8. 提取body hint
        spec.body_hint = self._extract_body_hint(text)
        
        logger.info(f"需求解析完成: {spec.code_type.value} {spec.name}")
        return spec
    
    def _detect_code_type(self, text: str) -> CodeType:
        """检测要生成的代码类型"""