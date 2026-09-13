import json
import os
from typing import Dict, Any, Optional, Tuple, List, Union
from datetime import datetime

# Default thresholds for evolution failure detection
DEFAULT_STAGNATION_THRESHOLD = 5  # Consecutive cycles without progress
DEFAULT_GOAL_STAGNATION_THRESHOLD = 3  # Consecutive cycles without goal progress
CORE_GOALS = ['self_programming', 'knowledge_acquisition', 'task_adaptation']  # Core evolution goals

def _load_json_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Load and return JSON content from a file, returning None on failure."""
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None

def _validate_dna_state(dna_state: Optional[Dict[str, Any]], config_path: str = None) -> Dict[str, Any]:
    """
    Validate the structure and evolution state of the DNA state dictionary.
    Returns a structured diagnostic result with validation status, evolution status, and failure reasons.
    
    Args:
        dna_state: The DNA state dictionary to validate
        config_path: Optional path to configuration file for memory/reflection analysis
        
    Returns:
        Dictionary with keys: 'is_valid', 'status', 'failure_reasons', 'diagnostics'
    """
    result = {
        'is_valid': False,
        'status': 'invalid',
        'failure_reasons': [],
        'diagnostics': {
            'stagnation_detected': False,
            'goal_progression_status': {},
            'intervention_needed': False
        }
    }
    
    # Load configuration if provided
    config = None
    if config_path:
        config = _load_json_file(config_path)
        if config:
            # Update thresholds from config if available
            result['diagnostics']['config_loaded'] = True