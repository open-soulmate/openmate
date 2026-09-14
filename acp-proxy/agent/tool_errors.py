"""工具失败三级处理 + Doom Loop 检测

借鉴自：
- goose 的 Errors as Prompts（错误当提示回注）
- LangGraph 的工具失败策略
- Dify 的节点级错误三态（ignore/warn/raise）

核心思想：
1. 工具失败不是异常，是信息——结构化回注给模型
2. 同样的错误重复出现 = doom loop，必须中断
3. 不同工具不同策略：读文件失败可以重试，删除文件失败必须停止
"""

import time
import logging
import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger("acp-agent.tool-errors")


class FailureAction(str, Enum):
    IGNORE = "ignore"    # 忽略，给模型一个空结果
    WARN = "warn"        # 警告，把错误信息回注给模型让它自己决定
    RAISE = "raise"      # 抛出，中断当前任务


class ErrorCategory(str, Enum):
    NETWORK = "network"          # 网络错误
    PERMISSION = "permission"    # 权限错误
    NOT_FOUND = "not_found"      # 资源不存在
    VALIDATION = "validation"    # 参数校验失败
    RATE_LIMIT = "rate_limit"    # 限流
    INTERNAL = "internal"        # 内部错误
    TIMEOUT = "timeout"          # 超时
    UNKNOWN = "unknown"


@dataclass
class ToolError:
    """结构化的工具错误"""
    tool_name: str
    error_message: str
    category: ErrorCategory
    action: FailureAction
    attempt: int = 1
    args_hash: str = ""
    timestamp: float = field(default_factory=time.time)
    
    def to_model_message(self) -> str:
        """转换为给模型看的错误提示"""
        emoji = {
            ErrorCategory.NETWORK: "🌐",
            ErrorCategory.PERMISSION: "🔒",
            ErrorCategory.NOT_FOUND: "🔍",
            ErrorCategory.VALIDATION: "⚠️",
            ErrorCategory.RATE_LIMIT: "🚦",
            ErrorCategory.INTERNAL: "💥",
            ErrorCategory.TIMEOUT: "⏱️",
            ErrorCategory.UNKNOWN: "❓",
        }.get(self.category, "❓")
        
        hint = {
            ErrorCategory.NETWORK: "网络问题，可以稍后重试或换一个URL",
            ErrorCategory.PERMISSION: "权限不足，需要用户授权或换一个路径",
            ErrorCategory.NOT_FOUND: "文件/资源不存在，检查路径是否正确",
            ErrorCategory.VALIDATION: "参数格式不对，检查参数类型和格式",
            ErrorCategory.RATE_LIMIT: "请求太频繁，等一下再试",
            ErrorCategory.INTERNAL: "内部错误，不要重复相同的调用",
            ErrorCategory.TIMEOUT: "操作超时，可以简化操作或分步执行",
            ErrorCategory.UNKNOWN: "未知错误，不要重复相同的调用",
        }.get(self.category, "")
        
        return (
            f"{emoji} 工具 `{self.tool_name}` 调用失败 "
            f"(第{self.attempt}次尝试)\n"
            f"错误类别: {self.category.value}\n"
            f"错误信息: {self.error_message[:500]}\n"
            f"建议: {hint}"
        )


@dataclass
class DoomLoopState:
    """Doom loop检测状态"""
    error_hashes: list[str] = field(default_factory=list)  # 最近的错误hash
    error_timestamps: list[float] = field(default_factory=list)
    consecutive_failures: int = 0
    last_success_time: float = field(default_factory=time.time)
    
    def record_error(self, error_hash: str):
        now = time.time()
        self.error_hashes.append(error_hash)
        self.error_timestamps.append(now)
        self.consecutive_failures += 1
        # 只保留最近20个
        if len(self.error_hashes) > 20:
            self.error_hashes = self.error_hashes[-20:]
            self.error_timestamps = self.error_timestamps[-20:]
    
    def record_success(self):
        self.consecutive_failures = 0
        self.last_success_time = time.time()
    
    def is_doom_loop(
        self,
        current_hash: str,
        window_seconds: float = 60.0,
        same_error_threshold: int = 3,
        consecutive_threshold: int = 5,
    ) -> tuple[bool, str]:
        """检测是否陷入doom loop
        
        Returns:
            (is_doom_loop, reason)
        """
        now = time.time()
        
        # 规则1: 同一个错误在窗口期内出现>=N次
        recent_same = sum(
            1 for h, t in zip(self.error_hashes, self.error_timestamps)
            if h == current_hash and now - t < window_seconds
        )
        if recent_same >= same_error_threshold:
            return True, (
                f"同一个错误在{window_seconds}秒内出现了{recent_same}次，"
                f"继续重试没有意义"
            )
        
        # 规则2: 连续失败次数过多
        if self.consecutive_failures >= consecutive_threshold:
            return True, (
                f"连续失败{self.consecutive_failures}次，"
                f"可能陷入了循环"
            )
        
        # 规则3: 最近的错误hash有大量重复（不一定是同一个）
        if len(self.error_hashes) >= 6:
            recent = self.error_hashes[-6:]
            unique = len(set(recent))
            if unique <= 2:  # 6次错误只有2种不同的
                return True, (
                    f"最近6次错误只有{unique}种不同的类型，"
                    f"可能在重复无效操作"
                )
        
        return False, ""


