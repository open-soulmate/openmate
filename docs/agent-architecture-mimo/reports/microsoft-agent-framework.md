# Microsoft Agent Framework 架构深度研究报告

> 仓库: https://github.com/microsoft/agent-framework  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/agent-framework@main  
> 版本快照: main @ 2026-09-13（README 全量实读 + ADR 0037 Agent Skills）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多语言生产 Agent、工作流 checkpoint、中间件、OTel、Declarative/Skills 借鉴

---

## 0. 诚实性说明

- 成功拉取：`README.md`（全量）、`docs/decisions/0037-agent-skills-design.md`（Agent Skills 多源架构 ADR）。
- 本轮未打开 `python/packages/**` 与 `dotnet/src/**`；实现细节以 README 与 Learn 文档为准，不发明行号。
- MAF 是 **Semantic Kernel + AutoGen 的官方继任**；多语言生产向。

---

## 1. 系统架构

### 1.1 定位（README 实读）

```
Microsoft Agent Framework (MAF)
  → production-grade AI agents + multi-agent workflows
  → Python / C#/.NET（Go 独立仓 agent-framework-go）
  → 编排: sequential / concurrent / handoff / group
  → 耐久性、可重启、可观测、治理、HITL
  → 生态: Foundry / Azure OpenAI / OpenAI / GitHub Copilot SDK
```

**适用判断（README）**：

- 期望生产运行
- 超越单 prompt / 无状态 chat loop
- 需要图式编排
- 关心 durability / observability / governance / HITL
- 需要 provider 灵活性

### 1.2 源码与包布局（README 路径）

| 路径 | 职责 |
|------|------|
| `python/packages/` | Python 包集 |
| `dotnet/src/` | .NET 源码 |
| `python/samples/01-get-started` … `05-end-to-end` | 渐进样例 |
| `dotnet/samples/` | .NET 对应 |
| `declarative-agents/` | YAML 声明式 Agent |
| `docs/decisions/0037-agent-skills-design.md` | Agent Skills ADR |
| `python/packages/lab/` | AF Labs（实验：bench/RL） |

### 1.3 安装

```bash
pip install agent-framework
# lab 单独: agent-framework-lab

dotnet add package Microsoft.Agents.AI
dotnet add package Microsoft.Agents.AI.Foundry
dotnet add package Azure.AI.Projects
dotnet add package Azure.Identity
```

### 1.4 Quickstart 形态（README 实读）

**Python**：`Agent(client=FoundryChatClient(credential=AzureCliCredential()), name=…, instructions=…)` → `await agent.run(...)`。

**.NET**：`AIProjectClient(...).AsAIAgent(model: deploymentName, instructions:…, name:…)` → `RunAsync`。

默认模型示例：`gpt-5.4-mini`（.NET 样例 fallback）。

---

## 2. 核心机制深潜

### 2.1 关键特性清单（README）

| 特性 | 说明 | 样例路径 |
|------|------|----------|
| 多语言 | Python + .NET 一致 API；Go 独立仓 | `python/packages` / `dotnet/src` |
| 多 Provider | Foundry / Azure OpenAI / OpenAI / Copilot SDK… | `02-agents/providers` |
| Middleware | 请求/响应、异常、自定义管线 | `02-agents/middleware` |
| 工作流 | sequential / concurrent / handoff / group；**checkpoint、streaming、HITL、time-travel** | `03-workflows` |
| Foundry Hosted | **+2 行代码**部署托管 | `04-hosting/foundry-hosted-agents` |
| Observability | **内建 OpenTelemetry** | `02-agents/observability` |
| Declarative Agents | YAML 定义，易版本化 | `declarative-agents/` |
| Agent Skills | 文件/内联代码/类库 → 领域知识基座 | ADR 0037 |
| AF Labs | bench / RL / 研究实验包 | `python/packages/lab` |
| DevUI | 开发调试交互 UI | 视频链接 |

### 2.2 Agent Loop 语义

- `Agent.run` / `RunAsync`。
- Middleware 链包裹模型调用与工具。
- 工作流层可 checkpoint、time-travel——比 SK 显著增强。

### 2.3 状态与持久化

