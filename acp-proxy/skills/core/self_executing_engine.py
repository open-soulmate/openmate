import json
import sqlite3
import datetime
import uuid
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class SelfExecutingEngine:
    """
    核心技能：自我执行引擎
    让Agent能主动规划并执行自我改进任务，强制其自主执行比例。
    解析反思记录，识别可自主执行的改进项，生成执行计划。
    """
    
    def __init__(self, memory_db_path: str = "memory.db"):
        self.memory_db_path = memory_db_path
        self.keyword_weights = {
            "自己写代码": 0.9,
            "修复bug": 0.85,
            "创建脚本": 0.8,
            "优化代码": 0.75,
            "重构": 0.7,
            "编写函数": 0.8,
            "添加测试": 0.75,
            "自动生成": 0.9,
            "编写插件": 0.8,
            "创建技能": 0.85,
            "修复错误": 0.85,
            "代码改进": 0.75,
            "实现功能": 0.8,
            "独立完成": 0.9,
            "无需协作": 0.85,
            "自动化": 0.8,
            "批处理": 0.75,
            "模板化": 0.7,
            "工具开发": 0.8
        }
        self.partner_keywords = [
            "需要帮助", "协作", "共同", "讨论", "沟通", "审批", 
            "外部依赖", "第三方", "团队", "人工审核", "需要反馈",
            "用户输入", "外部API", "网络请求", "部署到服务器"
        ]
    
    def generate_self_plan(self, reflection_json: List[Dict], 
                          current_skills_plugins: List[str],
                          cycle_id: Optional[int] = None) -> Dict[str, Any]:
        """
        生成自我执行计划
        
        Args:
            reflection_json: 反思记录JSON列表
            current_skills_plugins: 当前技能/插件目录列表
            cycle_id: 周期ID，如果为None则自动生成
            
        Returns:
            符合指定schema的自我执行计划
        """
        if cycle_id is None:
            cycle_id = int(datetime.datetime.now().timestamp())
        
        # 1. 解析反思记录，识别可自主执行的改进项
        executable_tasks = []
        
        for reflection in reflection_json:
            reflection_id = reflection.get("id", str(uuid.uuid4()))
            content = reflection.get("content", "")
            context = reflection.get("context", "")
            full_text = f"{content} {context}"
            
            # 2. 计算自主可行性得分
            score, is_executable = self._calculate_self_executability_score(full_text)
            
            if is_executable:
                # 3. 解析任务细节
                task_details = self._parse_task_details(full_text, current_skills_plugins)
                
                if task_details:
                    task = {
                        "task_id": f"task_{reflection_id}_{uuid.uuid4().hex[:8]}",
                        "description": task_details["description"],
                        "target_files": task_details["target_files"],
                        "verification_criteria": task_details["verification_criteria"],
                        "status": "pending",
                        "feasibility_score": score,
                        "source_reflection_id": reflection_id
                    }
                    executable_tasks.append(task)
        
        # 4. 按可行性得分排序
        executable_tasks.sort(key=lambda x: x["feasibility_score"], reverse=True)
        
        # 5. 限制任务数量，确保不超过合理范围
        max_tasks = min(len(executable_tasks), 10)
        final_tasks = executable_tasks[:max_tasks]
        
        # 6. 确保至少有1个任务，如果没有合适的任务则创建默认任务
        if not final_tasks:
            default_task = self._create_default_self_improvement_task()
            final_tasks.append(default_task)
        
        # 7. 构建计划
        plan = {
            "cycle_id": cycle_id,
            "tasks": final_tasks,
            "self_exec_ratio_target": 0.5,
            "generated_at": datetime.datetime.now().isoformat(),
            "total_tasks": len(final_tasks),
            "executive_tasks_count": len([t for t in final_tasks if t["feasibility_score"] >= 0.7])
        }
        
        # 8. 保存计划到文件
        self._save_plan_to_file(plan)
        
        # 9. 持久化到数据库
        self._save_plan_to_db(plan)
        
        logger.info(f"Generated self-execution plan with {len(final_tasks)} tasks, cycle_id: {cycle_id}")
        
        return plan
    
    def _calculate_self_executability_score(self, text: str) -> tuple[float, bool]:
        """
        计算改进项的自主可行性得分
        
        Args:
            text: 改进项文本
            
        Returns:
            (得分, 是否可执行)
        """
        text_lower = text.lower()
        
        # 检查是否包含需要协作的关键词
        for partner_keyword in self.partner_keywords:
            if partner_keyword in text_lower:
                return 0.0, False
        
        # 计算正向关键词得分
        score = 0.0
        matched_keywords = []
        
        for keyword, weight in self.keyword_weights.items():
            if keyword in text_lower:
                score += weight
                matched_keywords.append(keyword)
        
        # 归一化得分
        if score > 0:
            normalized_score = min(score / len(self.keyword_weights), 1.0)
        else:
            normalized_score = 0.0
        
        # 基于关键词数量的加成
        if len(matched_keywords) >= 3:
            normalized_score = min(normalized_score * 1.2, 1.0)
        
        # 判断是否可执行（阈值0.6）
        is_executable = normalized_score >= 0.6
        
        return normalized_score, is_executable
    
    def _parse_task_details(self, text: str, current_skills_plugins: List[str]) -> Optional[Dict[str, Any]]:
        """
        解析任务细节，提取描述、目标文件和验证标准
        
        Args:
            text: 改进项文本
            current_skills_plugins: 当前技能/插件列表
            
        Returns:
            任务细节字典，如果解析失败返回None
        """
        # 简单的规则提取（实际项目中可能需要更复杂的NLP）
        lines = text.split('\n')
        
        # 提取描述
        description = ""
        for line in lines[:3]:  # 取前三行作为描述
            if len(line.strip()) > 10:
                description = line.strip()
                break
        
        if not description:
            description = text[:100] + "..." if len(text) > 100 else text
        
        # 提取可能的目标文件
        target_files = []
        file_indicators = [".py", ".js", ".ts", ".json", ".yaml", ".yml", ".md", ".txt", ".cfg"]
        
        for skill_plugin in current_skills_plugins:
            if any(indicator in skill_plugin for indicator in file_indicators):
                target_files.append(skill_plugin)
        
        # 基于文本内容推断可能的文件
        if "技能" in text or "skill" in text.lower():
            target_files.extend(["skills/", "core/"])
        if "插件" in text or "plugin" in text.lower():
            target_files.extend(["plugins/", "extensions/"])
        if "配置" in text or "config" in text.lower():
            target_files.extend(["config/", "settings/"])
        
        # 去重
        target_files = list(set(target_files))
        
        # 生成验证标准
        verification_criteria = self._generate_verification_criteria(text)
        
        return {
            "description": description,
            "target_files": target_files,
            "verification_criteria": verification_criteria
        }
    