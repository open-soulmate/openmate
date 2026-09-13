# microsoft/agent-framework-dotnet — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/microsoft/agent-framework（.NET 路径: `dotnet/`）  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/agent-framework@main/dotnet/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 .NET Agent 入口 / Azure OpenAI 集成 / AsAIAgent 扩展 借鉴

---

## 0. 诚实性说明

- 成功拉取: `dotnet/README.md`（C# Quickstart + samples 链接）
- 相关全量报告: `reports/microsoft-agent-framework.md`（多语言整体架构）
- 未打开: `dotnet/src/**` 实现
- 本报告聚焦 **.NET/C# 入口面**；整体架构见 sibling 报告

---

## 1. .NET Quickstart（README 源码实读）

### 1.1 完整示例代码

```csharp
using System.ClientModel.Primitives;
using Azure.Identity;
using Microsoft.Agents.AI;
using OpenAI;
using OpenAI.Responses;

var endpoint = Environment.GetEnvironmentVariable("AZURE_OPENAI_ENDPOINT")!;
// e.g. https://YOUR.openai.azure.com/openai/v1/
var deploymentName = Environment.GetEnvironmentVariable("AZURE_OPENAI_DEPLOYMENT_NAME")!;

var agent = new OpenAIClient(
        new BearerTokenPolicy(new AzureCliCredential(), "https://ai.azure.com/.default"),
        new OpenAIClientOptions { Endpoint = new Uri(endpoint) })
    .GetResponsesClient()
    .AsAIAgent(
        model: deploymentName,
        name: "HaikuBot",
        instructions: "You are an upbeat assistant that writes beautifully.");

Console.WriteLine(await agent.RunAsync("Write a haiku about Microsoft Agent Framework."));
```

### 1.2 关键 API 链（源码实读）

```
OpenAIClient(BearerTokenPolicy(AzureCliCredential), Endpoint)
  → GetResponsesClient()
  → AsAIAgent(model, name, instructions)
  → RunAsync(prompt)
```

**设计要点**:
- **`AsAIAgent()` 扩展方法**把现有 OpenAI Responses client 适配成 Agent
- 不新建平行 client 体系，复用 OpenAI SDK
- Auth: `AzureCliCredential` + scope `https://ai.azure.com/.default`
- Endpoint 必须是 **v1 route**: `https://YOUR.openai.azure.com/openai/v1/`

### 1.3 命名空间（using 实读）

| Namespace | 用途 |
|-----------|------|
| `Microsoft.Agents.AI` | Agent 抽象 + AsAIAgent |
| `OpenAI` / `OpenAI.Responses` | OpenAI SDK |
| `Azure.Identity` | AzureCliCredential |
| `System.ClientModel.Primitives` | BearerTokenPolicy |

---

## 2. Samples 布局（README 链接实读）

| 路径 | 内容 |
|------|------|
| `./samples/02-agents/Agents` | 基础 agent 创建 + 工具使用 |
| `./samples/02-agents/AgentProviders` | 不同 agent provider |
| `./samples/03-workflows` | 多 agent 模式 + 工作流编排 |

**渐进结构**: 02-agents（基础）→ 03-workflows（编排）。

---

## 3. 文档与决策记录（README 链接实读）

| 资源 | URL / 路径 |
|------|------------|
| 官方文档 | https://learn.microsoft.com/agent-framework/ |
| 主仓库 | https://github.com/microsoft/agent-framework |
| Design Documents | `../docs/design` |
| ADR | `../docs/decisions` |
| Learn Overview | https://learn.microsoft.com/agent-framework/overview/agent-framework-overview |

**对 openmate**: design docs + ADR 独立目录是可抄的工程实践（sibling 报告详述 ADR 0037 Agent Skills）。

---

## 4. 架构模式（.NET 视角）

### 4.1 Provider 适配器模式

```
OpenAIClient (OpenAI SDK)
  → GetResponsesClient()
  → AsAIAgent()  ← 扩展方法，统一 Agent 接口
```

推断: `AgentProviders` samples 暗示 Azure OpenAI / OpenAI / Foundry 等多 provider 均走类似扩展。

### 4.2 与 Python 侧对称（见 sibling 报告）

| 概念 | Python | .NET |
|------|--------|------|
| Agent 创建 | `Agent(client=..., name=, instructions=)` | `AsAIAgent(model, name, instructions)` |
| 运行 | `await agent.run(...)` | `await agent.RunAsync(...)` |
| 包名 | `agent-framework` | `Microsoft.Agents.AI` |
| Foundry | `FoundryChatClient` | `Microsoft.Agents.AI.Foundry` |

### 4.3 工具与工作流

- samples/02-agents/Agents: 工具使用
- samples/03-workflows: 多 agent 编排
- 详细编排模式见 `reports/microsoft-agent-framework.md`

