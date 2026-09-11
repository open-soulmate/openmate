# acp-proxy/skills/self_introspect_progress_reporter.py

import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

class SkillExecutionError(Exception):
    """技能执行异常"""
    pass

def run_skill(params: Optional[Dict] = None) -> Dict[str, Any]:
    """
    自省进度报告技能主函数
    Args:
        params: 技能参数（当前未使用）
    Returns:
        包含报告状态的字典
    """
    try:
        # 初始化默认参数
        if params is None:
            params = {}
        
        # 获取当前时间戳（UTC ISO8601格式）
        current_timestamp = datetime.now(timezone.utc).isoformat()
        
        # 定义文件路径
        plan_path = "plans/current_evolution_plan.json"
        log_path = "logs/execution_log.jsonl"
        report_path = "reports/evolution_progress.json"
        memory_path = "memory/long_term_memory.json"
        
        # 1. 读取进化计划
        plan_data = _read_plan(plan_path)
        if not plan_data:
            raise SkillExecutionError(f"无法读取计划文件: {plan_path}")
        
        # 2. 读取执行日志
        execution_logs = _read_execution_log(log_path)
        
        # 3. 读取上次报告时间戳（如果存在）
        last_report_timestamp = _get_last_report_timestamp(report_path)
        
        # 4. 分析计划项
        planned_items = plan_data.get("items", [])
        
        # 5. 关联执行记录（仅限agent发起的记录）
        executed_items, pending_items = _match_executions_to_plans(
            planned_items, 
            execution_logs, 
            last_report_timestamp
        )
        
        # 6. 生成下一个动作建议
        next_action = _generate_next_action(executed_items, pending_items)
        
        # 7. 构建报告
        cycle_count = _get_cycle_count(report_path)
        summary = _generate_summary(planned_items, executed_items, pending_items)
        
        report = {
            "report_timestamp": current_timestamp,
            "cycle_count": cycle_count,
            "summary": summary,
            "planned_improvements": planned_items,
            "executed_improvements": executed_items,
            "pending_improvements": pending_items,
            "next_action": next_action
        }
        
        # 8. 保存报告
        _save_report(report_path, report)
        
        # 9. 更新长期记忆
        _update_long_term_memory(memory_path, report)
        
        return {
            "status": "success",
            "report_timestamp": current_timestamp,
            "cycle_count": cycle_count,
            "next_action": next_action
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

def _read_plan(plan_path: str) -> Optional[Dict]:
    """读取进化计划文件"""
    try:
        if not os.path.exists(plan_path):
            # 创建示例计划（如果不存在）
            sample_plan = {
                "plan_id": "example_plan_001",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "items": [
                    {
                        "id": "item_001",
                        "type": "optimization",
                        "target": "response_latency",
                        "description": "优化响应延迟",
                        "expected_outcome": "减少50%的响应时间",
                        "status": "planned"
                    }
                ]
            }
            os.makedirs(os.path.dirname(plan_path), exist_ok=True)
            with open(plan_path, 'w', encoding='utf-8') as f:
                json.dump(sample_plan, f, indent=2, ensure_ascii=False)
            return sample_plan
        
        with open(plan_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        raise SkillExecutionError(f"读取计划文件失败: {e}")

def _read_execution_log(log_path: str) -> List[Dict]:
    """读取执行日志（JSONL格式）"""
    try:
        if not os.path.exists(log_path):
            return []
        
        logs = []
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        log_entry = json.loads(line)
                        # 确保所有必需字段都存在
                        required_fields = ['timestamp', 'actor', 'action_type', 'target', 'outcome']
                        if all(field in log_entry for field in required_fields):
                            logs.append(log_entry)
                    except json.JSONDecodeError:
                        # 跳过无效的JSON行
                        continue
        return logs
    except Exception as e:
        raise SkillExecutionError(f"读取执行日志失败: {e}")

def _get_last_report_timestamp(report_path: str) -> str:
    """获取上次报告的时间戳"""
    try:
        if not os.path.exists(report_path):
            # 返回一个很早的时间戳（Unix epoch开始）
            return "1970-01-01T00:00:00+00:00"
        
        with open(report_path, 'r', encoding='utf-8') as f:
            report = json.load(f)
            return report.get("report_timestamp", "1970-01-01T00:00:00+00:00")
    except Exception as e:
        # 如果读取失败，返回默认时间戳
        return "1970-01-01T00:00:00+00:00"

def _match_executions_to_plans(
    planned_items: List[Dict], 
    execution_logs: List[Dict], 
    last_report_timestamp: str
) -> tuple:
    """将执行记录与计划项匹配，区分已执行和未执行项"""
    executed_items = []
    pending_items = []
    