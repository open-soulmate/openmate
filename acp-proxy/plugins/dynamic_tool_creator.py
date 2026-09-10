import json
import re
import os
import sys
import uuid
import shutil
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import importlib.util

class DynamicToolCreator:
    """动态工具创建器插件，使agent能在运行时创建新的MCP工具定义并注册到系统中。"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        初始化动态工具创建器。
        
        Args:
            config: 配置字典，包含工具命名前缀、代码存储路径等
        """
        self.config = config or {}
        self.tool_prefix = self.config.get('tool_prefix', 'dynamic_')
        self.tools_directory = self.config.get('tools_directory', 'acp-proxy/tools/dynamic/')
        self.index_file = self.config.get('index_file', 'tools_index.json')
        
        # 确保工具目录存在
        os.makedirs(self.tools_directory, exist_ok=True)
        
        # 初始化工具索引
        self.tools_index = self._load_tools_index()
    
    def _load_tools_index(self) -> Dict[str, Any]:
        """加载工具索引文件。"""
        index_path = os.path.join(self.tools_directory, self.index_file)
        if os.path.exists(index_path):
            try:
                with open(index_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"tools": {}, "metadata": {"created": datetime.now().isoformat()}}
        else:
            return {"tools": {}, "metadata": {"created": datetime.now().isoformat()}}
    
    def _save_tools_index(self) -> None:
        """保存工具索引文件。"""
        index_path = os.path.join(self.tools_directory, self.index_file)
        try:
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(self.tools_index, f, indent=2, ensure_ascii=False)
        except IOError as e:
            print(f"警告：无法保存工具索引文件: {e}")
    
    def collect_requirement(self, conversation_history: List[str] = None, 
                           user_request: str = None) -> Dict[str, Any]:
        """
        分析近期对话历史或用户直接请求，识别工具需求。
        
        Args:
            conversation_history: 对话历史列表
            user_request: 用户直接请求
            
        Returns:
            工具需求字典，包含需求描述、关键词、意图等
        """
        # 如果提供了对话历史，则合并为一个文本
        if conversation_history:
            text = ' '.join(conversation_history[-5:])  # 取最近5条对话
        else:
            text = user_request or ""
        
        # 需求关键词模式
        patterns = [
            r'需要[一个]?([\w]+)工具',
            r'添加([\w]+)功能',
            r'创建[一个]?([\w]+)工具',
            r'实现([\w]+)工具',
            r'想要[一个]?([\w]+)工具',
            r'建[一个]?([\w]+)工具'
        ]
        
        # 尝试匹配需求
        requirement = {
            "original_text": text,
            "tool_name": "",
            "description": "",
            "intent": "",
            "keywords": []
        }
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                tool_name = match.group(1)
                requirement["tool_name"] = self._normalize_tool_name(tool_name)
                requirement["description"] = f"用于{tool_name}的工具"
                requirement["intent"] = f"创建{tool_name}工具"
                requirement["keywords"] = [tool_name]
                break
        
        # 如果没有匹配到具体工具名称，尝试提取一般性需求
        if not requirement["tool_name"]:
            # 提取可能的工具描述关键词
            keywords = re.findall(r'工具|功能|查询|计算|转换|处理|生成|获取|显示', text)
            if keywords:
                requirement["keywords"] = list(set(keywords))
                requirement["description"] = "通用工具"
                requirement["intent"] = "创建通用工具"
        
        return requirement
    
    def _normalize_tool_name(self, name: str) -> str:
        """规范化工具名称，确保符合Python标识符规则。"""
        # 移除特殊字符，替换为空格
        name = re.sub(r'[^\w\s]', '', name)
        # 替换空格为下划线
        name = re.sub(r'\s+', '_', name)
        # 转换为小写
        name = name.lower()
        # 确保名称不以数字开头
        if name and name[0].isdigit():
            name = 'tool_' + name
        return name
    
    def generate_tool_spec(self, requirement: Dict[str, Any]) -> Dict[str, Any]:
        """
        将需求转换为MCP工具定义格式。
        
        Args:
            requirement: 工具需求字典
            
        Returns:
            MCP工具定义字典，包含name、description、parameters、return_type
        """
        # 生成工具名称
        tool_name = requirement.get("tool_name", "")
        if not tool_name:
            tool_name = f"tool_{uuid.uuid4().hex[:8]}"
        
        # 确保工具名称有前缀
        if not tool_name.startswith(self.tool_prefix):
            tool_name = f"{self.tool_prefix}{tool_name}"
        
        # 根据需求类型生成参数定义
        parameters = self._generate_parameters_from_requirement(requirement)
        
        # 生成返回类型
        return_type = self._generate_return_type_from_requirement(requirement)
        
        # 创建工具规范
        spec = {
            "name": tool_name,
            "description": requirement.get("description", f"动态创建的工具: {tool_name}"),
            "parameters": parameters,
            "return_type": return_type,
            "version": "1.0.0",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "author": "DynamicToolCreator",
            "tags": requirement.get("keywords", []),
            "metadata": {
                "requirement": requirement,
                "auto_generated": True
            }
        }
        
        return spec
    
    def _generate_parameters_from_requirement(self, requirement: Dict[str, Any]) -> Dict[str, Any]:
        """根据需求生成参数定义。"""
        # 基本参数定义
        parameters = {
            "type": "object",
            "properties": {},
            "required": []
        }
        
        # 根据需求关键词添加参数
        keywords = requirement.get("keywords", [])
        
        # 添加查询参数
        if any(kw in ["查询", "搜索", "获取", "检索"] for kw in keywords):
            parameters["properties"]["query"] = {
                "type": "string",
                "description": "查询字符串",
                "default": ""
            }
        
        # 添加数值参数
        if any(kw in ["计算", "转换", "数值", "计算"] for kw in keywords):
            parameters["properties"]["value"] = {
                "type": "number",
                "description": "数值输入",
                "default": 0
            }