---

## 5. 与 openmate 映射

| 需求 | .NET MAF 机制 | 可复用度 |
|------|--------------|----------|
| 现有 SDK→Agent | AsAIAgent 扩展方法 | **高** |
| 统一 RunAsync | 与 Python run 对称 | **高** |
| Azure 认证 | AzureCliCredential + scope | **高** |
| v1 route 明确 | /openai/v1/ 路径要求 | 高 |
| Provider samples | AgentProviders 目录 | **高** |
| Workflows samples | 03-workflows 渐进 | **高** |
| Design + ADR 目录 | docs/design + docs/decisions | **高** |
| NuGet 包拆分 | Microsoft.Agents.AI / .Foundry / Azure.AI.Projects / Azure.Identity | 高 |
| 环境变量配置 | AZURE_OPENAI_ENDPOINT / DEPLOYMENT_NAME | 高 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Endpoint 格式 | https://*.openai.azure.com/openai/v1/ | README 注释 |
| Auth scope | https://ai.azure.com/.default | README |
| Credential | AzureCliCredential | README |
| 样例 agent 名 | HaikuBot | README |
| Env vars | AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME | README |
| NuGet | Microsoft.Agents.AI 等 | README + sibling |
| Samples | 02-agents, 03-workflows | README |
| Docs | learn.microsoft.com/agent-framework | README |

---

## 7. 失败路径 / 边界

```
Endpoint 缺 /openai/v1/
  → v1 route 要求；畸形 URL

AZURE_OPENAI_ENDPOINT 未设
  → ! 空引用（示例用 ! 抑制）

AZURE_OPENAI_DEPLOYMENT_NAME 未设
  → 同上

AzureCliCredential 未登录
  → az login 失败

BearerTokenPolicy 缺 System.ClientModel.Primitives
  → 编译失败

模型不支持 Responses API
  → GetResponsesClient 调用失败

跨语言 API 不完全对称
  → 以各自 Learn 文档为准

生产用 AzureCliCredential
  → 应改 DefaultAzureCredential / managed identity
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **`AsAIAgent()` 扩展方法**: 把现有 LLM client 适配成 Agent，不重建体系
2. **链式 API**: Client → GetXClient → AsAIAgent → RunAsync
3. **Samples 渐进目录**: 02-agents（基础+工具）→ 03-workflows（编排）
4. **AgentProviders 独立 samples**: 多 provider 对照
5. **AzureCliCredential + 明确 scope** 作本地开发默认
6. **v1 route 路径要求写进注释**（防畸形 endpoint）
7. **design/ 与 decisions/ 独立文档目录**
8. **环境变量 `!` + 注释示例 URL** 并列
9. **NuGet 包按职责拆分**（AI / Foundry / Projects / Identity）
10. **与 Python API 形状对称**（name/instructions/run）

### P1

- Workflows samples 作为编排参考
- Learn overview 文档结构
- DefaultAzureCredential 生产路径

### P2

- Foundry 深度集成
- Go 独立仓模式（agent-framework-go）

---

## 9. 应避免的坑

- Endpoint 必须 `/openai/v1/` 不是旧 route
- 勿在生产用 AzureCliCredential（应用 DefaultAzureCredential / managed identity）
- `!` 空抑制仅示例；生产需校验
- 勿发明 dotnet/src 内部类型路径
- 勿假设 .NET 与 Python API 100% 对称

---

## 10. 源码锚点速查

```
dotnet/README.md
  using: Microsoft.Agents.AI, OpenAI, OpenAI.Responses,
         Azure.Identity, System.ClientModel.Primitives
  Endpoint env: AZURE_OPENAI_ENDPOINT
    format: https://YOUR.openai.azure.com/openai/v1/
  Deployment env: AZURE_OPENAI_DEPLOYMENT_NAME
  Auth: BearerTokenPolicy(AzureCliCredential, "https://ai.azure.com/.default")
  Chain: OpenAIClient → GetResponsesClient() → AsAIAgent(model, name, instructions)
  Run: await agent.RunAsync(prompt)
  Samples: samples/02-agents/Agents, AgentProviders, samples/03-workflows
  Docs: ../docs/design, ../docs/decisions
  Learn: https://learn.microsoft.com/agent-framework/
  Repo: https://github.com/microsoft/agent-framework
