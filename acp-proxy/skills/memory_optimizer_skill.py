"""
Memory Optimizer Skill for ACP-Proxy Agent

This skill acts as a memory steward, optimizing the agent's memory pool by
intelligently archiving, compressing, or safely deleting low-value memories
when the memory capacity approaches saturation.
"""

import datetime
from typing import List, Dict, Any, Optional
from enum import Enum
import logging
from dataclasses import dataclass

# Import memory manager module (assuming it exists at this path)
from acp_proxy.plugins.memory.memory_manager import (
    get_all_memories,
    update_memory,
    archive_memory,
    delete_memory,
    summarize_memory,
)

# Configure logging
logger = logging.getLogger(__name__)


class MemoryOperation(Enum):
    """Operations that can be performed on memories."""
    KEEP = "keep"
    COMPRESS = "compress"
    ARCHIVE = "archive"
    DELETE = "delete"


@dataclass
class MemoryScore:
    """Represents a memory with its calculated score and recommended operation."""
    memory_id: str
    content: str
    created_at: datetime.datetime
    last_referenced: datetime.datetime
    references_count: int
    tags: List[str]
    is_core: bool
    is_immutable: bool
    score: float
    operation: MemoryOperation