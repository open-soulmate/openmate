"""
Skill: self_introspect_progress_reporter
Description: 定期对比‘计划改进项’与‘实际执行结果’，生成进度报告，
            强制建立‘规划-执行-反馈’的闭环。
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.resolve()

# 文件路径配置
PLAN_FILE = PROJECT_ROOT / "plans" / "current_evolution_plan.json"
EXECUTION_LOG = PROJECT_ROOT / "logs" / "execution_log.jsonl"
PROGRESS_REPORT = PROJECT_ROOT / "reports" / "evolution_progress.json"
LONG_TERM_MEMORY = PROJECT_ROOT / "memory" / "long_term_memory.json"


def _read_json_file(filepath: Path) -> Optional[Dict[str, Any]]:
    """读取 JSON 文件并返回解析后的字典，文件不存在则返回 None"""
    if not filepath.exists():
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[self_introspect_progress_reporter] Error reading {filepath}: {e}")
        return None


def _write_json_file(filepath: Path, data: Dict[str, Any]) -> bool:
    """将字典写入 JSON 文件，自动创建目录"""
    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except IOError as e:
        print(f"[self_introspect_progress_reporter] Error writing {filepath}: {e}")
        return False


def _read_jsonl_file(filepath: Path, since_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    读取 JSONL 文件，返回每行解析后的字典列表。
    如果提供了 since_timestamp，只返回时间戳晚于该值的记录。
    """
    if not filepath.exists():
        return []
    
    records = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    # 时间戳过滤
                    if since_timestamp and record.get("timestamp", "") <= since_timestamp:
                        continue
                    records.append(record)
                except json.JSONDecodeError:
                    print(f"[self_introspect_progress_reporter] Skipping invalid JSON at line {line_num}")
    except IOError as e:
        print(f"[self_introspect_progress_reporter] Error reading {filepath}: {e}")
    
    return records


def _get_last_report_timestamp() -> Optional[str]:
    """从长期记忆中获取上次报告的时间戳"""
    memory = _read_json_file(LONG_TERM_MEMORY)
    if not memory:
        return None
    
    evolution_progress = memory.get("evolution_progress", [])
    if not evolution_progress:
        return None
    
    # 获取最近一次报告的时间戳
    last_report = evolution_progress[-1]
    return last_report.get("report_timestamp")


def _get_cycle_count() -> int:
    """从长期记忆中获取当前进化周期数"""
    memory = _read_json_file(LONG_TERM_MEMORY)
    if not memory:
        return 0
    
    evolution_progress = memory.get("evolution_progress", [])
    return len(evolution_progress)


def _match_executions_to_plan(
    plan_items: List[Dict[str, Any]],
    execution_records: List[Dict[str, Any]]
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    将执行记录与计划项进行匹配。
    只考虑 actor 为 'agent' 的执行记录。
    
    返回: (已执行项列表, 未执行项列表)
    """
    # 过滤出 agent 执行的记录，并按 related_plan_item_id 索引
    agent_executions: Dict[str, List[Dict[str, Any]]] = {}
    for record in execution_records:
        if record.get("actor") != "agent":
            continue
        plan_item_id = record.get("related_plan_item_id")
        if plan_item_id:
            if plan_item_id not in agent_executions:
                agent_executions[plan_item_id] = []
            agent_executions[plan_item_id].append(record)
    
    executed_improvements = []
    pending_improvements = []
    
    for item in plan_items:
        item_id = item.get("id")
        plan_item_summary = {
            "id": item_id,
            "type": item.get("type", "unknown"),
            "target": item.get("target", ""),
            "description": item.get("description", ""),
            "expected_outcome": item.get("expected_outcome", ""),
            "status": item.get("status", "planned")
        }
        
        if item_id in agent_executions and agent_executions[item_id]:
            # 有对应的执行记录，取最新的
            latest_execution = agent_executions[item_id][-1]
            plan_item_summary["execution_status"] = latest_execution.get("outcome", "unknown")
            plan_item_summary["output_summary"] = latest_execution.get("output_summary", "")
            plan_item_summary["execution_timestamp"] = latest_execution.get("timestamp", "")
            executed_improvements.append(plan_item_summary)
        else:
            # 没有对应的执行记录，标记为待处理
            pending_improvements.append(plan_item_summary)
    
    return executed_improvements, pending_improvements


def _generate_next_action(
    executed_improvements: List[Dict[str, Any]],
    pending_improvements: List[Dict[str, Any]],
    plan_items: List[Dict[str, Any]]
) -> str:
    """
    基于当前进度生成下一个微小、可自主执行的改进点建议。
    逻辑保守且具体。
    """
    # 优先处理失败的执行项
    failed_items = [item for item in executed_improvements if item.get("execution_status") == "fail"]
    if failed_items:
        item = failed_items[0]
        return f"Fix the failed item: [{item['id']}] - {item.get('description', 'No description')}"
    
    # 其次处理待处理的计划项
    if pending_improvements:
        item = pending_improvements[0]
        item_type = item.get("type", "unknown")
        item_id = item.get("id", "unknown")
        description = item.get("description", "No description")
        
        if item_type == "bugfix":
            return f"Fix the pending bugfix item: [{item_id}] - {description}"
        elif item_type == "optimization":
            return f"Implement the pending optimization: [{item_id}] - {description}"
        elif item_type == "new_feature":
            return f"Start implementing the pending feature: [{item_id}] - {description}"
        else:
            return f"Work on the pending item: [{item_id}] - {description}"
    
    # 处理部分成功的项
    partial_items = [item for item in executed_improvements if item.get("execution_status") == "partial"]
    if partial_items:
        item = partial_items[0]
        return f"Complete the partially done item: [{item['id']}] - {item.get('description', 'No description')}"
    
    # 所有项都完成了，建议审查或优化日志格式
    if not pending_improvements and not failed_items:
        return "Review the evolution plan and update it with new improvement targets for the next cycle."
    
    return "Continue monitoring execution logs for new improvement opportunities."


def run(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    技能主入口函数。
    
    Args:
        params: 可选参数字典（当前未使用，保留接口兼容性）
    
    Returns:
        包含执行结果的字典，包括生成的报告内容
    """
    print("[self_introspect_progress_reporter] Starting introspection progress report generation...")
    
    # 1. 读取进化计划
    plan_data = _read_json_file(PLAN_FILE)