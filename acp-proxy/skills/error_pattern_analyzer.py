import asyncio
import json
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib


class ErrorSeverity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ErrorCategory(Enum):
    RUNTIME = "runtime"
    DEPENDENCY = "dependency"
    PARAMETER = "parameter"
    LOGIC = "logic"
    SYSTEM = "system"
    NETWORK = "network"
    UNKNOWN = "unknown"


@dataclass
class ErrorAnalysis:
    error_id: str
    category: ErrorCategory
    severity: ErrorSeverity
    root_cause: str
    suggested_fix: str
    occurrence_count: int
    first_seen: str
    last_seen: str
    affected_components: List[str]
    confidence_score: float


@dataclass
class DiagnosticReport:
    analysis_timestamp: str
    time_window: str
    total_errors: int
    unique_patterns: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    top_errors: List[ErrorAnalysis]
    overall_health: str
    recommendations: List[str]


class ErrorPatternAnalyzer:
    def __init__(
        self,
        memory_manager: Any,
        llm_client: Callable,
        log_file_path: Optional[str] = None,
        error_db_table: Optional[str] = None
    ):
        self.memory_manager = memory_manager
        self.llm_client = llm_client
        self.log_file_path = log_file_path
        self.error_db_table = error_db_table
        
        # Cache for error analysis results
        self._analysis_cache = {}
        self._cache_ttl = 3600  # 1 hour TTL
        
        # Error pattern database
        self._error_patterns_db = {}

    async def analyze_recent_errors(
        self, 
        time_window: str = 'last_24h'
    ) -> DiagnosticReport:
        """Main method to analyze recent errors and generate diagnostic report"""
        
        # 1. Retrieve errors from multiple sources
        errors = await self._collect_errors(time_window)
        
        if not errors:
            return self._create_empty_report(time_window)
        
        # 2. Process and cluster errors
        analyzed_errors = await self._process_errors(errors)
        
        # 3. Generate diagnostic report
        report = self._generate_report(analyzed_errors, time_window)
        
        # 4. Store analysis results
        await self._store_analysis_results(report)
        
        return report

    async def _collect_errors(self, time_window: str) -> List[Dict]:
        """Collect errors from memory manager and external log sources"""
        
        errors = []
        time_delta = self._parse_time_window(time_window)
        cutoff_time = datetime.now() - time_delta
        
        # Get errors from memory manager
        memory_errors = await self._search_memory_errors(cutoff_time)
        errors.extend(memory_errors)
        
        # Get errors from log file if specified
        if self.log_file_path:
            file_errors = await self._parse_log_file(cutoff_time)
            errors.extend(file_errors)
        
        # Get errors from database if specified
        if self.error_db_table:
            db_errors = await self._query_error_database(cutoff_time)
            errors.extend(db_errors)
        
        # Remove duplicates
        unique_errors = self._deduplicate_errors(errors)
        
        return unique_errors

    async def _search_memory_errors(self, cutoff_time: datetime) -> List[Dict]:
        """Search memory manager for error-related records"""
        
        error_keywords = [
            'error', 'failure', 'exception', 'bug', 'crash', 
            'traceback', 'error:', 'failed', 'invalid', 'missing'
        ]
        
        query = " OR ".join(error_keywords)
        
        try:
            results = await self.memory_manager.search(
                query=query,
                tags=['error', 'failure', 'exception'],
                after=cutoff_time.isoformat(),
                limit=100
            )
            
            return [
                {
                    'source': 'memory',
                    'content': result.get('content', ''),
                    'timestamp': result.get('timestamp', ''),
                    'metadata': result.get('metadata', {}),
                    'id': result.get('id', hashlib.md5(str(result).encode()).hexdigest())
                }
                for result in results
            ]
            
        except Exception as e:
            print(f"Error searching memory: {e}")
            return []

    async def _parse_log_file(self, cutoff_time: datetime) -> List[Dict]:
        """Parse error log file for errors"""
        
        errors = []
        error_patterns = [
            r'ERROR|Exception|Traceback|FATAL|CRITICAL',
            r'failed|invalid|missing|unavailable'
        ]
        
        try:
            # This is a simplified log parser
            with open(self.log_file_path, 'r') as f:
                lines = f.readlines()
                
                for i, line in enumerate(lines[-1000:]):  # Last 1000 lines
                    if any(re.search(pattern, line, re.IGNORECASE) for pattern in error_patterns):
                        timestamp = self._extract_timestamp_from_log(line)
                        if timestamp and timestamp >= cutoff_time:
                            errors.append({
                                'source': 'log_file',
                                'content': line.strip(),
                                'timestamp': timestamp.isoformat(),
                                'metadata': {'line_number': len(lines) - 1000 + i},
                                'id': hashlib.md5(line.strip().encode()).hexdigest()
                            })
                            
        except FileNotFoundError:
            print(f"Log file not found: {self.log_file_path}")
        except Exception as e:
            print(f"Error reading log file: {e}")
            
        return errors
