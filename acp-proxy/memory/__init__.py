"""Memory v1.0 记忆系统

三层记忆架构：
- 短期记忆 (ShortTermMemory): 会话内上下文，容量有限，随会话销毁清除
- 长期记忆 (LongTermMemory): 跨会话持久化，从短期记忆提炼后存入
- 工作记忆 (WorkingMemory): 当前任务临时状态，任务完成后清理

核心组件：
- MemoryItem: 记忆条目数据模型
- MemoryType: 记忆类型枚举
- MemoryStore: 全局单例存储引擎（add/search/get/delete/consolidate）

用法示例::

    from memory import MemoryStore, MemoryItem, MemoryType

    store = MemoryStore()
    item = MemoryItem(
        type=MemoryType.SHORT_TERM,
        content="用户想要创建一个Web应用",
        tags=["需求", "web"],
        session_id="sess_001",
    )
    store.add(item)

    # 搜索
    results = store.search("Web应用")

    # 会话结束时提炼+清理
    store.consolidate("sess_001")
    store.clear_session("sess_001")
"""

from .models import MemoryItem, MemoryType
from .store import MemoryStore

__all__ = ["MemoryItem", "MemoryType", "MemoryStore"]
