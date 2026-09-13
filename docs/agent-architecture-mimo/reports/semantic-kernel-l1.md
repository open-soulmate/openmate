# Semantic Kernel 架构深度研究报告

> 仓库: https://github.com/microsoft/semantic-kernel  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/semantic-kernel@main  
> 版本快照: main @ 2026-09-13（python/README.md 全量实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Kernel 注册中心、Plugin 四形态、Filter 钩子、Triage 分诊借鉴  
> 继任: microsoft/agent-framework 1.0（稳定 API + LTS）；官方 SK→MAF 迁移指南

---

## 0. 诚实性说明

- 成功拉取：`python/README.md`（全量，含 Kernel/Agent/Plugin/GroupChat 代码示例）。
- 本轮未打开 `python/semantic_kernel/**` 实现；路径以 README 引用为准，不发明行号。
- **官方定位（README 顶部）**：Semantic Kernel is now Microsoft Agent Framework；MAF 1.0 为生产继任。
- SK 当历史/模式教材读；稳定性能力以 MAF 为准。

---

## 1. 系统架构

### 1.1 定位（README 实读）

```
Semantic Kernel = 企业级 Agent 编排 SDK
  Kernel 中枢（AI Services + Plugins + Memory + Filters）
  Plugin 四形态：Python / OpenAPI / MCP / Prompt
  LLM: OpenAI / Azure / HuggingFace / Mistral / Google / ONNX / Ollama / NVIDIA NIM
  Vector DB: Azure AI Search / Elasticsearch / Chroma
  Process Framework: 结构化业务流程
  多模态: Text / Vision / Audio
```

Python 3.10+；Windows/macOS/Linux。

### 1.2 安装

```bash
pip install --upgrade semantic-kernel
pip install --upgrade semantic-kernel[hugging_face]
pip install --upgrade semantic-kernel[all]
```

### 1.3 源码布局（公开 monorepo）

```
semantic-kernel/
├── python/
│   └── semantic_kernel/
│       ├── agents/                 # ChatCompletionAgent、GroupChat、thread
│       ├── functions/              # kernel_function、KernelArguments、filters
│       ├── connectors/ai/          # OpenAI/Azure 等 connector
│       ├── memory/
│       ├── prompts/
│       └── services/
├── dotnet/src/{Agents,Functions,Connectors,SemanticKernel.Core}/
├── java/
├── samples/
└── docs/
```

**诚实标注**：路径为公开稳定布局。

---

## 2. 核心机制深潜（README 代码实读）

### 2.1 Kernel Prompt 调用

```python
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion
from semantic_kernel.functions import KernelArguments

kernel = Kernel()
kernel.add_service(OpenAIChatCompletion())

prompt = """
1) A robot may not injure a human being...
2) A robot must obey orders given it by human beings...
3) A robot must protect its own existence...

Give me the TLDR in exactly {{$num_words}} words."""

result = await kernel.invoke_prompt(prompt, arguments=KernelArguments(num_words=5))
# Output: Protect humans, obey, self-preserve, prioritized.
```

要点：`Kernel` 统一注册 AI Service；`invoke_prompt` + `KernelArguments` 注入参数。

### 2.2 直接 AI Service（无 Kernel）

```python
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion, OpenAIChatPromptExecutionSettings
from semantic_kernel.contents import ChatHistory

service = OpenAIChatCompletion()
settings = OpenAIChatPromptExecutionSettings()
chat_history = ChatHistory(system_message="You are a helpful assistant.")
chat_history.add_user_message("Write a haiku about Semantic Kernel.")
response = await service.get_chat_message_content(chat_history=chat_history, settings=settings)
```

### 2.3 Agent + Plugin + 结构化输出

```python
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.functions import kernel_function, KernelArguments

class MenuPlugin:
    @kernel_function(description="Provides a list of specials from the menu.")
    def get_specials(self) -> Annotated[str, "Returns the specials from the menu."]:
        return "Special Soup: Clam Chowder\nSpecial Salad: Cobb Salad"

    @kernel_function(description="Provides the price of the requested menu item.")
    def get_item_price(self, menu_item: Annotated[str, "The name of the menu item."]) -> Annotated[str, "Returns the price."]:
        return "$9.99"

class MenuItem(BaseModel):
    price: float
    name: str

settings = OpenAIChatPromptExecutionSettings()
settings.response_format = MenuItem

agent = ChatCompletionAgent(
    service=AzureChatCompletion(),
    name="SK-Assistant",
    instructions="You are a helpful assistant.",
    plugins=[MenuPlugin()],
    arguments=KernelArguments(settings),
)
response = await agent.get_response("What is the price of the soup special?")
# Output: The price of the Clam Chowder, which is the soup special, is $9.99.
```

