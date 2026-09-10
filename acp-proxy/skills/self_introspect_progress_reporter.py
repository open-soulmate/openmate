import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional, Set

def run_skill(params: Dict[str, Any] = None) -> Dict[str, Any]:
    """执行自省进度报告技能"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    plan_path = os.path.join(base_dir, "plans", "current_evolution_plan.json")
    log_path = os.path.join(base_dir, "logs", "execution_log.jsonl")
    report_path = os.path.join(base_dir, "reports", "evolution_progress.json")
    memory_path = os.path.join(base_dir, "memory", "long_term_memory.json")
    
    try:
        plan_data = _load_json(plan_path)
        execution_logs = _load_jsonl(log_path)
        
        cycle_count = _get_cycle_count(memory_path)
        last_report_timestamp = _get_last_report_timestamp(memory_path)
        
        planned_improvements = plan_data.get("items", [])
        
        executed_improvements = []
        pending_improvements = []
        
        for item in planned_improvements:
            item_id = item.get("id")
            matching_logs = _find_matching_logs(
                execution_logs, 
                item_id, 
                "agent", 
                last_report_timestamp
            )
            
            if matching_logs:
                executed_improvement = {
                    "plan_item": item,
                    "execution_logs": matching_logs,
                    "status": _get_aggregate_status(matching_logs),
                    "output_summary": _get_output_summary(matching_logs)
                }
                executed_improvements.append(executed_improvement)
            else:
                pending_improvements.append(item)
        
        next_action = _generate_next_action(
            executed_improvements, 
            pending_improvements, 
            plan_data.get("timestamp")
        )
        
        current_timestamp = datetime.now().isoformat()
        report = {
            "report_timestamp": current_timestamp,
            "cycle_count": cycle_count + 1,
            "summary": _generate_summary(executed_improvements, pending_improvements),
            "planned_improvements": planned_improvements,
            "executed_improvements": executed_improvements,
            "pending_improvements": pending_improvements,
            "next_action": next_action
        }
        
        _save_report(report_path, report)
        _update_memory(memory_path, report, cycle_count + 1)
        
        return {
            "success": True,
            "report": report,
            "message": f"Progress report generated successfully. Cycle: {cycle_count + 1}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to generate progress report: {e}"
        }

def _load_json(file_path: str) -> Dict[str, Any]:
    """加载JSON文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}

def _load_jsonl(file_path: str) -> List[Dict[str, Any]]:
    """加载JSONL文件"""
    logs = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        logs.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except FileNotFoundError:
        pass
    return logs

def _get_cycle_count(memory_path: str) -> int:
    """获取当前周期数"""
    memory = _load_json(memory_path)
    progress_reports = memory.get("evolution_progress", [])
    return len(progress_reports)

def _get_last_report_timestamp(memory_path: str) -> Optional[str]:
    """获取上次报告时间戳"""
    memory = _load_json(memory_path)
    progress_reports = memory.get("evolution_progress", [])
    if progress_reports:
        return progress_reports[-1].get("report_timestamp")
    return None

def _find_matching_logs(
    logs: List[Dict[str, Any]], 
    item_id: str, 
    actor: str, 
    since_timestamp: Optional[str]
) -> List[Dict[str, Any]]:
    """查找匹配的执行日志"""
    matching_logs = []
    
    for log in logs:
        if log.get("related_plan_item_id") != item_id:
            continue
            
        if log.get("actor") != actor:
            continue
            
        if since_timestamp:
            log_time = log.get("timestamp", "")
            if log_time <= since_timestamp:
                continue
                
        matching_logs.append(log)
    
    return matching_logs

def _get_aggregate_status(logs: List[Dict[str, Any]]) -> str:
    """计算聚合执行状态"""
    if not logs:
        return "unknown"
        
    outcomes = set(log.get("outcome") for log in logs if log.get("outcome"))
    
    if "fail" in outcomes:
        return "failed"
    elif "success" in outcomes:
        return "completed"
    elif "partial" in outcomes:
        return "partially_completed"
    else:
        return "unknown"

def _get_output_summary(logs: List[Dict[str, Any]]) -> str:
    """获取执行输出摘要"""
    summaries = []
    for log in logs[-3:]:
        summary = log.get("output_summary")
        if summary:
            summaries.append(summary)
    
    return " | ".join(summaries) if summaries else "No output summary available"

def _generate_summary(
    executed: List[Dict[str, Any]], 
    pending: List[Dict[str, Any]]
) -> str:
    """生成执行摘要"""
    total_executed = len(executed)
    total_pending = len(pending)
    successful = sum(1 for ex in executed if ex.get("status") == "completed")
    
    return (
        f"Executed: {total_executed} items ({successful} successful), "
        f"Pending: {total_pending} items, "
        f"Success rate: {successful}/{total_executed} executed"
    )

def _generate_next_action(
    executed: List[Dict[str, Any]], 
    pending: List[Dict[str, Any]], 
    plan_timestamp: Optional[str]
) -> str:
    """生成下一个建议行动"""
    if pending:
        next_pending = pending[0]
        return f"Execute pending item: [{next_pending.get('id')}] - {next_pending.get('description')}"
    
    failed_items = [ex for ex in executed if ex.get("status") == "failed"]
    if failed_items:
        failed_item = failed_items[0]
        plan_item = failed_item.get("plan_item", {})
        return f"Retry failed item: [{plan_item.get('id')}] - {plan_item.get('description')}"
    
    if executed:
        successful_items = [ex for ex in executed if ex.get("status") == "completed"]
        if successful_items:
            last_executed = successful_items[-1]
            return (
                f"Review and document implementation of: "
                f"[{last_executed.get('plan_item', {}).get('id')}]"
            )
    
    return "Create new evolution plan or review current execution logs for optimization opportunities"

def _save_report(file_path: str, report: Dict[str, Any]) -> None:
    """保存进度报告"""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

def _update_memory(
    file_path: str, 
    report: Dict[str, Any], 
    cycle_count: int
) -> None:
    """更新长期记忆"""
    memory = _load_json(file_path)
    
    if "evolution_progress" not in memory:
        memory["evolution_progress"] = []
    
    memory_summary = {
        "cycle_count": cycle_count,
        "report_timestamp": report["report_timestamp"],
        "summary": report["summary"],
        "next_action": report["next_action"],
        "executed_count": len(report["executed_improvements"]),
        "pending_count": len(report["pending_improvements"])
    }
    
    memory["evolution_progress"].append(memory_summary)
    
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
