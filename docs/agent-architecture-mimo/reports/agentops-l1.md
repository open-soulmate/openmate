# AgentOps-AI/agentops — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/AgentOps-AI/agentops  
> 抓取通道: cdn.jsdelivr.net/gh/AgentOps-AI/agentops@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 可观测 / 装饰器 spans / 框架集成 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（装饰器、集成、roadmap、依赖项目）
- 未打开: `agentops/` 源码、`app/` 自托管实现
- License: MIT
- App **开源**（app 目录）

---

## 1. 项目定位（README 实读）

> "Observability and DevTool platform for AI Agents"

帮助开发者 **build, evaluate, monitor** AI agents：从原型到生产。

功能:
- Replay Analytics and Debugging（step-by-step 执行图）
- LLM Cost Management
- Framework Integrations（CrewAI, AG2, Agno, LangGraph 等）
- Self-Host

---

## 2. 快速开始（README 实读）

```bash
pip install agentops
```

```python
import agentops
agentops.init(<API KEY>)
...
agentops.end_session('Success')
```

---

## 3. 装饰器 Span 体系（README 代码实读）

### 3.1 五种装饰器

| 装饰器 | 层级 | 用途 |
|--------|------|------|
| `@session` | root | 会话根 span |
| `@agent` | agent | Agent 操作 |
| `@operation` / `@task` | op/task | 具体操作 |
| `@workflow` | workflow | 多操作工作流 |

### 3.2 示例（源码实读）

```python
from agentops.sdk.decorators import session, agent, operation, task, workflow

@session
def my_workflow():
    return result

@agent
class MyAgent:
    def __init__(self, name):
        self.name = name

@operation  # or @task
def process_data(data):
    return result

@workflow
def my_workflow(data):
    return result

# 嵌套
@agent
class MyAgent:
    @operation
    def nested_operation(self, message):
        return f"Processed: {message}"

    @operation
    def main_operation(self):
        return self.nested_operation("test message")

@session
def my_session():
    agent = MyAgent()
    return agent.main_operation()
```

### 3.3 所有装饰器支持

- Input/Output Recording
- Exception Handling
- Async/await
- Generator functions
- Custom attributes and names

---

## 4. 集成矩阵（README 实读）

### 4.1 OpenAI Agents SDK

**Python**:
```bash
pip install openai-agents
```

**TypeScript**:
```bash
npm install agentops @openai/agents
```

### 4.2 CrewAI

```bash
pip install 'crewai[agentops]'
# 仅需 AGENTOPS_API_KEY env
```

### 4.3 AG2 (AutoGen)

`agentops.init()` + `AGENTOPS_API_KEY`

### 4.4 Camel AI

```bash
pip install "camel-ai[all]==0.2.11"
pip install agentops
```

**重要顺序（README 代码注释）**: `agentops.init()` 之后再 import toolkits。

```python
agentops.init(os.getenv("AGENTOPS_API_KEY"), tags=["CAMEL Example"])
from camel.toolkits import SearchToolkit  # after init
```

### 4.5 LangChain

```bash
pip install agentops[langchain]
```

```python
from agentops.integration.callbacks.langchain import LangchainCallbackHandler
handler = LangchainCallbackHandler(api_key=..., tags=[...])
llm = ChatOpenAI(..., callbacks=[handler])
agent = initialize_agent(..., callbacks=[handler], handle_parsing_errors=True)
```

**必须显式传 callbacks** 才会记录。

### 4.6 其他

Cohere（>=5.4.0）、Anthropic（>=0.32.0，sync/stream/async）、Mistral、CamelAI、LiteLLM（>=1.3.1）、LlamaIndex（`llama-index-instrumentation-agentops` + `set_global_handler("agentops")`）、Llama Stack（>=0.0.53）、SwarmZero

---

## 5. 自托管（README 实读）

完整 App（Dashboard + API backend）在 `app/README.md`。

---

## 6. Roadmap（README 表实读）

### 6.1 Platform / Dashboard / Evals

| 项 | 状态 |
|----|------|
| Python SDK | ✅ |
| Evaluation builder API | 🚧 |
| JS/TS SDK (Alpha) | 🚧 agentops-node |
| Multi-session metrics | ✅ |
| Custom event tags | ✅ |
| Session replays | ✅ |
| Custom eval metrics | ✅ |
| Agent scorecards | 🔜 |
| Eval playground + leaderboard | 🔜 |

### 6.2 Debugging

