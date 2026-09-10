"""
Observation Handler Skill - Agent自编程能力的核心组件

该技能将Agent从被动的状态报告者转变为主动的自我改进执行者，
通过定期处理积压的观察数据，提炼结构化洞察并写入长期记忆。
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class ProcessedObservation:
    """已处理的观察记录"""
    source_file: str
    observation_id: str
    content_summary: str
    status: str  # success | failed | skipped
    error_message: Optional[str] = None


@dataclass
class GeneratedMemory:
    """生成的记忆条目"""
    memory_id: str
    source_observation: str
    pattern: str
    rule: str
    action_template: str
    priority: int
    category: str
    created_at: str


@dataclass
class ProcessingReport:
    """处理报告 - 最小可验证输出"""
    timestamp: str
    cycle_id: str
    observations_discovered: int
    observations_processed: int
    observations_succeeded: int
    observations_failed: int
    memories_generated: int
    backlog_resolved: int
    details: List[Dict[str, Any]]
    status: str

