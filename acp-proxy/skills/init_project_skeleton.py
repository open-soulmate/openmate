#!/usr/bin/env python3
"""
项目骨架初始化技能
用于快速创建标准化项目基础结构
"""
import os
import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# 项目类型配置字典：定义每种项目的目录结构和默认文件
PROJECT_TEMPLATES = {
    "basic": {
        "directories": ["src", "tests", "docs"],
        "files": {
            "requirements.txt": "# 项目依赖\n",
            ".gitignore": """# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
*.egg-info/
dist/
build/
"""
        }
    },
    "api_service": {
        "directories": ["src", "routes", "models", "utils", "tests", "docs", "config"],
        "files": {
            "requirements.txt": """flask>=2.0.0
requests>=2.25.0
gunicorn>=20.1.0
""",
            "src/__init__.py": "# API 服务入口\n",
            "routes/__init__.py": "# API 路由\n",
            "models/__init__.py": "# 数据模型\n",
            "utils/__init__.py": "# 工具函数\n",
            "config/__init__.py": "# 配置管理\n",
            "config/settings.py": """# 配置文件示例
class Config:
    DEBUG = False
    SECRET_KEY = 'your-secret-key'
    
class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    SECRET_KEY = os.environ.get('SECRET_KEY', 'fallback-secret-key')
"""
        }
    },
    "data_processor": {
        "directories": ["data", "src", "processors", "output", "tests", "docs"],
        "files": {
            "requirements.txt": """pandas>=1.3.0
numpy>=1.21.0
scikit-learn>=1.0.0
""",
            "data/__init__.py": "# 数据目录\n",
            "src/__init__.py": "# 数据处理源码\n",
            "processors/__init__.py": "# 数据处理器\n",
            "output/__init__.py": "# 输出目录\n",
            "src/processor.py": '''"""数据处理器模板"""

class DataProcessor:
    """数据处理器基类"""
    
    def __init__(self):
        self.data = None
        
    def load_data(self, path):
        """加载数据"""
        # TODO: 实现数据加载逻辑
        pass
        
    def process(self):
        """处理数据"""
        # TODO: 实现数据处理逻辑
        pass
        
    def save_output(self, output_path):
        """保存处理结果"""
        # TODO: 实现结果保存逻辑
        pass
'''
        }
    }
}

def init_skeleton(
    project_name: str, 
    project_type: str = "basic", 
    description: str = "", 
    root_dir: str = ".",
    interactive: bool = True
) -> Tuple[bool, List[str], List[str]]:
    """
    初始化项目骨架
    
    Args:
        project_name: 项目名称
        project_type: 项目类型，支持 'basic', 'api_service', 'data_processor'
        description: 项目描述
        root_dir: 根目录路径
        interactive: 是否为交互模式（询问覆盖策略）
        
    Returns:
        Tuple: (成功标志, 创建的文件列表, 下一步建议列表)
    """