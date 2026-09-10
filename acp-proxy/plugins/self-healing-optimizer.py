import json
import time
import os
import psutil
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ErrorType(Enum):
    """错误类型枚举"""
    CONNECTION_TIMEOUT = "connection_timeout"
    RESOURCE_INSUFFICIENT = "resource_insufficient"
    FORMAT_ERROR = "format_error"
    PERMISSION_DENIED = "permission_denied"
    DEPENDENCY_FAILURE = "dependency_failure"
    CONFIGURATION_ERROR = "configuration_error"
    NETWORK_ERROR = "network_error"
    DISK_FULL = "disk_full"
    MEMORY_LEAK = "memory_leak"
    UNKNOWN = "unknown"

class HealthStatus(Enum):
    """健康状态枚举"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    DOWN = "down"

@dataclass
class SystemMetric:
    """系统指标数据类"""
    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    error_count: int
    network_errors: int
    process_count: int

@dataclass
class ErrorEvent:
    """错误事件数据类"""
    timestamp: datetime
    error_type: ErrorType
    message: str
    source: str
    stack_trace: Optional[str] = None
    resolved: bool = False

@dataclass
class RepairStrategy:
    """修复策略数据类"""
    id: str
    name: str
    description: str
    error_types: List[ErrorType]
    priority: int
    steps: List[str]
    estimated_time: int
    success_rate: float
    rollback_plan: List[str]

@dataclass
class RepairResult:
    """修复结果数据类"""
    strategy_id: str
    start_time: datetime
    end_time: Optional[datetime]
    success: bool
    error_fixed: bool
    details: str
    metrics_before: Optional[SystemMetric] = None
    metrics_after: Optional[SystemMetric] = None

class HealthMonitor:
    """错误检测监控器 - 实时监控系统异常和性能指标"""
    
    def __init__(self, check_interval: int = 300):  # 5分钟 = 300秒
        self.check_interval = check_interval
        self.metric_history: List[SystemMetric] = []
        self.error_events: List[ErrorEvent] = []
        self.alert_thresholds = {
            'cpu_critical': 90,
            'cpu_warning': 80,
            'memory_critical': 85,
            'memory_warning': 75,
            'disk_critical': 95,
            'disk_warning': 85,
            'error_rate_critical': 10,
            'error_rate_warning': 5
        }
        self.last_check = None
        self.health_status = HealthStatus.HEALTHY
        
    def collect_metrics(self) -> SystemMetric:
        """收集系统指标"""
        try:
            # CPU使用率
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # 内存使用率
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            # 磁盘使用率
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent
            
            # 错误日志统计（模拟）
            error_count = self._count_recent_errors()
            
            # 网络错误统计（模拟）
            network_errors = self._count_network_errors()
            
            # 进程数量
            process_count = len(psutil.pids())
            
            metric = SystemMetric(
                timestamp=datetime.now(),
                cpu_percent=cpu_percent,
                memory_percent=memory_percent,
                disk_percent=disk_percent,
                error_count=error_count,
                network_errors=network_errors,
                process_count=process_count
            )
            
            self.metric_history.append(metric)
            if len(self.metric_history) > 1000:  # 保留最近1000条记录
                self.metric_history = self.metric_history[-1000:]
            
            return metric
            
        except Exception as e:
            logger.error(f"收集系统指标失败: {e}")
            return None
    
    def _count_recent_errors(self) -> int:
        """统计最近5分钟的错误数"""
        cutoff_time = datetime.now() - timedelta(minutes=5)
        recent_errors = [e for e in self.error_events if e.timestamp > cutoff_time]
        return len(recent_errors)
    
    def _count_network_errors(self) -> int:
        """统计网络错误（模拟）"""
        # 实际实现中应该检查网络连接状态
        return 0
    
    def check_health_status(self, metric: SystemMetric) -> HealthStatus:
        """检查健康状态"""
        issues = []
        
        if metric.cpu_percent >= self.alert_thresholds['cpu_critical']:
            issues.append(f"CPU使用率过高: {metric.cpu_percent}%")
        elif metric.cpu_percent >= self.alert_thresholds['cpu_warning']:
            issues.append(f"CPU使用率偏高: {metric.cpu_percent}%")
            
        if metric.memory_percent >= self.alert_thresholds['memory_critical']:
            issues.append(f"内存使用率过高: {metric.memory_percent}%")
        elif metric.memory_percent >= self.alert_thresholds['memory_warning']:
            issues.append(f"内存使用率偏高: {metric.memory_percent}%")
            
        if metric.disk_percent >= self.alert_thresholds['disk_critical']:
            issues.append(f"磁盘使用率过高: {metric.disk_percent}%")
        elif metric.disk_percent >= self.alert_thresholds['disk_warning']:
            issues.append(f"磁盘使用率偏高: {metric.disk_percent}%")
        
        error_rate = metric.error_count / 5  # 每分钟错误率
        if error_rate >= self.alert_thresholds['error_rate_critical']:
            issues.append(f"错误率过高: {metric.error_count}次/5分钟")
        elif error_rate >= self.alert_thresholds['error_rate_warning']:
            issues.append(f"错误率偏高: {metric.error_count}次/5分钟")
        
        if not issues:
            self.health_status = HealthStatus.HEALTHY
        elif len(issues) <= 2:
            self.health_status = HealthStatus.WARNING
        else:
            self.health_status = HealthStatus.CRITICAL
            
        if issues:
            logger.warning(f"健康检查发现 {len(issues)} 个问题: {'; '.join(issues)}")
        
        return self.health_status
    
    def add_error_event(self, error_type: ErrorType, message: str, source: str, stack_trace: Optional[str] = None):
        """添加错误事件"""
        error_event = ErrorEvent(
            timestamp=datetime.now(),
            error_type=error_type,
            message=message,
            source=source,
            stack_trace=stack_trace
        )
        self.error_events.append(error_event)
        logger.error(f"检测到错误: [{error_type.value}] {message} (来源: {source})")
    
    def get_metric_trend(self, metric_name: str, hours: int = 1) -> Dict[str, Any]:
        """获取指标趋势"""