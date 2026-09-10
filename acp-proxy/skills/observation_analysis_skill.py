# acp-proxy/skills/observation_analysis_skill.py

import logging
from typing import List, Any
from datetime import datetime

from .base_skill import BaseSkill

logger = logging.getLogger(__name__)


class PriorityAnalysisSkill(BaseSkill):
    """
    A high-priority skill designed to process and analyze pending observations
    in each processing cycle to prevent backlog accumulation.
    """
    
    def __init__(self, memory_service: Any = None, analysis_service: Any = None):
        """
        Initialize the PriorityAnalysisSkill.
        
        Args:
            memory_service: Service for accessing observation memory/store
            analysis_service: Service for analyzing observations
        """
        super().__init__()
        self.priority = 1  # Highest priority
        self.memory_service = memory_service
        self.analysis_service = analysis_service
        self.name = "priority_observation_analysis"
        self.description = "High-priority skill to analyze pending observations"
    
    async def run(self) -> List[dict]:
        """
        Execute the observation analysis workflow.
        
        Returns:
            List of processed observation results
        """
        processed_observations = []
        
        try:
            # Step 1: Fetch all pending or unanalyzed observations
            observations = await self.memory_service.get_observations_by_status(
                statuses=["pending", "unanalyzed"]
            )
            
            if not observations:
                logger.info("No pending observations found")
                return []
            
            # Step 2: Sort observations by timestamp (oldest first)
            observations.sort(key=lambda obs: obs.get("timestamp", datetime.min))
            
            logger.info(f"Processing {len(observations)} pending observations")
            
            # Step 3: Process each observation
            for observation in observations:
                try:
                    # Analyze the observation
                    analysis_result = await self.analysis_service.analyze(observation)
                    
                    # Update observation status to analyzed
                    await self.memory_service.update_observation_status(
                        observation_id=observation["id"],
                        new_status="analyzed",
                        analysis_result=analysis_result
                    )
                    
                    processed_observations.append({
                        "observation_id": observation["id"],
                        "status": "analyzed",
                        "result": analysis_result,
                        "processed_at": datetime.now().isoformat()
                    })
                    
                except Exception as e:
                    logger.error(f"Failed to process observation {observation.get('id')}: {str(e)}")
                    # Mark observation as failed but continue processing
                    await self.memory_service.update_observation_status(
                        observation_id=observation["id"],
                        new_status="failed",
                        error=str(e)
                    )
            
            # Step 4: Log summary
            success_count = len(processed_observations)
            total_count = len(observations)
            failed_count = total_count - success_count
            
            logger.info(
                f"Processed {success_count}/{total_count} observations successfully. "
                f"{failed_count} observations failed."
            )
            
            return processed_observations
            
        except Exception as e:
            logger.error(f"Critical error in PriorityAnalysisSkill: {str(e)}")
            raise
    
    def set_services(self, memory_service: Any, analysis_service: Any):
        """
        Set or update the required services.
        
        Args:
            memory_service: Service for accessing observation memory/store
            analysis_service: Service for analyzing observations
        """
        self.memory_service = memory_service
        self.analysis_service = analysis_service