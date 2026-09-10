#!/usr/bin/env python3
"""
Observation Analyzer Skill - Core component for continuous evolution
"""

import json
import os
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('observation_analyzer')

class ObservationAnalyzer:
    """Skill for analyzing observations and triggering evolutionary improvements"""
    
    def __init__(self, 
                 observations_path: str = "data/observations.json",
                 goals_path: str = "data/goals.json",
                 knowledge_path: str = "data/knowledge_base.md",
                 unanalyzed_threshold: int = 2):
        """
        Initialize the observation analyzer skill
        
        Args:
            observations_path: Path to observations data file
            goals_path: Path to evolution goals file
            knowledge_path: Path to knowledge base file
            unanalyzed_threshold: Minimum number of unanalyzed observations to trigger analysis
        """
        self.observations_path = Path(observations_path)
        self.goals_path = Path(goals_path)
        self.knowledge_path = Path(knowledge_path)
        self.unanalyzed_threshold = unanalyzed_threshold
        
        # Ensure directories exist
        self.observations_path.parent.mkdir(parents=True, exist_ok=True)
        self.knowledge_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"ObservationAnalyzer initialized with threshold: {unanalyzed_threshold}")
    
    def run_analysis(self) -> Dict[str, Any]:
        """
        Main entry point for triggering analysis cycle
        
        Returns:
            Dictionary containing analysis report and execution status
        """
        start_time = time.time()
        report = {
            "timestamp": datetime.now().isoformat(),
            "observations_processed": 0,
            "insights_generated": [],
            "suggestions": [],
            "potential_goal_impacts": {},
            "self_programming_task": None,
            "errors": []
        }
        
        try:
            # Step 1: Load and analyze observations
            observations = self._load_observations()
            unanalyzed = self._get_unanalyzed_observations(observations)
            
            if len(unanalyzed) < self.unanalyzed_threshold:
                logger.info(f"Only {len(unanalyzed)} unanalyzed observations (threshold: {self.unanalyzed_threshold}). Skipping analysis.")
                report["status"] = "skipped"
                report["reason"] = f"Insufficient unanalyzed observations ({len(unanalyzed)} < {self.unanalyzed_threshold})"
                return report
            
            logger.info(f"Starting analysis of {len(unanalyzed)} unanalyzed observations")
            
            # Step 2: Perform analysis
            analysis_results = self._analyze_observations(unanalyzed)
            report.update({
                "observations_processed": len(unanalyzed),
                "insights_generated": analysis_results["insights"],
                "suggestions": analysis_results["suggestions"],
                "potential_goal_impacts": analysis_results["goal_impacts"]
            })
            
            # Step 3: Generate self-programming task if needed
            self_programming_task = self._check_and_generate_self_programming_task(analysis_results)
            if self_programming_task:
                report["self_programming_task"] = self_programming_task
            
            # Step 4: Update observation status and knowledge base
            self._update_observations_status(observations, unanalyzed)
            self._update_knowledge_base(analysis_results)
            
            report["status"] = "completed"
            report["execution_time"] = time.time() - start_time
            
            logger.info(f"Analysis completed in {report['execution_time']:.2f} seconds")
            
        except Exception as e:
            logger.error(f"Error during analysis: {str(e)}")
            report["status"] = "failed"
            report["errors"].append(str(e))
            report["execution_time"] = time.time() - start_time
            
            # Log error for self-repair goal
            self._log_error_for_repair(str(e))
        
        return report
    
    def _load_observations(self) -> List[Dict[str, Any]]:
        """Load observations from file with error handling"""
        try:
            if not self.observations_path.exists():
                logger.warning(f"Observations file not found: {self.observations_path}. Creating empty file.")
                with open(self.observations_path, 'w') as f:
                    json.dump([], f)
                return []
            
            with open(self.observations_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            if not isinstance(data, list):
                raise ValueError("Observations file must contain a JSON array")
                
            return data
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in observations file: {e}")
            raise ValueError(f"Invalid JSON format in observations file: {e}")
        except Exception as e:
            logger.error(f"Error loading observations: {e}")
            raise
    
    def _get_unanalyzed_observations(self, observations: List[Dict]) -> List[Dict]:
        """Filter and return unanalyzed observations"""
        unanalyzed = []
        for obs in observations:
            if not obs.get("analyzed", False):
                # Ensure required fields exist
                required_fields = ["content", "timestamp", "target"]
                if all(field in obs for field in required_fields):
                    unanalyzed.append(obs)
                else:
                    logger.warning(f"Skipping observation missing required fields: {obs}")
        return unanalyzed
    
    def _analyze_observations(self, observations: List[Dict]) -> Dict[str, Any]:
        """Perform analysis on observations - rule-driven analysis logic"""
        insights = []
        suggestions = []
        goal_impacts = {}
        
        # Simple rule-based analysis
        for obs in observations:
            content = obs.get("content", "").lower()
            target = obs.get("target", "general")
            
            # Rule 1: Pattern detection for self-programming opportunities
            if any(keyword in content for keyword in ["error", "bug", "fix", "improve", "optimize"]):
                insights.append({
                    "type": "improvement_opportunity",
                    "observation_id": obs.get("id", "unknown"),
                    "content": f"Potential improvement opportunity detected in {target}: {content[:100]}...",
                    "confidence": 0.7,
                    "related_target": target
                })
            
            # Rule 2: Performance anomaly detection