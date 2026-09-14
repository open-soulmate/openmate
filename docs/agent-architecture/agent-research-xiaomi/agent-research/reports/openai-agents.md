# openai/openai-agents-python 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/openai/openai-agents-python |
| 语言 | Python 3.10+ |
| License | MIT（开源 SDK） |
| 定位一句话 | **轻量多 Agent 工作流框架**：Handoffs + Guardrails + Sessions + Tracing，provider 无关（100+ LLM） |
| 商业 | OpenAI API 优先；无独立商业订阅 |
| 文档 | openai.github.io/openai-agents-python/ |

> 对 openmate：OpenAI Agents SDK 是「**最小原语**」路线——Agent、Handoff、Tool、Guardrail、Session、Trace 六个概念即可构建多 Agent 系统。openmate 若要保持 API 表面积极简、同时保留生产级 tracing 与会话，这是最直接的参考实现。

---

## 1. 系统架构

### 1.1 六个核心概念

| 概念 | 说明 |
|---|---|
| **Agents** | 配置了 instructions、tools、guardrails、handoffs 的 LLM |
| **Handoffs** | Agent 间任务委派（表示为工具 `transfer_to_<agent>`） |
| **Tools** | 函数工具、MCP、hosted tools；Agent-as-Tool |
| **Guardrails** | 输入/输出可配置安全检查 |
| **Sessions** | 跨 run 的自动对话历史管理 |
| **Tracing** | 内置 run 追踪，可视化调试与优化 |

### 1.2 四类 Agent 运行形态

| 形态 | 场景 |
|---|---|
| **Text Agent** | 无需持久连接或沙箱的常规工作流 |
| **Sandbox Agent** | 需要检查文件、跑命令、打补丁、跨长任务保留工作区状态 |
| **Realtime Agent** | 低延迟服务端语音/多模态（WebSocket） |
| **Voice Agent** | STT + Agent 工作流 + TTS 管线 |

### 1.3 最小示例

```python
from agents import Agent, Runner

agent = Agent(name="Assistant", instructions="You are a helpful assistant")
result = Runner.run_sync(agent, "Write a haiku about recursion in programming.")
print(result.final_output)
```

---

## 2. 核心机制深潜

### 2.1 Handoffs（多 Agent 协调核心）

Handoff 表示为 LLM 可见的工具：对名为 `Refund Agent` 的 handoff，工具名为 `transfer_to_refund_agent`。

```python
from agents import Agent, handoff

billing_agent = Agent(name="Billing agent")
refund_agent = Agent(name="Refund agent")
triage_agent = Agent(name="Triage agent", handoffs=[billing_agent, handoff(refund_agent)])
```

**`handoff()` 参数**：

| 参数 | 作用 |
|---|---|
| `agent` | 目标 Agent |
| `tool_name_override` / `tool_description_override` | 覆盖默认工具名/描述 |
| `on_handoff` | 委派触发时的回调（可预取数据） |
| `input_type` | LLM 生成的结构化输入 schema（如 reason、priority） |
| `input_filter` | 过滤下一 Agent 看到的输入 |
| `is_enabled` | 运行时动态启用/禁用（布尔或函数） |
| `nest_handoff_history` | 覆盖 RunConfig 级嵌套历史设置 |

**关键语义**：
- handoff 在单次 run 内发生；input guardrail 只作用于链中第一个 Agent，output guardrail 只作用于产出最终输出的 Agent
- `input_type` 是模型生成的元数据，**不**选择目标 Agent（多目标需注册多个 handoff）
- 授权检查应在 `on_handoff` 开头做，失败应 raise
- 需要结构化输入但不想转移对话时，用 `Agent.as_tool(parameters=...)`

**input_filter 与 HandoffInputData**：
```python
# HandoffInputData 包含：
# - input_history: Runner.run 前的输入历史
# - pre_handoff_items: 触发 handoff 的轮次之前生成的项
# - new_items: 当前轮次生成的项（含 handoff call 与 output）
# - input_items: 可选，替代 new_items 转发给下一 Agent
# - run_context: 触发时的 RunContextWrapper
```

**预置过滤器**：`agents.extensions.handoff_filters.remove_all_tools` 等。

**嵌套历史（beta）**：`RunConfig.nest_handoff_history=True` 时，可摘要历史压缩为有序 assistant summary 段，无损消息保持原位；Sessions/RunState/RunResult 跟踪精确消息位置避免重复追加。

**推荐提示**：`agents.extensions.handoff_prompt.RECOMMENDED_PROMPT_PREFIX` 帮助 LLM 理解 handoff 机制。

### 2.2 Guardrails