要点：
- `@kernel_function` 装饰器定义 Plugin 方法
- `plugins=[MenuPlugin()]` 注入 Agent
- `response_format = MenuItem` 做结构化输出

### 2.4 多 Agent 编排（GroupChat）

```python
from semantic_kernel.agents import ChatCompletionAgent, GroupChatOrchestration, RoundRobinGroupChatManager
from semantic_kernel.agents.runtime import InProcessRuntime

agents = [
    ChatCompletionAgent(name="Writer", instructions="...", service=AzureChatCompletion()),
    ChatCompletionAgent(name="Reviewer", instructions="...", service=AzureChatCompletion()),
]
group_chat = GroupChatOrchestration(
    members=agents,
    manager=RoundRobinGroupChatManager(max_rounds=5),
)
runtime = InProcessRuntime()
runtime.start()
result = await group_chat.invoke(task="Create a slogan...", runtime=runtime)
value = await result.get()
await runtime.stop_when_idle()
```

要点：
- `GroupChatOrchestration` + `RoundRobinGroupChatManager(max_rounds=5)`
- `InProcessRuntime` 管理生命周期
- Triage 模式：父 Agent 的 `plugins=[child_agent1, child_agent2]`（README 另有示例）

---

## 3. 稳定性 / HA

### 3.1 错误恢复

| 场景 | SK 行为 | openmate 应对 |
|---|---|---|
| 工具抛异常 | Filter 可捕获；默认可能中断 | 统一「错误字符串回传 LLM」 |
| 畸形 tool_call | 依赖 connector | 本地 JSON schema 校验 + 一次修复 |
| Thread 无限膨胀 | 无自动压缩 | 主动压缩或 MAF Harness |
| 多 Agent 子调用失败 | 父 thread 可能已消费部分消息 | 子 Agent 独立 thread，只回传摘要 |
| 凭据错误 | 连接失败 | 启动健康检查 + 明确错误 |

重试：依赖厂商 SDK 与 Polly（.NET）/ tenacity（Python，需自配）。

### 3.2 会话恢复

- Thread 序列化后可恢复，但无官方「崩溃续跑」原语
- Process Framework 事件流可审计，恢复语义弱于 LangGraph checkpoint

### 3.3 隔离

- 工具同进程，无沙箱
- MCP 可把危险工具放独立进程/容器
- Azure 生产建议 ManagedIdentity

### 3.4 幂等性与可观测

- OpenTelemetry 集成（Activity / tracing）
- 无内建 metrics dashboard，需接 Langfuse / Application Insights
- 无 WS idempotency key

### 3.5 Python API 契约（README 实读）

| 符号 | 用途 |
|------|------|
| `Kernel()` | 中枢；`add_service` 注册 AI Service |
| `KernelArguments` | prompt 参数注入（`{{$var}}`） |
| `@kernel_function` | Plugin 方法装饰器；`description` 进 schema |
| `ChatCompletionAgent` | Agent；`service`/`name`/`instructions`/`plugins`/`arguments` |
| `ChatHistory` | 消息历史；`system_message`/`add_user_message` |
| `GroupChatOrchestration` | 多 Agent 编排 |
| `RoundRobinGroupChatManager(max_rounds=5)` | 轮询策略 |
| `InProcessRuntime` | 生命周期；`start()`/`stop_when_idle()` |
| `OpenAIChatPromptExecutionSettings` | 执行设置；`response_format` 结构化输出 |

### 3.6 官方迁移声明（README 顶部）

> Semantic Kernel is now Microsoft Agent Framework! MAF is the enterprise-ready successor. MAF 1.0: production-ready release, stable APIs, long-term support.

含义：SK 新项目勿押注；openmate 应读 MAF。

### 3.7 Sample 路径（README 实读）

```
python/samples/getting_started_with_agents/          # Agent 入门
python/samples/getting_started_with_agents/multi_agent_orchestration/  # 多 Agent 编排
python/samples/getting_started_with_processes/       # Process Framework
python/samples/concepts/                             # 高级场景与集成
python/samples/concepts/setup/                       # API Key 配置
python/samples/getting_started/                      # 交互式 notebook
```

---

## 4. 自我进化

| 维度 | 现状 | OpenClaw 对照 |
|---|---|---|
| 记忆写入 | Memory store 可写向量库；无自动反思 | Dreaming 六信号 |
| 技能 | Plugin 四通道；ADR 0037 Agent Skills 在 MAF 演进 | SKILL.md + Workshop |
| 评测 | PromptFlow 链路；SK 本身弱 | 无内建 |
| 反馈 | Filter 可记录样本，需自建飞轮 | Self-Learning |

---

## 5. 对 openmate 的借鉴

### 直接可抄（P0/P1）

