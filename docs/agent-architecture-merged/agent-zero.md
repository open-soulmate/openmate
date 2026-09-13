# Agent Zero

## 概述

Agent Zero 是一个通用AI Agent。

**仓库**: https://github.com/agent0ai/agent-zero | **语言**: Python

## 核心架构

> 仓库：[frdel/agent-zero](https://github.com/agent0ai/agent-zero)
> 定位：「给你的 Agent 一台完整的 Linux 计算机」——基于 Docker 化 Linux 桌面的开源智能体框架
> 分析日期：2026-09-13

Agent Zero 是一个以「**环境即能力**」为核心理念的 AI Agent 框架。与传统 Agent 框架（如 LangChain、AutoGen）侧重于工具调用链编排不同，Agent Zero 的核心主张是：**让 Agent 拥有一个真实的、隔离的 Linux 桌面环境**，从而获得文件操作、终端执行、GUI 应用驱动、浏览器交互等全方位能力。

这种设计哲学源于一个关键洞察：许多现实任务（操作 Blender、使用 LibreOffice、浏览网页并标注 UI 问题）无法通过纯 API 工具链完成，必须拥有一个**可交互的真实运行环境**。Agent Zero 通过 Docker 容器运行完整的 XFCE 桌面会话，将「环境」本身变成了 Agent 的最大工具。

项目由 frdel（Jan Tomášek）发起，目前由 agent0ai 组织维护，社区活跃度高，拥有 100+ 社区插件，Discord 社区和 Skool 学习社区。

Agent Zero 的运行时分为三层：

[详见源码]

整个系统通过 Docker 运行，用户数据持久化在 `/a0/usr` 卷中。容器内运行完整的 Linux 发行版，Agent 可以像人类用户一样操作桌面环境中的任何软件。

Agent Zero 的提示词系统是其架构中最具特色的设计之一。所有提示词存放在 `prompts/` 目录下，采用**模块化模板**结构，支持 `{{ include }}` 指令进行组合。

| 模块 | 职责 |
|------|------|
| `agent.system.main.role.md` | 定义角色：自主 JSON AI Agent |
| `agent.system.main.specifics.md` | 具体行为规范 |
| `agent.system.main.environment.md` | 环境信息注入 |
| `agent.system.main.communication.md` | JSON 通信协议格式 |
| `agent.system.main.solving.md` | 问题解决方法论（4 步流程） |
| `agent.system.main.tips.md` | 补充提示和技巧 |
| `agent.system.tools.md` | 可用工具列表（动态注入 `{{tools}}`） |
| `agent.system.skills.md` | 技能系统描述（动态注入 `{{skills}}`） |
| `agent.system.behaviour.md` | 行为规则（动态注入 `{{rules}}`） |
| `agent.system.tool.call_sub.md` | 子代理调用协议 |
| `agent.system.tool.parallel.md` | 并行工具调用协议 |

这种设计的好处是**极高的可定制性**——用户可以直接编辑任何一个模块文件来改变 Agent 的行为，无需修改核心代码。提示词不再是黑盒，而是透明、可审查、可替换的配置文件。

记忆分为多个维度：
- **Memories**——稳定的偏好、事实、约束（非任务历史）
- **Skills**——可复用的技能和过程
- **Knowledge**——项目知识库

Agent 在解决问题时的流程明确规定：「先检查记忆和技能，优先使用技能」。记忆是跨会话持久化的，而技能可按需加载或从聊天输入中固定。

| 维度 | 核心特征 |
|------|----------|
| **运行环境** | 完整 Docker 化 Linux 桌面（XFCE），而非沙盒终端 |
| **通信协议** | 严格 JSON 工具调用，非 function calling |
| **提示词系统** | 模块化模板引擎，`{{ include }}` 组合，完全透明可编辑 |
| **工具生态** | 内置工具 + 100+ 社区插件 + MCP + A2A |
| **多 Agent** | 层级式子代理委托（A0→A1→A2），支持并行扇出 |
| **浏览器** | DOM 标注模式（Change/Inspect/Lift/Comment），非被动浏览 |
| **项目隔离** | 每个项目独立的工作空间、记忆、密钥、模型预设 |


## 关键技术

Agent Zero 的 LLM 通信采用**严格的 JSON 格式**，而非 OpenAI 风格的 function calling。每次 Agent 响应必须是如下结构：

[详见源码]json
{
  "tool_name": "parallel",
  "tool_args": {
    "tool_calls": [
      { "tool_name": "call_subordinate", "tool_args": {"message": "研究选项A", "reset": true} },
      { "tool_name": "search_engine", "tool_args": {"query": "API 变更日志"} }
    ],
    "wait": true
  }
}
```

约束条件清晰：不用于有依赖关系的步骤、不嵌套 parallel、不把 `response` 放入并行组、`call_subordinate` 在并行中使用独立子 Agent 生命周期。

记忆分为多个维度：
- **Memories**——稳定的偏好、事实、约束（非任务历史）
- **Skills**——可复用的技能和过程
- **Knowledge**——项目知识库

Agent 在解决问题时的流程明确规定：「先检查记忆和技能，优先使用技能」。记忆是跨会话持久化的，而技能可按需加载或从聊天输入中固定。

Agent Zero 的安全考量体现了对「Agent 拥有真实环境」的审慎态度：

1. **保持在 Docker 或隔离环境内运行**
2. **不要挂载整个 home 目录**（除非理解风险）
3. **A0 CLI 的读写和远程代码执行权限**只授予信任的机器和工作区
4. **密钥存储在项目 secrets 或设置中**，不要放在提示词或公开文件中
5. **涉及账户、资金、生产系统、私人数据的操作**需要人工审查
6. **为重要工作区保留备份**

---

## 对openmate的启示

1. **Protocol vs extras context channels** with temporary/persistent split — cleaner than one flat system prompt.
2. **Extension hooks at every hist_add / prompt / loop boundary** — enable memory recall without forking core.
3. **`_NN_name.py` priority-ordered extensions** — simple, greppable.
4. **Core re-raises; extensions decide** — policy stays out of the kernel.
5. **Three model tiers** (chat/utility/embedding) with independent config.
6. **Store ctx window text + approx tokens** on the agent for downstream tools.
7. **Nudge as injectable system message**, not a special API call.
8. **Pro

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（76-agent-zero.md）
- MiMo报告（agent-zero-l1.md）
- MiMo卡片（agent-zero.md）
