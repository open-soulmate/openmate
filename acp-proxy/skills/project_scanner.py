import os
import json
import unittest
from typing import List, Dict, Any, Optional

def scan_project(root_path: str = '.', file_extensions: Optional[List[str]] = None, exclude_dirs: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    扫描项目目录，识别指定类型的文件，并返回结构化结果。
    
    Args:
        root_path (str): 扫描的根目录路径，默认为当前目录。
        file_extensions (List[str]): 要识别的文件扩展名列表，默认为['.py', '.ts', '.tsx']。
        exclude_dirs (List[str]): 要排除的目录列表，默认为['node_modules', '.git']。
    
    Returns:
        Dict[str, Any]: 包含文件列表和统计信息的字典。
    """
    # 设置默认参数
    if file_extensions is None:
        file_extensions = ['.py', '.ts', '.tsx']
    if exclude_dirs is None:
        exclude_dirs = ['node_modules', '.git']
    
    # 初始化结果字典
    result = {
        'files': [],
        'statistics': {
            'total_files': 0,
            'type_counts': {ext: 0 for ext in file_extensions}
        }
    }
    
    # 检查根路径是否存在
    if not os.path.exists(root_path):
        raise FileNotFoundError(f"Root path '{root_path}' does not exist.")
    
    # 递归遍历目录
    for dirpath, dirnames, filenames in os.walk(root_path):
        # 排除无关目录，修改dirnames以避免进入子目录
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        
        # 遍历文件
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            _, ext = os.path.splitext(filename)
            
            # 检查文件扩展名是否在支持列表中
            if ext in file_extensions:
                # 获取文件大小（可选信息）
                file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                
                # 添加文件信息
                file_info = {
                    'path': file_path,
                    'type': ext,
                    'size': file_size
                }
                result['files'].append(file_info)
                
                # 更新统计信息
                result['statistics']['total_files'] += 1
                result['statistics']['type_counts'][ext] += 1
    
    return result

def scan_project_to_json(root_path: str = '.', file_extensions: Optional[List[str]] = None, exclude_dirs: Optional[List[str]] = None, indent: int = 2) -> str:
    """
    扫描项目并返回JSON格式的结果。
    
    Args:
        root_path (str): 扫描的根目录路径。
        file_extensions (List[str]): 要识别的文件扩展名列表。
        exclude_dirs (List[str]): 要排除的目录列表。
        indent (int): JSON缩进空格数，默认为2。
    
    Returns:
        str: JSON格式的扫描结果。
    """
    result = scan_project(root_path, file_extensions, exclude_dirs)
    return json.dumps(result, indent=indent, ensure_ascii=False)

class TestProjectScanner(unittest.TestCase):
    """单元测试类，验证项目扫描技能的新功能。"""
    
    def setUp(self):
        """测试前准备：创建临时目录结构。"""
        self.test_root = 'test_project_scanner_temp'
        os.makedirs(self.test_root, exist_ok=True)
        # 创建示例文件
        with open(os.path.join(self.test_root, 'test.py'), 'w') as f:
            f.write('# Python file')