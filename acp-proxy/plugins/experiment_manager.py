import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

class ExperimentManager:
    def __init__(self, base_dir: str = "experiments"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)
    
    def create_experiment(
        self, 
        name: str, 
        hypothesis: str, 
        variables: Dict[str, Any], 
        metrics: List[str]
    ) -> str:
        """Create a new experiment and return its ID."""
        experiment_id = str(uuid.uuid4())
        experiment_dir = os.path.join(self.base_dir, experiment_id)
        os.makedirs(experiment_dir, exist_ok=True)
        
        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "created",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        with open(os.path.join(experiment_dir, "experiment.json"), "w") as f:
            json.dump(experiment_data, f, indent=2)
        
        # Initialize log file
        with open(os.path.join(experiment_dir, "log.jsonl"), "w") as f:
            pass
            
        return experiment_id
    
    def log_step(
        self, 
        experiment_id: str, 
        step_description: str, 
        data: Dict[str, Any]
    ) -> bool:
        """Log a step in the experiment."""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "step": step_description,
            "data": data
        }
        
        log_path = os.path.join(self.base_dir, experiment_id, "log.jsonl")
        
        if not os.path.exists(log_path):
            raise FileNotFoundError(f"Experiment {experiment_id} not found")
            
        with open(log_path, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
        
        # Update experiment status