#!/usr/bin/env python3
"""
项目扫描技能 - 优化版本
支持扩展文件类型识别和可配置扫描路径
"""

import os
import json
from typing import Dict, List, Optional, Set, Any
from pathlib import Path
import argparse
from dataclasses import dataclass, asdict


@dataclass
class ScanResult:
    """扫描结果数据结构"""
    total_files: int
    total_size: int
    file_type_stats: Dict[str, int]
    file_type_size_stats: Dict[str, int]
    files: List[Dict[str, Any]]
    scan_config: Dict[str, Any]


class ProjectScanner:
    """项目扫描器 - 支持多种文件类型和配置化扫描"""
    
    # 默认支持的文件类型及其分类
    DEFAULT_FILE_TYPES = {
        # Python 文件
        '.py': 'python',
        '.pyw': 'python',
        
        # TypeScript 文件
        '.ts': 'typescript',
        '.tsx': 'typescript-react',
        
        # JavaScript 文件
        '.js': 'javascript',
        '.jsx': 'javascript-react',
        
        # 其他常见开发文件
        '.json': 'json',
        '.md': 'markdown',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.toml': 'toml',
        '.ini': 'config',
        '.cfg': 'config',
    }
    
    # 默认忽略的目录
    DEFAULT_IGNORE_DIRS = {
        'node_modules',
        '.git',
        '.svn',
        '.hg',
        '__pycache__',
        '.pytest_cache',
        '.mypy_cache',
        '.tox',
        'venv',
        'env',
        '.env',
        'dist',
        'build',
        '.next',
        '.nuxt',
        'coverage',
    }
    
    def __init__(self, 
                 root_path: Optional[str] = None,
                 file_types: Optional[Dict[str, str]] = None,
                 ignore_dirs: Optional[Set[str]] = None,
                 max_depth: Optional[int] = None):
        """
        初始化项目扫描器
        
        Args:
            root_path: 扫描根目录路径，默认为当前工作目录
            file_types: 自定义文件类型映射 {扩展名: 分类}
            ignore_dirs: 自定义忽略目录集合
            max_depth: 最大扫描深度，None表示无限制
        """
        self.root_path = Path(root_path) if root_path else Path.cwd()
        self.file_types = file_types or self.DEFAULT_FILE_TYPES
        self.ignore_dirs = ignore_dirs or self.DEFAULT_IGNORE_DIRS
        self.max_depth = max_depth
        
        # 验证根目录存在
        if not self.root_path.exists():
            raise FileNotFoundError(f"根目录不存在: {self.root_path}")
        if not self.root_path.is_dir():
            raise ValueError(f"根目录不是有效的目录: {self.root_path}")
    
    def should_ignore(self, dir_name: str) -> bool:
        """判断是否应该忽略该目录"""
        return dir_name in self.ignore_dirs
    
    def get_file_type(self, file_path: Path) -> Optional[str]:
        """获取文件类型"""
        extension = file_path.suffix.lower()
        return self.file_types.get(extension)
    
    def scan_directory(self) -> ScanResult:
        """扫描目录并返回结构化结果"""
        file_type_stats = {}
        file_type_size_stats = {}
        files = []
        total_size = 0
        
        # 统计所有支持的文件类型