- **Checkpoint**：工作流可恢复。
- Durable Agent Framework 扩展（独立仓 `agent-framework-durable-extension`）：Durable Task / Azure Functions。
- A2A / self-hosted protocol helpers。

### 2.4 Skills 多源架构（ADR 0037 实读）

**模型面三工具**（渐进披露）：

| 工具 | 作用 |
|------|------|
| `load_skill(skillName)` | 返回完整 skill body |
| `read_skill_resource(skillName, resourceName)` | 读补充资源 |
| `run_skill_script(skillName, scriptName, arguments?)` | 执行脚本；无脚本时**不注册** |

**四抽象基类**：

```
AgentSkill / AgentSkillResource / AgentSkillScript / AgentSkillsSource
```

**两类技能**：

1. **File-Based**：`SKILL.md` + YAML frontmatter；`resources/` 与 `scripts/` 子目录发现。
2. **Programmatic**：Inline（fluent API）与 Class（`AgentClassSkill` 子类，可 NuGet）。

**装饰器链**（Filtering / Caching / Deduplication 作为 `DelegatingAgentSkillsSource`）：

```csharp
var compositeSource = new FilteringAgentSkillsSource(
    new AggregatingAgentSkillsSource([fileSource, codeSource]),
    filter: s => s.Frontmatter.Name != "internal");
```

**Builder**：

```csharp
new AgentSkillsProviderBuilder()
    .UseFileSkill("./skills")
    .UseInlineSkills(codeSkill)
    .UseClassSkills(new ClassSkill())
    .UseFileScriptRunner(SubprocessScriptRunner.RunAsync)
    .UseScriptApproval()   // HITL
    .UsePromptTemplate(customTemplate)
    .UseFilter(...)
    .Build();
```

**ADR 决策结果**：

1. 保留自定义 `AgentSkillResource`/`AgentSkillScript`（不用 `AIFunction`）：资源无参数、审批兼容、owner skill 注入。
2. 全部 skill 类 **internal**，只留 `AgentSkillsProvider` 与 `AgentSkillsProviderBuilder` 两个 public 入口。
3. 缓存在 provider 层（非外挂装饰器）。

**File source 安全**：

- 递归扫描 **max 2 levels**。
- 路径遍历与 symlink 检查。
- `AllowedResourceExtensions` / `AllowedScriptExtensions` 可配。

---

## 3. 稳定性 / HA / 治理

### 3.1 生产关注点（README 适用段）

- durability、restartability
- observability、governance
- human-in-the-loop

### 3.2 认证故障表（README 实读）

| 问题 | 原因 | 修复 |
|------|------|------|
| Azure 凭据错误 | 未登录 CLI | `az login` |
| API key 错误 | key 错/缺 | 核对资源/provider |

**Tip（README）**：`DefaultAzureCredential` 开发方便；生产建议具体凭据（如 `ManagedIdentityCredential`），避免探测延迟、意外 fallback、安全风险。

### 3.3 可观测

- OTel 内建（Python + .NET）。
- 非可选插件，是一等能力。

### 3.4 第三方系统责任（README 重要注意）

- 连接第三方 server/agent/代码/非 Azure 直连模型：**自担风险**。
- 需审查数据流出组织边界与合规地理边界。
- 需自建 responsible AI 缓解（metaprompt、内容过滤等）。

---

## 4. 与 SK / AutoGen 关系

