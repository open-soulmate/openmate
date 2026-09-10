import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import hashlib

class SelfIntrospectProgressReporter:
    """定期自省进度报告技能，建立规划-执行-反馈闭环"""
    
    def __init__(self, workspace_root: str = "."):
        self.workspace_root = Path(workspace_root)
        
        # 文件路径定义
        self.plan_path = self.workspace_root / "plans" / "current_evolution_plan.json"
        self.execution_log_path = self.workspace_root / "logs" / "execution_log.jsonl"
        self.report_path = self.workspace_root / "reports" / "evolution_progress.json"
        self.memory_path = self.workspace_root / "memory" / "long_term_memory.json"
        
        # 确保目录存在
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        self.memory_path.parent.mkdir(parents=True, exist_ok=True)
        
    def run(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """主执行函数，生成进度报告"""
        try:
            # 1. 读取进化计划
            plan_data = self._load_evolution_plan()
            if not plan_data:
                return self._create_error_response("无法读取进化计划文件")
            
            # 2. 读取执行日志
            execution_logs = self._load_execution_logs()
            
            # 3. 获取上次报告时间戳和周期计数
            last_report_timestamp, cycle_count = self._get_report_metadata()
            
            # 4. 计算时间窗口（自上次报告以来的执行记录）
            recent_logs = self._filter_logs_by_time(execution_logs, last_report_timestamp)
            
            # 5. 解析计划项
            planned_improvements = self._parse_plan_items(plan_data)
            
            # 6. 匹配执行记录与计划项
            executed_improvements, pending_improvements = self._match_logs_to_plan_items(
                planned_improvements, recent_logs
            )
            
            # 7. 生成下一个行动建议
            next_action = self._generate_next_action(executed_improvements, pending_improvements)
            
            # 8. 创建进度报告
            report_timestamp = datetime.now(timezone.utc).isoformat()
            report = self._create_report(
                report_timestamp, cycle_count, planned_improvements,
                executed_improvements, pending_improvements, next_action
            )
            
            # 9. 写入报告文件
            self._write_report_to_file(report)
            
            # 10. 更新长期记忆
            self._update_long_term_memory(report)
            
            return {
                "status": "success",
                "report_timestamp": report_timestamp,
                "cycle_count": cycle_count,
                "executed_count": len(executed_improvements),
                "pending_count": len(pending_improvements),
                "next_action": next_action
            }
            
        except Exception as e:
            return self._create_error_response(f"技能执行错误: {str(e)}")
    
    def _load_evolution_plan(self) -> Optional[Dict[str, Any]]:
        """加载进化计划文件"""
        try:
            if not self.plan_path.exists():
                # 创建默认计划文件
                default_plan = {
                    "plan_id": "default_plan",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "items": []
                }
                self.plan_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self.plan_path, 'w', encoding='utf-8') as f:
                    json.dump(default_plan, f, indent=2, ensure_ascii=False)
                return default_plan
            
            with open(self.plan_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载进化计划失败: {e}")
            return None
    
    def _load_execution_logs(self) -> List[Dict[str, Any]]:
        """加载执行日志"""
        logs = []
        if not self.execution_log_path.exists():
            # 创建空日志文件
            self.execution_log_path.parent.mkdir(parents=True, exist_ok=True)
            self.execution_log_path.touch()
            return logs
        
        try:
            with open(self.execution_log_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if line:
                        try:
                            log_entry = json.loads(line)
                            # 验证必要字段
                            required_fields = ["timestamp", "actor", "action_type", "target", "description", "outcome"]
                            if all(field in log_entry for field in required_fields):
                                logs.append(log_entry)
                        except json.JSONDecodeError as e:
                            print(f"警告: 第{line_num}行JSON解析失败: {e}")
        except Exception as e:
            print(f"读取执行日志失败: {e}")
        
        return logs
    
    def _get_report_metadata(self) -> tuple:
        """获取上次报告时间戳和周期计数"""