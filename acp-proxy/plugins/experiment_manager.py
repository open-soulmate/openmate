import os
import json
import uuid
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

class ExperimentManager:
    def __init__(self, base_dir: str = "experiments"):
        """
        Initialize the ExperimentManager.
        
        Args:
            base_dir: Base directory for storing experiments
        """
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(exist_ok=True)
        self.active_experiments = {}
        self.experiment_registry = {}
    
    def create_experiment(self, name: str, hypothesis: str, variables: dict, metrics: list[str]) -> str:
        """
        Create a new experiment with structured metadata.
        
        Args:
            name: Human-readable name for the experiment
            hypothesis: The hypothesis being tested
            variables: Dictionary of variables being manipulated or observed
            metrics: List of metrics to evaluate success
            
        Returns:
            Unique experiment ID
        """
        # Generate unique experiment ID
        experiment_id = f"exp_{uuid.uuid4().hex[:8]}_{int(time.time())}"
        
        # Create experiment directory
        experiment_dir = self.base_dir / experiment_id
        experiment_dir.mkdir(exist_ok=True)
        
        # Create experiment metadata file
        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "active",
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "steps": [],
            "conclusion": None,
            "learning_summary": None
        }
        
        # Save to file
        with open(experiment_dir / "experiment.json", "w") as f:
            json.dump(experiment_data, f, indent=2)
        
        # Create empty directories for data and results
        (experiment_dir / "data").mkdir(exist_ok=True)
        (experiment_dir / "results").mkdir(exist_ok=True)
        
        # Register experiment
        self.active_experiments[experiment_id] = {
            "dir": experiment_dir,
            "data": experiment_data
        }
        
        return experiment_id
    
    def log_step(self, experiment_id: str, step_description: str, data: dict) -> None:
        """
        Log a step in an experiment.
        
        Args:
            experiment_id: ID of the experiment
            step_description: Description of the step taken
            data: Data collected during this step
        """
        if experiment_id not in self.active_experiments:
            raise ValueError(f"Experiment {experiment_id} not found or not active")
        
        # Load current experiment data
        experiment_dir = self.active_experiments[experiment_id]["dir"]
        with open(experiment_dir / "experiment.json", "r") as f:
            experiment_data = json.load(f)
        
        # Create step entry
        step = {
            "step_number": len(experiment_data["steps"]) + 1,
            "description": step_description,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Update experiment data
        experiment_data["steps"].append(step)
        experiment_data["last_updated"] = datetime.now().isoformat()
        
        # Save updated data
        with open(experiment_dir / "experiment.json", "w") as f:
            json.dump(experiment_data, f, indent=2)
        
        # Update in-memory data
        self.active_experiments[experiment_id]["data"] = experiment_data
    
    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> dict:
        """
        Conclude an experiment with summary and learning.
        
        Args:
            experiment_id: ID of the experiment
            outcome_summary: Summary of the experiment's outcome
            
        Returns:
            Dictionary with conclusion details and learning summary
        """
        if experiment_id not in self.active_experiments:
            raise ValueError(f"Experiment {experiment_id} not found")
        
        # Load experiment data
        experiment_dir = self.active_experiments[experiment_id]["dir"]
        with open(experiment_dir / "experiment.json", "r") as f:
            experiment_data = json.load(f)
        
        # Generate learning summary
        learning_summary = self._generate_learning_summary(experiment_data, outcome_summary)
        
        # Update experiment data
        experiment_data["status"] = "concluded"
        experiment_data["conclusion"] = {
            "outcome_summary": outcome_summary,
            "concluded_at": datetime.now().isoformat(),
            "learning_summary": learning_summary
        }
        experiment_data["last_updated"] = datetime.now().isoformat()
        
        # Save final data
        with open(experiment_dir / "experiment.json", "w") as f:
            json.dump(experiment_data, f, indent=2)
        
        # Save learning summary as separate file for easy access
        with open(experiment_dir / "learning_summary.txt", "w") as f:
            f.write(learning_summary)
        
        # Move from active to registry
        self.experiment_registry[experiment_id] = self.active_experiments.pop(experiment_id)
        
        return {
            "experiment_id": experiment_id,
            "outcome_summary": outcome_summary,
            "learning_summary": learning_summary,
            "status": "concluded"
        }
    
    def suggest_new_skill_from_experiment(self, experiment_id: str) -> dict:
        """
        Analyze successful experiments and suggest new skills.
        
        Args:
            experiment_id: ID of the experiment to analyze
            
        Returns:
            Dictionary containing suggested skill definition
        """
        if experiment_id not in self.experiment_registry:
            raise ValueError(f"Concluded experiment {experiment_id} not found in registry")
        
        # Load experiment data
        experiment_dir = self.experiment_registry[experiment_id]["dir"]