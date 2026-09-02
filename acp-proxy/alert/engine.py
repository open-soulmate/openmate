"""Alert v1.0 告警规则引擎 — 条件检测+去重+等级分类。"""
from __future__ import annotations
import time, threading
from dataclasses import dataclass, field
from enum import Enum

class AlertLevel(str, Enum):
    """告警等级。"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

@dataclass
class AlertRule:
    """告警规则。"""
    rule_id: str
    name: str
    metric_name: str
    condition: str  # "gt"/"lt"/"eq"
    threshold: float
    level: AlertLevel = AlertLevel.WARNING
    cooldown_seconds: int = 300  # 去重冷却5分钟
    last_triggered: float = 0.0

@dataclass
class AlertEvent:
    """告警事件。"""
    event_id: str
    rule_id: str
    name: str
    level: AlertLevel
    message: str
    value: float
    timestamp: float = field(default_factory=time.time)

class AlertEngine:
    """告警引擎（单例）。"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._rules: dict[str, AlertRule] = {}
                    cls._instance._events: list[AlertEvent] = []
        return cls._instance

    def add_rule(self, rule: AlertRule):
        """添加告警规则。"""
        self._rules[rule.rule_id] = rule

    def evaluate(self, rule_id: str, current_value: float) -> AlertEvent | None:
        """评估单条规则。"""
        rule = self._rules.get(rule_id)
        if not rule:
            return None
        now = time.time()
        if now - rule.last_triggered < rule.cooldown_seconds:
            return None  # 冷却期内去重
        triggered = False
        if rule.condition == "gt" and current_value > rule.threshold:
            triggered = True
        elif rule.condition == "lt" and current_value < rule.threshold:
            triggered = True
        elif rule.condition == "eq" and current_value == rule.threshold:
            triggered = True
        if triggered:
            rule.last_triggered = now
            event = AlertEvent(
                event_id=f"alert-{int(now*1000)}",
                rule_id=rule.rule_id,
                name=rule.name,
                level=rule.level,
                message=f"{rule.name}: {current_value} {rule.condition} {rule.threshold}",
                value=current_value,
            )
            self._events.append(event)
            if len(self._events) > 1000:
                self._events = self._events[-500:]
            return event
        return None

    def check_all(self, metrics: dict[str, float]) -> list[AlertEvent]:
        """批量检查所有规则。"""
        results = []
        for rule_id, value in metrics.items():
            event = self.evaluate(rule_id, value)
            if event:
                results.append(event)
        return results

    def get_events(self, level: AlertLevel | None = None) -> list[AlertEvent]:
        """获取告警事件列表。"""
        if level:
            return [e for e in self._events if e.level == level]
        return list(self._events)
