"""
项目扫描技能 - 扫描项目文件并返回结构化结果
"""
import os
import json
import logging
from typing import Dict, List, Optional, Any, Set
from pathlib import Path
from collections import defaultdict

logger = logging.getLogger(__name__)

# 默认支持的文件扩展名及其对应类型
DEFAULT_FILE_EXTENSIONS = {
    '.py': 'python',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.txt': 'text',
}

# 默认排除的目录
DEFAULT_EXCLUDED_DIRS = {
    'node_modules',
    '.git',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.vscode',
    '.idea',
    'venv',
    'env',
    '.env',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'coverage',
}


class ProjectScanner:
    """
    项目扫描器 - 递归扫描项目目录，识别文件类型，返回结构化结果
    """
    
    def __init__(
        self,
        root_dir: Optional[str] = None,
        file_extensions: Optional[Dict[str, str]] = None,
        excluded_dirs: Optional[Set[str]] = None,
        max_file_size: Optional[int] = None
    ):
        """
        初始化项目扫描器
        
        Args:
            root_dir: 项目根目录路径，默认为当前工作目录
            file_extensions: 文件扩展名到类型的映射，默认使用DEFAULT_FILE_EXTENSIONS
            excluded_dirs: 排除的目录集合，默认使用DEFAULT_EXCLUDED_DIRS
            max_file_size: 最大文件大小(字节)，None表示不限制
        """
        if root_dir is None:
            root_dir = os.getcwd()
        
        self.root_dir = Path(root_dir).resolve()
        self.file_extensions = file_extensions or DEFAULT_FILE_EXTENSIONS
        self.excluded_dirs = excluded_dirs or DEFAULT_EXCLUDED_DIRS
        self.max_file_size = max_file_size
        
        # 验证根目录是否存在
        if not self.root_dir.exists():
            raise FileNotFoundError(f"根目录不存在: {self.root_dir}")
        
        if not self.root_dir.is_dir():
            raise ValueError(f"根目录不是目录: {self.root_dir}")
        
        # 缓存扫描结果
        self._scan_result = None
        self._last_scan_time = None
    
    def _should_exclude_dir(self, dir_name: str) -> bool:
        """判断是否应排除该目录"""
        # 排除隐藏目录（以.开头）
        if dir_name.startswith('.') and dir_name not in self.excluded_dirs:
            return True
        return dir_name in self.excluded_dirs
    
    def _get_file_type(self, file_path: Path) -> str:
        """获取文件类型"""
        suffix = file_path.suffix.lower()
        return self.file_extensions.get(suffix, 'other')
    
    def _should_include_file(self, file_path: Path) -> bool:
        """判断是否应包含该文件"""
        suffix = file_path.suffix.lower()
        
        # 检查文件扩展名是否在支持列表中
        if suffix not in self.file_extensions:
            return False
        
        # 检查文件大小限制
        if self.max_file_size is not None:
            try:
                file_size = file_path.stat().st_size
                if file_size > self.max_file_size:
                    return False
            except OSError:
                return False
        
        return True
    
    def scan(self, force_rescan: bool = False) -> Dict[str, Any]:
        """
        执行项目扫描
        
        Args:
            force_rescan: 是否强制重新扫描，忽略缓存
            
        Returns:
            结构化扫描结果
        """
        if self._scan_result and not force_rescan:
            return self._scan_result
        
        logger.info(f"开始扫描项目: {self.root_dir}")
        
        files = []
        stats = defaultdict(int)
        type_stats = defaultdict(int)
        dir_stats = defaultdict(int)
        
        try:
            # 使用os.walk递归遍历目录
            for dirpath, dirnames, filenames in os.walk(self.root_dir):
                # 过滤排除的目录（原地修改dirnames以影响遍历）
                dirnames[:] = [
                    d for d in dirnames 
                    if not self._should_exclude_dir(d)
                ]
                
                # 统计目录信息
                relative_dir = os.path.relpath(dirpath, self.root_dir)
                if relative_dir == '.':
                    dir_stats['root'] += 1
                else:
                    dir_stats[relative_dir] += 1
                
                # 处理文件
                for filename in filenames:
                    file_path = Path(dirpath) / filename
                    
                    # 检查文件是否应该包含
                    if self._should_include_file(file_path):
                        relative_path = file_path.relative_to(self.root_dir)
                        file_type = self._get_file_type(file_path)
                        
                        file_info = {
                            'path': str(relative_path),
                            'absolute_path': str(file_path),
                            'name': filename,
                            'type': file_type,
                            'extension': file_path.suffix.lower(),
                            'size': file_path.stat().st_size if file_path.exists() else 0
                        }
                        
                        files.append(file_info)
                        stats['total_files'] += 1
                        type_stats[file_type] += 1
        
        except Exception as e:
            logger.error(f"扫描项目时出错: {e}")
            raise
        
        # 构建结果
        self._scan_result = {
            'root_dir': str(self.root_dir),
            'scan_time': os.path.getctime(str(self.root_dir)),
            'files': files,
            'stats': {
                'total_files': stats['total_files'],
                'by_type': dict(type_stats),
                'by_directory': dict(dir_stats),
                'unique_extensions': list(set(file['extension'] for file in files))
            },
            'config': {
                'file_extensions': self.file_extensions,
                'excluded_dirs': list(self.excluded_dirs),
                'max_file_size': self.max_file_size
            }
        }
        
        logger.info(f"扫描完成: 共找到 {stats['total_files']} 个文件")
        return self._scan_result
    
    def get_files_by_type(self, file_type: str) -> List[Dict[str, Any]]:
        """获取指定类型的所有文件"""
        result = self.scan()
        return [file for file in result['files'] if file['type'] == file_type]
    
    def get_files_by_extension(self, extension: str) -> List[Dict[str, Any]]:
        """获取指定扩展名的所有文件"""
        result = self.scan()
        return [file for file in result['files'] if file['extension'] == extension]
    