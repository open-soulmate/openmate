"""
Self Introspect Progress Reporter Skill
Automatically compares planned improvements with actual execution results
to establish a 'plan-execute-feedback' loop.
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

# Path constants
PLANS_FILE = "plans/current_evolution_plan.json"
EXECUTION_LOG_FILE = "logs/execution_log.jsonl"
PROGRESS_REPORT_FILE = "reports/evolution_progress.json"
LONG_TERM_MEMORY_FILE = "memory/long_term_memory.json"
LAST_REPORT_TIMESTAMP_FILE = "memory/last_report_timestamp.json"
CYCLE_COUNT_FILE = "memory/cycle_count.json"


def load_json_file(filepath: str) -> Any:
    """Load and parse a JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def save_json_file(filepath: str, data: Any) -> bool:
    """Save data to a JSON file."""
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False


def load_jsonl_file(filepath: str) -> List[Dict[str, Any]]:
    """Load and parse a JSONL file (one JSON object per line)."""
    records = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except FileNotFoundError:
        pass
    return records


def get_last_report_timestamp() -> datetime:
    """Get the timestamp of the last report, or a very early date if none exists."""
    data = load_json_file(LAST_REPORT_TIMESTAMP_FILE)
    if data and "last_report_timestamp" in data:
        try:
            return datetime.fromisoformat(data["last_report_timestamp"])
        except (ValueError, TypeError):
            pass
    # Default to a very early date (start of Unix time)
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def get_cycle_count() -> int:
    """Get the current evolution cycle count."""
    data = load_json_file(CYCLE_COUNT_FILE)
    if data and "cycle_count" in data:
        return data["cycle_count"]
    return 0


def update_cycle_count(count: int) -> bool:
    """Update the cycle count."""
    return save_json_file(CYCLE_COUNT_FILE, {"cycle_count": count})


def save_last_report_timestamp(timestamp: datetime) -> bool:
    """Save the timestamp of the last report."""
    data = {"last_report_timestamp": timestamp.isoformat()}
    return save_json_file(LAST_REPORT_TIMESTAMP_FILE, data)


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """Parse a timestamp string into a datetime object."""
    try:
        # Handle various timestamp formats
        if timestamp_str.endswith('Z'):
            timestamp_str = timestamp_str[:-1] + '+00:00'
        return datetime.fromisoformat(timestamp_str)
    except (ValueError, TypeError):
        return None


def filter_executions_in_window(
    executions: List[Dict[str, Any]],
    start_time: datetime,
    end_time: datetime
) -> List[Dict[str, Any]]:
    """Filter executions within the specified time window."""
    filtered = []
    for exec_record in executions:
        # Only consider executions by agent (not partner)
        if exec_record.get("actor") != "agent":
            continue
        
        # Parse execution timestamp
        exec_time = parse_timestamp(exec_record.get("timestamp", ""))
        if exec_time is None:
            continue
        
        # Check if within time window
        if start_time <= exec_time <= end_time:
            filtered.append(exec_record)
    
    return filtered


def match_plan_items_with_executions(
    plan_items: List[Dict[str, Any]],
    executions: List[Dict[str, Any]]
) -> Dict[str, List[Dict[str, Any]]]:
    """Match plan items with their corresponding executions."""
    # Create a mapping from plan item ID to executions
    plan_exec_map: Dict[str, List[Dict[str, Any]]] = {}
    
    for plan_item in plan_items:
        plan_item_id = plan_item.get("id")
        if not plan_item_id:
            continue
        
        # Find matching executions
        matching_execs = []
        for exec_record in executions:
            related_id = exec_record.get("related_plan_item_id")
            if related_id == plan_item_id:
                matching_execs.append(exec_record)
        
        plan_exec_map[plan_item_id] = matching_execs
    
    return plan_exec_map


def classify_plan_items(
    plan_items: List[Dict[str, Any]],
    plan_exec_map: Dict[str, List[Dict[str, Any]]]
) -> Dict[str, List[Dict[str, Any]]]:
    """Classify plan items into executed and pending."""
    executed = []
    pending = []
    
    for plan_item in plan_items:
        plan_item_id = plan_item.get("id")
        if not plan_item_id:
            continue
        
        executions = plan_exec_map.get(plan_item_id, [])
        
        if executions:
            # Item has at least one execution
            for exec_record in executions:
                executed_item = {
                    "plan_item_id": plan_item_id,
                    "plan_item": plan_item,
                    "execution": exec_record,
                    "status": exec_record.get("outcome", "unknown"),
                    "output_summary": exec_record.get("output_summary", "")
                }
                executed.append(executed_item)
        else:
            # Item has no executions - mark as pending
            pending.append(plan_item)
    
    return {"executed": executed, "pending": pending}


def generate_next_action(
    pending_items: List[Dict[str, Any]],
    executed_items: List[Dict[str, Any]],
    current_cycle: int
) -> str:
    """Generate the next small, actionable improvement suggestion."""
    if pending_items:
        # Suggest working on the first pending item
        item = pending_items[0]
        item_id = item.get("id", "unknown")
        item_type = item.get("type", "improvement")
        item_target = item.get("target", "system")
        item_description = item.get("description", "")
        
        # Keep suggestion specific and small
        if item_type == "bugfix":
            return f"Fix the pending bug: [{item_id}] - {item_target}"
        elif item_type == "optimization":
            return f"Optimize: [{item_id}] - {item_target}"
        else:
            return f"Implement: [{item_id}] - {item_target}"
    
    elif executed_items:
        # All items executed, suggest verification or minor improvement
        last_executed = executed_items[-1]
        plan_item = last_executed.get("plan_item", {})
        item_target = plan_item.get("target", "system")
        
        return f"Verify results of last execution on: {item_target}"
    
    else:
        # No items to work on
        return "Review evolution plan and add new improvement items"


def run_skill(params: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Main skill execution function.
    
    Args:
        params: Optional parameters (currently unused but maintains interface)
    
    Returns:
        Dictionary with execution results
    """
    if params is None:
        params = {}
    
    # Current execution time