- **Input guardrails**：输入验证，作用于链首 Agent
- **Output guardrails**：输出验证，作用于最终产出 Agent
- **Tool guardrails**：围绕自定义函数工具调用的检查
- 可配置安全检查，失败可中断 run

### 2.3 Sessions

- 跨 run 自动管理对话历史
- 可选 Redis 后端（`openai-agents[redis]`）
- SQLAlchemy 存储支持
- 与 handoff 历史过滤协同：input_filter 可改写下一 Agent 看到的会话内容

### 2.4 Sandbox Agent

```python
from agents.sandbox import Manifest, SandboxAgent, SandboxRunConfig
from agents.sandbox.entries import GitRepo
from agents.sandbox.sandboxes import UnixLocalSandboxClient

agent = SandboxAgent(
    name="Workspace Assistant",
    instructions="Inspect the sandbox workspace before answering.",
    default_manifest=Manifest(entries={"repo": GitRepo(repo="openai/openai-agents-python", ref="main")}),
)
result = Runner.run_sync(
    agent, "Inspect the repo README...",
    run_config=RunConfig(sandbox=SandboxRunConfig(client=UnixLocalSandboxClient())),
)
```

- **Manifest**：声明工作区内容（Git 仓库等）
- **沙箱客户端**：UnixLocalSandboxClient（macOS/Linux）、DockerSandboxClient（Windows/容器）、托管沙箱
- 长时任务保留工作区状态

### 2.5 状态与 RunContext

| 概念 | 说明 |
|---|---|
| `RunContextWrapper.context` | 应用状态与依赖（非模型生成数据） |
| `RunResult` | final_output、to_input_list()、中间项 |
| `RunConfig` | nest_handoff_history、handoff_input_filter、handoff_history_mapper、sandbox |
| `RunState` | 运行状态，跟踪消息位置 |

**区分**：应用状态放 `context`；模型在 handoff 时生成的元数据用 `input_type`；改写下一 Agent 看到的历史用 `input_filter`。

### 2.6 工具体系

| 类型 | 说明 |
|---|---|
| Function tools | Python 函数 |
| MCP tools | 原生 MCP 集成 |
| Hosted tools | OpenAI 托管工具 |
| Agents as tools | `Agent.as_tool(parameters=...)` 结构化嵌套调用 |
| Realtime tools | 实时语音场景工具 |

### 2.7 Tracing（生产关键）

- 内置追踪所有 Agent run
- 可视化调试与优化工作流
- 与 OpenAI 平台 Tracing UI 集成

### 2.8 恢复语义

- **Sessions**：跨 run 历史延续
- **HITL**：内置人工介入机制（human_in_the_loop）
- 无细粒度 checkpoint/fork
- Sandbox Agent 跨长任务保留工作区状态（文件级持久）
- 中断恢复依赖应用层 Session 管理

### 2.9 生产模式

| 能力 | 实现 |
|---|---|
| Provider 无关 | OpenAI Responses/Chat Completions + 100+ LLM（LiteLLM、any-llm） |
| 语音 | `openai-agents[voice]`；RealtimeAgent 低延迟 WebSocket |
| Redis Session | `openai-agents[redis]` |
| 轻量依赖 | Pydantic、Requests、MCP SDK、Griffe；可选 websockets、SQLAlchemy |
| 质量 | mypy + Pyright + pytest + ruff + uv |
| 文档 | MkDocs Material |

---

## 3. 对 openmate 的借鉴

| 维度 | 借鉴点 |
|---|---|
| Handoff 即工具 | 委派机制对 LLM 透明，`transfer_to_*` 命名约定简单有效 |
| input_filter | 精确控制下一 Agent 看到的历史（去工具调用、摘要嵌套），解决上下文膨胀 |
| Guardrail 作用域 | input/chain 首、output/终态、tool/每次调用，边界清晰 |
| Agent-as-Tool vs Handoff | 不转移对话用 as_tool，转移控制用 handoff，语义分明 |
| Sandbox Agent | Manifest 声明式工作区 + 长任务文件持久，适合编码场景 |
| Tracing 内置 | 零配置可观测，降低生产接入成本 |
| 极简 API | 六概念覆盖 80% 多 Agent 场景，学习曲线低 |
| 局限 | 恢复粒度粗；复杂 DAG/循环需外接；多租户需自建 |

---

## 4. 版本与生态快照（截至 2026-09）

- JS/TS 姊妹项目：openai-agents-js
- 支持 Realtime（gpt-realtime-2.1）、Voice Pipeline、Sandbox Agent
- 嵌套 handoff 历史为 opt-in beta
- 社区：GitHub Issues；文档站完整（agents/handoffs/tools/guardrails/sessions/tracing/sandbox/realtime/voice）