```

**未本轮打开**: `dotnet/src/**`。整体多语言架构见 `reports/microsoft-agent-framework.md`。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | tools 在 samples |
| 权限/安全边界 | 4 | Azure identity 链 |
| 容错与会话恢复 | 3 | 见 sibling 报告 |
| 上下文工程 | 3 | instructions 即 system |
| 可扩展（技能/MCP） | 4 | Provider 扩展点 |
| 可观测与可评测 | 3 | 见 sibling |
| 生产可用成熟度 | 4 | Microsoft 维护 + NuGet |

**综合**: **.NET 侧 AsAIAgent 适配器模式**。openmate 抄扩展方法适配、渐进 samples 与 Azure 认证链；编排细节看 sibling 报告。

---

## 12. 附录 A — AsAIAgent 扩展方法 openmate 规范（P0）

```csharp
// 目标: 任何 IXxxClient 都能 .AsAIAgent()
public static AIAgent AsAIAgent(
    this ResponsesClient client,
    string model,
    string name,
    string instructions)
{
    // 适配器包装，不重建 HTTP 栈
}
```

openmate (任意语言):
```
existing_client.as_agent(model, name, instructions) -> Agent
agent.run(input) -> Result
```

规则:
- 复用已有 auth/transport/middleware
- 只增加 Agent 语义（name/instructions/tools）
- 不 fork SDK

---

## 13. 附录 B — NuGet / 包拆分对照

| 包 | 职责 |
|----|------|
| Microsoft.Agents.AI | 核心 Agent 抽象 |
| Microsoft.Agents.AI.Foundry | Foundry 集成 |
| Azure.AI.Projects | 项目/部署 |
| Azure.Identity | 认证 |

openmate:
```
openmate-agents-core
openmate-agents-azure
openmate-agents-openai
openmate-identity
```

---

## 14. 附录 C — 样例渐进结构

```
samples/
  02-agents/
    Agents/           # 最小 agent + tool
    AgentProviders/   # 多 provider
  03-workflows/       # 编排
```

openmate docs:
```
examples/01-hello-agent
examples/02-tools
examples/03-providers
examples/04-workflows
```

---

## 15. 附录 D — 失败路径明细

```
缺 /openai/v1/
  → 启动校验 endpoint 后缀

未 az login
  → AzureCliCredential 失败
  → 提示 az login

ENV 未设
  → fail-loud，打印变量名

模型无 Responses API
  → 能力探测失败

! 空抑制
  → 仅示例；生产 null 检查
```

---

## 16. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 抓取路径 | microsoft/agent-framework@main/dotnet/README.md | 本轮 |
| Endpoint | /openai/v1/ | README 注释 |
| Scope | https://ai.azure.com/.default | README |
| Credential | AzureCliCredential | README |
| Agent 名示例 | HaikuBot | README |
| Samples | 02-agents, 03-workflows | README |
| Docs | ../docs/design, ../docs/decisions | README |

---

## 17. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | samples 有 tools |
| 权限安全 | 4 | Azure identity 链 |
| 容错恢复 | 3 | 见 sibling |
| 上下文 | 3 | instructions |
| 可扩展 | 4 | Provider 扩展 |
| 可观测 | 3 | 见 sibling |
| 成熟度 | 4 | Microsoft + NuGet |

**净推荐**: openmate 抄 **AsAIAgent 适配器 + 渐进 samples + Azure 认证链 + design/ADR 目录**；编排细节读 sibling 全量报告。

---

## 18. 关键链接

- https://github.com/microsoft/agent-framework
- https://learn.microsoft.com/agent-framework/
- `reports/microsoft-agent-framework.md`（全量架构）
- 相关: `reports/semantic-kernel-l1.md`、`reports/autogen.md`

---

## 19. 附录 F — 与 sibling 报告分工

| 主题 | 本报告 (.NET) | sibling (全量) |
|------|---------------|----------------|
| AsAIAgent 链 | ✅ 深挖 | 简述 |
| Azure 认证 | ✅ 深挖 | 简述 |
| Samples 布局 | ✅ | ✅ |
| Python API | 简述 | ✅ |
| 编排模式 | 链接 | ✅ |
| ADR 0037 Skills | 链接 | ✅ |
| OTel / checkpoint | 链接 | ✅ |

---

## 20. 附录 G — openmate 多语言 API 对称检查表

| 概念 | Python | .NET | Go | JS |
|------|--------|------|----|-----|
| 创建 Agent | Agent(...) | AsAIAgent(...) | NewAgent | new Agent |
| 运行 | run() | RunAsync() | Run | run() |
| 工具 | tools= | Tools= | WithTools | tools |
| 指令 | instructions= | instructions= | WithInstructions | instructions |
| 包名 | agent-framework | Microsoft.Agents.AI | agent-framework-go | @openai/agents 等 |

openmate: 冻结概念表；各语言命名可本地化但语义一致。

---

## 21. 最终结论

.NET 侧黄金参考是 **AsAIAgent 扩展方法**——复用现有 OpenAI SDK，不重建 HTTP 栈。openmate 抄适配器模式、渐进 samples、Azure 认证链与 design/ADR 目录；编排与 Skills 读 sibling `microsoft-agent-framework.md`。
