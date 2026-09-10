#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
观察分析技能 - 自动化处理观察数据积压
"""

import json
import os
import time
import signal
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

# 假设存在基础技能类
try:
    from acp_proxy.skills.base import BaseSkill
except ImportError:
    # 如果没有基础类，创建一个简化的替代
    class BaseSkill:
        def __init__(self, *args, **kwargs):
            pass
        
        def execute(self, *args, **kwargs):
            raise NotImplementedError


class ObservationAnalysisSkill(BaseSkill):
    """
    观察分析技能：自动处理观察数据积压，提高决策质量和知识积累
    """
    
    def __init__(self, config: Optional[Dict] = None):
        """
        初始化观察分析技能
        
        Args:
            config: 配置字典，包含技能配置
        """
        super().__init__()
        
        # 默认配置
        self.default_config = {
            "max_analysis_per_cycle": 3,
            "priority_rule": "timestamp",  # 可选: timestamp, importance, combined
            "timeout_per_observation": 5,  # 每个观察分析的最大时间(秒)
            "observation_data_path": "acp-proxy/data/observations.json",
            "memory_path": "acp-proxy/memory/",
            "log_file": "acp-proxy/logs/observation_analysis.log"
        }
        
        # 合并配置
        self.config = {**self.default_config, **(config or {})}
        
        # 初始化日志
        self._setup_logging()
        
        # 创建必要的目录
        self._ensure_directories()
        
        # 运行状态
        self.is_running = False
        
        self.logger.info("观察分析技能已初始化")
    
    def _setup_logging(self):
        """设置日志系统"""
        self.logger = logging.getLogger("ObservationAnalysisSkill")
        self.logger.setLevel(logging.INFO)
        
        # 防止重复添加处理器
        if not self.logger.handlers:
            # 文件处理器
            try:
                log_dir = os.path.dirname(self.config["log_file"])
                os.makedirs(log_dir, exist_ok=True)
                
                file_handler = logging.FileHandler(
                    self.config["log_file"],
                    encoding='utf-8'
                )
                file_handler.setLevel(logging.INFO)
                
                # 控制台处理器
                console_handler = logging.StreamHandler()
                console_handler.setLevel(logging.WARNING)
                
                # 格式化器
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                )
                file_handler.setFormatter(formatter)
                console_handler.setFormatter(formatter)
                
                self.logger.addHandler(file_handler)
                self.logger.addHandler(console_handler)
            except Exception as e:
                # 如果无法创建文件处理器，只使用控制台
                console_handler = logging.StreamHandler()
                console_handler.setLevel(logging.INFO)
                self.logger.addHandler(console_handler)
                self.logger.warning(f"无法创建日志文件: {e}")
    
    def _ensure_directories(self):
        """确保必要的目录存在"""
        directories = [
            self.config["memory_path"],
            os.path.dirname(self.config["observation_data_path"])
        ]
        
        for directory in directories:
            try:
                os.makedirs(directory, exist_ok=True)
            except Exception as e:
                self.logger.error(f"创建目录失败 {directory}: {e}")
    
    def _load_observations(self) -> List[Dict]:
        """
        加载观察数据
        
        Returns:
            观察数据列表
        """
        try:
            file_path = self.config["observation_data_path"]
            
            if not os.path.exists(file_path):
                self.logger.warning(f"观察数据文件不存在: {file_path}")
                return []
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 确保数据结构正确
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "observations" in data:
                return data["observations"]
            else:
                self.logger.error("观察数据格式不正确")
                return []
                
        except json.JSONDecodeError as e:
            self.logger.error(f"观察数据JSON解析失败: {e}")
            return []
        except Exception as e:
            self.logger.error(f"加载观察数据失败: {e}")
            return []
    
    def _save_observations(self, observations: List[Dict]):
        """
        保存观察数据
        
        Args:
            observations: 观察数据列表
        """
        try:
            file_path = self.config["observation_data_path"]
            
            # 创建备份
            if os.path.exists(file_path):
                backup_path = f"{file_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                os.rename(file_path, backup_path)
            
            # 保存新数据
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(observations, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"观察数据已保存到 {file_path}")
            
        except Exception as e:
            self.logger.error(f"保存观察数据失败: {e}")