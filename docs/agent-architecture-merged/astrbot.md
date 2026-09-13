# AstrBot

## 概述

AstrBot 是一个多平台聊天机器人框架。

**仓库**: https://github.com/AstrBotDevs/AstrBot | **语言**: Python | **License**: AGPL

## 核心架构

> 项目地址：[AstrBotDevs/AstrBot](https://github.com/AstrBotDevs/AstrBot)
> 定位：开源全栈 AI Agent 聊天机器人平台，集成多种 IM 平台、LLM 模型、插件系统和 AI Agent 能力

AstrBot 采用**四层分层架构**，基于 Python 3.10+ 构建，全程使用 `asyncio` 实现非阻塞异步操作：

[详见源码]

核心入口 `main.py` 完成环境检查（Python 版本、目录创建、mimetype 修复），同步 WebUI 静态文件后，实例化 `AstrBotInit` 并调用其 `run()` 方法，同时启动核心生命周期任务和 Dashboard 服务，整个应用运行在单一 `asyncio` 事件循环下。

平台适配器是 AstrBot 多平台能力的核心，采用**装饰器注册 + 双类架构**：

每个平台集成由两个核心组件构成：
1. **Platform 子类**：处理连接生命周期、配置、出站消息路由
2. **AstrMessageEvent**：将平台原始消息标准化为统一事件对象

AstrBot 的插件称为 **Star**，是其最大亮点之一（1000+ 社区插件）：

`PlatformAdapterTypeFilter` 允许插件按平台类型过滤事件处理器，实现平台特定逻辑。

Provider 系统统一封装了多种 LLM 服务类型：

| 类型 | 代表 |
|------|------|
| Chat（文本生成） | OpenAI、Anthropic、Gemini、DeepSeek、Moonshot、智谱 |
| STT（语音转文字） | Whisper、SenseVoice、小米 MiMo Omni |
| TTS（文字转语音） | Edge TTS、FishAudio、GPT-Sovits、Azure TTS |
| LLMOps 平台 | Dify、阿里云百炼、Coze |
| 自托管 | Ollama、LM Studio |

`ProviderManager` 管理所有 Provider 实例，支持动态切换和多 Provider 并存。Provider 通过统一接口暴露能力，上层（Agent Runner / 插件）无需关心底层模型差异。

Agent Runner 是执行 AI Agent 能力的核心组件：

AstrBot 的核心设计理念是**"陪伴与能力不应矛盾"**——它既要做能理解情感、提供陪伴的机器人，又要做能可靠完成任务的 AI Agent。

从架构角度看，其关键设计决策包括：

1. **装饰器自动注册**：零配置的插件和适配器发现机制，极大降低了扩展门槛
2. **洋葱模型管线**：灵活的消息处理链，支持拦截、修改、增强
3. **双类适配器架构**：Platform（连接管理）+ MessageEvent（消息标准化）的清晰分离
4. **Agent Runner 抽象**：将 AI 能力执行层独立出来，既可用内置引擎也可接入第三方平台
5. **MCP 原生支持**：拥抱开放协议标准，工具能力可无限扩展
6. **单一事件循环**：全系统 asyncio 统一调度，避免线程安全问题

这种架构使 AstrBot 成为一个真正的**全栈 AI Agent 平台**——不仅是一个聊天机器人，更是连接 IM 平台、LLM 模型、工具服务和用户应用的统一基础设施。

## 关键技术

1. **Provider（说话）与 Agent Runner（思考）解耦**：这是 AstrBot 架构上最值得抄的一刀——"生成文本"与"工具调用循环"是两个职责，可独立替换；外接 Dify/Coze 正是靠这个边界。
2. **IM 渠道覆盖最广**：16+ 官方渠道，且每个渠道是 adapter，加渠道不改核心。
3. **插件生态 1000+**：插件市场 + 热重载，社区贡献规模大，是"能力可插拔"的范本。
4. **自动上下文压缩**：README:48 明确 Auto Context Compression——长对话自动压缩，防爆 context。
5. **Anthropic Skills 渐进式披露**：架构清单称 v4.13 起支持，解决工具过多导致的 token 膨胀——与 SKILL.md 标准对齐。
6. **沙盒隔离执行**：代码/Shell 在隔离沙盒跑，且会话级资源复用（不每次冷启动）。

- **Pipeline stage 化处理**：消息流拆成 stage 链，单 stage 出错可被 pipeline 框架捕获，不崩整个 bot。**架构认知**。
- **自动上下文压缩**（README:48）：长对话自动压缩，既省 token 也防"上下文超长导致请求失败"。
- **沙盒隔离**（README:52）：代码/Shell 在隔离环境执行，恶意/出错代码不影响宿主进程；会话级资源复用兼顾安全与性能。
- **多部署形态兜底**：Docker/Docker Compose 被 README 推荐为"更稳定、生产就绪"方式（README:87），`--restart` 类容器策略保证进程重启。
- **配置初始化分离**：`astrbot init`（首次）与 `astrbot run` 分离（README:75-76），避免首次运行与运行时混淆。
- **插件热重载**：插件可热加载，坏插件不强制重启主进程。
- **未逐行确认（如实）**：pipeline 的异常分类、重试退避、超时设置未读源码（llm_request_stage.py 路径 404）；上述为 README 能力描述 + 架构认知。

- **异步框架**：Python async 事件循环，IM I/O 与 LLM 调用异步，单进程可挂多渠道。**架构认知**。
- **多进程/多实例**：AstrBot Launcher 支持"隔离的多实例"（README:99）——一个实例崩了不影响其他。
- **Docker/Compose 生产部署**：README 推荐生产用 Docker（README:87），配合编排实现自愈。
- **插件隔离**：插件在沙盒/子环境跑，崩溃隔离。
- **状态外置**：配置/会话/知识库落 `data/`，重启可恢复。
- **局限（如实）**：单 bot 实例为主，未见内建多副本分布式协调；横向扩展靠多实例 + 各自数据。

- **自动上下文压缩（遗忘旧细节）**：README:48，长对话自动压缩——短期记忆的"遗忘"机制。
- **Skills 渐进式披露**：架构清单 v4.13 起支持 Anthropic Skills——按需加载技能说明，避免工具/技能过多撑爆上下文，相当于"技能侧的主动检索与遗忘"。
- **人设（Persona）**：README:48，可配置人格设定，随上下文注入。
- **知识库**：README:48，RAG 式外部知识随问随取。
- **插件市场即能力进化**：1000+ 插件按需安装，bot 能力随社区插件库持续增长。
- **未发现**：无在线权重训练、无自动 A/B；"进化"= 上下文压缩 + Skills 渐进披露 + 知识库 + 插件市场。

---

## 对openmate的启示

> 供 openmate 参考：多平台 IM 适配、插件（Star）生命周期、ToolLoop 常量、会话管理
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `AstrBotDevs/AstrBot@master`
> 版本锚点：`pyproject.toml` → `name = "AstrBot"`, `version = "4.28.0"`, `requires-python = ">=3.12"`, license AGPL-3.0-or-later

---

```python
class ToolLoopAgentRunner(BaseAgentRunner[TContext]):
    TOOL_RESULT_MAX_ESTIMATED_TOKENS = 27_500
    TOOL_RESULT_PREVIEW_MAX_ESTIMATED_TOKENS = 7000
    EMPTY_OUTPUT_RETRY_WAIT_MAX_S = 4
```

| 常量 | 值 | 含义 |
|---|---|---|
| `TOOL_RESULT_MAX_ESTIMATED_TOKENS` | **27500** | 工具结果超此值 → 物化到文件 |
| `TOOL_RESULT_PREVIEW_MAX_ESTIMATED_TOKENS` | **7000** | 预览截断阈值 |
| `EMPTY_OUTPUT_RETRY_WAIT_MAX_S` | **4** | 空输出重试最大等待秒 |

相关类型：

- `_HandleFunctionToolsResult`：从 `MessageChain` / tool_call_result_blocks / cached_image 构造
- `FollowUpTicket`：跟进票据
- `_ToolExecutionInterrupted`：工具执行被中断异常
- `MAX_S

把 AstrBot 当「多 IM 适配层参考」，不要当 Agent 内核参考：

| 抄什么 | 具体值 |
|---|---|
| 工具结果预览上限 | 7000 tokens |
| 工具结果物化阈值 | 27500 tokens |
| 空输出重试等待 | ≤4s |
| MCP 最大超时 | 300s（超则钳制） |
| MCP 快速连通测试 | 10s |
| 每 MCP 连接 | 独立 asyncio.Task（anyio cancel scope） |
| stdio 命令 | 白名单 + 参数校验 |
| 会话列表 | include_history 默认可关 |
| 无默认 provider | 显式警告 + startup fallback |
| 初始化顺序 | db → sp → renderer → config → persona → provider → kb → platform → cron |

**不要抄：** 13+ 平台适配器的全部实现细节（openmate 先做 2-3 个通道即可）；Dashboard Vue 全套。

**与 nanobot 互补：** nanobot 有崩溃恢复（pending_user_turn/checkpoint），AstrBot 没有同等机制——openmate 必须两者都抄。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（81-astrbot.md）
- 豆包（067_AstrBot.md）
- MiMo报告（astrbot-l1.md）
- MiMo卡片（astrbot.md）
