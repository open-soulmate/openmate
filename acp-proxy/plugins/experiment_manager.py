import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path


class ExperimentManager:
    def __init__(self, base_path: str = "experiments"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_experiment_path(self, experiment_id: str) -> Path:
        return self.base_path / experiment_id

    def create_experiment(self, name: str, hypothesis: str, variables: dict, metrics: List[str]) -> str:
        experiment_id = str(uuid.uuid4())
        experiment_dir = self._get_experiment_path(experiment_id)
        experiment_dir.mkdir(parents=True, exist_ok=True)

        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "active",
            "created_at": datetime.now().isoformat(),
            "concluded_at": None,
            "outcome_summary": None,
            "steps": [],
            "results": {}
        }

        with open(experiment_dir / "experiment.json", "w", encoding="utf-8") as f:
            json.dump(experiment_data, f, indent=2, ensure_ascii=False)

        with open(experiment_dir / "steps.log", "w", encoding="utf-8") as f:
            f.write("")

        return experiment_id

    def log_step(self, experiment_id: str, step_description: str, data: dict) -> None:
        experiment_dir = self._get_experiment_path(experiment_id)
        if not experiment_dir.exists():
            raise FileNotFoundError(f"Experiment {experiment_id} not found")

        step = {
            "timestamp": datetime.now().isoformat(),
            "description": step_description,
            "data": data
        }

        with open(experiment_dir / "experiment.json", "r+", encoding="utf-8") as f:
            experiment_data = json.load(f)
            experiment_data["steps"].append(step)
            f.seek(0)
            json.dump(experiment_data, f, indent=2, ensure_ascii=False)
            f.truncate()

        with open(experiment_dir / "steps.log", "a", encoding="utf-8") as f:
            f.write(f"[{step['timestamp']}] {step_description}\n")
            f.write(f"Data: {json.dumps(data, ensure_ascii=False)}\n\n")

    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> dict:
        experiment_dir = self._get_experiment_path(experiment_id)
        if not experiment_dir.exists():
            raise FileNotFoundError(f"Experiment {experiment_id} not found")

        with open(experiment_dir / "experiment.json", "r+", encoding="utf-8") as f:
            experiment_data = json.load(f)
            experiment_data["status"] = "concluded"
            experiment_data["concluded_at"] = datetime.now().isoformat()
            experiment_data["outcome_summary"] = outcome_summary

            success_metrics = self._calculate_success_metrics(experiment_data)
            experiment_data["results"] = {
                "success_metrics": success_metrics,
                "learning_points": self._extract_learning_points(experiment_data)
            }

            f.seek(0)
            json.dump(experiment_data, f, indent=2, ensure_ascii=False)
            f.truncate()

        return experiment_data

    def suggest_new_skill_from_experiment(self, experiment_id: str) -> dict:
        experiment_dir = self._get_experiment_path(experiment_id)
        if not experiment_dir.exists():
            raise FileNotFoundError(f"Experiment {experiment_id} not found")

        with open(experiment_dir / "experiment.json", "r", encoding="utf-8") as f:
            experiment_data = json.load(f)

        if experiment_data["status"] != "concluded":
            return {"error": "Experiment not concluded"}

        success_score = self._calculate_success_score(experiment_data)
        
        if success_score >= 0.7:
            return {
                "suggested": True,
                "skill_definition": {
                    "name": f"skill_from_{experiment_data['name']}_{experiment_id[:8]}",
                    "description": f"Skill derived from successful experiment: {experiment_data['hypothesis']}",
                    "approach": experiment_data["variables"],
                    "expected_outcomes": experiment_data["metrics"],
                    "source_experiment": experiment_id,
                    "success_score": success_score,
                    "implementation_guide": f"Use the methodology from experiment {experiment_id} as described in {experiment_dir}/steps.log"
                }
            }
        else:
            return {
                "suggested": False,
                "reason": f"Experiment had low success score: {success_score}",
                "learning_points": experiment_data["results"].get("learning_points", [])
            }

    def get_experiment(self, experiment_id: str) -> Optional[dict]:
        experiment_dir = self._get_experiment_path(experiment_id)
        if not experiment_dir.exists():
            return None

        with open(experiment_dir / "experiment.json", "r", encoding="utf-8") as f:
            return json.load(f)
