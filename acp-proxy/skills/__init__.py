"""
Skill Infrastructure Framework
===============================

This module provides the foundational classes for creating, registering, and managing
skills within the ACP-Proxy system. It includes:

1. `Skill` - Base class defining standard interface for all skills
2. `SkillRegistry` - Central registry for skill discovery and management
3. Helper functions for accessing registered skills

This framework serves as the foundation for self-programming and tool creation capabilities.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Type


class Skill(ABC):
    """
    Abstract base class defining the standard interface for all skills.
    
    All skills must inherit from this class and implement the required methods.
    This ensures consistency and enables the skill registry to manage them properly.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for the skill."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what the skill does."""
        pass
    
    @abstractmethod
    def __init__(self, **kwargs: Any) -> None:
        """
        Initialize the skill with configuration parameters.
        
        Args:
            **kwargs: Skill-specific configuration parameters
        """
        pass
    
    @abstractmethod
    def execute(self, *args: Any, **kwargs: Any) -> Any:
        """
        Execute the skill's main logic.
        
        This method should be overridden by concrete skill implementations
        to provide their specific functionality.
        
        Args:
            *args: Positional arguments for skill execution
            **kwargs: Keyword arguments for skill execution
            
        Returns:
            Result of skill execution, type depends on implementation
        """
        pass
    
    def serialize(self) -> Dict[str, Any]:
        """
        Serialize the skill to a dictionary for storage and retrieval.
        
        Returns:
            Dictionary containing skill metadata and configuration
        """
        return {
            "name": self.name,
            "description": self.description,
            "class": self.__class__.__name__,
            "module": self.__class__.__module__,
        }


class SkillRegistry:
    """
    Central registry for managing available skills.
    
    Provides methods for:
    - Registering skill classes
    - Retrieving skills by name
    - Listing all available skills with their descriptions
    
    This registry acts as the discovery mechanism for all skills in the system.
    """
    
    def __init__(self) -> None:
        """Initialize an empty skill registry."""
        self._skills: Dict[str, Type[Skill]] = {}
    
    def register(self, skill_class: Type[Skill]) -> None:
        """
        Register a skill class with the registry.
        
        Args:
            skill_class: The skill class to register (must inherit from Skill)
            
        Raises:
            TypeError: If skill_class doesn't inherit from Skill
            ValueError: If a skill with the same name is already registered
        """
        if not issubclass(skill_class, Skill):
            raise TypeError(f"Cannot register {skill_class}: must be a subclass of Skill")
        
        # Create a temporary instance to get the skill name
        try:
            # We use a dummy instance just to get the name property
            dummy = skill_class.__new__(skill_class)
            skill_name = dummy.name
        except (AttributeError, TypeError):
            raise ValueError(f"Could not determine name for skill class {skill_class}")
        
        if skill_name in self._skills:
            raise ValueError(f"Skill with name '{skill_name}' is already registered")
        
        self._skills[skill_name] = skill_class
    
    def get(self, name: str) -> Optional[Type[Skill]]:
        """
        Retrieve a skill class by its name.
        
        Args:
            name: The unique name of the skill
            
        Returns:
            The skill class if found, None otherwise
        """
        return self._skills.get(name)
    
    def list_skills(self) -> List[Dict[str, Any]]:
        """
        List all registered skills with their description information.
        
        Returns:
            List of dictionaries containing skill metadata
        """
        skills_list = []
        for name, skill_class in self._skills.items():
            # Create a temporary instance to get description
            try:
                dummy = skill_class.__new__(skill_class)
                skills_list.append({
                    "name": name,
                    "description": dummy.description,
                    "class": skill_class.__name__,
                    "module": skill_class.__module__,
                })
            except (AttributeError, TypeError):
                # If we can't get description, use class name as fallback
                skills_list.append({
                    "name": name,
                    "description": f"Skill: {skill_class.__name__}",
                    "class": skill_class.__name__,
                    "module": skill_class.__module__,
                })
        
        return skills_list


# Module-level registry instance (singleton)
_default_registry = SkillRegistry()


def get_skill_registry() -> SkillRegistry:
    """
    Get the default skill registry instance.
    
    Returns:
        The default SkillRegistry instance used for skill management
    """
    return _default_registry


def register_skill(skill_class: Type[Skill]) -> None:
    """
    Convenience function to register a skill with the default registry.
    
    Args:
        skill_class: The skill class to register
    """
    _default_registry.register(skill_class)


def get_skill(name: str) -> Optional[Type[Skill]]:
    """
    Get a skill class by name from the default registry.
    
    Args:
        name: The unique name of the skill to retrieve
        
    Returns:
        The skill class if found, None otherwise
    """
    return _default_registry.get(name)


def list_available_skills() -> List[Dict[str, Any]]:
    """
    List all available skills from the default registry.
    
    Returns:
        List of dictionaries containing skill metadata
    """
    return _default_registry.list_skills()