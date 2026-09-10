import json
import os
import time
from datetime import datetime
from typing import Dict, List, Any, Optional

class SelfIntrospectProgressReporter:
    """自省进度报告器技能"""
    
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.plan_file = os.path.join(self.base_dir, "plans/current_evolution_plan.json")
        self.log_file = os.path.join(self.base_dir, "logs/execution_log.jsonl")
        self.report_file = os.path.join(self.base_dir, "reports/evolution_progress.json")
        self.memory_file = os.path.join(self.base_dir, "memory/long_term_memory.json")
        
        # 确保目录存在
        os.makedirs(os.path.dirname(self.plan_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.log_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.report_file), exist_ok=True)
        os.makedirs(os.path.dirname(self.memory_file), exist_ok=True)
    
    def run(self, params: Optional[Dict] = None) -> Dict[str, Any]:
        """执行自省进度报告生成"""
        try:
            # 读取上次报告时间戳
            last_report_timestamp = self._get_last_report_timestamp()
            
            # 读取进化计划
            plan_data = self._read_plan_file()
            if not plan_data:
                return {"status": "error", "message": "无法读取进化计划文件"}
            
            # 读取执行日志
            execution_logs = self._read_execution_logs()
            
            # 解析计划项
            planned_items = self._parse_planned_items(plan_data)
            
            # 匹配已执行项
            executed_items, pending_items = self._match_executed_items(
                planned_items, execution_logs, last_report_timestamp
            )
            
            # 生成下一步建议
            next_action = self._generate_next_action(executed_items, pending_items)
            
            # 生成报告
            report = self._generate_report(
                plan_data, executed_items, pending_items, next_action, last_report_timestamp
            )
            
            # 保存报告
            self._save_report(report)
            
            # 更新长期记忆
            self._update_long_term_memory(report)
            
            return {
                "status": "success",
                "report": report,
                "message": "自省进度报告生成完成"
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"自省进度报告生成失败: {str(e)}"
            }
    
    def _get_last_report_timestamp(self) -> Optional[str]:
        """获取上次报告时间戳"""
        if os.path.exists(self.report_file):
            try:
                with open(self.report_file, 'r', encoding='utf-8') as f:
                    report_data = json.load(f)
                    return report_data.get("last_report_timestamp")
            except:
                pass
        return None
    
    def _read_plan_file(self) -> Optional[Dict]:
        """读取进化计划文件"""
        if not os.path.exists(self.plan_file):
            return None
        
        try:
            with open(self.plan_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return None
    
    def _read_execution_logs(self) -> List[Dict]:
        """读取执行日志文件"""
        if not os.path.exists(self.log_file):
            return []
        
        logs = []
        try:
            with open(self.log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            logs.append(json.loads(line))
                        except:
                            continue
        except:
            pass
        
        return logs
    
    def _parse_planned_items(self, plan_data: Dict) -> List[Dict]:
        """解析计划项"""
        items = plan_data.get("items", [])
        parsed_items = []
        
        for item in items:
            parsed_item = {
                "id": item.get("id"),
                "type": item.get("type"),
                "target": item.get("target"),
                "description": item.get("description"),
                "expected_outcome": item.get("expected_outcome"),
                "status": item.get("status", "planned")
            }
            parsed_items.append(parsed_item)
        
        return parsed_items
    
    def _match_executed_items(
        self, 
        planned_items: List[Dict], 
        execution_logs: List[Dict], 
        last_report_timestamp: Optional[str]
    ) -> tuple:
        """匹配已执行项和未执行项"""
        executed_items = []
        pending_items = []
        
        # 将日志按相关计划项ID索引
        logs_by_plan_id = {}
        for log in execution_logs:
            plan_item_id = log.get("related_plan_item_id")
            if plan_item_id:
                if plan_item_id not in logs_by_plan_id:
                    logs_by_plan_id[plan_item_id] = []
                logs_by_plan_id[plan_item_id].append(log)
        
        # 遍历计划项进行匹配
        for planned_item in planned_items:
            item_id = planned_item["id"]
            
            # 检查是否有对应的执行记录
            if item_id in logs_by_plan_id:
                # 过滤在时间窗口内且由agent发起的执行记录
                matching_logs = []