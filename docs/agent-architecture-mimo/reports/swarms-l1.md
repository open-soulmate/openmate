# Swarms 架构深度研究报告

> 仓库: https://github.com/kyegomez/swarms  
> 版本快照: master branch · Commits 5,353  
> 星数: ~7.2k · Fork ~1.0k  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 编排形态库、MCP 双向集成、max_loops=auto、GroupChat 门控借鉴  
> License: Apache-2.0

---

## 0. 元信息与现状

| 项 | 值 |
|---|---|
| 语言 | Python（pip/uv/poetry） |
| 定位 | 企业级多 Agent 编排框架：60+ 预置结构 |
| 文档 | docs.swarms.world · llms.txt 供 AI IDE 一次拉取 |
| 协议 | MCP · x402 · Agent Skills（SKILL.md）· Open Responses |
| 根文件 | CLAUDE.md · SKILL.md · CITATION.cff · example.py |

> 对 openmate：Swarms 的价值在 **编排形态目录** 与 **MCP 双向（消费 + MCPDeployer 暴露）**，而非稳定性内核。openmate 可借 SwarmRouter/AgentRearrange 思路做个人助手多工具编排，但必须自建审批与 durable。

---

## 1. 系统架构

### 1.1 顶层模块图

```
┌──────────────────────────────────────────────────────────┐
│  Agent（LLM + Tools + Memory + max_loops）                │
├──────────────────────────────────────────────────────────┤
│  structs/  编排结构体                                     │
│   SequentialWorkflow · ConcurrentWorkflow · AgentRearrange│
│   GraphWorkflow · MixtureOfAgents · GroupChat             │
│   HierarchicalSwarm · HeavySwarm · ForestSwarm · SwarmRouter│
├──────────────────────────────────────────────────────────┤
│  tools/ · memory · telemetry/ · prompts/ · schemas/       │
├──────────────────────────────────────────────────────────┤
│  MCP：mcp_url 消费工具 · MCPDeployer 暴露为 server        │
└──────────────────────────────────────────────────────────┘
```

### 1.2 真实源码布局（经 GitHub tree 核实）

```
swarms/
├── swarms/
│   ├── agents/          # Agent 实现
│   ├── cli/
│   ├── prompts/
│   ├── schemas/         # 含 MCPConnection 等
│   ├── structs/         # 各类多 Agent 结构
│   ├── telemetry/
│   ├── tools/
│   ├── utils/
│   ├── env.py
│   └── __init__.py
├── examples/
├── tests/
├── scripts/
├── images/
├── CLAUDE.md · SKILL.md · CITATION.cff
├── example.py
├── .env.example
└── pyproject.toml · requirements.txt
```

### 1.3 进程/线程模型

- 库形态，嵌入用户进程
- ConcurrentWorkflow / GroupChat：进程内并发（asyncio/线程，版本相关）
- MCPDeployer：可起 HTTP server（默认 streamable HTTP；SSE/stdio 可选）
- 无强制外置 Celery/队列

### 1.4 与 LLM 的调用链路

```
task → SwarmRouter / 具体 struct
  → Agent.run()
      → model_name 调 LLM
      ← tool_call（tools/ 或 MCP 自动发现）
      → max_loops 循环或 auto 停止
  → 下游 Agent 或 aggregator
  → 返回 str / dict
```

---

## 2. 核心机制深潜

### 2.1 Agent Loop

关键参数（README）：

| 参数 | 说明 |
|---|---|
| `max_loops` | 整数或 `"auto"`：agent 自判完成 |
| `interactive` | 实时反馈 |
| `autosave` | 状态保存 |
| `mcp_url` / `mcp_urls` | MCP 工具自动接入 |
| `tools_list_dictionary` | 显式工具列表（如 GroupChat 的 RESPOND_TOOL） |
| `persistent_memory` | 是否持久记忆 |
| `temperature` / `max_tokens` / `reasoning_effort` | 采样与推理 |

`max_loops="auto"`：
- 适合开放式研究、迭代精炼
- 固定 loops 适合延迟/成本敏感管道

停止：完成信号、loops 耗尽、GroupChat `idle_timeout` / `max_loops` 消息上限。

### 2.2 工具系统与 MCP

**消费 MCP**：
```python
Agent(..., mcp_url="https://mcp.deepwiki.com/mcp")
```

**暴露为 MCP**：
```python
MCPDeployer(researcher, api_keys=["sk-local-dev"], port=8000).run()
# http://127.0.0.1:8000/mcp
```

- Auth：静态 key / 自定义 callable / TokenVerifier + scopes
- **无 auth 时必须 `allow_anonymous=True` 否则拒绝启动**（安全默认）
- Transport：streamable HTTP 默认，SSE、stdio
- 示例：`single_agent_api_key.py`、`multiple_agents_one_server.py`、`custom_auth_per_tenant.py`、`token_verifier_with_scopes.py`

**Agent Skills**：SKILL.md 轻量能力定义（Anthropic 风格）。

### 2.3 多 Agent 结构目录

| 架构 | 描述 | 适用 |
|---|---|---|
| SequentialWorkflow | 线性管道 | 数据变换、报告 |
| ConcurrentWorkflow | 并行同任务 | 批处理 |
| AgentRearrange | 字符串流 `a -> b, c` | 动态路由 |
| GraphWorkflow | DAG + 拓扑排序 + 自动并行 | 软件构建依赖 |
| MixtureOfAgents | 并行专家 + aggregator | 综合决策 |
| GroupChat | 并行监听 + respond(score) 门控 | 协商/头脑风暴 |
| ForestSwarm | 动态选 agent 树 | 任务路由 |
| HierarchicalSwarm | director 计划分发 + 反馈环 | 项目管理 |
| HeavySwarm | 5 阶段：研究/分析/备选/验证 | 深度分析 |
| SwarmRouter | 统一入口切换 swarm_type | 策略实验 |
| AutoSwarmBuilder | 按任务描述自动生成 agent+工作流 | 快速原型 |
| SocialAlgorithms | 自定义通信 callable | 自定义协议 |

