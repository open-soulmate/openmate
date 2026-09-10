"""
Observation Scheduler Skill

目标：作为Agent与外部世界事件的唯一入口和调度中心，解决观察处理不稳定、
积压和过度依赖外部伙伴的问题。

设计哲学：
1. 统一入口：所有外部观察必须通过submit_observation方法提交
2. 智能调度：根据观察类型、来源、优先级动态分配处理资源
3. 自治能力：逐步提高Agent自身处理观察的能力，减少对外部依赖
4. 自我进化：通过分析历史数据持续优化调度策略，并与self_evolver协作
5. 弹性设计：具备异常检测、自动修复和降级机制

交互点：
- self_evolver技能：当检测到系统异常时，可向其报告并建议创建修复性子技能
- 其他技能：根据路由表将观察分发给专门的处理技能
- knowledge模块：所有观察历史和异常日志都记录到knowledge目录

集成方式：
1. 在Agent启动时初始化此技能
2. 将所有外部观察（API响应、文件变更等）通过submit_observation提交
3. 后台自动运行调度循环，无需手动触发
4. 定期调用analyze_and_optimize方法进行自我优化

文件结构：
acp-proxy/skills/observation_scheduler.py
"""

import heapq
import json
import uuid
import threading
import time
import logging
from typing import Dict, List, Callable, Optional, Any, Union
from datetime import datetime, timedelta
from pathlib import Path
from collections import deque, defaultdict
import concurrent.futures
from dataclasses import dataclass, asdict
from enum import Enum

# 尝试导入BaseSkill，如果不存在则定义一个简单的基础接口
try:
    from .base_skill import BaseSkill
except ImportError:
    class BaseSkill:
        def __init__(self, config: dict):
            self.config = config
            self.name = self.__class__.__name__
        
        async def execute(self, *args, **kwargs):
            raise NotImplementedError

# 配置日志
logger = logging.getLogger(__name__)


class ObservationPriority(Enum):
    """观察优先级枚举"""
    CRITICAL = 0    # 最高优先级，立即处理
    HIGH = 1        # 高优先级，尽快处理
    MEDIUM = 2      # 中优先级
    LOW = 3         # 低优先级
    BACKGROUND = 4  # 后台处理


@dataclass
class Observation:
    """观察数据结构"""
    type: str               # 观察类型（如：api_response, file_change, code_execution）
    source: str             # 观察来源（如：github, monitor_system, user_input）
    payload: dict           # 观察数据负载
    priority: int = 2       # 优先级（0-9，默认为2）
    observation_id: str = None  # 观察ID，自动生成
    timestamp: str = None   # 时间戳
    metadata: dict = None   # 元数据
    
    def __post_init__(self):
        if not self.observation_id:
            self.observation_id = f"obs_{uuid.uuid4().hex[:12]}"
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()
        if not self.metadata:
            self.metadata = {}
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return asdict(self)


class ObservationScheduler(BaseSkill):
    """
    观察调度器 - 负责稳定、高效调度和处理外部观察的核心技能
    
    核心功能：
    1. 统一调度：维护优先级队列，根据类型、来源、优先级动态排序
    2. 异常检测：监控队列状态，检测积压和异常模式
    3. 自动修复：当检测到问题时，自动启动备用处理路径
    4. 路由优化：建立动态路由表，将观察分发给最合适的处理器
    5. 状态跟踪：记录所有观察的元数据，用于分析和优化
    """
    
    def __init__(self, config: dict = None):
        super().__init__(config or {})
        
        # 配置参数
        self.config = {
            "max_queue_size": 1000,
            "backlog_threshold": 500,
            "alert_threshold": 300,
            "processing_threads": 4,
            "history_file": "knowledge/observation_history.json",
            "anomaly_log": "knowledge/observation_anomalies.log",
            "max_history_size": 10000,
            "health_check_interval": 30,  # 秒
            "optimization_interval": 3600,  # 秒
            "auto_handle_simple": True,
            "max_retry_count": 3,
            **(config or {})
        }
        
        # 核心数据结构
        self.priority_queue = []  # 优先级队列（最小堆）
        self.observation_map = {}  # 观察ID到观察对象的映射
        self.processing_history = deque(maxlen=self.config["max_history_size"])
        self.route_table = self._initialize_route_table()
        self.metrics = {
            "submitted": 0,
            "processed": 0,
            "failed": 0,
            "backlogged": 0,
            "direct_handled": 0
        }
        
        # 线程控制
        self.running = False
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)
        self.thread_pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=self.config["processing_threads"]
        )
        
        # 历史分析
        self.anomaly_history = []
        self.last_optimization = time.time()
        
        # 启动后台线程
        self._start_background_processes()
    
    def _initialize_route_table(self) -> Dict[str, Union[str, Callable]]:
        """初始化路由表，将观察类型映射到处理者"""
        # 基础路由映射
        route_table = {
            # GitHub相关观察
            "github_webhook": "git_handler",
            "github_pr": "git_handler",
            "github_issue": "git_handler",
            
            # 系统监控观察
            "system_monitor": "system_health",
            "performance_metric": "system_health",
            "error_log": "system_health",
            
            # API响应
            "api_response": "api_handler",
            "http_response": "api_handler",
            
            # 文件系统观察
            "file_change": "file_handler",
            "directory_change": "file_handler",
            
            # 用户交互
            "user_message": "chat_handler",
            "user_command": "chat_handler",
            
            # 代码执行
            "code_execution": "code_executor",
            "test_result": "code_executor",
        }
        
        # 从配置或历史中加载自定义路由
        try:
            history_path = Path(self.config["history_file"])
            if history_path.exists():
                with open(history_path, 'r', encoding='utf-8') as f:
                    history_data = json.load(f)
                    if "route_table" in history_data:
                        route_table.update(history_data["route_table"])
        except Exception as e:
            logger.warning(f"无法加载历史路由表: {e}")
        
        return route_table
    
    def _start_background_processes(self):
        """启动后台处理线程"""
        self.running = True
        
        # 调度循环线程