import asyncio
import threading
import time
from unittest.mock import Mock, patch, MagicMock
import pytest
from dataclasses import dataclass, field
from typing import Optional
from contextlib import contextmanager

# 假设Soul和相关类的结构
@dataclass
class SoulState:
    """Soul状态数据类"""
    id: str
    state: str
    validation_level: int = 0
    evolution_cycle: int = 0
    metadata: dict = field(default_factory=dict)
    is_valid: bool = True
    last_validated: Optional[float] = None

class Soul:
    """Soul类，表示一个需要验证和进化的灵魂实体"""
    def __init__(self, soul_id: str, initial_state: str = "inactive"):
        self.state = SoulState(
            id=soul_id,
            state=initial_state,
            metadata={"created": time.time()}
        )
        self._lock = threading.RLock()
        self._validation_history = []
    
    def validate(self, validation_level: int = 1) -> bool:
        """验证Soul状态"""
        with self._lock:
            self.state.last_validated = time.time()
            self.state.validation_level = validation_level
            
            # 验证逻辑
            if validation_level < 0 or validation_level > 100:
                raise ValueError("Invalid validation level")
            
            if self.state.state == "invalid":
                self.state.is_valid = False
                return False
            
            self.state.is_valid = True
            self._validation_history.append({
                "timestamp": time.time(),
                "level": validation_level,
                "result": True
            })
            return True
    
    def evolve(self) -> bool:
        """进化Soul到下一个状态"""
        with self._lock:
            if not self.state.is_valid:
                return False
            
            # 进化逻辑
            state_transitions = {
                "inactive": "awakening",
                "awakening": "aware",
                "aware": "enlightened",
                "enlightened": "transcendent"
            }
            
            current = self.state.state
            if current in state_transitions:
                self.state.state = state_transitions[current]
                self.state.evolution_cycle += 1
                return True
            return False
    
    def get_state(self) -> SoulState:
        """获取Soul状态的副本"""
        with self._lock:
            return SoulState(
                id=self.state.id,
                state=self.state.state,
                validation_level=self.state.validation_level,
                evolution_cycle=self.state.evolution_cycle,
                metadata=self.state.metadata.copy(),
                is_valid=self.state.is_valid,
                last_validated=self.state.last_validated
            )

class EvolutionCycle:
    """进化周期管理器"""
    def __init__(self, cycle_id: str, souls: list[Soul]):
        self.cycle_id = cycle_id
        self.souls = souls
        self.current_phase = 0
        self.is_active = False
    
    def validate_all(self) -> dict[str, bool]:
        """验证所有Soul的状态"""
        results = {}
        for soul in self.souls:
            try:
                results[soul.state.id] = soul.validate()
            except Exception as e:
                results[soul.state.id] = False
        return results
    
    def evolve_all(self) -> dict[str, bool]:
        """进化所有Soul"""
        results = {}
        for soul in self.souls:
            try:
                results[soul.state.id] = soul.evolve()
            except Exception as e:
                results[soul.state.id] = False
        return results
    
    def run_cycle(self) -> dict[str, dict]:
        """运行一个完整的进化周期"""
        self.is_active = True
        validation_results = self.validate_all()
        evolution_results = self.evolve_all()
        self.is_active = False
        self.current_phase += 1
        
        return {
            "cycle_id": self.cycle_id,
            "phase": self.current_phase,
            "validation": validation_results,
            "evolution": evolution_results,
            "timestamp": time.time()
        }

@contextmanager
def atomic_write(file_path: str, data: str, backup_path: Optional[str] = None):
    """模拟原子写入操作，支持回滚"""
    backup_created = False
    original_data = None
    
    try:
        # 读取原始数据（如果文件存在）
        try:
            with open(file_path, 'r') as f:
                original_data = f.read()
        except FileNotFoundError:
            original_data = None
        
        # 创建备份
        if backup_path and original_data is not None:
            with open(backup_path, 'w') as f:
                f.write(original_data)
            backup_created = True
        
        # 执行写入
        with open(file_path, 'w') as f:
            f.write(data)
        
        yield
        
    except Exception as e:
        # 回滚操作
        if backup_created and backup_path:
            try:
                with open(backup_path, 'r') as f:
                    backup_data = f.read()
                with open(file_path, 'w') as f:
                    f.write(backup_data)
            except Exception:
                pass
        
        raise e
    
    finally:
        # 清理备份文件（如果需要）
        if backup_created and backup_path:
            try:
                import os
                if os.path.exists(backup_path):
                    os.remove(backup_path)
            except Exception:
                pass

def atomic_write_soul_state(soul: Soul, new_state: str, save_path: str, backup_path: str = None):
    """原子性地保存Soul状态到文件，支持回滚"""
    original_state = soul.state.state
    
    try:
        with atomic_write(save_path, f"{soul.state.id}:{new_state}", backup_path):
            soul.state.state = new_state
            return True
    except Exception:
        # atomic_write内部已经处理了文件回滚
        # 但我们需要确保Soul状态也回滚
        soul.state.state = original_state
        return False


class TestSoulEvolutionCompatibility:
    """Soul与进化流程兼容性测试类"""
    
    def setup_method(self):
        """每个测试方法执行前的设置"""
        self.soul1 = Soul("soul_001", "inactive")
        self.soul2 = Soul("soul_002", "awakening")
        self.soul3 = Soul("soul_003", "invalid")
        self.cycle = EvolutionCycle("cycle_001", [self.soul1, self.soul2, self.soul3])
    
    def test_soul_validation_boundary_cases(self):
        """测试Soul验证与evolution_cycle验证的边界情况"""
        
        # 测试1: 验证级别边界
        assert self.soul1.validate(0) == True
        assert self.soul1.validate(100) == True
        assert self.soul1.validate(1) == True
        
        with pytest.raises(ValueError):
            self.soul1.validate(-1)
        
        with pytest.raises(ValueError):
            self.soul1.validate(101)
        