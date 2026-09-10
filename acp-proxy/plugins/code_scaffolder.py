import os
from typing import Optional

class CodeScaffolder:
    """代码脚手架插件，用于自动化创建技能和插件的基础代码文件"""
    
    SKILL_TEMPLATE = '''"""{{description}}"""
from acp_proxy.skills.base_skill import BaseSkill

class {{class_name}}(BaseSkill):
    """{{description}}"""
    
    def __init__(self):
        """初始化{{class_name}}"""
        super().__init__()
        self.name = "{{class_name}}"
        self.description = "{{description}}"
    
    def run(self, *args, **kwargs):
        """
        主执行方法
        
        Args:
            *args: 位置参数
            **kwargs: 关键字参数
            
        Returns:
            执行结果
        """
        # 在此实现技能逻辑
        print(f"执行{self.name}技能")
        return True
'''
    
    PLUGIN_TEMPLATE = '''"""{{description}}"""
from acp_proxy.plugins.base_plugin import BasePlugin

class {{class_name}}(BasePlugin):
    """{{description}}"""
    
    def __init__(self):
        """初始化{{class_name}}"""
        super().__init__()
        self.name = "{{class_name}}"
        self.description = "{{description}}"
    
    def execute(self, *args, **kwargs):
        """
        主执行方法
        
        Args:
            *args: 位置参数
            **kwargs: 关键字参数
            
        Returns:
            执行结果
        """
        # 在此实现插件逻辑
        print(f"执行{self.name}插件")
        return True
'''
    
    @staticmethod
    def _get_template(file_type: str, class_name: str, description: str) -> Optional[str]:
        """根据文件类型获取对应的代码模板"""
        if file_type == 'skill':
            template = CodeScaffolder.SKILL_TEMPLATE
        elif file_type == 'plugin':
            template = CodeScaffolder.PLUGIN_TEMPLATE
        else:
            return None
        
        # 替换模板中的占位符
        template = template.replace('{{description}}', description)
        template = template.replace('{{class_name}}', class_name)
        
        return template
    
    @staticmethod
    def _ensure_directory_exists(file_path: str) -> bool:
        """确保文件路径的目录存在，不存在则创建"""
        try:
            directory = os.path.dirname(file_path)
            if not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)
            return True
        except Exception as e:
            print(f"创建目录时出错: {e}")
            return False
    
    @staticmethod
    def create_code_file(file_type: str, file_path: str, class_name: str, description: str) -> bool:
        """
        创建代码文件
        
        Args:
            file_type: 字符串，'skill' 或 'plugin'，决定生成的模板类型
            file_path: 字符串，完整的文件路径，例如 acp-proxy/skills/new_skill.py
            class_name: 字符串，将要创建的类名（例如 NewSkill）
            description: 字符串，该模块的简要描述，将写入文档字符串
            
        Returns:
            布尔值，表示文件是否创建成功
        """
        try:
            # 验证参数
            if file_type not in ('skill', 'plugin'):
                print(f"错误: 不支持的文件类型 '{file_type}'，只支持 'skill' 或 'plugin'")
                return False
            
            # 确保目录存在
            if not CodeScaffolder._ensure_directory_exists(file_path):
                return False
            
            # 获取模板
            template = CodeScaffolder._get_template(file_type, class_name, description)
            if template is None:
                return False
            
            # 写入文件
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(template)
            
            print(f"成功创建{file_type}文件: {file_path}")
            return True
            
        except Exception as e:
            print(f"创建文件时出错: {e}")
            return False

# 插件入口点，供调用方使用
def main():
    """插件主函数，供外部调用"""
    # 示例用法
    scaffolder = CodeScaffolder()
    
    # 创建一个示例技能
    skill_created = scaffolder.create_code_file(
        file_type='skill',
        file_path='acp-proxy/skills/example_skill.py',
        class_name='ExampleSkill',
        description='示例技能，用于演示代码脚手架功能'
    )
    
    # 创建一个示例插件
    plugin_created = scaffolder.create_code_file(
        file_type='plugin',
        file_path='acp-proxy/plugins/example_plugin.py',
        class_name='ExamplePlugin',
        description='示例插件，用于演示代码脚手架功能'
    )
    
    return skill_created and plugin_created

if __name__ == '__main__':
    main()