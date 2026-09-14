"""
上下文窗口分析器 — 借鉴LLMLingua/MicroPEFT上下文压缩研究
核心思想：分析上下文中每个组件的token占用，识别压缩机会，自动优化
"""

import logging
import json
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.context-analyzer")


@dataclass
class ContextComponent:
    component_id: str
    name: str
    content: str
    category: str  # "system", "tools", "messages", "memory", "files"
    token_count: int = 0
    importance: float = 0.5  # 0.0 - 1.0
    compressible: bool = True
    compressed_content: str = ""

    def __post_init__(self):
        if not self.token_count:
            self.token_count = len(self.content) // 3


@dataclass
class AnalysisReport:
    total_tokens: int
    budget: int
    usage_percent: float
    components: list[ContextComponent] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    compressible_tokens: int = 0
    critical_tokens: int = 0


class ContextAnalyzer:
    """上下文窗口分析器"""

    def __init__(self, model_max_tokens: int = 128000):
        self.model_max = model_max_tokens
        self._analysis_history: list[AnalysisReport] = []

    def analyze(self, components: list[ContextComponent]) -> AnalysisReport:
        """分析上下文组成"""
        total = sum(c.token_count for c in components)
        usage = total / self.model_max if self.model_max else 0

        compressible = sum(
            c.token_count for c in components if c.compressible
        )
        critical = sum(
            c.token_count for c in components if not c.compressible
        )

        recommendations = self._generate_recommendations(components, total, usage)

        report = AnalysisReport(
            total_tokens=total,
            budget=self.model_max,
            usage_percent=round(usage * 100, 1),
            components=sorted(components, key=lambda c: c.token_count, reverse=True),
            recommendations=recommendations,
            compressible_tokens=compressible,
            critical_tokens=critical,
        )

        self._analysis_history.append(report)
        return report

    def _generate_recommendations(
        self,
        components: list[ContextComponent],
        total: int,
        usage: float,
    ) -> list[str]:
        """生成优化建议"""
        recs = []

        if usage > 0.9:
            recs.append("🔴 上下文使用率超过90%，需要立即压缩！")
        elif usage > 0.7:
            recs.append("🟡 上下文使用率超过70%，建议压缩")

        # 找最大的token消耗者
        sorted_comps = sorted(components, key=lambda c: c.token_count, reverse=True)
        for comp in sorted_comps[:3]:
            if comp.compressible and comp.token_count > 1000:
                pct = comp.token_count / total * 100
                recs.append(
                    f"💡 {comp.name}占用{comp.token_count} tokens ({pct:.0f}%)，可压缩"
                )

        # 工具定义占比
        tool_tokens = sum(
            c.token_count for c in components if c.category == "tools"
        )
        if tool_tokens > total * 0.3:
            recs.append(
                f"💡 工具定义占用{tool_tokens} tokens ({tool_tokens/total*100:.0f}%)，"
                "考虑减少工具数量或精简描述"
            )

        # 消息历史占比
        msg_tokens = sum(
            c.token_count for c in components if c.category == "messages"
        )
        if msg_tokens > total * 0.5:
            recs.append(
                f"💡 消息历史占用{msg_tokens} tokens ({msg_tokens/total*100:.0f}%)，"
                "建议启用对话摘要压缩"
            )

        return recs

    def suggest_compression(
        self,
        components: list[ContextComponent],
        target_tokens: int,
    ) -> list[tuple[str, float]]:
        """建议压缩方案

        返回：[(组件ID, 建议压缩到的比例)]
        """
        current_total = sum(c.token_count for c in components)
        need_reduction = current_total - target_tokens

        if need_reduction <= 0:
            return []

        # 按可压缩性+重要性排序
        compressible = [
            c for c in components if c.compressible
        ]
        compressible.sort(key=lambda c: (c.importance, c.token_count))

        suggestions = []
        remaining = need_reduction

        for comp in compressible:
            if remaining <= 0:
                break

            # 计算压缩比例（重要性越低，压缩越多）
            max_compression = 1.0 - comp.importance * 0.5  # 最多压缩50%×(1-重要性)
            possible_reduction = comp.token_count * max_compression

            if possible_reduction > 0:
                actual_reduction = min(possible_reduction, remaining)
                compression_ratio = actual_reduction / comp.token_count
                target_ratio = 1.0 - compression_ratio

                suggestions.append((comp.component_id, round(target_ratio, 2)))
                remaining -= actual_reduction

        return suggestions

    def get_stats(self) -> dict:
        if not self._analysis_history:
            return {"total_analyses": 0}

        latest = self._analysis_history[-1]
        return {
            "total_analyses": len(self._analysis_history),
            "latest_usage_percent": latest.usage_percent,
            "latest_total_tokens": latest.total_tokens,
            "compressible_tokens": latest.compressible_tokens,
            "critical_tokens": latest.critical_tokens,
            "recommendations_count": len(latest.recommendations),
        }
