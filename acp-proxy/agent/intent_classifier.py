"""
Agent意图分类器 — 借鉴Rasa NLU/DistilBERT意图检测
核心思想：快速分类用户意图，路由到最合适的处理策略
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

logger = logging.getLogger("acp-proxy.intent-classifier")


class Intent(str, Enum):
    CODING = "coding"           # 写代码/调试/测试
    FILE_OP = "file_operation"  # 文件读写/管理
    WEB_SEARCH = "web_search"   # 搜索/浏览网页
    RESEARCH = "research"       # 调研/分析
    WRITING = "writing"         # 写文章/文档
    SYSTEM = "system"           # 系统操作/终端命令
    CONVERSATION = "conversation"  # 闲聊/问答
    TASK_MANAGEMENT = "task_management"  # 任务管理/规划
    CONFIGURATION = "configuration"  # 配置/设置
    UNKNOWN = "unknown"


@dataclass
class IntentResult:
    intent: Intent
    confidence: float
    sub_intents: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    suggested_tools: list[str] = field(default_factory=list)


INTENT_PATTERNS: dict[Intent, dict] = {
    Intent.CODING: {
        "keywords": [
            "代码", "函数", "bug", "调试", "测试", "重构", "实现", "开发",
            "code", "function", "debug", "test", "refactor", "implement",
            "python", "javascript", "typescript", "java", "rust", "go",
            "报错", "错误", "修复", "fix", "error", "exception",
        ],
        "tools": ["terminal", "read_file", "write_file", "patch"],
        "weight": 1.2,  # 优先级加权
    },
    Intent.FILE_OP: {
        "keywords": [
            "文件", "目录", "读取", "写入", "创建", "删除", "复制", "移动",
            "file", "directory", "read", "write", "create", "delete", "copy", "move",
            "打开", "保存", "导出", "导入", "open", "save", "export", "import",
        ],
        "tools": ["read_file", "write_file", "search_files", "terminal"],
        "weight": 1.0,
    },
    Intent.WEB_SEARCH: {
        "keywords": [
            "搜索", "查询", "查找", "网上", "百度", "谷歌", "百度",
            "search", "google", "look up", "find online",
            "最新", "新闻", "资讯", "latest", "news",
        ],
        "tools": ["web_search", "web_extract", "browser_exec"],
        "weight": 1.0,
    },
    Intent.RESEARCH: {
        "keywords": [
            "调研", "分析", "研究", "对比", "评估", "报告",
            "research", "analyze", "study", "compare", "evaluate", "report",
            "为什么", "如何", "怎么样", "why", "how",
        ],
        "tools": ["web_search", "read_file", "write_file"],
        "weight": 0.9,
    },
    Intent.WRITING: {
        "keywords": [
            "写", "撰写", "编写", "文章", "文档", "方案", "报告", "总结",
            "write", "draft", "article", "document", "report", "summary",
            "公众号", "博客", "blog", "邮件", "email",
        ],
        "tools": ["write_file", "web_search"],
        "weight": 1.0,
    },
    Intent.SYSTEM: {
        "keywords": [
            "运行", "执行", "安装", "部署", "启动", "停止", "重启",
            "run", "execute", "install", "deploy", "start", "stop", "restart",
            "终端", "命令", "shell", "terminal", "command", "bash",
            "进程", "端口", "服务", "process", "port", "service",
        ],
        "tools": ["terminal"],
        "weight": 1.1,
    },
    Intent.TASK_MANAGEMENT: {
        "keywords": [
            "任务", "计划", "安排", "待办", "提醒", "定时",
            "task", "plan", "schedule", "todo", "remind", "cron",
            "步骤", "流程", "优先级", "step", "workflow", "priority",
        ],
        "tools": ["todo", "cronjob"],
        "weight": 0.8,
    },
    Intent.CONFIGURATION: {
        "keywords": [
            "配置", "设置", "修改", "调整", "偏好",
            "config", "settings", "configure", "adjust", "preference",
            "模型", "provider", "model", "端口", "port",
        ],
        "tools": ["read_file", "write_file", "terminal"],
        "weight": 0.7,
    },
}


class IntentClassifier:
    """意图分类器"""

    def __init__(self):
        self._stats = {
            "total_classified": 0,
            "by_intent": {},
        }

    def classify(self, message: str) -> IntentResult:
        """分类用户意图"""
        self._stats["total_classified"] += 1

        message_lower = message.lower()
        scores: dict[Intent, float] = {}
        matched_keywords: dict[Intent, list[str]] = {}

        for intent, config in INTENT_PATTERNS.items():
            score = 0.0
            keywords_found = []

            for keyword in config["keywords"]:
                if keyword in message_lower:
                    score += 1.0
                    keywords_found.append(keyword)

            if score > 0:
                # 应用权重
                score *= config["weight"]
                # 消息长度加权（短消息中关键词更重要）
                if len(message) < 50:
                    score *= 1.5
                scores[intent] = score
                matched_keywords[intent] = keywords_found

        if not scores:
            self._stats["by_intent"]["unknown"] = (
                self._stats["by_intent"].get("unknown", 0) + 1
            )
            return IntentResult(
                intent=Intent.UNKNOWN,
                confidence=0.0,
            )

        # 选择最高分的意图
        best_intent = max(scores, key=lambda k: scores[k])
        best_score = scores[best_intent]
        max_possible = len(INTENT_PATTERNS[best_intent]["keywords"]) * INTENT_PATTERNS[best_intent]["weight"]
        confidence = min(1.0, best_score / max_possible)

        # 次要意图
        sub_intents = [
            intent.value
            for intent, score in sorted(scores.items(), key=lambda x: x[1], reverse=True)
            if intent != best_intent and score > best_score * 0.5
        ]

        # 推荐工具
        suggested_tools = INTENT_PATTERNS[best_intent]["tools"]

        # 更新统计
        self._stats["by_intent"][best_intent.value] = (
            self._stats["by_intent"].get(best_intent.value, 0) + 1
        )

        return IntentResult(
            intent=best_intent,
            confidence=round(confidence, 2),
            sub_intents=sub_intents,
            keywords=matched_keywords.get(best_intent, []),
            suggested_tools=suggested_tools,
        )

    def get_routing_strategy(self, intent: Intent) -> dict:
        """获取意图对应的处理策略"""
        strategies = {
            Intent.CODING: {
                "max_iterations": 10,
                "enable_terminal": True,
                "enable_file_ops": True,
                "context_verbosity": "detailed",
            },
            Intent.FILE_OP: {
                "max_iterations": 5,
                "enable_terminal": True,
                "enable_file_ops": True,
                "context_verbosity": "normal",
            },
            Intent.WEB_SEARCH: {
                "max_iterations": 3,
                "enable_browser": True,
                "context_verbosity": "normal",
            },
            Intent.CONVERSATION: {
                "max_iterations": 1,
                "enable_terminal": False,
                "enable_file_ops": False,
                "context_verbosity": "concise",
            },
        }
        return strategies.get(intent, strategies[Intent.CONVERSATION])

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "known_intents": [i.value for i in Intent if i != Intent.UNKNOWN],
        }
