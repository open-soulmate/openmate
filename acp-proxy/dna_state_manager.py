import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Dict, Any, Optional

class DNAStateManager:
    """原子化状态文件管理器，实现线程安全的读写操作"""
    
    def __init__(self, state_file_path: str):
        """
        初始化状态文件管理器
        
        Args:
            state_file_path: 状态文件路径
        """
        self._state_file_path = Path(state_file_path)
        self._lock = threading.Lock()
        
        # 确保目录存在
        self._state_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    def read(self, current_version: int = 1) -> Optional[Dict[str, Any]]:
        """
        读取状态文件并验证完整性
        
        Args:
            current_version: 期望的最小版本号
            
        Returns:
            解析后的状态数据字典，验证失败返回None
        """
        with self._lock:
            try:
                if not self._state_file_path.exists():
                    return None
                
                # 读取文件内容
                with open(self._state_file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if not content.strip():
                    return None
                
                # JSON解析验证
                data = json.loads(content)
                
                # 验证数据结构
                if not isinstance(data, dict):
                    return None
                
                # 版本号检查
                file_version = data.get('version')
                if file_version is None or file_version < current_version:
                    return None
                
                return data
                
            except (json.JSONDecodeError, IOError, OSError):
                return None
    
    def write(self, state_data: Dict[str, Any], version: int = 1) -> bool:
        """
        原子化写入状态文件
        
        Args:
            state_data: 要写入的状态数据
            version: 版本号
            
        Returns:
            写入是否成功
        """
        with self._lock:
            try:
                # 准备完整的状态数据
                write_data = {
                    'version': version,
                    'data': state_data
                }
                
                # JSON序列化
                content = json.dumps(write_data, ensure_ascii=False, indent=2)
                
                # 创建临时文件
                temp_dir = self._state_file_path.parent
                temp_fd, temp_path = tempfile.mkstemp(
                    dir=temp_dir,
                    prefix='.tmp_',
                    suffix='.json'
                )
                
                try:
                    # 写入临时文件
                    with os.fdopen(temp_fd, 'w', encoding='utf-8') as temp_file:
                        temp_file.write(content)
                        temp_file.flush()
                        os.fsync(temp_file.fileno())
                    
                    # 原子化重命名
                    temp_path_obj = Path(temp_path)
                    temp_path_obj.replace(self._state_file_path)
                    
                    return True
                    
                except Exception:
                    # 清理临时文件
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        pass
                    raise
                    
            except (IOError, OSError, json.JSONDecodeError):
                return False
    
    def update(self, update_func, current_version: int = 1, new_version: int = None) -> Optional[Dict[str, Any]]:
        """
        原子化更新状态文件
        
        Args:
            update_func: 更新函数，接收当前数据，返回新数据
            current_version: 期望的最小版本号
            new_version: 新版本号，None则自动递增
            
        Returns:
            更新后的状态数据，失败返回None
        """
        with self._lock:
            # 读取当前状态
            current_state = self.read(current_version)
            
            try:
                # 应用更新函数
                new_data = update_func(current_state)
                
                # 确定新版本号
                if new_version is None:
                    new_version = (current_state.get('version', 0) + 1) if current_state else 1
                
                # 写入新状态
                if self.write(new_data, new_version):
                    return {
                        'version': new_version,
                        'data': new_data
                    }
                    
            except Exception:
                pass
            
            return None
    
    def exists(self) -> bool:
        """检查状态文件是否存在"""
        return self._state_file_path.exists()
    
    def delete(self) -> bool:
        """删除状态文件"""
        with self._lock:
            try:
                if self._state_file_path.exists():
                    self._state_file_path.unlink()
                    return True
            except OSError:
                pass
            return False