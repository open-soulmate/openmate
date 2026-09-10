"""
项目扫描技能模块

优化项目扫描，支持多种文件类型识别和可配置扫描路径。
"""

import os
import json
from pathlib import Path
from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict


# 默认支持的文件扩展名配置
DEFAULT_FILE_EXTENSIONS: Dict[str, List[str]] = {
    "python": [".py"],
    "typescript": [".ts", ".tsx"],
    "javascript": [".js", ".jsx"],
    "json": [".json"],
    "yaml": [".yaml", ".yml"],
    "markdown": [".md"],
}

# 默认排除的目录列表
DEFAULT_EXCLUDE_DIRS: Set[str] = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
    ".idea",
    ".vscode",
    "mypy_cache",
    ".pytest_cache",
}

# 默认排除的文件模式
DEFAULT_EXCLUDE_FILES: Set[str] = {
    ".gitignore",
    ".env",
    ".DS_Store",
}


@dataclass
class FileInfo:
    """文件信息数据类"""
    path: str
    relative_path: str
    name: str
    extension: str
    file_type: str
    size: int = 0


@dataclass
class ScanResult:
    """扫描结果数据类"""
    root_path: str
    total_files: int = 0
    files_by_type: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    type_counts: Dict[str, int] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    excluded_dirs: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        """转换为JSON格式"""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    def summary(self) -> str:
        """返回扫描摘要"""
        lines = [f"扫描路径: {self.root_path}"]
        lines.append(f"总文件数: {self.total_files}")
        lines.append("--- 文件类型统计 ---")
        for file_type, count in sorted(self.type_counts.items()):
            lines.append(f"  {file_type}: {count} 个文件")
        if self.errors:
            lines.append(f"--- 错误 ({len(self.errors)}) ---")
            for error in self.errors[:5]:
                lines.append(f"  {error}")
        return "\n".join(lines)


class ProjectScanner:
    """项目扫描器类"""

    def __init__(
        self,
        file_extensions: Optional[Dict[str, List[str]]] = None,
        exclude_dirs: Optional[Set[str]] = None,
        exclude_files: Optional[Set[str]] = None,
        follow_symlinks: bool = False,
        max_depth: Optional[int] = None,
    ):
        """
        初始化项目扫描器

        Args:
            file_extensions: 文件类型扩展名映射，默认使用内置配置
            exclude_dirs: 排除的目录集合
            exclude_files: 排除的文件集合
            follow_symlinks: 是否跟随符号链接
            max_depth: 最大递归深度，None表示无限制
        """
        self.file_extensions = file_extensions or DEFAULT_FILE_EXTENSIONS
        self.exclude_dirs = exclude_dirs or DEFAULT_EXCLUDE_DIRS
        self.exclude_files = exclude_files or DEFAULT_EXCLUDE_FILES
        self.follow_symlinks = follow_symlinks
        self.max_depth = max_depth

        # 构建扩展名到类型的反向映射
        self._ext_to_type: Dict[str, str] = {}
        for file_type, extensions in self.file_extensions.items():
            for ext in extensions:
                self._ext_to_type[ext.lower()] = file_type

    def get_supported_extensions(self) -> Set[str]:
        """获取所有支持的文件扩展名"""
        return set(self._ext_to_type.keys())

    def get_file_type(self, extension: str) -> Optional[str]:
        """根据扩展名获取文件类型"""
        return self._ext_to_type.get(extension.lower())

    def scan(
        self,
        root_path: str,
        specific_types: Optional[List[str]] = None,
    ) -> ScanResult:
        """
        扫描项目目录

        Args:
            root_path: 根目录路径
            specific_types: 指定扫描的文件类型列表，None表示扫描所有支持的类型

        Returns:
            ScanResult: 扫描结果对象
        """
        root = Path(root_path).resolve()

        if not root.exists():
            return ScanResult(
                root_path=str(root),
                errors=[f"路径不存在: {root}"],
            )

        if not root.is_dir():
            return ScanResult(
                root_path=str(root),
                errors=[f"路径不是目录: {root}"],
            )

        # 确定要扫描的扩展名集合
        target_extensions: Optional[Set[str]] = None
        if specific_types:
            target_extensions = set()
            for file_type in specific_types:
                if file_type in self.file_extensions:
                    for ext in self.file_extensions[file_type]:
                        target_extensions.add(ext.lower())

        result = ScanResult(
            root_path=str(root),
            excluded_dirs=list(self.exclude_dirs),
        )

        files_by_type = defaultdict(list)

        try:
            for current_path, dirs, files in os.walk(
                root, followlinks=self.follow_symlinks
            ):
                current = Path(current_path)
                depth = len(current.relative_to(root).parts)

                # 检查最大深度
                if self.max_depth is not None and depth > self.max_depth:
                    dirs.clear()
                    continue

                # 过滤目录
                dirs[:] = [
                    d for d in dirs
                    if d not in self.exclude_dirs and not d.startswith(".")
                ]

                for file_name in files:
                    # 过滤排除的文件
                    if file_name in self.exclude_files:
                        continue

                    file_path = current / file_name

                    # 跳过符号链接（如果配置了不跟随）
                    if not self.follow_symlinks and file_path.is_symlink():
                        continue

                    # 获取文件扩展名
                    extension = file_path.suffix.lower()

                    # 检查是否为目标扩展名
                    if target_extensions and extension not in target_extensions:
                        continue
                    elif not target_extensions and extension not in self._ext_to_type:
                        continue

                    # 获取文件类型
                    file_type = self._ext_to_type.get(extension, "unknown")

                    # 创建文件信息
                    try:
                        file_size = file_path.stat().st_size
                    except OSError:
                        file_size = 0

                    file_info = FileInfo(
                        path=str(file_path),
                        relative_path=str(file_path.relative_to(root)),
                        name=file_name,
                        extension=extension,
                        file_type=file_type,
                        size=file_size,
                    )

                    files_by_type[file_type].append(asdict(file_info))

        except PermissionError as e:
            result.errors.append(f"权限错误: {e}")
        except OSError as e:
            result.errors.append(f"系统错误: {e}")

        # 设置结果
        result.files_by_type = dict(files_by_type)
        result.type_counts = {
            file_type: len(files)
            for file_type, files in files_by_type.items()
        }
        result.total_files = sum(result.type_counts.values())

        return result

    def scan_to_json(
        self,
        root_path: str,
        specific_types: Optional[List[str]] = None,
        indent: int = 2,
    ) -> str:
        """
        扫描项目并返回JSON结果

        Args:
            root_path: 根目录路径
            specific_types: 指定扫描的文件类型列表
            indent: JSON缩进空格数

        Returns:
            str: JSON格式的扫描结果
        """
        result = self.scan(root_path, specific_types)
        return result.to_json(indent=indent)

    def get_project_structure(
        self,
        root_path: str,
        max_depth: int = 3,
    ) -> Dict[str, Any]:
        """
        获取项目目录结构

        Args:
            root_path: 根目录路径
            max_depth: 最大显示深度

        Returns:
            Dict: 项目结构字典
        """