class ToolErrorHandler:
    """工具错误处理器
    
    Usage:
        handler = ToolErrorHandler()
        
        # 注册工具的失败策略
        handler.register_tool("read_file", FailureAction.WARN)
        handler.register_tool("delete_file", FailureAction.RAISE)
        handler.register_tool("web_search", FailureAction.WARN)
        
        # 处理工具调用
        try:
            result = await tool_fn(**args)
            handler.record_success(session_id, tool_name)
            return result
        except Exception as e:
            error = handler.handle_error(session_id, tool_name, e, args)
            if error.action == FailureAction.RAISE:
                raise
            return error.to_model_message()  # 回注给模型
    """
    
    def __init__(self):
        self._tool_policies: dict[str, FailureAction] = {}
        self._default_policy = FailureAction.WARN
        self._session_doom: dict[str, DoomLoopState] = {}
        self._error_log: list[ToolError] = []
    
    def register_tool(self, tool_name: str, action: FailureAction):
        self._tool_policies[tool_name] = action
    
    def _categorize_error(self, error: Exception) -> ErrorCategory:
        """自动分类错误"""
        error_str = str(error).lower()
        error_type = type(error).__name__.lower()
        
        if isinstance(error, (ConnectionError, ConnectionResetError)):
            return ErrorCategory.NETWORK
        if "timeout" in error_type or "timeout" in error_str:
            return ErrorCategory.TIMEOUT
        if "permission" in error_str or "denied" in error_str or "eacces" in error_str:
            return ErrorCategory.PERMISSION
        if "not found" in error_str or "enoent" in error_str or "404" in error_str:
            return ErrorCategory.NOT_FOUND
        if "rate" in error_str and "limit" in error_str:
            return ErrorCategory.RATE_LIMIT
        if "validation" in error_str or "invalid" in error_str or "schema" in error_str:
            return ErrorCategory.VALIDATION
        if "internal" in error_str or "500" in error_str:
            return ErrorCategory.INTERNAL
        return ErrorCategory.UNKNOWN
    
    def _hash_error(self, tool_name: str, error: Exception, args: dict) -> str:
        """生成错误指纹（用于doom loop检测）"""
        key = f"{tool_name}:{type(error).__name__}:{str(error)[:100]}"
        return hashlib.md5(key.encode()).hexdigest()[:8]
    
    def _get_doom_state(self, session_id: str) -> DoomLoopState:
        if session_id not in self._session_doom:
            self._session_doom[session_id] = DoomLoopState()
        return self._session_doom[session_id]
    
    def handle_error(
        self,
        session_id: str,
        tool_name: str,
        error: Exception,
        args: dict | None = None,
        attempt: int = 1,
    ) -> ToolError:
        """处理工具错误，返回结构化的ToolError"""
        category = self._categorize_error(error)
        action = self._tool_policies.get(tool_name, self._default_policy)
        error_hash = self._hash_error(tool_name, error, args or {})
        
        # 记录到doom loop状态
        doom_state = self._get_doom_state(session_id)
        doom_state.record_error(error_hash)
        
        # 检测doom loop
        is_doom, doom_reason = doom_state.is_doom_loop(error_hash)
        if is_doom:
            logger.warning(
                f"[doom-loop] Detected in session {session_id}: {doom_reason}"
            )
            action = FailureAction.RAISE  # 强制升级为RAISE
        
        tool_error = ToolError(
            tool_name=tool_name,
            error_message=str(error),
            category=category,
            action=action,
            attempt=attempt,
            args_hash=error_hash,
        )
        
        self._error_log.append(tool_error)
        # 只保留最近100条
        if len(self._error_log) > 100:
            self._error_log = self._error_log[-100:]
        
        if action == FailureAction.RAISE:
            logger.error(
                f"[tool-error] RAISE: {tool_name} — {error} "
                f"(category={category.value}, doom_loop={is_doom})"
            )
        elif action == FailureAction.WARN:
            logger.warning(
                f"[tool-error] WARN: {tool_name} — {error} "
                f"(category={category.value})"
            )
        else:
            logger.debug(f"[tool-error] IGNORE: {tool_name} — {error}")
        
        return tool_error
    
    def record_success(self, session_id: str, tool_name: str):
        """记录工具调用成功，重置doom loop计数"""
        doom_state = self._get_doom_state(session_id)
        doom_state.record_success()
    
    def get_stats(self, session_id: str | None = None) -> dict:
        """获取错误统计"""
        recent = self._error_log[-50:] if not session_id else [
            e for e in self._error_log[-200:]
        ]
        
        by_category = {}
        for cat in ErrorCategory:
            count = sum(1 for e in recent if e.category == cat)
            if count:
                by_category[cat.value] = count
        
        by_tool = {}
        for e in recent:
            by_tool[e.tool_name] = by_tool.get(e.tool_name, 0) + 1
        
        doom_info = {}
        if session_id and session_id in self._session_doom:
            ds = self._session_doom[session_id]
            doom_info = {
                "consecutive_failures": ds.consecutive_failures,
                "recent_errors": len(ds.error_hashes),
                "last_success": f"{time.time() - ds.last_success_time:.0f}s ago",
            }
        
        return {
            "recent_errors": len(recent),
            "by_category": by_category,
            "by_tool": dict(sorted(by_tool.items(), key=lambda x: -x[1])[:10]),
            "doom_loop": doom_info,
        }
