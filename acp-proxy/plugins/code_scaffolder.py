import os
import sys

class CodeScaffolderPlugin:
    """
    代码脚手架插件，用于自动化创建技能和插件的基础代码文件。
    当需要新建skill或plugin时，由evolution_planner调用此插件执行文件创建。
    """

    def create_code_file(self, file_type: str, file_path: str, class_name: str, description: str) -> bool:
        """
        创建代码文件
        
        Args:
            file_type: 字符串，'skill' 或 'plugin'，决定生成的模板类型
            file_path: 字符串，完整的文件路径，例如 'acp-proxy/skills/new_skill.py'
            class_name: 字符串，将要创建的类名（例如 'NewSkill'）
            description: 字符串，该模块的简要描述，将写入文档字符串
        
        Returns:
            bool: 表示文件是否创建成功
        """
        try:
            # 验证参数
            if file_type not in ['skill', 'plugin']:
                print(f"错误: file_type必须是'skill'或'plugin'，收到: {file_type}")
                return False
            
            # 确保文件路径以.py结尾
            if not file_path.endswith('.py'):
                file_path += '.py'
            
            # 根据文件类型选择模板
            template = self._get_template(file_type, class_name, description)
            
            # 检查并创建目录
            directory = os.path.dirname(file_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory)
                print(f"创建目录: {directory}")
            
            # 写入文件
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(template)
            
            print(f"成功创建{file_type}: {file_path}")
            return True
            
        except Exception as e:
            print(f"创建文件时发生错误: {str(e)}")
            return False
    
    def _get_template(self, file_type: str, class_name: str, description: str) -> str:
        """
        根据文件类型生成代码模板
        
        Args:
            file_type: 'skill' 或 'plugin'
            class_name: 类名
            description: 描述字符串
        
        Returns:
            str: 格式化后的代码模板字符串
        """
        if file_type == 'skill':
            return f'''# -*- coding: utf-8 -*-
"""
技能: {class_name}
{description}
"""

from acp_proxy.skills.base_skill import BaseSkill


class {class_name}(BaseSkill):
    """
    {description}
    """
    
    def __init__(self, **kwargs):
        """
        初始化技能
        
        Args:
            **kwargs: 可选参数
        """
        super().__init__(**kwargs)
        self.description = "{description}"
    
    async def run(self, *args, **kwargs):
        """
        执行技能的主要逻辑
        
        Args:
            *args: 位置参数
            **kwargs: 关键字参数
        
        Returns:
            Any: 技能执行结果
        """
        # TODO: 实现技能逻辑
        print(f"执行技能: {class_name}")
        return None
    
    def get_description(self) -> str:
        """
        获取技能描述
        
        Returns:
            str: 技能描述
        """
        return self.description


if __name__ == "__main__":
    # 示例用法
    skill = {class_name}()
    print(f"技能描述: {{skill.get_description()}}")
'''
        else:  # plugin
            return f'''# -*- coding: utf-8 -*-
"""
插件: {class_name}
{description}
"""

from acp_proxy.plugins.base_plugin import BasePlugin


class {class_name}(BasePlugin):
    """
    {description}
    """
    
    def __init__(self, **kwargs):
        """
        初始化插件
        
        Args:
            **kwargs: 可选参数
        """
        super().__init__(**kwargs)
        self.description = "{description}"
        self.name = "{class_name}"
    
    async def execute(self, *args, **kwargs):
        """
        执行插件功能
        
        Args:
            *args: 位置参数
            **kwargs: 关键字参数
        
        Returns:
            Any: 插件执行结果
        """
        # TODO: 实现插件逻辑
        print(f"执行插件: {class_name}")
        return None
    
    def get_name(self) -> str:
        """
        获取插件名称
        
        Returns:
            str: 插件名称
        """
        return self.name
    
    def get_description(self) -> str:
        """
        获取插件描述
        
        Returns:
            str: 插件描述
        """
        return self.description


if __name__ == "__main__":
    # 示例用法
    plugin = {class_name}()
    print(f"插件名称: {{plugin.get_name()}}")
    print(f"插件描述: {{plugin.get_description()}}")
'''


# 插件元数据
PLUGIN_NAME = "code_scaffolder"
PLUGIN_VERSION = "1.0.0"
PLUGIN_DESCRIPTION = "代码脚手架插件，用于自动化创建技能和插件的基础代码文件"
PLUGIN_AUTHOR = "ACP-Proxy Team"