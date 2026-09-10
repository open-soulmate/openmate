import os
from typing import Dict, Any, Optional
from pathlib import Path


class CodeScaffolder:
    """
    代码脚手架插件，用于自动化创建技能和插件的基础代码文件。
    直接服务于“工具创造”和“自编程能力”目标。
    当`evolution_planner`技能规划出需要新建一个skill或plugin的改进项时，
    本插件将被调用来执行文件创建。
    """

    # 模板字典，存储不同文件类型的代码模板
    TEMPLATES: Dict[str, str] = {
        'skill': '''"""
{description}

这是由代码脚手架自动生成的技能文件。
"""

from acp_proxy.skills.base_skill import BaseSkill


class {class_name}(BaseSkill):
    """{description}"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """初始化技能。

        Args:
            config: 配置字典，包含技能运行所需的参数
        """
        super().__init__(config)
        self.name = "{class_name.lower()}"
        self.description = "{description}"

    def run(self, input_data: Any) -> Any:
        """执行技能的主要功能。

        Args:
            input_data: 输入数据，类型取决于具体技能

        Returns:
            处理结果，类型取决于具体技能

        Raises:
            NotImplementedError: 子类必须实现此方法
        """
        # TODO: 实现具体的技能逻辑
        raise NotImplementedError("子类必须实现run方法")

    def validate_input(self, input_data: Any) -> bool:
        """验证输入数据的有效性。

        Args:
            input_data: 待验证的输入数据

        Returns:
            如果输入有效返回True，否则返回False
        """
        # TODO: 实现输入验证逻辑
        return True
''',
        'plugin': '''"""
{description}

这是由代码脚手架自动生成的插件文件。
"""

from acp_proxy.plugins.base_plugin import BasePlugin


class {class_name}(BasePlugin):
    """{description}"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """初始化插件。

        Args:
            config: 配置字典，包含插件运行所需的参数
        """
        super().__init__(config)
        self.name = "{class_name.lower()}"
        self.description = "{description}"
        self.version = "1.0.0"

    def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行插件的主要功能。

        Args:
            context: 上下文字典，包含执行环境信息

        Returns:
            包含执行结果的字典

        Raises:
            NotImplementedError: 子类必须实现此方法
        """
        # TODO: 实现具体的插件逻辑
        raise NotImplementedError("子类必须实现execute方法")

    def get_dependencies(self) -> list:
        """获取插件的依赖项列表。

        Returns:
            依赖项列表，每个元素是一个依赖描述
        """
        # TODO: 根据插件需求返回依赖项
        return []
'''
    }

    @staticmethod
    def create_code_file(
        file_type: str,
        file_path: str,
        class_name: str,
        description: str
    ) -> bool:
        """创建代码脚手架文件。

        Args:
            file_type: 文件类型，'skill' 或 'plugin'
            file_path: 完整的文件路径
            class_name: 类名
            description: 模块描述

        Returns:
            布尔值，表示文件是否创建成功

        Raises:
            ValueError: 当文件类型不是 'skill' 或 'plugin' 时
            OSError: 当文件写入失败时
        """
        # 验证文件类型
        if file_type not in CodeScaffolder.TEMPLATES:
            raise ValueError(f"不支持的文件类型: {file_type}，仅支持 'skill' 或 'plugin'")

        try:
            # 转换路径为Path对象
            path = Path(file_path)

            # 确保目录存在
            path.parent.mkdir(parents=True, exist_ok=True)

            # 获取模板并格式化
            template = CodeScaffolder.TEMPLATES[file_type]
            content = template.format(
                class_name=class_name,
                description=description
            )

            # 写入文件
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)

            print(f"成功创建{file_type}文件: {path}")
            return True

        except Exception as e:
            print(f"创建文件失败: {e}")
            return False