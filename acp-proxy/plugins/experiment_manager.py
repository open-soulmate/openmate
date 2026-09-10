import os
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

class ExperimentManager:
    def __init__(self, base_path: str = "experiments") -> None:
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)
    
    def create_experiment(self, name: str, hypothesis: str, variables: Dict[str, Any], metrics: List[str]) -> str:
        experiment_id = str(uuid.uuid4())
        experiment_dir = os.path.join(self.base_path, experiment_id)
        os.makedirs(experiment_dir, exist_ok=True)
        
        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "in_progress",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "steps": [],
            "outcome": None,
            "learnings": None
        }
        
        with open(os.path.join(experiment_dir, "experiment.json"), "w") as f:
            json.dump(experiment_data, f, indent=2)
        
        return experiment_id
    
    def _load_experiment(self, experiment_id: str) -> Dict[str, Any]:
        experiment_path = os.path.join(self.base_path, experiment_id, "experiment.json")
        if not os.path.exists(experiment_path):
            raise FileNotFoundError(f"Experiment {experiment_id} not found")
        
        with open(experiment_path, "r") as f:
            return json.load(f)
    
    def _save_experiment(self, experiment_id: str, data: Dict[str, Any]) -> None:
        experiment_path = os.path.join(self.base_path, experiment_id, "experiment.json")
        data["updated_at"] = datetime.now().isoformat()
        
        with open(experiment_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def log_step(self, experiment_id: str, step_description: str, data: Dict[str, Any]) -> None:
        experiment_data = self._load_experiment(experiment_id)
        
        step_entry = {
            "timestamp": datetime.now().isoformat(),
            "description": step_description,
            "data": data
        }
        
        experiment_data["steps"].append(step_entry)
        self._save_experiment(experiment_id, experiment_data)
    
    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> Dict[str, Any]:
        experiment_data = self._load_experiment(experiment_id)
        
        if experiment_data["status"] != "in_progress":
            raise ValueError(f"Experiment {experiment_id} is already {experiment_data['status']}")
        
        experiment_data["status"] = "completed"
        experiment_data["outcome"] = outcome_summary
        experiment_data["conclusion_timestamp"] = datetime.now().isoformat()
        
        self._save_experiment(experiment_id, experiment_data)
        return experiment_data
    
    def suggest_new_skill_from_experiment(self, experiment_id: str) -> Dict[str, Any]:
        experiment_data = self._load_experiment(experiment_id)
        
        if experiment_data["status"] != "completed":
            raise ValueError(f"Experiment {experiment_id} must be completed to extract skills")
        
        suggestion = {
            "source_experiment": experiment_id,
            "extracted_at": datetime.now().isoformat(),
            "hypothesis": experiment_data["hypothesis"],
            "outcome": experiment_data["outcome"],
            "variables": experiment_data["variables"],
            "metrics": experiment_data["metrics"],
            "recommendation": self._generate_recommendation(experiment_data)
        }
        
        suggestions_path = os.path.join(self.base_path, experiment_id, "skill_suggestions.json")
        with open(suggestions_path, "w") as f:
            json.dump(suggestion, f, indent=2)
        
        return suggestion
    
    def _generate_recommendation(self, experiment_data: Dict[str, Any]) -> str:
        outcome = experiment_data.get("outcome", "").lower()
        hypothesis = experiment_data.get("hypothesis", "")
        
        if "success" in outcome or "positive" in outcome:
            return f"Based on successful experiment '{hypothesis}', consider creating new skill: '{hypothesis[:50]}...' implementation."
        elif "failure" in outcome or "negative" in outcome:
            return f"From failed experiment '{hypothesis}', avoid similar approaches and document as anti-pattern."
        else:
            return f"Intermediate results for '{hypothesis[:50]}...', requires further analysis before skill extraction."
    
    def get_experiment_summary(self, experiment_id: str) -> Dict[str, Any]:
        experiment_data = self._load_experiment(experiment_id)
        return {
            "id": experiment_data["id"],
            "name": experiment_data["name"],
            "status": experiment_data["status"],
            "created_at": experiment_data["created_at"],
            "updated_at": experiment_data["updated_at"],
            "hypothesis": experiment_data["hypothesis"],
            "outcome": experiment_data.get("outcome")
        }
    
    def list_experiments(self) -> List[Dict[str, Any]]:
        experiments = []
        if not os.path.exists(self.base_path):
            return experiments
        
        for experiment_id in os.listdir(self.base_path):
            experiment_path = os.path.join(self.base_path, experiment_id)
            if os.path.isdir(experiment_path):
                try:
                    summary = self.get_experiment_summary(experiment_id)
                    experiments.append(summary)
                except (FileNotFoundError, json.JSONDecodeError):
                    continue
        
        return experiments