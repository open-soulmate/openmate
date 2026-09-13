# CAMEL

## 概述

CAMEL 是一个多Agent角色扮演框架。

**仓库**: https://github.com/camel-ai/camel | **语言**: Python | **License**: Apache-2.0

## 核心架构

> **项目**: camel-ai/camel  
> **GitHub**: https://github.com/camel-ai/camel  
> **Stars**: 17,600+ | **Forks**: 2,000+ | **许可证**: Apache 2.0  
> **论文**: "CAMEL: Communicative Agents for 'Mind' Exploration of Large Language Model Society" (NeurIPS 2023)  
> **定位**: 第一个 LLM 多智能体框架，专注于发现智能体的规模化定律 (Scaling Laws of Agents)

CAMEL 的核心创新是 **角色扮演 (Role-Playing)** 协调机制，源自 NeurIPS 2023 论文。其核心问题是：如何让两个 LLM 代理自主协作完成任务，而无需人类持续干预？

**Inception Prompting 机制**：
- **AI User** (指令发起者)：扮演"用户"角色，给出高层指令和任务方向
- **AI Assistant** (执行者)：扮演"助手"角色，执行具体任务并返回结果
- **Critic** (可选评审者)：评估对话质量和任务完成度

关键洞察：无约束的代理对在 2-3 轮对话内就会发生角色反转——助手开始发号施令，用户开始提问，任务失败。CAMEL 通过 **系统提示中嵌入 "Never flip roles!"** 指令来维持角色一致性，这是一种提示级别的约束而非框架级强制。

**对话流程**：
[详见源码]python
model = ModelFactory.create(
    model_platform=ModelPlatformType.OPENAI,
    model_type=ModelType.GPT_4O,
)
[详见源码]
┌─────────────────────────────────────────────────────────────┐
│                    CAMEL Framework                           │
├─────────────────────────────────────────────────────────────┤
│  Societies Layer                                            │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │   RolePlaying     │  │        Workforce              │    │
│  │  (双代理角色扮演)  │  │  (多代理层级编排)              │    │
│  │  User ↔ Assistant │  │  Coordinator → Workers        │    │
│  │  + Critic (可选)  │  │  + Task Agent + Dynamic       │    │
│  └──────────────────┘  └──────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer                                                │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ChatAgent│ │CriticAgent│ │TaskAgent │ │RoleAssignAgent│   │
│  └────┬────┘ └──────────┘ └──────────┘ └──────────────┘   │
│       │                                                     │
├───────┼─────────────────────────────────────────────────────┤
│       │  Infrastructure Layer                               │
│  ┌────┴────┐ ┌─────────

## 关键技术

CAMEL 的核心创新是 **角色扮演 (Role-Playing)** 协调机制，源自 NeurIPS 2023 论文。其核心问题是：如何让两个 LLM 代理自主协作完成任务，而无需人类持续干预？

**Inception Prompting 机制**：
- **AI User** (指令发起者)：扮演"用户"角色，给出高层指令和任务方向
- **AI Assistant** (执行者)：扮演"助手"角色，执行具体任务并返回结果
- **Critic** (可选评审者)：评估对话质量和任务完成度

关键洞察：无约束的代理对在 2-3 轮对话内就会发生角色反转——助手开始发号施令，用户开始提问，任务失败。CAMEL 通过 **系统提示中嵌入 "Never flip roles!"** 指令来维持角色一致性，这是一种提示级别的约束而非框架级强制。

**对话流程**：
[详见源码]python
from camel.memories import (
    AgentMemory,        # 代理级记忆
    ChatHistoryMemory,  # 聊天历史记忆
    MemoryRecord,       # 记忆记录单元
    ScoreBasedContextCreator,  # 基于评分的上下文创建器
)
```

**记忆架构**：
- **短期记忆**：当前对话的完整历史
- **长期记忆**：跨会话的持久化存储（通过 `JsonStorage`）
- **工作记忆**：`ScoreBasedContextCreator` 根据相关性评分选择性加载上下文
- **记忆记录**：每条 `MemoryRecord` 包含内容、时间戳、相关性分数等元数据

CAMEL 生态中的 OASIS (Open Agent Social Interaction Simulations) 项目实现了 **百万级代理社交仿真**：

- **规模**：支持最多 100 万 LLM 代理同时交互
- **平台模拟**：模拟 X (Twitter)、Reddit 等社交媒体平台
- **研究场景**：虚假信息传播、羊群效应、舆论形成等社会现象
- **架构**：专用数据库 + 推荐系统 + 代理模块 + 时间引擎
- **论文**：NeurIPS 2024 收录

OASIS 继承了 CAMEL 的 `ChatAgent`，并引入异步机制加速大规模并发代理仿真。

1. **角色扮演是最简多代理协调原语**：两个代理、互补角色、轮替对话，就足以产生高质量合成数据
2. **提示级约束优于框架级强制**：通过系统提示维持角色一致性，保持了灵活性
3. **规模化是研究目标而非工程目标**：OASIS 的百万级仿真是为了发现代理行为的涌现规律
4. **闭环数据生成是护城河**：代理生成数据 → 训练模型 → 更好代理的自举循环
5. **工具生态是粘性来源**：80+ 工具包构成了难以复制的生态系统

## 对openmate的启示

> 仓库: https://github.com/camel-ai/camel  
> 抓取通道: cdn.jsdelivr.net/gh/camel-ai/camel@master  
> 版本快照: master @ 2026-09-13（`README.md` 35KB + `camel/agents/chat_agent.py` 264KB + `camel/toolkits/base.py` 6KB 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 角色扮演、工具调用循环、迭代上限、Toolkit 抽象与模型兼容层借鉴

---

| 需求 | CAMEL 机制 | 可复用度 |
|------|-----------|----------|
| 工具循环上限 | max_iteration（默认 None） | 高（但默认无上限是坑） |
| Toolkit 打包 | BaseToolkit.get_tools() | 高 |
| 多模型 | 兼容层 | 高 |
| 角色扮演 | User/Assistant 双 Agent | 中 |
| 多 Agent 协作 | Workforce | 中 |
| 终止条件 | termination 检查 + 日志 | 高 |

---

| CAMEL | openmate 建议 |
|-------|---------------|
| `max_iteration=None` 默认 | **必须设非零默认**（如 20） |
| 达限 break + 日志 | 优雅降级，不抛异常 |
| BaseToolkit + get_tools() | 工具打包单元 |
| toolkit.timeout | 统一工具超时 |
| ModelProcessingError + iteration | 错误带循环上下文 |
| system_message 必填 | 必填校验 |
| 264KB God Class | 拆分为多个协作类 |
| Workforce | 多 Agent 协作（P2） |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（26-camel.md）
- MiMo报告（camel-l1.md）
- MiMo卡片（camel.md）