- 官方迁移指南：
  - [From Semantic Kernel](https://learn.microsoft.com/agent-framework/migration-guide/from-semantic-kernel)
  - [From AutoGen](https://learn.microsoft.com/agent-framework/migration-guide/from-autogen)
- 含义：新项目应读 MAF，不押注 SK 新特性。

---

## 5. 对 openmate 的借鉴

### 5.1 直接可抄（P0）

1. **工作流四模式**：sequential / concurrent / handoff / group。
2. **Checkpoint + time-travel**：长任务可恢复、可回放。
3. **Middleware 管线**：工具/模型调用前后统一挂点。
4. **OTel 内建**，不是外挂。
5. **Declarative YAML Agent**：配置即 Agent，可版本化。
6. **Skills 多源**（文件/代码/库）统一发现面 + 三工具渐进披露。
7. **生产凭据建议**：弃 DefaultAzureCredential，用 ManagedIdentity 类确定性凭据。
8. **+2 行托管**：本地/云部署接口对称。
9. **internal 默认 + 两个 public 入口**：控制 API 面。
10. **file source 2 层扫描 + 路径遍历检查**。

### 5.2 应避免的坑

- 多语言双栈维护成本：openmate 选单主语言 + 可选绑定。
- 第三方系统数据边界：默认不外传，显式策略。
- Labs 包勿当生产依赖。
- DefaultAzureCredential 探测延迟在个人助手中会表现为「启动慢/偶发失败」。
- 无脚本时勿注册 `run_skill_script` 工具（浪费上下文）。

### 5.3 重构优先级

- **P0**：openmate 工作流 checkpoint + HITL
- **P0**：Middleware 统一挂点（权限/审计/截断）
- **P0**：OTel traces
- **P0**：Skills 三工具渐进披露
- **P1**：Declarative Agent（YAML）
- **P1**：Skills 多源 + Filtering/Caching/Dedup 装饰器
- **P2**：group collaboration 模式

---

## 6. 源码锚点速查

```
README.md
  pip install agent-framework
  dotnet add package Microsoft.Agents.AI[.Foundry]
  Agent + FoundryChatClient + AzureCliCredential
  AsAIAgent + RunAsync；示例模型 gpt-5.4-mini
  工作流: sequential concurrent handoff group
  checkpoint / streaming / HITL / time-travel
  Foundry Hosted +2 行
  OTel 内建
  declarative-agents/ YAML
  lab: agent-framework-lab
  凭据 Tip: ManagedIdentityCredential 优于 DefaultAzureCredential
  迁移: from-semantic-kernel / from-autogen
  durable-extension 独立仓
  Go SDK: microsoft/agent-framework-go

docs/decisions/0037-agent-skills-design.md
  load_skill / read_skill_resource / run_skill_script
  AgentSkill Resource Script Source 四抽象
  SKILL.md + resources/ + scripts/
  Filtering/Caching/Deduplicating AgentSkillsSource
  AgentSkillsProviderBuilder fluent API
  决策: 保留自定义类型；类全 internal；缓存在 provider
  file source max 2 levels + 路径遍历/symlink 检查
```

**未本轮打开**：checkpoint 存储实现、middleware 签名、workflow 引擎状态机。

---

## 6.1 README 适配场景原文（实读）

> *"MAF is a strong fit if you: are building agents and workflows you expect to run in production; need orchestration beyond a single prompt or stateless chat loop; want graph-based patterns such as sequential, concurrent, handoff, and group collaboration; care about durability, restartability, observability, governance, or human-in-the-loop control; need provider flexibility so your architecture can evolve without major rewrites."*

**Key Features（README 实读）**：

| 特性 | 说明 |
|------|------|
| Python and C#/.NET Support | 一致 API |
| Go Support | 独立仓库 agent-framework-go |
| Multiple Agent Provider Support | 多 LLM 提供商 |
| Middleware | 请求/响应处理、异常、自定义管线 |
| Orchestration Patterns & Workflows | sequential / concurrent / handoff / group；含 checkpointing、streaming、HITL、time-travel |
| Foundry Hosted Agents | **2 行代码**部署到 Foundry |
| Observability | **内建 OpenTelemetry** |
| Declarative Agents | **YAML 定义 Agent**（更快设置与版本化） |
| Agent Skills | 从 files / inline code / class libraries 构建领域知识 |
| AF Labs | 实验包：benchmarking、RL、研究 |

---

## 6.2 安全与责任边界（README 实读）

> *"When you connect to third-party servers/agents/code/models that are not first-party Azure direct-billing, you are using them at your own risk."*

要求：

- 审查数据流出组织边界与合规地理边界
- 自建 responsible AI 缓解（metaprompt、内容过滤等）
- 生产凭据建议：`ManagedIdentityCredential` 而非 `DefaultAzureCredential`

---

## 6.3 与 openmate 对照

| MAF | openmate 建议 |
|-----|---------------|
| sequential / concurrent / handoff / group 四模式 | 工作流四模式内置 |
| Checkpoint + time-travel | 长任务可恢复可回放 |
| Middleware 系统 | 请求/响应处理链 |
| OTel 内建 | 追踪第一天内置 |
| Declarative Agents (YAML) | Agent 定义版本化 |
| Agent Skills 四来源 | files / inline / class libs |
| Foundry 2 行部署 | 云部署摩擦最小化 |
| 第三方自担风险声明 | 明确责任边界 |
| 从 SK / AutoGen 迁移指南 | 不绑死单一生态 |

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | Provider + Middleware 清晰 |
| 权限/安全边界 | 4 | 治理叙事 + 凭据建议；企业向 |
| 容错与会话恢复 | 5 | checkpoint + durable 扩展 |
| 上下文工程 | 4 | Skills 渐进披露 |
| 可扩展（技能/MCP） | 5 | Skills 四抽象 + Declarative |
| 可观测与可评测 | 5 | OTel 内建 + Labs bench |
| 生产可用成熟度 | 4 | 微软生产向；生态新 |

**综合**：**生产多 Agent 工作流正统继任者**。openmate 对齐 checkpoint/Middleware/OTel/Declarative/Skills，不绑死 Azure。

---

## 8. 错误与边界路径

### 8.1 认证失败

- `az login` 未执行 → `DefaultAzureCredential` 探测链逐个失败 → 启动慢或抛错
- 生产建议 `ManagedIdentityCredential` 避免探测延迟与意外 fallback

### 8.2 第三方系统数据边界

- README 明确：连接第三方 server/agent/代码/非 Azure 直连模型需自担风险
- 需审查数据流出组织边界与合规地理边界
- 需自建 responsible AI 缓解（metaprompt、内容过滤等）

### 8.3 Labs 包

- `agent-framework-lab` 为实验包，勿当生产依赖

### 8.4 双栈概念漂移

- Python 与 .NET API 需对齐；Go SDK 独立仓 `microsoft/agent-framework-go`

---

## 9. 关键链接

- 仓库：https://github.com/microsoft/agent-framework  
- Learn：https://learn.microsoft.com/agent-framework/  
- ADR 0037：`docs/decisions/0037-agent-skills-design.md`  
- 相关报告：`reports/semantic-kernel-l1.md`、`reports/autogen.md`、`reports/openai-agents.md`

---

## 9. Quick Reference Card

### Orchestration Patterns

Sequential for steps in order.
Concurrent for parallel execution.
Handoff for agent-to-agent transfer.
Group for multi-agent collaboration.

### Key Features (README)

Python plus C#/.NET plus Go (separate repo).
Middleware system.
Checkpointing plus time-travel.
Built-in OpenTelemetry.
Declarative Agents (YAML).
Agent Skills (files / inline code / class libraries).
Foundry Hosted Agents (2 lines of code).

### openmate Mapping

4 orchestration patterns map to workflow modes.
Middleware system maps to request/response chain.
OTel built-in maps to tracing from day one.
Declarative Agents maps to YAML agent definitions.
Agent Skills 4 sources maps to files/inline/class libs.
Checkpoint+time-travel maps to long task recovery.
Foundry 2-line deploy maps to minimal deployment friction.
3rd-party risk notice maps to explicit responsibility boundary.
---

## 10. Implementation Notes for openmate

When implementing MAF-like patterns in openmate, consider these design decisions:

1. Four orchestration patterns: sequential, concurrent, handoff, group - implement all four as first-class.
2. Middleware system: build a flexible middleware chain for request/response processing, exception handling, and custom pipelines.
3. OTel from day one: integrate OpenTelemetry as a built-in capability, not an optional plugin.
4. Declarative agents: support YAML-based agent definitions for faster setup and versioning.
5. Agent Skills from multiple sources: files, inline code, class libraries.
6. Checkpoint and time-travel: enable long-running task recovery and replay.
7. Provider flexibility: design abstractions so architecture can evolve without major rewrites.

These seven decisions capture the core engineering lessons from Microsoft Agent Framework.