| 项 | 状态 |
|----|------|
| Event latency analysis | ✅ |
| Agent workflow pricing | ✅ |
| Success validators | 🚧 |
| Agent controllers/skill tests | 🔜 |
| Info context constraint testing | 🔜 |
| Non-stationary env testing | 🔜 |
| Multi-modal envs | 🔜 |
| Execution containers | 🔜 |
| LLM non-deterministic detection | 🔜 |
| Token limit overflow flags | 🚧 |
| Context limit overflow flags | 🚧 |
| Infinite loops / recursive thought | 🚧 |
| Faulty reasoning detection | 🔜 |
| **Honeypot + prompt injection (PromptArmor)** | ✅ |
| Anti-agent roadblocks (Captchas) | 🔜 |
| API bill tracking | ✅ |
| Multi-agent framework visualization | ✅ |

---

## 7. 与 openmate 映射

| 需求 | AgentOps 机制 | 可复用度 |
|------|--------------|----------|
| 装饰器 spans | session/agent/operation/task/workflow | **高** |
| 嵌套 span 层级 | @agent 内 @operation | **高** |
| 一行 init + end_session | 成功/失败字符串 | **高** |
| tags 参数 | 会话标签 | 高 |
| 异步/生成器支持 | 装饰器全支持 | **高** |
| I/O + 异常记录 | 默认 | **高** |
| 框架 callback handler | LangChain 等 | **高** |
| init 后再 import 工具 | Camel 顺序要求 | **P0 教训** |
| OpenAI Agents 双语言 | Python + TS | **高** |
| PromptArmor 集成 | honeypot + 注入检测 | **高** |
| API bill tracking | ✅ | 高 |
| Multi-agent 可视化 | ✅ | 高 |
| Self-host app 开源 | app/ 目录 | **高** |
| MIT | 宽松 | 高 |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 包 | agentops (PyPI) | README |
| TS 包 | agentops + @openai/agents | README |
| TS SDK 独立 | agentops-node (Alpha) | README |
| CrewAI extra | crewai[agentops] | README |
| LangChain extra | agentops[langchain] | README |
| Camel pin 示例 | camel-ai[all]==0.2.11 | README |
| Cohere | >=5.4.0 | README |
| Anthropic | >=0.32.0 | README |
| LiteLLM | >=1.3.1 | README |
| Llama Stack | >=0.0.53 | README |
| LlamaIndex 包 | llama-index-instrumentation-agentops | README |
| 装饰器 | session, agent, operation, task, workflow | README |
| end_session | 'Success' 等字符串 | README |
| License | MIT | README |
| App | 开源 app/ | README |

---

## 9. 失败路径 / 边界

```
未调 end_session
  → 会话可能不完整

LangChain 未传 callbacks=[handler]
  → 不记录（README 明确）

Camel 在 init 前 import toolkits
  → 工具调用可能漏记

无 AGENTOPS_API_KEY
  → CrewAI/AG2 集成失败

TS SDK 仍 Alpha
  → agentops-node

Evaluation builder API
  → 🚧 未完成

PromptArmor 之外的注入
  → Captcha 检测 🔜

Token/context overflow
  → 🚧 仅 flags 部分
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **五层装饰器 spans**: session / agent / operation / task / workflow
2. **嵌套装饰器**形成 span 树
3. **init 顺序**: 先 agentops.init 再 import 工具（Camel 教训）
4. **end_session(status)** 显式收尾
5. **装饰器默认记录 I/O + 异常 + async + generator**
6. **callback handler 集成模式**（LangChain 必须显式传）
7. **双语言 SDK**（Python + TS）
8. **Self-host app 开源**
9. **PromptArmor honeypot + 注入检测**作为安全观测
10. **API bill tracking + multi-agent 可视化**作为标配

### P1

- tags 会话标签
- Event latency analysis
- Token/context overflow flags

### P2

- Agent scorecards
- Eval playground + leaderboard

---

## 11. 应避免的坑

- 勿在 init 前 import 工具包（Camel）
- 勿忘传 LangChain callbacks
- 勿忘 end_session
- TS SDK 仍 Alpha
- 勿发明 agentops/ 内部路径

---

## 12. 源码锚点速查

```
README.md
  pip install agentops
  agentops.init(KEY); agentops.end_session('Success')
  Decorators: session, agent, operation, task, workflow
  Nested @agent + @operation supported
  Features: I/O, exceptions, async, generators, custom attrs
  Integrations: OpenAI Agents (Py+TS), CrewAI, AG2, Camel, LangChain,
    Cohere, Anthropic, Mistral, LiteLLM, LlamaIndex, Llama Stack, SwarmZero
  Camel order: init BEFORE toolkits import
  LangChain: must pass callbacks=[handler]
  Self-host: app/README.md (open source app)
  Security: PromptArmor honeypot + prompt injection ✅
  Pricing: API bill tracking ✅
  Multi-agent viz ✅
  TS: agentops-node Alpha
  License: MIT
