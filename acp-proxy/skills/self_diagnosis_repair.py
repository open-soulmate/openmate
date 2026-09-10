import os
import re
import json
import time
import logging
import schedule
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('self_diagnosis.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('SelfDiagnosisRepair')

@dataclass
class ErrorPattern:
    """Data class representing an error pattern."""
    name: str
    pattern: str
    description: str
    severity: int  # 1-5 scale
    repair_strategy: str

@dataclass
class RepairAction:
    """Data class representing a repair action."""
    error_type: str
    context: Dict
    action_taken: str
    timestamp: str
    success: bool
    details: Optional[str] = None

class SelfDiagnosisRepair:
    """Self-diagnosis and repair skill for agent system maintenance."""
    
    def __init__(
        self,
        scan_frequency_hours: int = 24,
        max_repair_attempts: int = 3,
        log_directory: str = 'logs',
        feedback_file: str = 'feedback.log',
        repair_history_file: str = 'repair_history.json'
    ):
        """Initialize the self-diagnosis and repair system.
        
        Args:
            scan_frequency_hours: How often to scan for errors (in hours)
            max_repair_attempts: Maximum number of repair attempts per error
            log_directory: Directory containing log files
            feedback_file: Path to user feedback log file
            repair_history_file: File to store repair history
        """
        self.scan_frequency_hours = scan_frequency_hours
        self.max_repair_attempts = max_repair_attempts
        self.log_directory = Path(log_directory)
        self.feedback_file = Path(feedback_file)
        self.repair_history_file = Path(repair_history_file)
        self.repair_history: List[RepairAction] = []
        
        # Initialize error patterns (at least 5 as required)
        self.error_patterns = [
            ErrorPattern(
                name='timeout_error',
                pattern=r'timeout|timed? ?out|request.?time',
                description='Request or operation timed out',
                severity=3,
                repair_strategy='increase_timeout'
            ),
            ErrorPattern(
                name='dependency_missing',
                pattern=r'import.?error|module.?not.?found|no.?module',
                description='Required dependency or module not found',
                severity=4,
                repair_strategy='install_dependency'
            ),
            ErrorPattern(
                name='resource_overflow',
                pattern=r'memory.?error|out.?of.?memory|resource.?limit|queue.?full',
                description='System resource limit exceeded',
                severity=5,
                repair_strategy='resource_optimization'
            ),
            ErrorPattern(
                name='api_failure',
                pattern=r'api.?error|http.?error|status.?code.?[^2]|connection.?refused',
                description='External API call failed',
                severity=3,
                repair_strategy='retry_with_backoff'
            ),
            ErrorPattern(
                name='logic_error',
                pattern=r'assertion.?error|type.?error|value.?error|key.?error',
                description='Programming logic or data error',
                severity=4,
                repair_strategy='parameter_validation'
            ),
            ErrorPattern(
                name='permission_error',
                pattern=r'permission.?denied|access.?denied|not.?authorized',
                description='Insufficient permissions for operation',
                severity=4,
                repair_strategy='check_permissions'
            )
        ]
        
        # Load repair history if exists
        self._load_repair_history()
        
        # Set up scheduled scanning
        schedule.every(scan_frequency_hours).hours.do(self.scan_errors)
        
        logger.info(f"SelfDiagnosisRepair initialized with {len(self.error_patterns)} error patterns")
    
    def _load_repair_history(self):
        """Load repair history from file."""
        try:
            if self.repair_history_file.exists():
                with open(self.repair_history_file, 'r') as f:
                    data = json.load(f)
                    self.repair_history = [RepairAction(**item) for item in data]
                logger.info(f"Loaded {len(self.repair_history)} repair history records")
        except Exception as e:
            logger.error(f"Failed to load repair history: {e}")
    
    def _save_repair_history(self):
        """Save repair history to file."""
        try:
            with open(self.repair_history_file, 'w') as f:
                json.dump([asdict(action) for action in self.repair_history], f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save repair history: {e}")
    
    def scan_errors(self) -> List[Dict]:
        """Scan log files and feedback for error patterns.
        
        Returns:
            List of error dictionaries with pattern matches and context
        """
        errors_found = []
        timestamp = datetime.now().isoformat()
        
        # Scan regular log files
        if self.log_directory.exists():
            for log_file in self.log_directory.glob('*.log'):
                try:
                    with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                    
                    for line_num, line in enumerate(lines, 1):
                        for pattern in self.error_patterns:
                            if re.search(pattern.pattern, line, re.IGNORECASE):
                                error_data = {
                                    'timestamp': timestamp,
                                    'source': str(log_file),
                                    'line_number': line_num,
                                    'content': line.strip(),
                                    'pattern_matched': pattern.name,
                                    'pattern_description': pattern.description,
                                    'severity': pattern.severity
                                }
                                errors_found.append(error_data)
                                logger.warning(f"Error detected: {pattern.name} in {log_file}:{line_num}")
                except Exception as e:
                    logger.error(f"Failed to scan {log_file}: {e}")
        
        # Scan feedback file if exists
        if self.feedback_file.exists():
            try:
                with open(self.feedback_file, 'r', encoding='utf-8', errors='ignore') as f:
                    feedback_lines = f.readlines()
                
                for line_num, line in enumerate(feedback_lines, 1):
                    # Look for negative feedback or error mentions
                    if any(keyword in line.lower() for keyword in ['error', 'bug', 'issue', 'problem', 'fail']):
                        errors_found.append({
                            'timestamp': timestamp,
                            'source': 'user_feedback',
                            'line_number': line_num,
                            'content': line.strip(),
                            'pattern_matched': 'user_reported_issue',
                            'pattern_description': 'Issue reported by user feedback',
                            'severity': 3
                        })
            except Exception as e:
                logger.error(f"Failed to scan feedback file: {e}")
        
        logger.info(f"Scan completed. Found {len(errors_found)} errors")
        return errors_found
    
    def diagnose(self, error_data: Dict) -> Tuple[str, Dict]:
        """Diagnose error type using pattern matching and rules.
        
        Args:
            error_data: Error data dictionary from scan_errors()
            
        Returns:
            Tuple of (error_type, context)
        """