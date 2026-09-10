#!/usr/bin/env python3
"""
初始化项目骨架技能
快速创建最小可行的项目基础结构，避免探索性开发后项目结构混乱
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import questionary
from rich.console import Console
from rich.table import Table
from rich.prompt import Prompt
from rich import print as rprint

console = Console()

# 项目类型配置
PROJECT_TYPES = {
    'basic': {
        'name': '基础项目',
        'description': '通用基础项目结构',
        'directories': ['src', 'tests', 'docs'],
        'files': {
            'requirements.txt': '# 项目依赖\n',
            '.gitignore': '# 忽略文件\n__pycache__/\n*.pyc\n.env\nvenv/\n',
            'pyproject.toml': '''[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "{project_name}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
requires-python = ">=3.8"
'''
        }
    },
    'api_service': {
        'name': 'API服务',
        'description': 'RESTful API服务结构',
        'directories': ['routes', 'models', 'schemas', 'services', 'middleware', 'tests', 'docs', 'config'],
        'files': {
            'requirements.txt': '''fastapi>=0.100.0
uvicorn>=0.22.0
sqlalchemy>=2.0.0
alembic>=1.11.0
pydantic>=2.0.0
python-jose>=3.3.0
passlib>=1.7.4
bcrypt>=4.0.1
''',
            '.gitignore': '''# 忽略文件
__pycache__/
*.pyc
.env
venv/
*.db
*.sqlite3
''',
            'pyproject.toml': '''[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "{project_name}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
requires-python = ">=3.8"

[tool.uv]
dev-dependencies = [
    "pytest>=7.0",
    "httpx>=0.24.0",
    "pytest-asyncio>=0.21.0",
]
'''
        }
    },
    'data_processor': {
        'name': '数据处理器',
        'description': '数据处理与分析项目结构',
        'directories': ['data', 'data/raw', 'data/processed', 'notebooks', 'scripts', 'models', 'tests', 'docs'],
        'files': {
            'requirements.txt': '''pandas>=2.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
seaborn>=0.12.0
jupyter>=1.0.0
''',
            '.gitignore': '''# 忽略文件
__pycache__/
*.pyc
.env
venv/
data/raw/*
data/processed/*
!data/raw/.gitkeep
!data/processed/.gitkeep
*.pkl
*.joblib
''',
            'pyproject.toml': '''[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "{project_name}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
requires-python = ">=3.8"

[tool.uv]
dev-dependencies = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
]
'''
        }
    }
}


def init_skeleton(
    project_name: str, 
    project_type: str = 'basic', 
    description: str = '',
    base_path: str = '.'
) -> Dict[str, List[str]]:
    """
    初始化项目骨架
    
    Args:
        project_name: 项目名称
        project_type: 项目类型 ('basic', 'api_service', 'data_processor')
        description: 项目描述
        base_path: 基础路径（默认为当前目录）
        
    Returns:
        创建的文件和目录清单
    """
    
    # 验证项目类型
    if project_type not in PROJECT_TYPES:
        rprint(f"[red]错误: 不支持的项目类型 '{project_type}'[/red]")
        rprint(f"[yellow]支持的项目类型: {', '.join(PROJECT_TYPES.keys())}[/yellow]")
        sys.exit(1)
    