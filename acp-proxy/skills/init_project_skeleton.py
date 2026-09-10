import os
from datetime import datetime
from pathlib import Path

class InitProjectSkeletonSkill:
    """技能：初始化最小可行的项目基础结构"""

    def __init__(self):
        self.name = "init_project_skeleton"
        self.description = "创建标准化项目目录结构和基础文件"

    def execute(self, project_name: str, project_type: str = 'basic', description: str = '', root_dir: str = '.') -> dict:
        """
        执行项目骨架初始化
        
        Args:
            project_name: 项目名称
            project_type: 项目类型 (basic, api_service, data_processor)
            description: 项目描述
            root_dir: 根目录路径
            
        Returns:
            dict: 包含创建的文件清单和下一步建议
        """
        
        # 项目根目录
        project_root = Path(root_dir) / project_name
        
        # 检查目录是否已存在
        if project_root.exists():
            return self._handle_existing_project(project_root, project_type, description)
        
        # 创建项目结构
        created_files = self._create_project_structure(project_root, project_type, description)
        
        # 输出创建的文件清单
        result = {
            "status": "success",
            "project_name": project_name,
            "project_type": project_type,
            "created_files": created_files,
            "next_steps": self._get_next_steps(project_type)
        }
        
        return result

    def _handle_existing_project(self, project_root: Path, project_type: str, description: str) -> dict:
        """处理已存在的项目目录"""
        
        # 获取已存在的文件列表
        existing_files = self._list_existing_files(project_root)
        
        # 计算缺失的文件
        expected_files = self._get_expected_files(project_type)
        missing_files = self._find_missing_files(project_root, expected_files)
        
        result = {
            "status": "partial",
            "project_name": project_root.name,
            "project_type": project_type,
            "existing_files": existing_files,
            "missing_files": missing_files,
            "action": "补充缺失文件",
            "suggestion": "是否要补充缺失的文件？"
        }
        
        return result

    def _create_project_structure(self, project_root: Path, project_type: str, description: str) -> list:
        """创建项目结构"""
        
        created_files = []
        
        # 创建根目录
        project_root.mkdir(parents=True, exist_ok=True)
        created_files.append(str(project_root))
        
        # 根据项目类型创建子目录和文件
        if project_type == 'basic':
            created_files.extend(self._create_basic_structure(project_root))
        elif project_type == 'api_service':
            created_files.extend(self._create_api_service_structure(project_root))
        elif project_type == 'data_processor':
            created_files.extend(self._create_data_processor_structure(project_root))
        else:
            created_files.extend(self._create_basic_structure(project_root))
        
        # 创建通用基础文件
        created_files.extend(self._create_common_files(project_root, description))
        
        return created_files

    def _create_basic_structure(self, root: Path) -> list:
        """创建基础项目结构"""
        
        files = []
        dirs = [
            'src',
            'tests',
            'docs',
            'data'
        ]
        
        for dir_name in dirs:
            dir_path = root / dir_name
            dir_path.mkdir(exist_ok=True)
            files.append(str(dir_path))
            
            # 在每个子目录创建__init__.py
            init_file = dir_path / '__init__.py'
            if not init_file.exists():
                init_file.touch()
                files.append(str(init_file))
        
        return files

    def _create_api_service_structure(self, root: Path) -> list:
        """创建API服务项目结构"""
        