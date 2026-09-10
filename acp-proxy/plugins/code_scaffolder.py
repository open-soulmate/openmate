import os
from pathlib import Path

def create_code_file(file_type: str, file_path: str, class_name: str, description: str) -> bool:
    """
    代码脚手架插件，用于自动化创建技能和插件的基础代码文件
    
    参数:
        file_type: 字符串，'skill' 或 'plugin'，决定生成的模板类型
        file_path: 字符串，完整的文件路径，例如 'acp-proxy/skills/new_skill.py'
        class_name: 字符串，将要创建的类名（例如 'NewSkill'）
        description: 字符串，该模块的简要描述，将写入文档字符串
    
    返回:
        布尔值，表示文件是否创建成功
    """
    
    # 根据文件类型选择模板
    if file_type == 'skill':
        template = f'''"""
{description}
"""

from acp_proxy.skills.base import BaseSkill
from typing import Any, Dict


class {class_name}(BaseSkill):
    """
    {description}
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """初始化{class_name}技能"""
        super().__init__(config)
        self.skill_name = "{class_name}"
        self.description = "{description}"
    
    def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        技能主执行逻辑
        
        参数:
            input_data: 输入数据字典
            
        返回:
            包含执行结果的字典
        """
        try:
            # 在这里实现技能的主要逻辑
            result = {
                "status": "success",
                "message": f"{class_name}技能执行完成",
                "data": input_data
            }
            return result
        except Exception as e:
            return {
                "status": "error",
                "message": f"技能执行失败: {str(e)}"
            }
'''
    elif file_type == 'plugin':
        template = f'''"""
{description}
"""

from acp_proxy.plugins.base import BasePlugin
from typing import Any, Dict, List


class {class_name}(BasePlugin):
    """
    {description}
    """
    
    def __init__(self):
        """初始化{class_name}插件"""
        super().__init__()
        self.plugin_name = "{class_name}"
        self.description = "{description}"
        self.version = "1.0.0"
    
    def execute(self, command: str, **kwargs) -> Dict[str, Any]:
        """
        插件主执行逻辑
        
        参数:
            command: 要执行的命令
            **kwargs: 命令参数
            
        返回:
            包含执行结果的字典
        """
        try:
            # 在这里实现插件的主要逻辑
            result = {
                "status": "success",
                "plugin": self.plugin_name,
                "command": command,
                "message": f"{class_name}插件执行完成"
            }
            return result
        except Exception as e:
            return {
                "status": "error",
                "plugin": self.plugin_name,
                "command": command,
                "message": f"插件执行失败: {str(e)}"
            }
    
    def get_commands(self) -> List[str]:
        """
        获取插件支持的命令列表
        
        返回:
            命令列表
        """
        return ["example_command"]
    
    def get_help(self, command: str = None) -> str:
        """
        获取插件帮助信息
        
        参数:
            command: 特定命令的帮助信息，如果为None则返回插件整体帮助
            
        返回:
            帮助信息字符串
        """
        if command:
            return f"命令 '{command}' 的帮助信息"
        return f"{self.plugin_name} 插件: {self.description}"
'''
    else:
        return False
    
    try:
        # 转换为Path对象并解析路径
        path = Path(file_path)
        
        # 检查并创建目录（如果不存在）
        if path.parent:
            path.parent.mkdir(parents=True, exist_ok=True)
        
        # 写入模板内容
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(template)
        
        # 验证文件是否创建成功
        if path.exists():
            return True
        else:
            return False
            
    except Exception as e:
        print(f"创建文件时发生错误: {str(e)}")
        return False