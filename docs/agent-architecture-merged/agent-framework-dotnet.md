# Agent Framework (.NET)

## 概述

Agent Framework (.NET) 是一个.NET Agent框架。

**仓库**: https://github.com/microsoft/agent-framework | **语言**: Python

## 核心架构

> 仓库: https://github.com/microsoft/agent-framework（.NET 路径: `dotnet/`）  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/agent-framework@main/dotnet/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 .NET Agent 入口 / Azure OpenAI 集成 / AsAIAgent 扩展 借鉴

---

## 关键技术

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

- samples/02-agents/Agents: 工具使用
- samples/03-workflows: 多 agent 编排
- 详细编排模式见 `reports/microsoft-agent-framework.md`

- https://github.com/microsoft/agent-framework
- https://learn.microsoft.com/agent-framework/
- `reports/microsoft-agent-framework.md`（全量架构）
- 相关: `reports/semantic-kernel-l1.md`、`reports/autogen.md`

---

## 对openmate的启示

> 仓库: https://github.com/microsoft/agent-framework（.NET 路径: `dotnet/`）  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/agent-framework@main/dotnet/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 .NET Agent 入口 / Azure OpenAI 集成 / AsAIAgent 扩展 借鉴

---

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

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- MiMo报告（agent-framework-dotnet-l1.md）
- MiMo卡片（agent-framework-dotnet.md）
