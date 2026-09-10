import json
from datetime import datetime
from typing import Dict, List, Any

from .base import Skill


class EvolutionPlannerSkill(Skill):
    """Generates structured improvement plans from system state and reflection data."""
    
    def __init__(self):
        super().__init__(
            name="evolution_planner",
            description="Automatically generates structured improvement plans based on system state and reflection data"
        )
        self.goal_priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    
    def generate_plan(self, system_state: Dict[str, Any], reflection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate improvement suggestions based on system state and reflection data.
        
        Args:
            system_state: Dictionary containing system state information
                - memory_stats: Statistics about system memory
                - goal_progress: Progress of evolution goals
                - improvement_history: History of past improvements
            reflection_data: Dictionary containing reflection results
                - failure_patterns: Identified failure patterns
                - success_patterns: Identified success patterns
                - improvements: Current improvement insights
        
        Returns:
            Dictionary with status and generated suggestions
        """
        try:
            # Extract data with safe defaults
            goal_progress = system_state.get('goal_progress', {})
            failure_patterns = reflection_data.get('failure_patterns', [])
            improvements = reflection_data.get('improvements', [])
            improvement_history = system_state.get('improvement_history', [])
            
            # Goal analysis
            goal_insights = self._analyze_goals(goal_progress)
            
            # Pattern analysis
            pattern_insights = self._analyze_patterns(failure_patterns, improvements)
            
            # Generate suggestions
            suggestions = self._generate_suggestions(goal_insights, pattern_insights, improvement_history)
            
            # Ensure 1-2 suggestions
            suggestions = suggestions[:2]
            
            # Add execution tags
            tagged_suggestions = self._add_execution_tags(suggestions, improvement_history)
            
            return {
                "status": "success",
                "data": {
                    "suggestions": tagged_suggestions,
                    "generated_at": datetime.now().isoformat()
                }
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to generate plan: {str(e)}"
            }
    
    def _analyze_goals(self, goal_progress: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze goal progress to identify areas needing improvement."""
        critical_goals = []
        
        for goal_name, goal_data in goal_progress.items():
            if isinstance(goal_data, dict):
                priority = goal_data.get('priority', 'low')
                progress = goal_data.get('progress', 0)
                
                if priority in ['critical', 'high']:
                    critical_goals.append({
                        'name': goal_name,
                        'priority': priority,
                        'progress': progress,
                        'priority_score': self.goal_priority_order.get(priority, 3)
                    })
        
        # Sort by priority then by progress (lowest first)
        critical_goals.sort(key=lambda x: (x['priority_score'], x['progress']))
        
        return {
            'critical_goals': critical_goals,
            'lowest_progress_goal': critical_goals[0] if critical_goals else None
        }
    
    def _analyze_patterns(self, failure_patterns: List[str], improvements: List[str]) -> Dict[str, Any]:
        """Analyze failure patterns and improvement insights."""
        # Combine and deduplicate patterns
        all_patterns = set()
        
        # Extract keywords from patterns
        pattern_keywords = []
        for pattern in failure_patterns:
            if isinstance(pattern, str):
                all_patterns.add(pattern)
                pattern_keywords.extend(pattern.lower().split())
        