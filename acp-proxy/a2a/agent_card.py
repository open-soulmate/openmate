"""A2A AgentCard动态生成模块。

提供内置Agent卡片配置和查询接口。
每个Agent卡片描述其身份、能力、技能和通信地址。
"""

from __future__ import annotations

from typing import Optional

from a2a.models import AgentCapabilities, AgentCard, AgentSkill


def _build_skill(skill_id: str, name: str, description: str,
                 tags: list[str], examples: Optional[list[str]] = None) -> AgentSkill:
    """构建AgentSkill实例的辅助函数。"""
    return AgentSkill(id=skill_id, name=name, description=description,
                      tags=tags, examples=examples)


# ---------------------------------------------------------------------------
# 内置Agent卡片注册表
# ---------------------------------------------------------------------------

AGENT_CARD_REGISTRY: dict[str, AgentCard] = {
    "soulmate": AgentCard(
        name="SoulMate",
        description="通用对话与任务规划Agent，擅长理解用户意图、分解复杂任务并委派给合适的子Agent",
        version="0.2.2",
        url="/a2a/soulmate",
        capabilities=AgentCapabilities(
            streaming=True,
            pushNotifications=True,
            stateTransitionHistory=True,
        ),
        skills=[
            _build_skill(
                "chat", "通用对话", "与用户进行自然语言交互，理解需求并提供回应",
                ["conversation", "nlp", "understanding"],
                ["帮我分析一下这个需求", "你觉得这个方案怎么样"],
            ),
            _build_skill(
                "planning", "任务规划", "将复杂目标拆解为可执行的步骤序列",
                ["planning", "decomposition", "strategy"],
                ["帮我规划一个项目的开发步骤", "如何分阶段实现这个功能"],
            ),
            _build_skill(
                "task-delegation", "任务委派", "根据任务特征将子任务分配给最合适的Agent",
                ["delegation", "orchestration", "routing"],
                ["把这个任务交给Hermes处理", "谁适合做代码重构"],
            ),
        ],
        defaultInputModes=["text/plain", "application/json"],
        defaultOutputModes=["text/plain", "application/json"],
    ),

    "hermes": AgentCard(
        name="Hermes",
        description="任务拆解与编排Agent，专注于将大任务分解为子任务并协调多个Agent协作完成",
        version="0.2.2",
        url="/a2a/hermes",
        capabilities=AgentCapabilities(
            streaming=True,
            pushNotifications=True,
            stateTransitionHistory=True,
        ),
        skills=[
            _build_skill(
                "task-breakdown", "任务拆解", "将复杂任务递归分解为原子操作",
                ["breakdown", "decomposition", "planning"],
                ["把这个需求拆成子任务", "分析这个功能需要哪些步骤"],
            ),
            _build_skill(
                "sub-agent-delegation", "子Agent委派", "将子任务分配给专业Agent并跟踪执行进度",
                ["delegation", "agent-management", "monitoring"],
                ["分配代码任务给OpenCode", "检查子任务执行状态"],
            ),
            _build_skill(
                "orchestration", "编排协调", "管理多Agent间的依赖关系和执行顺序",
                ["orchestration", "workflow", "coordination"],
                ["先让A完成设计再让B编码", "并行执行这些独立任务"],
            ),
        ],
        defaultInputModes=["text/plain", "application/json"],
        defaultOutputModes=["text/plain", "application/json"],
    ),

    "opencode": AgentCard(
        name="OpenCode",
        description="代码工程Agent，专注于代码重构、patch生成和LSP查询等软件工程任务",
        version="0.2.2",
        url="/a2a/opencode",
        capabilities=AgentCapabilities(
            streaming=True,
            pushNotifications=False,
            stateTransitionHistory=True,
        ),
        skills=[
            _build_skill(
                "code-refactor", "代码重构", "对现有代码进行结构优化，提升可读性和可维护性",
                ["refactor", "code-quality", "clean-code"],
                ["重构这个模块的接口", "提取公共逻辑到工具函数"],
            ),
            _build_skill(
                "patch-generation", "Patch生成", "根据需求描述生成可直接应用的代码补丁",
                ["patch", "diff", "code-generation"],
                ["生成一个修复bug的patch", "为这个接口添加参数校验"],
            ),
            _build_skill(
                "lsp-query", "LSP查询", "通过Language Server Protocol查询代码结构信息",
                ["lsp", "code-analysis", "navigation"],
                ["查找这个函数的所有调用点", "这个类继承了哪些接口"],
            ),
        ],
        defaultInputModes=["text/plain", "application/json"],
        defaultOutputModes=["text/plain", "application/json"],
    ),
}


def get_agent_card(name: str) -> Optional[AgentCard]:
    """根据Agent名称获取AgentCard。

    Args:
        name: Agent名称（不区分大小写）

    Returns:
        匹配的AgentCard，不存在则返回None
    """
    return AGENT_CARD_REGISTRY.get(name.lower())


def list_agent_cards() -> list[AgentCard]:
    """列出所有已注册的AgentCard。

    Returns:
        AgentCard列表
    """
    return list(AGENT_CARD_REGISTRY.values())
