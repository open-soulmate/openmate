"""
ObservationScheduler - 稳定高效的外部观察调度与处理技能

目标:
此技能作为Agent与外部世界事件的唯一入口和调度中心，专门负责稳定、高效调度和处理外部观察（Observations）。
核心使命是解决观察处理不稳定、积压和过度依赖外部伙伴的问题。

设计哲学:
1.  **统一入口**: 所有外部观察（API响应、文件变更、用户通知等）都通过本技能提交，避免直接依赖外部伙伴
2.  **智能调度**: 根据观察类型、来源和紧迫程度进行动态优先级排序和调度
3.  **自我修复**: 实现异常检测、积压预警和自动修复机制，确保系统稳定性
4.  **路径优化**: 持续学习并优化观察处理路径，减少对单一伙伴的依赖，提升自主处理能力
5.  **进化闭环**: 与`self_evolver`技能深度集成，形成"发现问题 -> 报告异常 -> 生成修复方案 -> 进化提升"的闭环

与其他技能的交互点:
- **self_evolver**: 当检测到复杂异常或需要新处理能力时，向其报告异常并建议创建修复性子技能
- **knowledge_system**: 将观察历史和异常日志持久化存储，用于模式分析和学习
- **git_handler**: 路由GitHub webhook等代码相关观察
- **system_health**: 路由系统监控相关观察
- **其他技能**: 根据观察类型动态路由到最合适的处理技能

集成到现有Agent循环:
1. 在Agent启动时初始化ObservationScheduler实例
2. 将外部事件收集器（如webhook处理器、文件监控器等）的输出连接到`submit_observation`方法
3. 调度器在后台线程中自动处理观察，并将结果反馈给Agent主循环
4. 定期调用`analyze_and_optimize`方法进行策略优化
5. 通过`get_metrics`方法监控调度器性能
"""

import json
import time
import uuid
import threading
import logging
import heapq
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable, Union
from pathlib import Path
import queue

# 假设存在这些基础模块，根据实际项目结构调整
try:
    from .base_skill import BaseSkill
except ImportError:
    # 如果不存在基类，定义基础接口
    class BaseSkill:
        """技能基础类"""
        def __init__(self, skill_name: str, config: dict = None):
            self.skill_name = skill_name
            self.config = config or {}
            self.logger = logging.getLogger(f"skill.{skill_name}")
            
        def execute(self, *args, **kwargs):
            """执行技能的主要逻辑"""
            raise NotImplementedError
            
        def get_status(self) -> dict:
            """获取技能状态"""
            return {
                "skill_name": self.skill_name,
                "status": "active",
                "timestamp": datetime.now().isoformat()
            }

class ObservationPriority:
    """观察优先级常量定义"""
    CRITICAL = 0    # 紧急：需要立即处理
    HIGH = 1        # 高优先级：需要快速处理
    MEDIUM = 2      # 中优先级：正常处理
    LOW = 3         # 低优先级：可以稍后处理
    BACKGROUND = 4  # 后台处理：空闲时处理

class ObservationScheduler(BaseSkill):
    """
    观察调度器技能
    
    作为Agent与外部世界的唯一入口，负责调度、处理和监控所有外部观察。
    实现优先级队列、异常检测、自动修复和路径优化功能。
    """
    
    def __init__(self, config: dict = None):
        """
        初始化观察调度器
        
        Args:
            config: 配置字典，包含以下可选字段：
                - max_queue_size: 队列最大长度，默认1000
                - backlog_threshold: 积压预警阈值，默认500
                - alert_cooldown: 警报冷却时间(秒)，默认60
                - processing_threads: 并发处理线程数，默认3
                - direct_handling_enabled: 是否启用直接处理，默认True
                - direct_handling_types: 可直接处理的观察类型列表
                - history_file: 历史记录文件路径
                - anomalies_log_file: 异常日志文件路径
                - health_check_interval: 健康检查间隔(秒)，默认30
                - max_processing_time: 最大处理时间(秒)阈值，默认30
                - fluctuation_threshold: 波动检测阈值，默认3
                - fluctuation_window: 波动检测时间窗口(秒)，默认60
        """
        super().__init__("observation_scheduler", config)
        
        # 初始化配置
        self.max_queue_size = self.config.get('max_queue_size', 1000)
        self.backlog_threshold = self.config.get('backlog_threshold', 500)
        self.alert_cooldown = self.config.get('alert_cooldown', 60)
        self.processing_threads = self.config.get('processing_threads', 3)
        self.direct_handling_enabled = self.config.get('direct_handling_enabled', True)
        self.direct_handling_types = self.config.get('direct_handling_types', [
            'simple_message', 'status_update', 'notification_ack'
        ])
        
        # 文件路径配置
        self.history_file = Path(self.config.get('history_file', 'knowledge/observation_history.json'))
        self.anomalies_log_file = Path(self.config.get('anomalies_log_file', 'knowledge/observation_anomalies.log'))
        
        # 确保目录存在
        self.history_file.parent.mkdir(parents=True, exist_ok=True)
        self.anomalies_log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 健康检查配置
        self.health_check_interval = self.config.get('health_check_interval', 30)
        self.max_processing_time = self.config.get('max_processing_time', 30)
        self.fluctuation_threshold = self.config.get('fluctuation_threshold', 3)
        self.fluctuation_window = self.config.get('fluctuation_window', 60)
        
        # 初始化队列和锁
        self.observation_queue = []  # 优先级队列（最小堆）
        self.queue_lock = threading.RLock()
        self.metrics_lock = threading.RLock()
        
        # 指标统计
        self.metrics = {
            'submitted': 0,
            'processed': 0,
            'failed': 0,
            'backlog_alerts': 0,
            'direct_handled': 0,
            'avg_processing_time': 0,
            'queue_depth': 0,
            'processing_times': []
        }
        