#!/usr/bin/env python3
"""
ACP技能：初始化项目基础结构
根据项目类型创建标准化的项目骨架
"""

import os
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Set
import questionary
from rich.console import Console
from rich.tree import Tree

console = Console()

# 项目类型模板定义
PROJECT_TEMPLATES: Dict[str, Dict[str, List[str]]] = {
    "basic": {
        "directories": [],
        "files": ["__init__.py", "README.md", "config.example.py"]
    },
    "api_service": {
        "directories": ["routes", "models", "services", "tests"],
        "files": ["__init__.py", "README.md", "config.example.py", "requirements.txt"]
    },
    "data_processor": {
        "directories": ["data/input", "data/output", "processors", "utils", "tests"],
        "files": ["__init__.py", "README.md", "config.example.py", "requirements.txt"]
    }
}

def get_project_structure(project_type: str) -> Dict[str, List[str]]:
    """获取项目类型的目录和文件结构"""
    return PROJECT_TEMPLATES.get(project_type, PROJECT_TEMPLATES["basic"])

def check_existing_structure(root_path: Path, template: Dict[str, List[str]]) -> Dict[str, Set[Path]]:
    """检查已存在的目录和文件结构"""
    existing = {
        "directories": set(),
        "files": set()
    }
    
    # 检查目录
    for dir_path in template["directories"]:
        full_path = root_path / dir_path
        if full_path.exists():
            existing["directories"].add(dir_path)
    
    # 检查文件
    for file_path in template["files"]:
        full_path = root_path / file_path
        if full_path.exists():
            existing["files"].add(file_path)
    
    return existing

def create_directory_structure(root_path: Path, template: Dict[str, List[str]], mode: str) -> List[str]:
    """创建目录结构"""
    created_items = []
    
    # 创建目录
    for dir_path in template["directories"]:
        full_path = root_path / dir_path
        if not full_path.exists():
            full_path.mkdir(parents=True, exist_ok=True)
            created_items.append(f"📁 创建目录: {dir_path}")
    
    return created_items

def create_init_file(file_path: Path) -> None:
    """创建__init__.py文件"""
    content = '''"""
初始化文件
"""
'''
    file_path.write_text(content, encoding='utf-8')

def create_readme(file_path: Path, project_name: str, description: str) -> None:
    """创建README.md文件"""
    content = f'''# {project_name}

{description if description else "项目描述"}

## 创建时间
{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 项目结构
请在此处添加项目结构说明

## 安装和使用
请在此处添加安装和使用说明

## 开发说明
请在此处添加开发说明
'''
    file_path.write_text(content, encoding='utf-8')

def create_config_example(file_path: Path, project_type: str) -> None:
    """创建config.example.py文件"""
    if project_type == "api_service":
        content = '''# API服务配置示例
HOST = "0.0.0.0"
PORT = 8000
DEBUG = True
DATABASE_URL = "sqlite:///./app.db"
SECRET_KEY = "your-secret-key-here"
'''
    elif project_type == "data_processor":
        content = '''# 数据处理器配置示例
INPUT_DIR = "./data/input"
OUTPUT_DIR = "./data/output"
BATCH_SIZE = 100
LOG_LEVEL = "INFO"
'''
    else:
        content = '''# 基础配置示例
DEBUG = True
LOG_LEVEL = "INFO"
'''
    file_path.write_text(content, encoding='utf-8')

def create_requirements_file(file_path: Path, project_type: str) -> None:
    """创建requirements.txt文件"""
    if project_type == "api_service":
        content = '''# API服务依赖
fastapi>=0.68.0
uvicorn>=0.15.0
sqlalchemy>=1.4.0
pydantic>=1.8.0
python-multipart>=0.0.5
'''
    elif project_type == "data_processor":
        content = '''# 数据处理器依赖
pandas>=1.3.0
numpy>=1.21.0
sqlalchemy>=1.4.0
pydantic>=1.8.0
tqdm>=4.62.0
'''
    else:
        content = '''# 基础依赖
# 根据项目需求添加依赖包
'''
    file_path.write_text(content, encoding='utf-8')

def create_files(root_path: Path, template: Dict[str, List[str]], project_name: str, description: str) -> List[str]:
    """创建文件"""
    created_items = []
    
    for file_path in template["files"]:
        full_path = root_path / file_path
        
        # 根据文件类型创建不同内容
        if file_path == "__init__.py":
            create_init_file(full_path)
        elif file_path == "README.md":
            create_readme(full_path, project_name, description)
        elif file_path == "config.example.py":
            create_config_example(full_path, template["project_type"])
        elif file_path == "requirements.txt":
            create_requirements_file(full_path, template["project_type"])
        
        created_items.append(f"📄 创建文件: {file_path}")
    
    return created_items

def show_next_steps(project_type: str) -> None:
    """显示下一步建议"""
    console.print("\n[bold green]✅ 项目初始化完成！[/bold green]")
    
    tree = Tree("[bold cyan]📋 下一步建议[/bold cyan]")
    
    if project_type == "basic":
        tree.add("📝 编写requirements.txt并初始化虚拟环境")
        tree.add("📖 补充README.md中的项目描述")
        tree.add("⚙️ 根据实际需求修改config.example.py")
    elif project_type == "api_service":
        tree.add("📝 安装依赖: [bold]pip install -r requirements.txt[/bold]")
        tree.add("📖 添加路由到routes/目录")
        tree.add("📑 定义数据模型到models/目录")