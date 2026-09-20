"""
上下文预算管理器 — 借鉴Claude Code的context window管理策略
核心思想：智能分配token预算，优先保留系统提示+工具定义+最近消息
支持：动态裁剪、重要性加权、自动压缩触发
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional
from enum import IntEnum

logger = logging.getLogger("acp-proxy.context-budget")


class MessageImportance(IntEnum):
    """消息重要性等级 — 决定裁剪优先级"""
    CRITICAL = 100    # 系统提示、工具定义
    HIGH = 80         # 用户最新消息、AI最新回复
    MEDIUM = 60       # 工具调用结果
    NORMAL = 40       # 普通对话
    LOW = 20          # 旧的工具输出
    DISCARDABLE = 10  # 可丢弃的调试信息


@dataclass
class TokenBudget:
    """Token预算分配"""
    total_window: int = 128000
    system_reserve: int = 8000      # 系统提示+工具定义
    response_reserve: int = 8000    # 预留给响应的token
    min_recent_messages: int = 6    # 至少保留的最近消息数
    compression_threshold: float = 0.75  # 触发压缩的阈值

    @property
    def available_for_history(self) -> int:
        return self.total_window - self.system_reserve - self.response_reserve

    @property
    def compression_trigger_at(self) -> int:
        return int(self.available_for_history * self.compression_threshold)


@dataclass
class ManagedMessage:
    """带元数据的管理消息"""
    role: str
    content: str
    importance: MessageImportance = MessageImportance.NORMAL
    timestamp: float = field(default_factory=time.time)
    token_estimate: int = 0
    tool_call_id: str = ""
    compressed: bool = False

    def estimate_tokens(self) -> int:
        """粗略估算token数（中文1字≈1token，英文1词≈1.3token）"""
        if self.token_estimate:
            return self.token_estimate
        # 简单估算：字符数 / 2（中英混合）
        self.token_estimate = max(1, len(self.content) // 2)
        return self.token_estimate


class ContextBudgetManager:
    """上下文预算管理器"""

    def __init__(self, budget: Optional[TokenBudget] = None):
        self.budget = budget or TokenBudget()
        self._messages: list[ManagedMessage] = []
        self._total_tokens: int = 0
        self._compression_count: int = 0
        # 估算校准因子（d439f163遗留#3）：由token_attribution账本provider回填推出
        # （Σactual/Σestimated），manage()的裁剪估算=canonical estimate_tokens×此因子。
        # 默认1.0；调用方（soulmate_agent）在真实消息路径按TTL缓存刷新。
        self.calibration_factor: float = 1.0

    def manage(self, messages: list, max_tokens: Optional[int] = None) -> list:
        """按预算裁剪会话历史，返回供LLM请求使用的子集（原顺序保留）。

        背景（P0静默死路径修复）：soulmate_agent._prompt_inner此前调用本方法，但
        ContextBudgetManager上并不存在manage——AttributeError被except:pass静默吞掉，
        上下文预算裁剪从未生效（"写了≠接线了"）。本方法为该调用点的真实实现。

        估算公式（估算校准闭环）：token数用agent.token_attribution.estimate_tokens
        （canonical CJK感知公式，与归因/回填/校准同一公式——ManagedMessage的len//2
        旧估算仅用于add_message路径），再乘calibration_factor：provider视角系统性
        低估时提前触发裁剪，压缩决策与权威计数对齐。

        裁剪策略：从最旧的非保留消息开始丢弃；始终保留system消息与最后一条消息
        （即使其本身超预算——最新用户输入不可丢）；预算内不裁剪（原样返回副本）。
        空输入返回[]。fail-safe：方法内部不抛异常语义由调用方try/except兜底。
        """
        if not messages:
            return []
        from agent.token_attribution import estimate_tokens as _canonical_estimate

        target = max_tokens or self.budget.available_for_history
        factor = (
            self.calibration_factor
            if self.calibration_factor and self.calibration_factor > 0
            else 1.0
        )

        def _calibrated(msg) -> int:
            content = str((msg or {}).get("content", "") or "")
            return int(_canonical_estimate(content) * factor)

        last_idx = len(messages) - 1
        must_keep = {
            i
            for i, m in enumerate(messages)
            if str((m or {}).get("role", "") or "") == "system"
        } | {last_idx}

        total = sum(_calibrated(m) for m in messages)
        if total <= target:
            return list(messages)

        selected = set(must_keep)
        used = sum(_calibrated(messages[i]) for i in selected)
        for i in range(last_idx - 1, -1, -1):  # 次新→旧依次保留，预算尽即止（最旧先丢）
            if i in selected:
                continue
            tok = _calibrated(messages[i])
            if used + tok > target:
                break
            selected.add(i)
            used += tok
        result = [m for i, m in enumerate(messages) if i in selected]
        self._compression_count += 1
        logger.info(
            f"[context-budget] manage #{self._compression_count}: "
            f"{len(messages)}→{len(result)}条 "
            f"(~{total}→~{used} tokens, factor={factor:.4f}, target={target})"
        )
        return result

    def add_message(
        self,
        role: str,
        content: str,
        importance: MessageImportance = MessageImportance.NORMAL,
        tool_call_id: str = ""
    ) -> ManagedMessage:
        """添加消息到管理器"""
        msg = ManagedMessage(
            role=role,
            content=content,
            importance=importance,
            timestamp=time.time(),
            tool_call_id=tool_call_id,
        )
        msg.estimate_tokens()
        self._messages.append(msg)
        self._total_tokens += msg.token_estimate

        # 检查是否需要压缩
        if self._total_tokens > self.budget.compression_trigger_at:
            self._auto_compress()

        return msg

    def get_messages_for_llm(self, max_tokens: Optional[int] = None) -> list[dict]:
        """获取适合发送给LLM的消息列表（按预算裁剪）"""
        target = max_tokens or self.budget.available_for_history

        # 按重要性和时间排序：重要+新的优先保留
        scored = []
        for i, msg in enumerate(self._messages):
            # 新近度加权：越新越高
            recency_bonus = i * 0.5
            score = msg.importance + recency_bonus
            scored.append((score, i, msg))

        # 从高到低选择，直到预算用完
        scored.sort(key=lambda x: (-x[0], x[1]))
        selected_indices = set()
        used_tokens = 0

        for score, idx, msg in scored:
            if used_tokens + msg.token_estimate > target:
                continue
            selected_indices.add(idx)
            used_tokens += msg.token_estimate

        # 按原始顺序返回
        result = []
        for i, msg in enumerate(self._messages):
            if i in selected_indices:
                result.append({"role": msg.role, "content": msg.content})

        return result

    def _auto_compress(self):
        """自动压缩 — 合并旧的工具输出、截断长消息"""
        self._compression_count += 1
        original_tokens = self._total_tokens

        # 1. 压缩旧的工具输出（保留最近3个）
        tool_msgs = [
            (i, m) for i, m in enumerate(self._messages)
            if m.role == "tool" and not m.compressed
        ]
        if len(tool_msgs) > 3:
            for idx, msg in tool_msgs[:-3]:
                if len(msg.content) > 500:
                    self._messages[idx].content = msg.content[:200] + f"\n...[已压缩，原长{len(msg.content)}字]"
                    self._messages[idx].compressed = True
                    saved = msg.token_estimate - 100
                    self._total_tokens -= max(0, saved)

        # 2. 合并连续的assistant消息
        i = 0
        while i < len(self._messages) - 1:
            if (self._messages[i].role == "assistant" and
                self._messages[i + 1].role == "assistant" and
                not self._messages[i].compressed):
                merged = self._messages[i].content + "\n" + self._messages[i + 1].content
                self._messages[i].content = merged
                self._messages[i].token_estimate = 0
                self._messages[i].estimate_tokens()
                self._messages[i].compressed = True
                self._messages.pop(i + 1)
                self._recalculate_tokens()
            else:
                i += 1

        saved = original_tokens - self._total_tokens
        logger.info(
            f"Context auto-compressed #{self._compression_count}: "
            f"saved ~{saved} tokens ({original_tokens} -> {self._total_tokens})"
        )

    def _recalculate_tokens(self):
        self._total_tokens = sum(m.estimate_tokens() for m in self._messages)

    def get_stats(self) -> dict:
        return {
            "total_messages": len(self._messages),
            "total_tokens": self._total_tokens,
            "budget": {
                "total_window": self.budget.total_window,
                "available_for_history": self.budget.available_for_history,
                "compression_trigger_at": self.budget.compression_trigger_at,
            },
            "usage_percent": round(
                self._total_tokens / max(self.budget.available_for_history, 1) * 100, 1
            ),
            "compression_count": self._compression_count,
            "messages_by_role": {
                role: sum(1 for m in self._messages if m.role == role)
                for role in set(m.role for m in self._messages)
            },
        }

    def clear(self):
        self._messages.clear()
        self._total_tokens = 0
