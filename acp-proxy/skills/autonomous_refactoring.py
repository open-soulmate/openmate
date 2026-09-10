"""
自主重构器技能
定期分析代码库状态，生成并实施安全的代码改进任务
"""
import json
import os
import re
import time
from typing import Dict, List, Any, Optional, Tuple
import sys

# 添加父目录到系统路径，以便导入其他模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class AutonomousRefactoring:
    """自主重构器，具备自编程能力"""
    
    def __init__(self, state: Dict[str, Any]):
        self.state = state
        self.refactoring_interval = 10  # 每10个周期执行一次
        self.current_cycle = state.get('cycle_count', 0)
        self.observations = state.get('observations', [])
        self.history = state.get('history', [])
        self.objectives = state.get('objectives', {})
        
        # 项目根目录（假设在acp-proxy目录下运行）
        self.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.state_file_path = os.path.join(self.project_root, 'state.json')
        
        # 可修改的目录列表
        self.modifiable_directories = ['skills', 'plugins']
        
        # 改进记录计数器
        self.planned_improvements_key = 'planned_improvements_count'
        if self.planned_improvements_key not in self.state:
            self.state[self.planned_improvements_key] = 0

    def run_autonomous_refactoring(self) -> Dict[str, Any]:
        """
        入口函数：执行自主重构主循环
        返回更新后的状态字典
        """
        try:
            # 检查是否达到执行周期
            if self._should_execute():
                print(f"[自主重构器] 周期 {self.current_cycle} 开始执行重构分析...")
                
                # 步骤1: 分析并规划改进
                improvement_plan = self.analyze_and_plan()
                
                if improvement_plan:
                    # 步骤2: 实施并测试改进
                    success, changes = self.implement_and_test(improvement_plan)
                    
                    # 步骤3: 报告并记录
                    self.report_and_log(improvement_plan, success, changes)
                else:
                    print("[自主重构器] 本次未发现需要改进的问题")
            else:
                print(f"[自主重构器] 周期 {self.current_cycle} 未达到执行条件")
            
            return self.state
            
        except Exception as e:
            print(f"[自主重构器] 执行过程中发生错误: {str(e)}")
            # 记录错误但不中断进化循环
            self._log_error(e)
            return self.state

    def _should_execute(self) -> bool:
        """判断是否应该执行重构"""
        # 每隔refactoring_interval个周期执行一次
        return self.current_cycle % self.refactoring_interval == 0 and self.current_cycle > 0

    def analyze_and_plan(self) -> Optional[Dict[str, Any]]:
        """
        分析当前状态，生成改进计划
        基于反思模式和目标优先级规划改进
        """
        print("[自主重构器] 开始分析代码库状态和观察记录...")
        
        # 分析反思模式
        reflection_patterns = self._analyze_reflection_patterns()
        
        # 获取目标优先级
        objective_priority = self._get_objective_priority()
        
        # 生成改进计划
        plan = self._generate_improvement_plan(reflection_patterns, objective_priority)
        
        if plan:
            self.state[self.planned_improvements_key] += 1
        
        return plan

    def _analyze_reflection_patterns(self) -> Dict[str, Any]:
        """分析反思模式，识别常见问题"""
        patterns = {
            'analysis_delay': False,
            'failure_patterns': [],
            'success_patterns': [],
            'performance_issues': []
        }
        
        # 分析观察记录中的模式
        for obs in self.observations[-20:]:  # 分析最近20条观察
            obs_text = str(obs).lower()
            
            # 检查分析延迟模式
            if '延迟' in obs_text or 'delay' in obs_text:
                patterns['analysis_delay'] = True
                patterns['performance_issues'].append({
                    'type': 'analysis_delay',
                    'observation': obs,
                    'cycle': self.current_cycle
                })
            
            # 检查失败模式
            if any(keyword in obs_text for keyword in ['失败', '错误', 'error', 'fail']):
                patterns['failure_patterns'].append(obs)
            
            # 检查成功模式
            if any(keyword in obs_text for keyword in ['成功', '完成', 'success', 'complete']):
                patterns['success_patterns'].append(obs)
        
        return patterns

    def _get_objective_priority(self) -> List[Dict[str, Any]]:
        """获取目标优先级，重点关注自编程和错误自修复"""
        priority_list = []
        
        for obj_name, obj_data in self.objectives.items():
            if isinstance(obj_data, dict):
                progress = obj_data.get('progress', 0)
                priority_score = self._calculate_priority_score(obj_name, progress)
                
                priority_list.append({
                    'name': obj_name,
                    'progress': progress,
                    'priority_score': priority_score,
                    'data': obj_data
                })
        
        # 按优先级排序
        priority_list.sort(key=lambda x: x['priority_score'], reverse=True)
        return priority_list

    def _calculate_priority_score(self, objective_name: str, progress: float) -> float:
        """计算目标优先级分数"""
        base_score = 1.0 - progress  # 进度越低，优先级越高
        
        # 特定目标加权
        high_priority_keywords = ['自编程', 'self-programming', '错误修复', 'error-fix']
        if any(keyword in objective_name.lower() for keyword in high_priority_keywords):
            base_score *= 2.0
        
        return base_score

    def _generate_improvement_plan(self, 
                                 reflection_patterns: Dict[str, Any],
                                 objective_priority: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """生成具体的改进计划"""
        plan = None
        
        # 策略1: 优先处理性能问题
        if reflection_patterns.get('analysis_delay'):
            plan = self._create_performance_improvement_plan()
        
        # 策略2: 针对低优先级目标进行改进