import os

def create_code_file(file_type: str, file_path: str, class_name: str, description: str) -> bool:
    """
    创建一个代码文件用于技能或插件的脚手架。

    参数:
        file_type (str): 'skill' 或 'plugin'，决定生成的模板类型。
        file_path (str): 完整的文件路径，例如 'acp-proxy/skills/new_skill.py'。
        class_name (str): 将要创建的类名，例如 'NewSkill'。
        description (str): 模块的简要描述，将写入文档字符串。

    返回:
        bool: 文件是否创建成功。
    """
    # 根据 file_type 定义代码模板
    templates = {
        'skill': '''from acp_proxy.skills.base import BaseSkill


class {class_name}(BaseSkill):
    """
    {description}
    """

    def __init__(self):
        """
        初始化 {class_name} 实例。
        """
        super().__init__()
        # 添加初始化逻辑

    def run(self):
        """
        运行技能的主逻辑。
        """
        # 添加技能执行逻辑
        pass
''',
        'plugin': '''from acp_proxy.plugins.base import BasePlugin


class {class_name}(BasePlugin):
    """
    {description}
    """

    def __init__(self):
        """
        初始化 {class_name} 实例。
        """
        super().__init__()
        # 添加初始化逻辑

    def execute(self):
        """
        执行插件的主逻辑。
        """
        # 添加插件执行逻辑
        pass
'''
    }

    # 检查 file_type 是否有效
    if file_type not in templates:
        return False

    # 格式化模板字符串
    template = templates[file_type]
    code_content = template.format(class_name=class_name, description=description)

    # 检查并创建目录
    dir_path = os.path.dirname(file_path)
    if dir_path and not os.path.exists(dir_path):
        try:
            os.makedirs(dir_path, exist_ok=True)
        except OSError:
            return False

    # 写入文件
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(code_content)
        return True
    except (IOError, OSError):
        return False