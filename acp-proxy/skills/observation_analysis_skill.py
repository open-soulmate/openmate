"""
Observation Analysis Skill for breaking observation backlog and cycle stagnation.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from .base_skill import BaseSkill, SkillResult, SkillStatus
from ..utils.memory import save_memory, load_memories
from ..utils.observations import get_unanalyzed_observations, mark_observations_processed
from ..utils.llm import call_llm
from ..utils.evolution_goals import get_current_goals

logger = logging.getLogger(__name__)


class ObservationAnalysisSkill(BaseSkill):
    """
    A skill for analyzing system observation records and converting them into actionable insights.
    
    This skill processes unanalyzed observations to identify patterns, failures, and successes,
    generating structured insights that drive system evolution and self-improvement.
    """
    
    skill_name = "observation_analysis"
    skill_description = "Analyze observation records to generate actionable insights and memories"
    version = "1.0.0"
    
    def __init__(self, config: Optional[Dict] = None):
        super().__init__(config)
        self.analysis_batch_size = config.get("analysis_batch_size", 10) if config else 10
        self.min_relevance_threshold = config.get("min_relevance_threshold", 0.3) if config else 0.3
        
    async def execute(self, **kwargs) -> SkillResult:
        """Execute the observation analysis skill."""
        start_time = datetime.now()
        
        try:
            # Step 1: Get unanalyzed observations
            observations = get_unanalyzed_observations(limit=self.analysis_batch_size)
            
            if not observations:
                logger.info("No unanalyzed observations found")
                return SkillResult(
                    status=SkillStatus.SUCCESS,
                    data={"message": "No observations to analyze", "processed_count": 0},
                    execution_time=(datetime.now() - start_time).total_seconds()
                )
            
            logger.info(f"Analyzing {len(observations)} observations")
            
            # Step 2: Analyze each observation
            insights = []
            high_value_insights = []
            
            for obs in observations:
                analysis = await self._analyze_observation(obs)
                insights.append(analysis)
                
                # Check if insight is valuable enough to persist
                if analysis.get("relevance_to_goals", 0) >= self.min_relevance_threshold:
                    high_value_insights.append(analysis)
                    await self._persist_insight(analysis)
            
            # Step 3: Generate summary and suggested actions
            summary = await self._generate_analysis_summary(insights, high_value_insights)
            
            # Step 4: Mark observations as processed
            mark_observations_processed([obs["id"] for obs in observations])
            
            # Step 5: Determine if action should be triggered
            suggested_action = await self._determine_action(high_value_insights, summary)
            
            result_data = {
                "processed_count": len(observations),
                "insights_generated": len(insights),
                "high_value_insights": len(high_value_insights),
                "summary": summary,
                "suggested_action": suggested_action,
                "top_insights": self._get_top_insights(high_value_insights, limit=5)
            }
            
            return SkillResult(
                status=SkillStatus.SUCCESS,
                data=result_data,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
            
        except Exception as e:
            logger.error(f"Observation analysis failed: {str(e)}")
            return SkillResult(
                status=SkillStatus.ERROR,
                error=str(e),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
    
    async def _analyze_observation(self, observation: Dict) -> Dict:
        """Analyze a single observation using LLM."""
        observation_text = self._format_observation(observation)
        current_goals = get_current_goals()
        
        prompt = f"""Analyze the following system observation in the context of these evolution goals:
{current_goals}

Observation:
{observation_text}

Provide a structured analysis with:
1. insight: Core insight or pattern identified
2. category: "failure_pattern", "success_pattern", "improvement_opportunity", or "informational"
3. suggested_action: Specific, executable suggestion (e.g., "trigger_new_cycle", "create_new_skill", "modify_config")
4. relevance_to_goals: Score from 0.0 to 1.0 indicating relevance to current goals
5. confidence: Confidence level in the analysis (0.0-1.0)
6. supporting_evidence: Key evidence from the observation
7. potential_impact: Expected impact if suggestion is implemented

Return as JSON with these keys."""
        
        try:
            response = await call_llm(
                prompt=prompt,
                model="analysis",
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            analysis = response if isinstance(response, dict) else json.loads(response)
            analysis["observation_id"] = observation.get("id")
            analysis["analyzed_at"] = datetime.now().isoformat()
            
            return analysis
            
        except Exception as e:
            logger.warning(f"Failed to analyze observation {observation.get('id')}: {str(e)}")
            return {
                "observation_id": observation.get("id"),
                "insight": f"Analysis failed: {str(e)}",
                "category": "analysis_error",
                "relevance_to_goals": 0.0,
                "confidence": 0.0,
                "analyzed_at": datetime.now().isoformat()
            }
    
    def _format_observation(self, observation: Dict) -> str:
        """Format observation data into readable text."""
        parts = []
        
        # Add metadata
        if "timestamp" in observation:
            parts.append(f"Timestamp: {observation['timestamp']}")
        if "type" in observation:
            parts.append(f"Type: {observation['type']}")
        if "source" in observation:
            parts.append(f"Source: {observation['source']}")
        
        # Add content
        if "content" in observation:
            parts.append(f"Content:\n{observation['content']}")
        if "metrics" in observation:
            parts.append(f"Metrics: {observation['metrics']}")
        if "error" in observation:
            parts.append(f"Error: {observation['error']}")
        
        return "\n".join(parts)
    
    async def _persist_insight(self, insight: Dict) -> bool:
        """Persist valuable insight to long-term memory."""
        try:
            memory_entry = {
                "type": "observation_insight",
                "insight": insight.get("insight"),
                "category": insight.get("category"),
                "suggested_action": insight.get("suggested_action"),
                "relevance_to_goals": insight.get("relevance_to_goals"),
                "supporting_evidence": insight.get("supporting_evidence"),
                "analyzed_at": insight.get("analyzed_at"),
                "source_observation_id": insight.get("observation_id"),
                "confidence": insight.get("confidence"),
                "metadata": {
                    "potential_impact": insight.get("potential_impact"),
                    "skill_source": "observation_analysis"
                }
            }
            
            memory_id = save_memory(memory_entry)
            logger.info(f"Persisted insight {memory_id}: {insight.get('insight')[:100]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to persist insight: {str(e)}")
            return False
    
    async def _generate_analysis_summary(self, all_insights: List[Dict], high_value_insights: List[Dict]) -> Dict:
        """Generate summary of analysis results."""
        if not all_insights:
            return {"message": "No insights generated"}
        