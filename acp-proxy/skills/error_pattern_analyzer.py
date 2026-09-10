"""
Error Pattern Analyzer Skill
This skill scans and analyzes accumulated failure patterns, anomalous logs,
and unanalyzed observations to transform them into actionable improvement knowledge.
"""

import datetime
import json
import re
from typing import List, Dict, Optional, Any
from collections import defaultdict

# Import necessary components (assumed to exist)
try:
    from memory_manager import MemoryManager
    from llm_interface import LLMInterface
except ImportError:
    # Fallback implementations for standalone testing
    class MemoryManager:
        def search_memories(self, query: str, time_window: str = 'last_24h', limit: int = 100) -> List[Dict]:
            return []
        
        def add_memory(self, content: str, tags: List[str] = None, metadata: Dict = None) -> str:
            return "memory_id"
    
    class LLMInterface:
        def generate(self, prompt: str, max_tokens: int = 1000) -> str:
            return '{"classification": "unknown", "root_cause": "unknown", "suggested_fix": "unknown"}'


class ErrorPatternAnalyzer:
    """
    Analyzes error patterns from system memories and logs to generate
    diagnostic reports and actionable fixes.
    """
    
    def __init__(self, memory_manager: Optional[MemoryManager] = None, llm: Optional[LLMInterface] = None):
        """
        Initialize the Error Pattern Analyzer.
        
        Args:
            memory_manager: Instance of MemoryManager for accessing system memories
            llm: Instance of LLMInterface for text analysis
        """
        self.memory_manager = memory_manager or MemoryManager()
        self.llm = llm or LLMInterface()
        
        # Time window mapping for parsing
        self.time_windows = {
            'last_24h': datetime.timedelta(hours=24),
            'last_7d': datetime.timedelta(days=7),
            'last_30d': datetime.timedelta(days=30),
            'all': None
        }
        
        # Common error keywords to search for
        self.error_keywords = [
            'error', 'failure', 'exception', 'failed', 'broken',
            'bug', 'issue', 'problem', 'crash', 'timeout'
        ]
    
    def analyze_recent_errors(self, time_window: str = 'last_24h') -> List[Dict]:
        """
        Main method to analyze recent errors from the system.
        
        Args:
            time_window: Time window to analyze ('last_24h', 'last_7d', 'last_30d', 'all')
            
        Returns:
            List of diagnostic reports for each error pattern
        """
        # Retrieve error-related memories
        error_memories = self._retrieve_error_memories(time_window)
        
        # Check for dedicated error logs (file or database)
        error_logs = self._retrieve_error_logs()
        
        # Combine all error sources
        all_errors = error_memories + error_logs
        
        if not all_errors:
            return [{
                'status': 'no_errors',
                'message': f'No errors found in {time_window}',
                'timestamp': datetime.datetime.now().isoformat()
            }]
        
        # Cluster and diagnose errors
        diagnostic_results = self._cluster_and_diagnose(all_errors)
        
        # Generate final reports
        reports = self._generate_reports(diagnostic_results)
        
        # Update knowledge base with analysis
        self._update_knowledge_base(reports)
        
        return reports
    
    def _retrieve_error_memories(self, time_window: str) -> List[Dict]:
        """
        Retrieve error-related memories from memory manager.
        
        Args:
            time_window: Time window to search within
            
        Returns:
            List of error-related memory objects
        """
        error_memories = []
        
        # Search for each error keyword
        for keyword in self.error_keywords:
            memories = self.memory_manager.search_memories(
                query=keyword,
                time_window=time_window,
                limit=50
            )
            
            # Filter and format error memories
            for memory in memories:
                if self._is_error_memory(memory):
                    formatted_memory = {
                        'id': memory.get('id', 'unknown'),
                        'content': memory.get('content', ''),
                        'timestamp': memory.get('timestamp', ''),
                        'source': 'memory',
                        'tags': memory.get('tags', []),
                        'metadata': memory.get('metadata', {})
                    }
                    error_memories.append(formatted_memory)
        
        return error_memories
    
    def _retrieve_error_logs(self) -> List[Dict]:
        """
        Retrieve dedicated error logs from system.
        This could be from files, databases, or other logging systems.
        
        Returns:
            List of error log entries
        """
        error_logs = []
        
        # Check for dedicated error log file
        error_log_file = 'error_logs.json'
        try:
            with open(error_log_file, 'r') as f:
                logs = json.load(f)
                for log in logs:
                    error_logs.append({
                        'id': log.get('id', f'log_{len(error_logs)}'),
                        'content': log.get('message', log.get('content', '')),
                        'timestamp': log.get('timestamp', ''),
                        'source': 'error_log_file',
                        'level': log.get('level', 'ERROR'),
                        'stack_trace': log.get('stack_trace', ''),
                        'metadata': log.get('metadata', {})
                    })
        except (FileNotFoundError, json.JSONDecodeError):
            # No error log file found, continue
            pass
        
        return error_logs
    
    def _is_error_memory(self, memory: Dict) -> bool:
        """
        Determine if a memory is error-related.
        
        Args:
            memory: Memory object to check
            
        Returns:
            True if memory contains error-related content
        """
        content = memory.get('content', '').lower()
        tags = [tag.lower() for tag in memory.get('tags', [])]
        
        # Check content for error keywords
        for keyword in self.error_keywords:
            if keyword in content:
                return True
        
        # Check tags for error-related tags
        error_tags = ['error', 'failure', 'exception', 'bug', 'issue']
        for tag in error_tags:
            if tag in tags:
                return True
        
        return False
    
    def _cluster_and_diagnose(self, errors: List[Dict]) -> Dict:
        """
        Cluster errors and diagnose root causes using LLM.
        
        Args:
            errors: List of error entries
            
        Returns:
            Dictionary containing clustered errors with diagnoses
        """
        # Group errors by similarity (simple text-based clustering)
        clustered_errors = self._cluster_errors(errors)
        
        # Diagnose each cluster
        diagnoses = []
        for cluster_id, cluster_errors in clustered_errors.items():
            # Use LLM to analyze cluster
            diagnosis = self._diagnose_cluster(cluster_errors, cluster_id)
            diagnoses.append({
                'cluster_id': cluster_id,
                'error_count': len(cluster_errors),
                'first_occurrence': min(e['timestamp'] for e in cluster_errors if e['timestamp']),
                'last_occurrence': max(e['timestamp'] for e in cluster_errors if e['timestamp']),
                'diagnosis': diagnosis,
                'sample_errors': cluster_errors[:3]  # Keep first 3 for reference
            })
        
        return {
            'total_errors': len(errors),
            'unique_patterns': len(diagnoses),
            'diagnoses': diagnoses,
            'analysis_timestamp': datetime.datetime.now().isoformat()
        }
    
    def _cluster_errors(self, errors: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Simple clustering of errors based on content similarity.
        
        Args:
            errors: List of error entries
            
        Returns:
            Dictionary mapping cluster IDs to lists of errors
        """
        clusters = defaultdict(list)
        
        # Simple pattern-based clustering
        for error in errors:
            content = error['content'].lower()
            
            # Extract error type/message pattern
            error_type = self._extract_error_pattern(content)
            
            if error_type:
                clusters[error_type].append(error)
            else:
                # Default cluster for unclassified errors
                clusters['uncategorized'].append(error)
        
        return dict(clusters)
    