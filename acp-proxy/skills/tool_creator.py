# acp-proxy/skills/tool_creator.py
import json
import os
import re
import sys
import inspect
import importlib
import traceback
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

# 假设BaseSkill从现有基类导入
# from acp_proxy.skills.base import BaseSkill

class BaseSkill:
    """临时基类，实际项目中应替换为真实基类"""
    def __init__(self, agent=None, config=None):
        self.agent = agent
        self.config = config or {}
        
    def execute(self, **kwargs):
        raise NotImplementedError
        
    def update_progress(self, target: str, progress: float):
        """更新进度（模拟）"""
        print(f"Progress update - {target}: {progress:.2%}")

class ToolCreatorSkill(BaseSkill):
    """
    创建MCP工具自动创造技能
    支持agent识别能力缺口并自动创建新的MCP工具
    """
    
    def __init__(self, agent=None, config=None):
        super().__init__(agent, config)
        self.tool_registry = {}  # 已创建工具注册表
        self.mcp_protocol_docs = config.get('mcp_protocol_docs', {})
        self.existing_tools_interface = config.get('existing_tools_interface')
        self.plugins_dir = config.get('plugins_dir', 'plugins')
        self.created_tools_count = 0
        
        # 确保plugins目录存在
        Path(self.plugins_dir).mkdir(parents=True, exist_ok=True)
        
    def execute(self, **kwargs) -> Dict[str, Any]:
        """主执行方法"""
        action = kwargs.get('action', 'create_tool')
        
        if action == 'identify_gaps':
            failed_tasks = kwargs.get('failed_tasks', [])
            return self.identify_capability_gaps(failed_tasks)
        elif action == 'design_tool':
            gap_description = kwargs.get('gap_description', '')
            return self.design_tool_specification(gap_description)
        elif action == 'generate_tool':
            tool_spec = kwargs.get('tool_spec', {})
            return self.generate_mcp_tool(tool_spec)
        elif action == 'register_tool':
            tool_code = kwargs.get('tool_code', '')
            return self.register_tool(tool_code)
        elif action == 'test_tool':
            tool_name = kwargs.get('tool_name', '')
            test_cases = kwargs.get('test_cases', [])
            return self.test_tool(tool_name, test_cases)
        elif action == 'create_tool':
            failed_tasks = kwargs.get('failed_tasks', [])
            return self.create_new_tool(failed_tasks)
        else:
            return {'success': False, 'error': f'Unknown action: {action}'}
    
    def create_new_tool(self, failed_tasks: List[Dict]) -> Dict[str, Any]:
        """完整流程：从失败任务创建新工具"""
        try:
            # 1. 识别能力缺口
            gaps = self.identify_capability_gaps(failed_tasks)
            if not gaps['success']:
                return gaps
                
            # 2. 设计工具规格
            tool_specs = []
            for gap in gaps['gaps']:
                spec = self.design_tool_specification(gap)
                if spec['success']:
                    tool_specs.append(spec['specification'])
                    
            # 3. 生成并注册工具
            created_tools = []
            for spec in tool_specs:
                # 生成工具代码
                code_result = self.generate_mcp_tool(spec)
                if not code_result['success']:
                    continue
                    
                # 注册工具
                reg_result = self.register_tool(code_result['code'])
                if reg_result['success']:
                    created_tools.append({
                        'tool_name': spec['name'],
                        'tool_spec': spec,
                        'code': code_result['code']
                    })
                    
            # 更新进度
            self.created_tools_count += len(created_tools)
            self.update_progress('工具创造', self.created_tools_count / 100)
            
            return {
                'success': True,
                'created_tools': len(created_tools),
                'tools': created_tools,
                'progress': self.created_tools_count / 100
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'创建工具失败: {str(e)}',
                'traceback': traceback.format_exc()
            }
    
    def identify_capability_gaps(self, failed_tasks: List[Dict]) -> Dict[str, Any]:
        """分析历史失败任务，识别当前缺失的能力类型"""
        try:
            gaps = []
            task_patterns = {}
            
            for task in failed_tasks:
                task_type = task.get('type', 'unknown')
                error_type = task.get('error', '').split(':')[0] if task.get('error') else 'unknown'
                pattern_key = f"{task_type}_{error_type}"
                
                if pattern_key not in task_patterns:
                    task_patterns[pattern_key] = {
                        'count': 0,
                        'examples': [],
                        'task_type': task_type,
                        'error_type': error_type
                    }
                
                task_patterns[pattern_key]['count'] += 1
                task_patterns[pattern_key]['examples'].append(task)
                
                # 分析缺口类型
                if 'api' in task_type.lower() or 'service' in task_type.lower():
                    gap_type = 'api_integration'
                elif 'data' in task_type.lower() or 'process' in task_type.lower():
                    gap_type = 'data_processing'
                elif 'file' in task_type.lower() or 'io' in task_type.lower():
                    gap_type = 'file_operations'
                elif 'auth' in task_type.lower() or 'security' in task_type.lower():
                    gap_type = 'security'
                else:
                    gap_type = 'general'
                    
                # 检查是否已存在类似工具
                similar_tools = self._find_similar_tools(task_type, error_type)
                if not similar_tools:
                    gaps.append({
                        'gap_type': gap_type,
                        'task_type': task_type,
                        'error_type': error_type,
                        'frequency': task_patterns[pattern_key]['count'],
                        'suggested_capability': self._suggest_capability(task_type, error_type)
                    })
                    
            # 按频率排序
            gaps.sort(key=lambda x: x['frequency'], reverse=True)
            
            return {
                'success': True,
                'gaps': gaps,
                'patterns': task_patterns,
                'total_failed_tasks': len(failed_tasks)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'识别能力缺口失败: {str(e)}',
                'traceback': traceback.format_exc()
            }
    
    def _find_similar_tools(self, task_type: str, error_type: str) -> List[str]:
        """查找类似工具"""