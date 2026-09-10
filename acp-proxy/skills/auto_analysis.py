# acp-proxy/skills/auto_analysis.py
"""
auto_analysis skill: A callable atomic action that processes excessive observations
into structured insights by implementing an 'information processing threshold'
and batch analysis capabilities. This addresses information overload and processing
lag issues to improve knowledge accumulation efficiency.
"""

import datetime
from typing import List, Dict, Any, Optional, Tuple
from acp_proxy.core.skill import Skill, SkillConfig
from acp_proxy.core.context import Context

class AutoAnalysisConfig(SkillConfig):
    """Configuration for the auto_analysis skill."""
    # Minimum number of unanalyzed observations to trigger the skill
    UNANALYZED_THRESHOLD: int = 3
    # Maximum observations to process in a single batch (optional safeguard)
    MAX_BATCH_SIZE: int = 100

class AutoAnalysisSkill(Skill):
    """
    Implements an auto_analysis skill that batch-processes unanalyzed observations
    into structured insights and writes them directly to the memory system.
    """
    
    skill_name = "auto_analysis"
    skill_config_class = AutoAnalysisConfig
    
    def __init__(self, context: Context, config: Optional[AutoAnalysisConfig] = None):
        super().__init__(context, config)
        self.config = config or AutoAnalysisConfig()
    
    async def should_trigger(self) -> bool:
        """
        Determine if the skill should be triggered based on the number
        of unanalyzed observations.
        """
        try:
            unanalyzed_count = await self.context.memories.count_unanalyzed()
            return unanalyzed_count >= self.config.UNANALYZED_THRESHOLD
        except AttributeError:
            # Fallback if count_unanalyzed is not implemented
            unanalyzed_observations = await self.context.memories.get_unanalyzed()
            return len(unanalyzed_observations) >= self.config.UNANALYZED_THRESHOLD
    
    async def execute(self) -> str:
        """
        Execute the auto_analysis skill.
        
        Returns:
            A brief analysis report string.
        """
        try:
            # 1. Check and retrieve all unanalyzed observations
            unanalyzed_observations = await self.context.memories.get_unanalyzed()
            
            if not unanalyzed_observations:
                return "No unanalyzed observations found. Auto-analysis skipped."
            
            # Apply batch size limit
            observations_to_process = unanalyzed_observations[:self.config.MAX_BATCH_SIZE]
            
            # 2. Perform batch analysis
            analyzed_results = self._analyze_observations(observations_to_process)
            
            # 3. Format into insight memory entries
            insight_entries = self._format_as_insights(analyzed_results)
            
            # 4. Store new insights and mark original observations as analyzed
            stored_count = await self._store_and_mark(insight_entries, observations_to_process)
            
            # 5. Generate analysis report
            report = self._generate_report(
                processed=len(observations_to_process),
                generated=len(insight_entries),
                stored=stored_count
            )
            
            return report
            
        except Exception as e:
            return f"Auto-analysis failed: {str(e)}"
    
    def _analyze_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Perform batch analysis on observations.
        
        Args:
            observations: List of observation dictionaries to analyze.
            
        Returns:
            List of analyzed results.
        """
        # Step 1: Deduplicate observations based on content similarity
        unique_observations = self._deduplicate_observations(observations)
        
        # Step 2: Cluster by type/tag
        clustered = self._cluster_by_type(unique_observations)
        
        # Step 3: Extract key entities and actions as preliminary insights
        insights = []
        for cluster_type, cluster_observations in clustered.items():
            cluster_insights = self._extract_insights(cluster_type, cluster_observations)
            insights.extend(cluster_insights)
        
        return insights
    
    def _deduplicate_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate or highly similar observations.
        """
        # Simple implementation: remove exact content duplicates
        seen_contents = set()
        unique_observations = []
        
        for obs in observations:
            content = str(obs.get('content', ''))
            # Create a simplified key for comparison
            content_key = content.strip().lower()[:200]  # Use first 200 chars for comparison
            
            if content_key not in seen_contents:
                seen_contents.add(content_key)
                unique_observations.append(obs)
        
        return unique_observations
    
    def _cluster_by_type(self, observations: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Cluster observations by their type or primary tag.
        """
        clusters = {}
        
        for obs in observations:
            # Determine cluster key from tags or type
            tags = obs.get('tags', [])
            obs_type = obs.get('type', 'general')
            
            # Use first tag if available, otherwise use type
            cluster_key = tags[0] if tags else obs_type
            
            if cluster_key not in clusters:
                clusters[cluster_key] = []
            
            clusters[cluster_key].append(obs)
        
        return clusters
    
    def _extract_insights(self, cluster_type: str, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract key entities and actions from a cluster of observations.
        
        This is a simplified implementation that could be enhanced with NLP.
        """
        insights = []
        
        # Simple extraction: create a summary insight for each cluster
        if observations:
            # Combine contents for analysis
            combined_content = "\n".join([
                str(obs.get('content', '')) for obs in observations
            ])
            
            # Extract key entities (simplified: look for capitalized words)
            words = combined_content.split()
            key_entities = [word for word in words if word[0].isupper() and len(word) > 3]
            key_entities = list(set(key_entities))[:5]  # Limit to 5 unique entities
            
            # Create insight
            insight = {
                'type': 'insight',
                'category': cluster_type,
                'summary': f"Processed {len(observations)} observations in '{cluster_type}' category",
                'key_entities': key_entities,
                'observation_count': len(observations),
                'confidence': 0.7  # Placeholder confidence score
            }
            
            insights.append(insight)
        
        return insights
    
    def _format_as_insights(self, analyzed_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Format analysis results into proper insight memory entries.
        """
        timestamp = datetime.datetime.now().isoformat()
        insight_entries = []
        
        for result in analyzed_results:
            insight_entry = {
                'type': 'insight',
                'source': 'auto_analysis',
                'timestamp': timestamp,
                'content': result.get('summary', 'Auto-generated insight'),
                'metadata': {
                    'category': result.get('category'),
                    'key_entities': result.get('key_entities', []),
                    'observation_count': result.get('observation_count', 0),
                    'confidence': result.get('confidence', 0.5),
                    'analysis_type': 'batch_processing'
                },
                'tags': ['auto_analysis', 'insight', result.get('category', 'general')]
            }
            
            insight_entries.append(insight_entry)
        
        return insight_entries
    
    async def _store_and_mark(
        self, 
        insight_entries: List[Dict[str, Any]], 
        original_observations: List[Dict[str, Any]]
    ) -> int:
        """
        Store new insights and mark original observations as analyzed.
        
        Returns:
            Number of insights successfully stored.
        """
        stored_count = 0
        
        try:
            # Store new insights
            for insight in insight_entries:
                success = await self.context.memories.store(insight)
                if success:
                    stored_count += 1
            
            # Mark original observations as analyzed
            observation_ids = [obs.get('id') for obs in original_observations if obs.get('id')]
            
            if observation_ids:
                await self.context.memories.mark_as_analyzed(observation_ids)
            
        except Exception as e:
            # Log error but don't fail the entire operation
            print(f"Error in storage/mark operation: {e}")
        
        return stored_count
    