```

**未本轮打开**: `agentops/` 实现、`app/` 细节。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 观测向 |
| 权限/安全边界 | 4 | PromptArmor |
| 容错与会话恢复 | 3 | session replay |
| 上下文工程 | 2 | 非本职 |
| 可扩展（技能/MCP） | 4 | 多框架集成 |
| 可观测与可评测 | 5 | 本职 |
| 生产可用成熟度 | 4 | MIT + self-host |

**综合**: **Agent 装饰器可观测 + 多框架集成**。openmate 抄五层 spans、init 顺序、callback 显式传参与注入检测。

---

## 14. 关键链接

- https://github.com/AgentOps-AI/agentops
- https://docs.agentops.ai/
- https://github.com/AgentOps-AI/agentops-node
- 相关: `reports/openllmetry-l1.md`、`reports/langfuse.md`、`reports/openai-agents-js-l1.md`

---

## 15. 附录 A — 五层 Span openmate 规范（P0）

```
@session          → root span（一次用户任务）
  @workflow       → 多步骤编排
    @agent        → Agent 执行
      @operation  → 具体操作（或 @task）
```

嵌套规则:
- session 必须唯一 root
- agent 可嵌套 operation
- workflow 可含多 agent
- 装饰器自动记录 I/O、异常、async、generator

openmate:
```python
from openmate.telemetry import session, agent, operation, workflow

@session
def handle_user_task(...): ...

@agent
class ResearchAgent:
    @operation
    def search(self, q): ...
```

---

## 16. 附录 B — init 顺序（P0 教训）

Camel 集成 README 实读:
```python
agentops.init(...)                    # 必须先
from camel.toolkits import SearchToolkit  # 后 import
```

原因: instrumentation 需在工具包加载前挂上。

openmate:
- 文档强调顺序
- 提供 `openmate.instrument()` 一行入口
- 误序时 WARN 并尝试补挂

---

## 17. 附录 C — Callback 显式传参

LangChain README 实读:
```python
llm = ChatOpenAI(..., callbacks=[handler])
agent = initialize_agent(..., callbacks=[handler])
```

**必须显式传**，否则不记录。

openmate:
- 默认注入 handler
- 允许 `callbacks=False` 关闭
- 文档标明「不传则盲区」

---

## 18. 附录 D — 失败路径明细

```
未 end_session
  → 会话不完整
  → openmate: 进程退出钩子自动 end

init 前 import 工具
  → 漏记
  → openmate: 顺序检测 + WARN

LangChain 无 callbacks
  → 盲区
  → openmate: 默认注入

无 AGENTOPS_API_KEY
  → 集成失败
  → openmate: 降级本地 exporter

TS SDK Alpha
  → 功能不全
  → openmate: TS 侧标注 experimental

Token overflow flags 仍 🚧
  → 部分能力
  → openmate: 自实现上限检测
```

---

## 19. 附录 E — Roadmap 状态对照

| 能力 | AgentOps | openmate |
|------|:---:|:---:|
| Python SDK | ✅ | ✅ |
| Session replays | ✅ | P1 |
| API bill tracking | ✅ | P0 |
| Multi-agent viz | ✅ | P1 |
| Prompt injection | ✅ | P0 |
| Token overflow flags | 🚧 | P0 自建 |
| Agent scorecards | 🔜 | P2 |
| JS/TS SDK | 🚧 | P1 |

---

## 20. 附录 F — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 装饰器 | session/agent/operation/task/workflow | README |
| init + end_session | 两行接入 | README |
| Camel 顺序 | init 先于 toolkits | README |
| LangChain | 必须 callbacks=[handler] | README |
| PromptArmor | ✅ | roadmap |
| API bill | ✅ | roadmap |
| License | MIT | README |
| App 开源 | app/ | README |

---

## 21. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 3 | 观测向 |
| 权限安全 | 4 | PromptArmor |
| 容错恢复 | 3 | session replay |
| 上下文 | 2 | 非本职 |
| 可扩展 | 4 | 多框架 |
| 可观测 | 5 | 本职 |
| 成熟度 | 4 | MIT + self-host |

**净推荐**: openmate 抄 **五层 spans + init 顺序 + 默认注入 callback + 注入检测** 为 Agent 可观测 P0。覆盖 12+ 框架集成，MIT 许可可自托管。
