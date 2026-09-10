"""
Self Introspect Progress Reporter Skill
Automatically compares planned improvements with actual execution results
to establish a plan-execute-feedback loop for self-programming and error correction.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


class Skill:
    """Main skill class for self-introspective progress reporting."""
    
    def __init__(self):
        self.config = {
            'plan_file': 'plans/current_evolution_plan.json',
            'execution_log': 'logs/execution_log.jsonl',
            'progress_report': 'reports/evolution_progress.json',
            'long_term_memory': 'memory/long_term_memory.json',
            'time_format': 'ISO8601'
        }
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Create necessary directories if they don't exist."""
        for path in [
            'plans', 'logs', 'reports', 'memory'
        ]:
            Path(path).mkdir(exist_ok=True)
    
    def _read_plan_file(self) -> Dict[str, Any]:
        """Read and validate the evolution plan file."""
        plan_path = Path(self.config['plan_file'])
        
        if not plan_path.exists():
            logger.info(f"Plan file not found at {plan_path}, creating default structure")
            default_plan = {
                'plan_id': f'plan_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}',
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'items': []
            }
            self._write_json(plan_path, default_plan)
            return default_plan
        
        try:
            with open(plan_path, 'r', encoding='utf-8') as f:
                plan_data = json.load(f)
            
            # Validate required fields
            required_fields = ['plan_id', 'timestamp', 'items']
            for field in required_fields:
                if field not in plan_data:
                    raise ValueError(f"Plan file missing required field: {field}")
            
            # Validate plan items
            for item in plan_data.get('items', []):
                item_required = ['id', 'type', 'target', 'description', 'expected_outcome', 'status']
                for field in item_required:
                    if field not in item:
                        logger.warning(f"Plan item {item.get('id', 'unknown')} missing field: {field}")
            
            return plan_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in plan file: {e}")
            raise
        except Exception as e:
            logger.error(f"Error reading plan file: {e}")
            raise
    
    def _read_execution_logs(self, since_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
        """Read execution logs, optionally filtering by timestamp."""
        log_path = Path(self.config['execution_log'])
        
        if not log_path.exists():
            logger.info(f"Execution log not found at {log_path}, creating empty file")