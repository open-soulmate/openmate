import asyncio
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Protocol
from dataclasses import dataclass, asdict
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Protocol definitions for dependency injection
class ObservationsStore(Protocol):
    """Protocol for accessing unanalyzed observations"""
    async def get_unanalyzed(self, limit: int = 10) -> List[Dict[str, Any]]:
        ...
    
    async def mark_as_analyzed(self, observation_ids: List[str]) -> None:
        ...


class MemoryStore(Protocol):
    """Protocol for saving to long-term memory"""
    async def save(self, entry: Dict[str, Any]) -> bool:
        ...


class LLMClient(Protocol):
    """Protocol for LLM interactions"""
    async def generate(self, prompt: str, **kwargs) -> str:
        ...


@dataclass
class ObservationSummary:
    """Structured summary of observations"""
    patterns: List[str]
    anomalies: List[str]
    key_insights: List[str]
    relevance_to_goals: List[str]
    overall_summary: str


@dataclass
class KnowledgeEntry:
    """Knowledge entry for long-term memory"""
    id: str
    content: str
    source: str
    timestamp: datetime
    observation_ids: List[str]
    categories: List[str]
    confidence: float = 0.8


class ObservationSummarizer:
    """Skill for periodic processing and summarization of unanalyzed observations"""
    
    def __init__(
        self,
        observations_store: ObservationsStore,
        memory_store: MemoryStore,
        llm_client: LLMClient,
        batch_size: int = 10
    ):
        """
        Initialize the ObservationSummarizer with dependencies
        
        Args:
            observations_store: Storage for unanalyzed observations
            memory_store: Long-term memory storage
            llm_client: LLM client for analysis
            batch_size: Maximum number of observations to process at once
        """
        self.observations_store = observations_store
        self.memory_store = memory_store
        self.llm_client = llm_client
        self.batch_size = batch_size
        self.processing_stats = {
            "total_processed": 0,
            "total_knowledge_entries": 0,
            "last_run": None,
            "errors": []
        }
    
    async def execute(self) -> Dict[str, Any]:
        """
        Main execution method for the skill
        
        Returns:
            Summary report of processing results
        """
        start_time = time.time()
        logger.info("Starting observation summarization cycle")
        
        report = {
            "processed_count": 0,
            "knowledge_entries_created": 0,
            "errors": [],
            "processing_time_seconds": 0,
            "success": True
        }
        
        try:
            # Step 1: Fetch unanalyzed observations
            observations = await self._fetch_observations()
            
            if not observations:
                logger.info("No unanalyzed observations found")
                report["processing_time_seconds"] = time.time() - start_time
                self._update_stats(report)
                return report
            
            report["processed_count"] = len(observations)
            logger.info(f"Fetched {len(observations)} unanalyzed observations")
            
            # Step 2: Analyze observations with LLM
            summaries = await self._analyze_observations(observations)
            
            # Step 3: Create knowledge entries
            knowledge_entries = await self._create_knowledge_entries(observations, summaries)
            
            # Step 4: Save to memory store
            saved_count = await self._save_to_memory(knowledge_entries)
            report["knowledge_entries_created"] = saved_count
            
            # Step 5: Mark observations as analyzed
            observation_ids = [obs.get("id", "") for obs in observations if obs.get("id")]
            if observation_ids:
                await self.observations_store.mark_as_analyzed(observation_ids)
                logger.info(f"Marked {len(observation_ids)} observations as analyzed")
            
            logger.info(f"Successfully processed {len(observations)} observations, created {saved_count} knowledge entries")
            
        except Exception as e:
            logger.error(f"Error in observation summarization: {str(e)}")
            report["errors"].append({
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            report["success"] = False
        
        # Update processing statistics
        report["processing_time_seconds"] = time.time() - start_time
        self._update_stats(report)
        
        return report
    
    async def _fetch_observations(self) -> List[Dict[str, Any]]:
        """Fetch batch of unanalyzed observations"""
        try:
            return await self.observations_store.get_unanalyzed(limit=self.batch_size)
        except Exception as e:
            logger.error(f"Failed to fetch observations: {str(e)}")
            raise
    
    async def _analyze_observations(self, observations: List[Dict[str, Any]]) -> ObservationSummary:
        """Analyze observations using LLM"""
        # Prepare observation data for analysis