import os
import json
import logging
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Any, Optional
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SelfAnalysisAndSuggestionSkill:
    """
    Core analysis skill for automatically scanning and analyzing improvement_records logs.
    Addresses issues of over-reliance on external execution and lack of failure analysis templates.
    """
    
    def __init__(self, records_path: Optional[str] = None):
        """
        Initialize the skill.
        
        Args:
            records_path: Path to improvement_records directory.
                         Defaults to ~/.acp/improvement_records
        """
        self.records_path = Path(records_path) if records_path else Path.home() / ".acp" / "improvement_records"
        
    def execute(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main execution method for the skill.
        
        Args:
            context: Context dictionary that may contain override parameters.
            
        Returns:
            Analysis report and suggestions in structured JSON format.
        """
        context = context or {}
        
        # Allow path override through context
        if "records_path" in context:
            self.records_path = Path(context["records_path"])
            
        # Check if path exists
        if not self.records_path.exists():
            logger.warning(f"Records path does not exist: {self.records_path}")
            return self._empty_analysis_report()
            
        try:
            # Load and parse all JSON log files
            records = self._load_all_records()
            
            if not records:
                logger.info("No improvement records found.")
                return self._empty_analysis_report()
                
            # Analyze patterns
            failure_categories = self._analyze_failures(records)
            success_patterns = self._analyze_successes(records)
            
            # Generate suggestions
            suggestions = self._generate_suggestions(failure_categories, success_patterns)
            
            # Create analysis report
            report = {
                "analysis_report": {
                    "period": f"Analysis at {datetime.now().isoformat()}",
                    "total_records_analyzed": len(records),
                    "failure_categories": failure_categories,
                    "success_patterns": success_patterns
                },
                "suggestions": suggestions
            }
            
            logger.info(f"Analysis complete. Found {len(failure_categories)} failure categories and {len(success_patterns)} success patterns.")
            return report
            
        except Exception as e:
            logger.error(f"Error during analysis: {e}")
            return self._empty_analysis_report()
    