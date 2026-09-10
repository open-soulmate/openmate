import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

class SelfIntrospectProgressReporter:
    """技能：定期对比计划改进项与实际执行结果，生成进度报告。"""

    def __init__(self):
        self.plan_file = "plans/current_evolution_plan.json"
        self.log_file = "logs/execution_log.jsonl"
        self.report_output = "reports/evolution_progress.json"
        self.memory_output = "memory/long_term_memory.json"

    def _read_json_file(self, filepath: str) -> Any:
        """读取JSON文件。"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return None
        except json.JSONDecodeError:
            return None

    def _read_jsonl_file(self, filepath: str) -> List[Dict[str, Any]]:
        """读取JSONL文件。"""
        entries = []
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
        except FileNotFoundError:
            pass
        return entries

    def _get_last_report_timestamp(self) -> Optional[str]:
        """从现有报告或长期记忆中获取上次报告时间戳。"""
        report_data = self._read_json_file(self.report_output)
        if report_data and "report_timestamp" in report_data:
            return report_data["report_timestamp"]
        memory_data = self._read_json_file(self.memory_output)
        if memory_data and "evolution_progress" in memory_data:
            entries = memory_data["evolution_progress"]
            if entries:
                return entries[-1].get("report_timestamp")
        return None

    def _is_agent_execution(self, log_entry: Dict[str, Any], item_id: str,
                            start_time: Optional[datetime]) -> bool:
        """判断日志条目是否为agent针对特定计划项的执行记录。"""
        if log_entry.get("actor") != "agent":
            return False
        if log_entry.get("related_plan_item_id") != item_id:
            return False
        if start_time:
            try:
                log_time = datetime.fromisoformat(log_entry["timestamp"])
                if log_time < start_time:
                    return False
            except (ValueError, KeyError):
                return False
        return True

    def _generate_next_action(self, pending_items: List[Dict],
                              executed_items: List[Dict]) -> str:
        """生成下一个可自主执行的改进点。"""
        if pending_items:
            item = pending_items[0]
            return f"Fix the pending item: {item.get('id')} - {item.get('description', 'No description')}"
        if executed_items:
            last_executed = executed_items[-1]
            if last_executed.get("outcome") == "fail":
                return f"Retry failed improvement: {last_executed.get('related_plan_item_id')}"
            return "Analyze execution outputs for further optimization opportunities."
        return "Create a new minor optimization based on recent observations."

    def run(self, params: Dict = None) -> Dict[str, Any]:
        """主执行方法。"""
        # 1. 读取输入数据
        plan_data = self._read_json_file(self.plan_file)
        if not plan_data:
            return {"error": f"Plan file not found: {self.plan_file}"}
        
        execution_logs = self._read_jsonl_file(self.log_file)

        # 2. 确定时间窗口
        last_timestamp_str = self._get_last_report_timestamp()
        start_time = None
        if last_timestamp_str:
            try:
                start_time = datetime.fromisoformat(last_timestamp_str)
            except ValueError:
                pass

        # 3. 获取并增加周期计数
        cycle_count = 1
        existing_report = self._read_json_file(self.report_output)
        if existing_report and "cycle_count" in existing_report:
            cycle_count = existing_report["cycle_count"] + 1

        # 4. 处理计划项
        planned_improvements = []
        executed_improvements = []
        pending_improvements = []

        for plan_item in plan_data.get("items", []):
            item_id = plan_item.get("id")
            planned_improvements.append(plan_item.copy())
            
            # 查找对应的执行记录
            related_execution = None
            for log_entry in execution_logs:
                if self._is_agent_execution(log_entry, item_id, start_time):
                    related_execution = log_entry
                    break  # 取时间窗口内最近的一条

            if related_execution:
                executed_improvements.append({
                    "plan_item_id": item_id,
                    "type": plan_item.get("type"),
                    "target": plan_item.get("target"),
                    "status": related_execution.get("outcome"),
                    "execution_timestamp": related_execution.get("timestamp"),
                    "output_summary": related_execution.get("output_summary", "")
                })
            else:
                # 没有匹配的agent执行记录
                pending_improvements.append(plan_item.copy())

        # 5. 生成报告内容
        report_timestamp = datetime.now().isoformat()
        next_action = self._generate_next_action(pending_improvements, executed_improvements)
        
        summary = f"Cycle {cycle_count}: {len(executed_improvements)} improvements executed, {len(pending_improvements)} pending."

        progress_report = {
            "report_timestamp": report_timestamp,
            "cycle_count": cycle_count,
            "summary": summary,
            "planned_improvements": planned_improvements,
            "executed_improvements": executed_improvements,
            "pending_improvements": pending_improvements,
            "next_action": next_action
        }

        # 6. 写入输出文件
        # 写入进度报告
        os.makedirs(os.path.dirname(self.report_output), exist_ok=True)
        with open(self.report_output, 'w', encoding='utf-8') as f:
            json.dump(progress_report, f, indent=2, ensure_ascii=False)

        # 更新长期记忆
        memory_data = self._read_json_file(self.memory_output) or {}
        if "evolution_progress" not in memory_data:
            memory_data["evolution_progress"] = []
        
        memory_summary = {
            "report_timestamp": report_timestamp,
            "cycle_count": cycle_count,
            "summary": summary,
            "next_action": next_action
        }
        memory_data["evolution_progress"].append(memory_summary)
        
        os.makedirs(os.path.dirname(self.memory_output), exist_ok=True)
        with open(self.memory_output, 'w', encoding='utf-8') as f:
            json.dump(memory_data, f, indent=2, ensure_ascii=False)

        return {
            "status": "success",
            "report_timestamp": report_timestamp,
            "cycle_count": cycle_count,
            "executed_count": len(executed_improvements),
            "pending_count": len(pending_improvements),
            "next_action": next_action
        }

def run_skill(params: Dict = None) -> Dict[str, Any]:
    """技能入口点，供skill_runner_plugin调用。"""
    reporter = SelfIntrospectProgressReporter()
    return reporter.run(params)