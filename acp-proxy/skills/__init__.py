"""
技能基础设施框架

提供 Skill 基类和 SkillRegistry 注册表，用于管理和执行各类技能。
这是自编程和工具创造的基础架构。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type


class Skill(ABC):
    """
    技能基类
    
    所有技能必须继承此类并实现 execute 方法。
    每个技能都有名称、描述，并支持序列化以便存储和检索。
    """
    
    # 子类应覆盖这两个属性
    name: str = "base_skill"
    description: str = "基础技能类"
    
    def __init__(self, **kwargs: Any) -> None:
        """
        初始化技能
        
        Args:
            **kwargs: 技能所需的任意参数
        """
        self.config: Dict[str, Any] = kwargs
    
    @abstractmethod
    def execute(self, *args: Any, **kwargs: Any) -> Any:
        """
        执行技能逻辑
        
        子类必须重写此方法以实现具体的技能功能。
        
        Args:
            *args: 位置参数
            **kwargs: 关键字参数
            
        Returns:
            技能执行的结果
        """
        raise NotImplementedError("子类必须实现 execute 方法")
    
    def serialize(self) -> Dict[str, Any]:
        """
        将技能序列化为字典
        
        用于存储、检索和传输技能信息。
        
        Returns:
            包含技能信息的字典
        """
        return {
            "name": self.name,
            "description": self.description,
            "class": self.__class__.__name__,
            "module": self.__class__.__module__,
            "config": self.config,
        }
    
    def __repr__(self) -> str:
        return f"<Skill: {self.name}>"


class SkillRegistry:
    """
    技能注册表
    
    管理所有已注册的技能，支持注册、发现和实例化技能。
    """
    
    def __init__(self) -> None:
        """初始化空注册表"""
        self._skills: Dict[str, Type[Skill]] = {}
    
    def register(self, skill_class: Type[Skill]) -> Type[Skill]:
        """
        注册技能类
        
        Args:
            skill_class: 要注册的技能类
            
        Returns:
            注册的技能类（支持作为装饰器使用）
            
        Raises:
            TypeError: 如果 skill_class 不是 Skill 的子类
            ValueError: 如果技能名称已被注册
        """
        if not (isinstance(skill_class, type) and issubclass(skill_class, Skill)):
            raise TypeError(f"skill_class 必须是 Skill 的子类，得到: {skill_class}")
        
        name = skill_class.name
        if name in self._skills:
            raise ValueError(f"技能 '{name}' 已被注册")
        
        self._skills[name] = skill_class
        return skill_class
    
    def get(self, name: str) -> Optional[Type[Skill]]:
        """
        根据名称获取技能类
        
        Args:
            name: 技能名称
            
        Returns:
            技能类，如果未找到则返回 None
        """
        return self._skills.get(name)
    
    def create(self, name: str, **kwargs: Any) -> Optional[Skill]:
        """
        根据名称创建技能实例
        
        Args:
            name: 技能名称
            **kwargs: 传递给技能构造函数的参数
            
        Returns:
            技能实例，如果未找到则返回 None
        """
        skill_class = self.get(name)
        if skill_class is None:
            return None
        return skill_class(**kwargs)
    
    def list_skills(self) -> List[Dict[str, Any]]:
        """
        列出所有已注册技能的描述信息
        
        Returns:
            技能描述字典列表
        """
        return [
            {
                "name": cls.name,
                "description": cls.description,
                "class": cls.__name__,
                "module": cls.__module__,
            }
            for cls in self._skills.values()
        ]
    
    def has(self, name: str) -> bool:
        """
        检查技能是否已注册
        
        Args:
            name: 技能名称
            
        Returns:
            是否已注册
        """
        return name in self._skills
    
    def unregister(self, name: str) -> bool:
        """
        注销技能
        
        Args:
            name: 技能名称
            
        Returns:
            是否成功注销
        """
        if name in self._skills:
            del self._skills[name]
            return True
        return False
    
    def __len__(self) -> int:
        return len(self._skills)
    
    def __contains__(self, name: str) -> bool:
        return self.has(name)
    
    def __repr__(self) -> str:
        return f"<SkillRegistry: {len(self)} skills>"


# 全局技能注册表实例
registry = SkillRegistry()


def register_skill(skill_class: Type[Skill]) -> Type[Skill]:
    """
    注册技能到全局注册表（装饰器用法）
    
    Args:
        skill_class: 技能类
        
    Returns:
        注册的技能类
        
    Example:
        @register_skill
        class MySkill(Skill):
            name = "my_skill"
            description = "我的技能"
            
            def execute(self, **kwargs):
                return "执行结果"
    """
    return registry.register(skill_class)


def get_skill(name: str) -> Optional[Type[Skill]]:
    """
    从全局注册表获取技能类
    
    Args:
        name: 技能名称
        
    Returns:
        技能类，如果未找到则返回 None
    """
    return registry.get(name)


def create_skill(name: str, **kwargs: Any) -> Optional[Skill]:
    """
    创建技能实例
    
    Args:
        name: 技能名称
        **kwargs: 技能初始化参数
        
    Returns:
        技能实例，如果未找到则返回 None
    """
    return registry.create(name, **kwargs)


def list_skills() -> List[Dict[str, Any]]:
    """
    列出所有已注册技能
    
    Returns:
        技能描述字典列表
    """
    return registry.list_skills()


# 导出公共接口
__all__ = [
    "Skill",
    "SkillRegistry",
    "registry",
    "register_skill",
    "get_skill",
    "create_skill",
    "list_skills",
]