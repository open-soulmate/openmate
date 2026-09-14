"""可观测性最小集 — session/run/trace三级打点

借鉴自：
- Langfuse 的 trace树
- OpenTelemetry 的 span模型
- LangGraph 的 run记录

核心思想：
1. 每个session有自己的trace树
2. 每个run（一次prompt处理）是一个span
3. 工具调用、LLM调用都是子span
4. 所有span可以查询、分析、回放
"""

import time
import uuid
import logging
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from pathlib import Path

logger = logging.getLogger("acp-agent.observability")


class SpanType(str, Enum):
    SESSION = "session"
    RUN = "run"
    LLM_CALL = "llm_call"
    TOOL_CALL = "tool_call"
    FILE_EDIT = "file_edit"
    ERROR = "error"


class SpanStatus(str, Enum):
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass
class Span:
    """一个可观测的span"""
    span_id: str
    trace_id: str  # session_id
    parent_id: str | None
    span_type: SpanType
    name: str
    start_time: float = field(default_factory=time.time)
    end_time: float | None = None
    status: SpanStatus = SpanStatus.RUNNING
    attributes: dict = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)
    error: str | None = None
    
    @property
    def duration(self) -> float:
        if self.end_time:
            return self.end_time - self.start_time
        return time.time() - self.start_time
    
    def add_event(self, name: str, attributes: dict | None = None):
        """添加事件"""
        self.events.append({
            "name": name,
            "timestamp": time.time(),
            "attributes": attributes or {},
        })
    
    def set_attribute(self, key: str, value: Any):
        """设置属性"""
        self.attributes[key] = value
    
    def finish(self, status: SpanStatus = SpanStatus.SUCCESS, error: str | None = None):
        """结束span"""
        self.end_time = time.time()
        self.status = status
        if error:
            self.error = error
    
    def to_dict(self) -> dict:
        return {
            "span_id": self.span_id,
            "trace_id": self.trace_id,
            "parent_id": self.parent_id,
            "type": self.span_type.value,
            "name": self.name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
            "status": self.status.value,
            "attributes": self.attributes,
            "events": self.events,
            "error": self.error,
        }


class ObservabilityManager:
    """可观测性管理器
    
    Usage:
        obs = ObservabilityManager()
        
        # 创建run span
        run_span = obs.start_span(
            trace_id=session_id,
            span_type=SpanType.RUN,
            name="prompt_processing",
        )
        
        # 创建子span
        llm_span = obs.start_span(
            trace_id=session_id,
            span_type=SpanType.LLM_CALL,
            name="llm_chat",
            parent_id=run_span.span_id,
        )
        
        # 结束span
        llm_span.finish(SpanStatus.SUCCESS)
        run_span.finish(SpanStatus.SUCCESS)
        
        # 查询trace
        trace = obs.get_trace(session_id)
    """
    
    def __init__(self, max_spans_per_trace: int = 1000):
        self.max_spans_per_trace = max_spans_per_trace
        self._traces: dict[str, list[Span]] = {}  # trace_id -> spans
        self._active_spans: dict[str, Span] = {}  # span_id -> span
        self._global_stats = {
            "total_spans": 0,
            "total_errors": 0,
            "total_duration": 0.0,
        }
    
    def start_span(
        self,
        trace_id: str,
        span_type: SpanType,
        name: str,
        parent_id: str | None = None,
        attributes: dict | None = None,
    ) -> Span:
        """开始一个新的span"""
        span_id = f"{span_type.value}-{uuid.uuid4().hex[:8]}"
        
        span = Span(
            span_id=span_id,
            trace_id=trace_id,
            parent_id=parent_id,
            span_type=span_type,
            name=name,
            attributes=attributes or {},
        )
        
        # 存储
        if trace_id not in self._traces:
            self._traces[trace_id] = []
        self._traces[trace_id].append(span)
        self._active_spans[span_id] = span
        
        # 限制trace大小
        if len(self._traces[trace_id]) > self.max_spans_per_trace:
            self._traces[trace_id] = self._traces[trace_id][-self.max_spans_per_trace:]
        
        self._global_stats["total_spans"] += 1
        
        logger.debug(
            f"[observability] Started span {span_id} "
            f"({span_type.value}/{name}) in trace {trace_id}"
        )
        
        return span
    
    def finish_span(
        self,
        span_id: str,
        status: SpanStatus = SpanStatus.SUCCESS,
        error: str | None = None,
    ):
        """结束一个span"""
        span = self._active_spans.get(span_id)
        if span:
            span.finish(status, error)
            del self._active_spans[span_id]
            
            if status == SpanStatus.ERROR:
                self._global_stats["total_errors"] += 1
            
            self._global_stats["total_duration"] += span.duration
    
    def get_trace(self, trace_id: str) -> list[dict]:
        """获取一个trace的所有span"""
        spans = self._traces.get(trace_id, [])
        return [s.to_dict() for s in spans]
    
    def get_trace_tree(self, trace_id: str) -> dict:
        """获取trace的树形结构"""
        spans = self._traces.get(trace_id, [])
        if not spans:
            return {}
        
        # 构建树
        span_map = {s.span_id: s for s in spans}
        roots = []
        
        for span in spans:
            if span.parent_id is None:
                roots.append(span)
        
        def build_tree(span: Span) -> dict:
            children = [
                build_tree(s)
                for s in spans
                if s.parent_id == span.span_id
            ]
            return {
                **span.to_dict(),
                "children": children,
            }
        
        return {
            "trace_id": trace_id,
            "roots": [build_tree(r) for r in roots],
            "total_spans": len(spans),
            "total_duration": max(s.duration for s in spans) if spans else 0,
        }
    
    def get_recent_traces(self, limit: int = 10) -> list[dict]:
        """获取最近的trace"""
        trace_ids = list(self._traces.keys())[-limit:]
        result = []
        for tid in trace_ids:
            spans = self._traces[tid]
            if spans:
                result.append({
                    "trace_id": tid,
                    "span_count": len(spans),
                    "duration": max(s.duration for s in spans),
                    "errors": sum(1 for s in spans if s.status == SpanStatus.ERROR),
                    "last_activity": max(s.start_time for s in spans),
                })
        return sorted(result, key=lambda x: x["last_activity"], reverse=True)
    
    def get_stats(self) -> dict:
        """全局统计"""
        now = time.time()
        
        # 各类型span统计
        by_type = {}
        for span_type in SpanType:
            count = sum(
                1 for spans in self._traces.values()
                for s in spans
                if s.span_type == span_type
            )
            if count:
                by_type[span_type.value] = count
        
        # 各状态统计
        by_status = {}
        for status in SpanStatus:
            count = sum(
                1 for spans in self._traces.values()
                for s in spans
                if s.status == status
            )
            if count:
                by_status[status.value] = count
        
        return {
            **self._global_stats,
            "active_spans": len(self._active_spans),
            "total_traces": len(self._traces),
            "by_type": by_type,
            "by_status": by_status,
        }
    
    def export_trace(self, trace_id: str, format: str = "json") -> str:
        """导出trace（用于调试或分析）"""
        trace = self.get_trace_tree(trace_id)
        if format == "json":
            return json.dumps(trace, indent=2, ensure_ascii=False)
        return str(trace)
