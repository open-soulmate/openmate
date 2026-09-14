import json
import logging
from datetime import datetime
from pathlib import Path

class ValidationLogger:
    def __init__(self, log_dir: str = "validation_logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / "validation_failures.log.jsonl"
        
    def log_failure(self, candidate_id: str, metric_name: str, 
                   actual_value: float, threshold: float, 
                   gap: float, context: dict = None):
        """记录验证失败的结构化日志"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "candidate_id": candidate_id,
            "metric": metric_name,
            "actual_value": actual_value,
            "threshold": threshold,
            "gap": gap,
            "gap_percentage": (abs(gap) / threshold * 100) if threshold != 0 else 0,
            "context": context or {}
        }
        
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            # 静默处理日志写入失败，不影响核心验证性能
            logging.getLogger(__name__).warning(f"Failed to write validation log: {e}")

# 全局验证日志实例
validation_logger = ValidationLogger()

def validate_candidate(candidate: dict, validation_standards: dict) -> dict:
    """
    验证改进候选方案是否满足标准
    
    Args:
        candidate: 候选方案数据
        validation_standards: 验证标准
    
    Returns:
        验证结果字典，包含是否通过、失败原因等信息
    """
    results = {
        "passed": True,
        "failures": [],
        "candidate_id": candidate.get("id", "unknown"),
        "validation_timestamp": datetime.utcnow().isoformat()
    }
    
    # 获取方案标识
    candidate_id = candidate.get("id", "unknown")
    
    # 遍历所有验证指标
    for metric_name, standard in validation_standards.items():
        if metric_name not in candidate:
            # 指标缺失也算验证失败
            failure_info = {
                "metric": metric_name,
                "reason": "missing",
                "expected": "present",
                "actual": "missing"
            }
            results["failures"].append(failure_info)
            results["passed"] = False
            
            # 记录详细的诊断日志
            validation_logger.log_failure(
                candidate_id=candidate_id,
                metric_name=metric_name,
                actual_value=0,
                threshold=standard.get("threshold", 0),
                gap=-standard.get("threshold", 0),
                context={
                    "validation_type": "metric_missing",
                    "standard_config": standard,
                    "candidate_metrics": list(candidate.keys())
                }
            )
            continue
        
        actual_value = candidate[metric_name]
        threshold = standard.get("threshold", 0)
        comparison_type = standard.get("comparison", "gte")  # gte, lte, eq
        
        # 根据比较类型验证
        if comparison_type == "gte":
            passed = actual_value >= threshold
        elif comparison_type == "lte":
            passed = actual_value <= threshold
        elif comparison_type == "eq":
            passed = abs(actual_value - threshold) < 1e-6
        else:
            passed = actual_value >= threshold  # 默认大于等于
        
        if not passed:
            # 计算差距
            if comparison_type == "gte":
                gap = actual_value - threshold
            elif comparison_type == "lte":
                gap = threshold - actual_value
            else:
                gap = actual_value - threshold
            
            failure_info = {
                "metric": metric_name,
                "reason": "threshold_not_met",
                "expected": f"{comparison_type} {threshold}",
                "actual": actual_value,
                "gap": gap,
                "gap_percentage": (abs(gap) / threshold * 100) if threshold != 0 else 0
            }
            results["failures"].append(failure_info)
            results["passed"] = False
            
            # 记录详细的诊断日志
            validation_logger.log_failure(
                candidate_id=candidate_id,
                metric_name=metric_name,
                actual_value=actual_value,
                threshold=threshold,
                gap=gap,
                context={
                    "validation_type": "threshold_not_met",
                    "comparison": comparison_type,
                    "standard_config": standard,
                    "candidate_data": {k: v for k, v in candidate.items() 
                                      if isinstance(v, (int, float, str, bool))}
                }
            )
    
    return results