#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自主重构器技能 - 具备自编程能力的代码改进插件
该技能定期分析代码库状态，生成并实施安全的代码改进任务
"""

import os
import json
import time
import ast
import inspect
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import importlib
import sys
from pathlib import Path

class AutonomousRefactor:
    """自主重构器核心类"""
    
    def __init__(self, state_path: str = "acp-proxy/state.json"):
        self.state_path = state_path
        self.state = {}
        self.current_cycle = 0
        self.refactoring_interval = 10  # 每10个运行周期执行一次
        self.target_directories = ["skills/", "plugins/"]
        self.load_state()
        
    def load_state(self) -> None:
        """加载状态数据"""
        try:
            if os.path.exists(self.state_path):
                with open(self.state_path, 'r', encoding='utf-8') as f:
                    self.state = json.load(f)
                self.current_cycle = self.state.get('current_cycle', 0)
            else:
                # 初始化空状态
                self.state = {
                    'current_cycle': 0,
                    'observations': [],
                    'history': [],
                    'goals': {},
                    'refactoring_counter': 0,
                    'last_refactoring_cycle': 0
                }
        except (json.JSONDecodeError, IOError) as e:
            self._handle_error(f"加载状态文件失败: {str(e)}")
            self.state = {
                'current_cycle': 0,
                'observations': [],
                'history': [],
                'goals': {},
                'refactoring_counter': 0,
                'last_refactoring_cycle': 0
            }
    
    def save_state(self) -> None:
        """保存状态数据"""
        try:
            with open(self.state_path, 'w', encoding='utf-8') as f:
                json.dump(self.state, f, indent=2, ensure_ascii=False)
        except IOError as e:
            self._handle_error(f"保存状态文件失败: {str(e)}")
    
    def _handle_error(self, error_msg: str) -> None:
        """处理错误"""
        print(f"[自主重构器错误] {error_msg}")
        # 记录错误到状态
        error_record = {
            "type": "error",
            "message": error_msg,
            "timestamp": datetime.now().isoformat(),
            "cycle": self.current_cycle
        }
        self.state.setdefault('errors', []).append(error_record)
        self.save_state()
    
    def should_execute(self) -> bool:
        """判断是否应该执行重构"""
        last_refactoring = self.state.get('last_refactoring_cycle', 0)
        cycles_since_last = self.current_cycle - last_refactoring
        
        # 检查是否达到间隔周期
        if cycles_since_last >= self.refactoring_interval:
            # 检查是否有可用目标
            available_targets = self._find_available_targets()
            if available_targets:
                return True
        
        # 检查是否需要紧急修复
        urgent_needs = self._check_urgent_needs()
        if urgent_needs:
            return True
            
        return False
    
    def _find_available_targets(self) -> List[Dict[str, Any]]:
        """查找可修改的目标文件"""
        targets = []
        
        for target_dir in self.target_directories:
            if not os.path.exists(target_dir):
                continue
                
            for root, dirs, files in os.walk(target_dir):
                for file in files:
                    if file.endswith('.py'):
                        file_path = os.path.join(root, file)
                        
                        # 检查文件是否可读写
                        if os.access(file_path, os.R_OK | os.W_OK):
                            # 排除本技能自身修改（防止循环修改）
                            if "autonomous_refactoring.py" not in file_path:
                                targets.append({
                                    'path': file_path,
                                    'directory': target_dir,
                                    'last_modified': os.path.getmtime(file_path),
                                    'size': os.path.getsize(file_path)
                                })
        
        return targets
    
    def _check_urgent_needs(self) -> List[Dict[str, Any]]:
        """检查紧急改进需求"""
        urgent_needs = []
        observations = self.state.get('observations', [])
        goals = self.state.get('goals', {})
        
        # 分析失败模式
        for obs in observations[-10:]:  # 分析最近10条观察
            if obs.get('type') == 'failure':
                urgent_needs.append({
                    'type': 'failure_fix',
                    'description': obs.get('description', ''),
                    'priority': 'high',
                    'cycle': self.current_cycle
                })
        
        # 检查关键目标进度
        critical_goals = ['自编程能力', '错误自修复']