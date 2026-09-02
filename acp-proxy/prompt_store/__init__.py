"""
PromptStore v1.0 — 提示词仓库

功能特性：
- Prompt 版本管理：每次修改自动生成新版本，支持回滚到任意历史版本
- 变量模板引擎：支持 {{variable}} 占位符替换
- 多租户隔离：按 namespace 隔离 prompt
- Prompt 元数据：name, version, namespace, content, variables, tags, created_at

使用示例:
    from prompt_store import PromptStore

    store = PromptStore()
    store.save("greeting", "你好，{{user}}！欢迎来到 {{platform}}。", tags=["通知"])
    text = store.render("greeting", {"user": "张三", "platform": "OpenMate"})
    print(text)  # 你好，张三！欢迎来到 OpenMate。
"""

from .models import PromptTemplate
from .store import PromptStore

__all__ = ["PromptTemplate", "PromptStore"]
__version__ = "1.0.0"
