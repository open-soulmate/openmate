"""会话上下文管理 — 维护消息历史、工作目录、压缩策略

每个Session独立的上下文管理器，负责消息存取、工作目录文件树扫描、
上下文压缩（超长时调用LLM做摘要）。
"""

import logging
import os
from typing import Optional

logger = logging.getLogger("acp-agent.context")

# 消息数量超过此阈值时触发压缩
COMPRESS_THRESHOLD = 30
# 压缩后保留的最近消息数
COMPRESS_KEEP = 10


class SessionContext:
    """会话上下文管理 — 维护消息历史、工作目录、压缩策略"""

    def __init__(self, session_id: str, workspace: str):
        """初始化会话上下文，绑定会话ID和工作目录"""
        self.session_id = session_id         # 所属会话ID
        self.workspace = workspace           # 工作目录路径
        self.messages: list[dict] = []       # 消息历史
        self._file_tree_cache: Optional[str] = None  # 文件树缓存

    def add_message(self, role: str, content: str, **extra):
        """添加消息到历史记录

        Args:
            role: 消息角色 (user/assistant/system/tool)
            content: 消息文本内容
            **extra: 额外字段（如tool_calls, name等）
        """
        msg = {"role": role, "content": content}
        msg.update(extra)
        self.messages.append(msg)
        logger.debug(f"[{self.session_id}] Added {role} message ({len(content)} chars)")

    def add_message_raw(self, msg: dict):
        """直接添加原始消息字典到历史记录

        用于tool_calls等需要精确控制消息结构的场景，
        避免add_message的content必填限制。

        Args:
            msg: 完整的消息字典（role, content, tool_calls等）
        """
        self.messages.append(msg)
        role = msg.get("role", "unknown")
        logger.debug(f"[{self.session_id}] Added raw {role} message")

    def get_messages(self) -> list[dict]:
        """获取完整消息历史"""
        return list(self.messages)

    def get_workspace_files(self, max_depth: int = 3) -> str:
        """列出工作目录文件树 — 用于注入LLM上下文

        扫描workspace目录，生成tree格式的文件结构文本。
        跳过常见的无关目录（node_modules, .git, __pycache__等）。
        """
        if self._file_tree_cache:
            return self._file_tree_cache

        SKIP_DIRS = {
            "node_modules", ".git", "__pycache__", ".next", "dist",
            "build", ".venv", "venv", ".mypy_cache", ".pytest_cache",
            ".hermes", "coverage", ".turbo",
        }
        SKIP_EXTENSIONS = {".pyc", ".pyo", ".so", ".o", ".a", ".dylib", ".lock"}

        lines = []
        try:
            for root, dirs, files in os.walk(self.workspace):
                # 计算当前深度
                rel = os.path.relpath(root, self.workspace)
                depth = 0 if rel == "." else rel.count(os.sep) + 1
                if depth >= max_depth:
                    dirs.clear()
                    continue
                # 跳过无关目录
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                # 生成缩进前缀
                indent = "  " * depth
                basename = os.path.basename(root) if rel != "." else os.path.basename(self.workspace)
                lines.append(f"{indent}{basename}/")
                for f in sorted(files):
                    ext = os.path.splitext(f)[1]
                    if ext not in SKIP_EXTENSIONS:
                        lines.append(f"{indent}  {f}")
        except Exception as e:
            lines.append(f"[Error listing files: {e}]")

        result = "\n".join(lines[:200])  # 最多200行
        self._file_tree_cache = result
        return result

    async def compress_if_needed(self, llm_engine) -> None:
        """如果消息超过阈值，调用LLM做摘要压缩

        将旧消息压缩为一条摘要消息，保留最近COMPRESS_KEEP条。
        """
        if len(self.messages) <= COMPRESS_THRESHOLD:
            return

        old_messages = self.messages[:-COMPRESS_KEEP]
        recent_messages = self.messages[-COMPRESS_KEEP:]

        # 构建压缩请求
        summary_parts = []
        for m in old_messages:
            role = m.get("role", "unknown")
            content = m.get("content", "")[:200]
            summary_parts.append(f"[{role}]: {content}")

        compress_prompt = (
            "请将以下对话压缩为简短摘要，保留关键信息（做了什么决策、修改了哪些文件、"
            "当前任务进度）：\n\n" + "\n".join(summary_parts)
        )

        try:
            summary = await llm_engine.chat([{"role": "user", "content": compress_prompt}])
            self.messages = [{"role": "system", "content": f"对话历史摘要：{summary}"}] + recent_messages
            logger.info(f"[{self.session_id}] Context compressed: {len(old_messages)} → summary + {len(recent_messages)}")
        except Exception as e:
            logger.warning(f"[{self.session_id}] Context compression failed: {e}")

    def clear_cache(self):
        """清除文件树缓存（文件变更后需要重新扫描）"""
        self._file_tree_cache = None
