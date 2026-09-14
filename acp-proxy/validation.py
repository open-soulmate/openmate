import logging
from typing import Dict, Any, Optional

class ValidationManager:
    """
    Manages validation thresholds for solutions with adaptive adjustment for consecutive failures.
    """

    def __init__(self):
        # Base thresholds - relaxed from typical strict values
        self.base_thresholds: Dict[str, float] = {
            'accuracy': 0.85,
            'match_score': 0.80,
            'relevance': 0.75,
            'precision': 0.80,
            'recall': 0.80,
            'f1_score': 0.80,
            'score': 0.70,
            # Add other metrics as needed
        }

        # Adaptive adjustment parameters
        self.failure_count: int = 0
        self.max_failures_before_adjustment: int = 3
        self.adjustment_step: float = 0.05
        self.min_threshold: float = 0.60  # Absolute minimum to prevent low-quality solutions

        # Current active thresholds
        self.current_thresholds: Dict[str, float] = self.base_thresholds.copy()

    def adjust_thresholds(self) -> None:
        """
        Dynamically relax thresholds due to consecutive validation failures.
        Adjustment is bounded by the minimum threshold.
        """
        for key in self.current_thresholds:
            # Calculate new threshold with step reduction, but not below minimum
            new_value = max(self.current_thresholds[key] - self.adjustment_step, self.min_threshold)
            self.current_thresholds[key] = new_value

        logging.info(f"Thresholds adjusted after {self.failure_count} consecutive failures: {self.current_thresholds}")
        # Reset failure count after adjustment to allow cycle to repeat if needed
        self.failure_count = 0

    def validate(self, solution: Dict[str, Any]) -> bool:
        """
        Validate a solution against current thresholds.
        Implements adaptive threshold adjustment on consecutive failures.
        """
        # Check all metrics in solution that have thresholds
        metrics_passed = True
        failed_metrics = []

        for metric, value in solution.items():
            if metric in self.current_thresholds:
                if value < self.current_thresholds[metric]:
                    metrics_passed = False
                    failed_metrics.append(metric)

        if metrics_passed:
            # Solution passed - reset failure count
            self.failure_count = 0
            return True
        else:
            # Solution failed
            self.failure_count += 1
            logging.debug(f"Validation failed on metrics: {failed_metrics}. Failure count: {self.failure_count}")

            # Check if adjustment should be triggered
            if self.failure_count >= self.max_failures_before_adjustment:
                self.adjust_thresholds()

            return False

    def get_current_thresholds(self) -> Dict[str, float]:
        """Return current threshold values for inspection."""
        return self.current_thresholds.copy()

    def reset_thresholds(self) -> None:
        """Reset thresholds to base values and clear failure count."""
        self.current_thresholds = self.base_thresholds.copy()
        self.failure_count = 0