1. **Kernel = 注册中心**：工具、prompt、模型连接统一入口
2. **Plugin 四形态**：native + prompt + OpenAPI + MCP 同构接入
3. **Filter 钩子**：函数调用前后拦截，做权限/审计/截断
4. **Triage 分诊**：子 Agent 注册为父 Agent 的 plugin
5. **FunctionChoiceBehavior**：Auto/Required/None 显式控制自动执行
6. **GroupChatOrchestration**：Writer/Reviewer 多 Agent 轮询

### openmate 落地草图

```
openmate/
  kernel/
    registry.py      # Plugin 注册中心
    filters.py       # before_invoke / after_invoke / on_error
  plugins/
    native/          # 代码工具
    prompts/         # 提示模板即函数
    mcp/             # 外部 MCP 工具
  agents/
    triage.py        # 子 Agent 注册为 plugin 的分诊
```

最小 Filter 契约：`async def hook(ctx, next)`，ctx 含 tool_name/args/user/session。

### 应避免的坑

- 无内建 checkpoint / 压缩 / 预算：长任务会漂、会贵
- 三栈并行导致概念漂移，文档/示例常不同步
- 官方已迁 MAF，新项目勿押注 SK 新特性

### 重构优先级

- **P0**：统一工具注册面（Kernel 式）+ Filter 挂点
- **P0**：工具自动执行策略（Auto/Required/None）
- **P1**：分诊式多 Agent（子 Agent = 工具）
- **P1**：GroupChat 多 Agent 轮询
- **P2**：Process Framework 式长流程 Step 拆分

---

## 6. 源码锚点速查

```
python/README.md
  pip install semantic-kernel
  Kernel + OpenAIChatCompletion + invoke_prompt
  @kernel_function 装饰器
  ChatCompletionAgent + plugins=[MenuPlugin()]
  response_format = MenuItem（结构化输出）
  GroupChatOrchestration + RoundRobinGroupChatManager(max_rounds=5)
  InProcessRuntime.start() / stop_when_idle()
  LLM: OpenAI/Azure/HF/Mistral/Google/ONNX/Ollama/NIM
  VectorDB: Azure AI Search/Elasticsearch/Chroma

python/samples/
  getting_started_with_agents/
  getting_started_with_processes/
  concepts/
```

**未本轮打开**：Filter 实现、checkpoint 存储、middleware 签名。

### 7.1 官方迁移要点（README 顶部）

> Semantic Kernel is now Microsoft Agent Framework! MAF is the enterprise-ready successor. MAF 1.0: production-ready release, stable APIs, long-term support.

- 官方迁移指南：https://learn.microsoft.com/agent-framework/migration-guide/from-semantic-kernel
- SK 新项目勿押注；openmate 应读 MAF
- 三栈（Python/.NET/Java）概念漂移：文档/示例常不同步

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 4 | Plugin 统一 + FunctionChoiceBehavior 清晰 |
| 权限/安全边界 | 3 | Filter 可做；无内建审批策略 |
| 容错与会话恢复 | 2 | 无 checkpoint；恢复靠外挂 |
| 上下文工程 | 2 | 无自动压缩/预算；MAF Harness 才补齐 |
| 可扩展（技能/MCP） | **5** | 四形态 Plugin + MCP 原生 |
| 可观测与可评测 | 3 | OTel 有；评测靠 PromptFlow |
| 生产可用成熟度 | 3 | 企业用过，但官方迁 MAF |

**综合**：3.1 / 5 — 作为「工具注册与 Filter 模式」教材极佳；作为新基线应改读 MAF。

---

## 8. 错误与边界路径

### 8.1 凭据错误

- Azure：`DefaultAzureCredential` 探测慢 → 改 `ManagedIdentityCredential`
- OpenAI：`OPENAI_API_KEY` 未设 → 连接失败

### 8.2 工具异常

- Plugin 方法抛异常：Filter 可捕获；默认可能中断循环
- 畸形 tool_call：依赖 connector/厂商
- MCP server 不可达：对应工具调用失败

### 8.3 Thread 膨胀

- `ChatHistoryAgentThread` 无自动压缩 → 上下文溢出
- 无内建预算控制 → 长任务成本失控

### 8.4 OpenAPI 导入失败

- spec 不合法 → 导入报错
- 需校验 OpenAPI schema 后再注册

---

## 9. 关键链接

- README：https://github.com/microsoft/semantic-kernel  
- Learn：https://learn.microsoft.com/semantic-kernel  
- 迁移 MAF：https://learn.microsoft.com/agent-framework/migration-guide/from-semantic-kernel  
- 继任报告：`reports/microsoft-agent-framework.md`、`reports/promptflow-l1.md`、`reports/openclaw.md`
