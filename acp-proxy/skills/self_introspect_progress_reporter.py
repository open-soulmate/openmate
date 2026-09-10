"""
Self-Introspect Progress Reporter Skill
Automatically compares planned improvements with actual execution results
to establish a plan-execute-feedback loop for agent evolution.
"""

import json
import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging

# Configure logging
logger = logging.getLogger(__name__)


class SelfIntrospectProgressReporter:
    """
    Skill to introspect and report on the agent's evolution progress.
    """
    
    def __init__(self, base_path: str = "."):
        """Initialize paths and load data."""
        self.base_path = Path(base_path)
        self.plan_path = self.base_path / "plans" / "current_evolution_plan.json"
        self.log_path = self.base_path / "logs" / "execution_log.jsonl"
        self.report_path = self.base_path / "reports" / "evolution_progress.json"
        self.memory_path = self.base_path / "memory" / "long_term_memory.json"
        
        # Load data
        self.plan_data = self._load_json(self.plan_path)
        self.execution_logs = self._load_jsonl(self.log_path)
        
    def _load_json(self, path: Path) -> Optional[Dict[str, Any]]:
        """Load and parse a JSON file."""
        try:
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            logger.warning(f"File not found: {path}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON file {path}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error loading file {path}: {e}")
            return None
    
    def _load_jsonl(self, path: Path) -> List[Dict[str, Any]]:
        """Load and parse a JSONL file."""
        logs = []
        try:
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    for line_num, line in enumerate(f, 1):
                        try:
                            line = line.strip()
                            if line:
                                logs.append(json.loads(line))
                        except json.JSONDecodeError as e:
                            logger.warning(f"Error parsing line {line_num} in {path}: {e}")
            return logs
        except Exception as e:
            logger.error(f"Error loading JSONL file {path}: {e}")
            return []
    
    def _save_json(self, data: Dict[str, Any], path: Path) -> bool:
        """Save data to a JSON file."""
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Successfully saved to {path}")
            return True
        except Exception as e:
            logger.error(f"Error saving to {path}: {e}")
            return False
    
    def _get_last_report_timestamp(self) -> Optional[str]:
        """Get the timestamp of the last report."""
        memory_data = self._load_json(self.memory_path)
        if memory_data and "evolution_progress" in memory_data:
            progress_reports = memory_data["evolution_progress"]
            if progress_reports and len(progress_reports) > 0:
                # Get the most recent report
                last_report = progress_reports[-1]
                return last_report.get("report_timestamp")
        return None
    
    def _get_cycle_count(self) -> int:
        """Get the current cycle count."""
        memory_data = self._load_json(self.memory_path)
        if memory_data and "evolution_progress" in memory_data:
            return len(memory_data["evolution_progress"])
        return 0
    
    def _filter_logs_by_time_window(self, logs: List[Dict], start_time: Optional[str]) -> List[Dict]:
        """Filter execution logs by time window."""
        if not start_time:
            return logs
        
        filtered_logs = []
        for log in logs:
            log_timestamp = log.get("timestamp")
            if log_timestamp and log_timestamp > start_time:
                filtered_logs.append(log)
        
        return filtered_logs
    
    def _find_agent_executions_for_plan_item(self, 
                                           plan_item_id: str, 
                                           filtered_logs: List[Dict]) -> List[Dict]:
        """Find agent executions related to a specific plan item."""
        related_executions = []
        
        for log in filtered_logs:
            # Check if this log is from the agent (not partner)
            actor = log.get("actor")
            if actor != "agent":
                continue
            
            # Check if this log relates to the plan item
            related_id = log.get("related_plan_item_id")
            if related_id == plan_item_id:
                related_executions.append(log)
        
        return related_executions
    
    def _generate_next_action(self, 
                            executed_items: List[Dict], 
                            pending_items: List[Dict]) -> str:
        """Generate the next suggested action based on progress."""
        # Prioritize fixing pending items
        if pending_items:
            next_pending = pending_items[0]
            item_id = next_pending.get("id", "unknown")
            item_type = next_pending.get("type", "unknown")
            return f"Fix the pending {item_type} item: {item_id}"
        
        # If no pending items, suggest optimization of recent execution
        if executed_items:
            last_executed = executed_items[-1]
            execution_status = last_executed.get("execution_status")
            if execution_status == "fail":
                return f"Retry failed execution: {last_executed.get('id')}"
            elif execution_status == "partial":
                return f"Complete partial execution: {last_executed.get('id')}"
            else:
                return f"Optimize the timestamp format in execution_log entry to ISO8601"
        
        # Default action if no items
        return "Review and update the evolution plan with new items"
    
    def execute_skill(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main skill execution method.
        
        Args:
            params: Optional parameters (currently unused)
            
        Returns:
            Dictionary containing the progress report
        """
        logger.info("Starting self-introspect progress reporter skill")
        
        # Get time window
        last_report_timestamp = self._get_last_report_timestamp()
        current_timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        
        # Load plan data
        if not self.plan_data:
            logger.error("No evolution plan data found")
            return {"error": "No evolution plan data found"}
        
        plan_items = self.plan_data.get("items", [])
        plan_id = self.plan_data.get("plan_id", "unknown")
        plan_timestamp = self.plan_data.get("timestamp", "unknown")
        
        # Filter execution logs by time window
        filtered_logs = self._filter_logs_by_time_window(
            self.execution_logs, 
            last_report_timestamp
        )
        
        # Process each plan item
        planned_improvements = []
        executed_improvements = []
        pending_improvements = []
        
        for item in plan_items:
            item_id = item.get("id")
            item_type = item.get("type", "unknown")
            target = item.get("target", "")
            description = item.get("description", "")
            expected_outcome = item.get("expected_outcome", "")
            
            # Create base item structure
            base_item = {
                "id": item_id,
                "type": item_type,
                "target": target,
                "description": description,
                "expected_outcome": expected_outcome
            }
            
            # Find related executions
            related_executions = self._find_agent_executions_for_plan_item(
                item_id, 
                filtered_logs
            )
            
            if related_executions:
                # Item has been executed
                execution = related_executions[-1]  # Get most recent execution
                executed_item = {
                    **base_item,
                    "execution_status": execution.get("outcome", "unknown"),
                    "execution_timestamp": execution.get("timestamp"),
                    "output_summary": execution.get("output_summary", ""),
                    "related_log_entries": len(related_executions)
                }
                executed_improvements.append(executed_item)
            else:
                # Item is pending
                pending_item = {
                    **base_item,
                    "plan_status": item.get("status", "planned"),
                    "time_since_plan": plan_timestamp
                }