GroupChat 细节：
- 所有 agent 必须挂 `RESPOND_TOOL`
- 每条广播消息触发 respond(score, message) 强制 function call
- 阈值 `threshold`（0..1）以上才广播
- 结束：`max_loops` 消息数或 `idle_timeout` 秒静默
- **无固定发言顺序**，可多人同时响应

GraphWorkflow：
- Node/Edge/NodeType；`set_entry_points` / `set_end_points`
- 独立分支自动并行；节点完成可 hook 回调

### 2.4 状态与持久化

- `WORKSPACE_DIR`（默认 `agent_workspace`）
- autosave 可选
- telemetry/ 目录存在；细节未在 README 展开
- 无 SQLite writer claim

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

| 路径 | 行为 |
|---|---|
| LLM/工具失败 | 依赖实现层重试（非 OpenClaw 级策略表） |
| MCP server 挂 | 工具调用失败；无公开自动降级 |
| 进程崩溃 | 库内状态丢失（除 autosave） |
| durable transcript | **无** |
| 审批/HITL | **无内建** |

### 3.2 会话恢复

- autosave / persistent_memory 可选
- 无 gateway 重启 resume

### 3.3 隔离

- MCPDeployer 提供 **进程外工具边界 + auth**
- 本地工具同进程；无 Docker 沙箱内建

### 3.4 幂等性与可观测

- telemetry/ 包；无公开 WS idempotency
- CLAUDE.md / llms.txt 强调 AI 协作与可发现性（工程体验强）

---

## 4. 自我进化

| 维度 | 现状 |
|---|---|
| 记忆 | persistent_memory 可选 |
| 技能 | SKILL.md · Marketplace |
| 评测 | tests/；无内建评测台 |
| 反馈 | GroupChat 分数门控；HeavySwarm 验证阶段 |

---

## 5. 对 openmate 的借鉴

### 直接可抄

1. **MCP 双向**：既消费外部工具，也可把个人助手能力 `MCPDeployer` 暴露
2. **无 auth 拒绝启动**：安全默认（`allow_anonymous` 显式）
3. **GroupChat 门控**：respond(score) + threshold + idle_timeout 控发言成本
4. **GraphWorkflow**：DAG + 自动并行，适合编码任务依赖
5. **AgentRearrange 字符串流**：极简拓扑表达
6. **llms.txt + CLAUDE.md**：给 AI 编码助手的可发现文档模式

### 应避免的坑

- 「企业级」宣传与实际 HA/durable 不匹配，勿被 README 营销误导
- max_loops=auto 易烧 token，openmate 必须叠加预算
- 60+ 结构增加选择困难，openmate 应先固定 2–3 种

### 重构优先级

- **P0**：MCP 消费 + 暴露（含 auth 默认拒绝）
- **P0**：run 预算叠加在 auto loop 上
- **P1**：Graph/Sequential 两种编排
- **P2**：GroupChat 分数门控（多工具协商）

---

## 6. 源码阅读笔记

| 路径 | 作用 |
|---|---|
| `swarms/agents/` | Agent |
| `swarms/structs/` | 各编排结构 |
| `swarms/schemas/mcp_schemas.py` | MCPConnection |
| `swarms/tools/` | 工具 |
| `swarms/telemetry/` | 遥测 |
| `swarms/env.py` | 环境 |
| `CLAUDE.md` · `SKILL.md` | AI 助手指南与技能 |
| `.env.example` | OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY / WORKSPACE_DIR |

值得摘录：
- MCPDeployer auth 拒绝匿名启动
- GroupChat RESPOND_TOOL + threshold + idle_timeout
- SwarmRouter 只换 swarm_type 参数切换策略

失败/边界路径备忘：
- GroupChat agent 缺 RESPOND_TOOL → 无法被询问是否发言
- MoA 缺 aggregator_agent → 配置错误
- MCP 无 auth 且未 allow_anonymous → 启动失败（设计如此）

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 3 | MCP 方便；策略浅 |
| 权限/安全边界 | 2 | MCPDeployer auth 有；本地工具无审批 |
| 容错与会话恢复 | 1 | 无 durable/恢复 |
| 上下文工程 | 2 | 无 compaction 体系 |
| 可扩展（技能/MCP） | 4 | MCP 双向 + Skills |
| 可观测与可评测 | 2 | telemetry 有；浅 |
| 生产可用成熟度 | 2 | 编排目录多，内核弱 |

**综合**：2.4 / 5 — **编排形态与 MCP 双向值得抄**，稳定性勿当基线。

---

## 8. 关键链接

- README：https://github.com/kyegomez/swarms  
- Docs：https://docs.swarms.world  
- llms.txt：https://docs.swarms.world/llms.txt  
- 相关报告：`cards/swarms.md`、`reports/openclaw.md`、`reports/crewai.md`

---

## 9. 验证深度诚实声明

- **已核实**：`swarms/` 一级子包（agents/cli/prompts/schemas/structs/telemetry/tools/utils/env.py）、CLAUDE.md/SKILL.md 存在、Apache-2.0、README 中全部编排名与 MCPDeployer auth 默认、GroupChat 参数、.env 键名。
- **未能逐文件打开**：各 struct 的类实现文件、Agent._run 重试细节。
- **推断标注**：「企业级/99.9% uptime」为营销文案，本报告不采信为已验证事实。
- 本报告路径均来自 GitHub HTML tree 与 README，**无捏造路径**。
