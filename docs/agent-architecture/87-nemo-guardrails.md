# NeMo Guardrails 架构深度分析

> **仓库**: [NVIDIA/NeMo-Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) | **Stars**: 6,629 | **License**: Apache 2.0
> **论文**: [arXiv:2310.10501](https://arxiv.org/abs/2310.10501) | **版本**: v0.23.0 | **语言**: Python 3.10-3.13

NeMo Guardrails 是 NVIDIA 开源的 LLM 对话应用可编程护栏（Programmable Guardrails）工具包，旨在为基于大语言模型的对话系统添加可配置、可审计的安全控制层。它不是简单的"过滤器"，而是一个完整的对话状态机运行时，通过自研的 Colang 语言定义对话流，实现对 LLM 输入/输出的精确管控。

---

## 1. 整体架构设计

NeMo Guardrails 采用**分层拦截管线**（Pipeline）架构，将护栏插入应用代码与 LLM 之间。核心思想是：用户消息不直接发送给 LLM，而是经过一个由 Colang 驱动的状态机运行时，按预定义流程进行多阶段处理。

```
用户输入 → [Input Rails] → [Dialog Rails] → [Retrieval Rails] → LLM → [Execution Rails] → [Output Rails] → 用户
```

架构核心组件：
- **LLMRails**：主入口类，继承自 `BaseGuardrails`，提供 `generate()` / `generate_async()` / `stream_async()` 三个同步/异步/流式接口
- **RailsConfig**：基于 Pydantic 的配置模型，支持 YAML + Colang 双格式定义
- **Runtime**：对话流运行时，分为 `RuntimeV1_0`（Colang 1.0）和 `RuntimeV2_x`（Colang 2.x）两个实现
- **ActionDispatcher**：动作分发器，将 Colang 中声明的动作映射到 Python 函数执行

这种分层设计使得护栏可以独立于具体的 LLM 后端工作，支持 OpenAI、LLaMA、Falcon、Vicuna、Mosaic 等多种模型。

---

## 2. Colang 对话建模语言

Colang（Conversation Language）是 NeMo Guardrails 的核心创新，一种专为对话流设计的领域特定语言（DSL）。它采用 Python 风格语法，支持两种版本：

**Colang 1.0**：基于意图匹配的声明式语法
```colang
define user express greeting
  "Hello!"
  "Good afternoon!"

define flow
  user express greeting
  bot express greeting
  bot offer to help
```

**Colang 2.x**：引入事件驱动的状态机语义，支持 `match`、`await`、`start`、`send` 等操作符，以及 `fork/merge` 并行分支、`@override` 流覆盖等高级特性。Colang 2.x 的运行时基于**流头（FlowHead）驱动的状态机**，每个流实例维护多个执行头，通过事件匹配推进状态转换。

Colang 的关键设计决策：
- 使用 `COLANGPATH` 环境变量管理标准库路径
- 内置标准库位于 `nemoguardrails/colang/v2_x/library/`
- 支持流覆盖（override）机制，允许用户流替换系统流
- 流配置通过 `FlowConfig` 对象管理，包含元素列表、装饰器、参数等元数据

---

## 3. 五层护栏体系

NeMo Guardrails 定义了五种护栏类型，覆盖完整的请求生命周期：

| 护栏类型 | 触发时机 | 能力 |
|---------|---------|------|
| **Input Rails** | 用户输入后 | 拒绝/修改输入，敏感数据脱敏，越狱检测 |
| **Dialog Rails** | 对话管理阶段 | 控制对话流，决定调用哪个动作或提示 LLM |
| **Retrieval Rails** | RAG 检索后 | 过滤/修改检索到的文档块 |
| **Execution Rails** | 工具/动作调用前后 | 校验工具输入输出 |
| **Output Rails** | LLM 输出后 | 内容审核、幻觉检测、事实核查 |

每种护栏通过 Colang flow 定义，在 `config.yml` 中激活：
```yaml
rails:
  input:
    flows:
      - check jailbreak
      - mask sensitive data on input
  output:
    flows:
      - self check facts
      - self check hallucination
```

---

## 4. 状态机运行时引擎

运行时是 NeMo Guardrails 最复杂的组件。以 Colang 2.x 的 `RuntimeV2_x` 为例，其核心是 `statemachine.py` 中实现的**事件驱动状态机**：

- **State**：全局状态对象，包含 `flow_states`（所有流实例）、`flow_configs`（流配置）、`actions`（已注册动作）、`context`（共享上下文）、`internal_events`（事件队列）
- **FlowState**：单个流实例的状态，包含 `heads`（执行头字典）、`context`（局部上下文）、`loop_id`（交互循环标识）
- **FlowHead**：执行头，表示流中的当前位置，包含 `position`（元素索引）、`matching_scores`（匹配分数）、`status`（ACTIVE/INACTIVE/MERGING）
- **run_to_completion()**：核心循环，处理外部事件直到所有头稳定

状态机的执行流程：
1. 接收外部事件（如用户消息）
2. 遍历所有活跃流的执行头，检查事件匹配
3. 匹配成功的头推进到下一个元素
4. 处理 `fork/merge` 并行分支（通过匹配分数竞争选择胜出头）
5. 执行动作并收集输出事件
6. 循环直到没有头可以推进

---

## 5. LLM 生成与提示管理

`LLMGenerationActions` 类封装了所有需要调用 LLM 的生成动作：

- **用户意图识别**：通过嵌入向量索引（`EmbeddingsIndex`）匹配最相似的用户消息示例，将自然语言映射到规范形式（canonical form）
- **流匹配**：根据识别出的意图，在流索引中搜索相关的对话流步骤
- **Bot 消息生成**：基于匹配的流步骤，使用 Jinja2 沙盒模板渲染 bot 响应
- **单次调用优化**：`generate_intent_steps_message()` 方法将意图识别、流匹配、消息生成三个阶段合并为一次 LLM 调用

提示模板通过 `LLMTaskManager` 管理，支持任务类型（`Task.GENERATE_USER_INTENT`、`Task.GENERATE_BOT_MESSAGE` 等）的灵活配置。关键设计：用户消息和 bot 消息都通过嵌入索引进行语义检索，而非简单的字符串匹配。

---

## 6. 内置护栏库

`nemoguardrails/library/` 目录包含丰富的开箱即用护栏：

**安全检测类**：
- `check_jailbreak`：越狱攻击检测（支持模型和启发式两种方式）
- `self_check_input` / `self_check_output`：LLM 自检输入/输出审核
- `self_check_facts` / `self_check_hallucination`：事实核查和幻觉检测
- `injection_detection`：SQL/模板/代码/XSS 注入检测（基于 YARA 规则）

**数据保护类**：
- `mask_sensitive_data`：基于 Presidio 的 PII 脱敏（支持 PERSON、EMAIL_ADDRESS 等实体）
- `gliner`：基于 GLiNER 模型的 PII 检测
- `privateai`：Private AI 集成
- `regex_detection`：正则表达式模式检测

**第三方集成**：
- `activefence`：ActiveFence 内容安全 API
- `patronus`：Patronus 评估 API
- `autoalign`：AutoAlign 护栏 API
- `fiddler`：Fiddler 护栏集成
- `llama_guard`：Meta Llama Guard 模型

**NVIDIA 专有模型**：
- `content_safety`：NVIDIA 内容安全模型（支持推理模式）
- `topic_safety`：NVIDIA 主题安全模型
- `nemoguard_jailbreak_detect`：NVIDIA 越狱检测 NIM
- `nemoguard_content_safety`：NVIDIA 内容安全 NIM

---

## 7. 配置体系

配置通过 `RailsConfig`（Pydantic BaseModel）管理，支持 YAML + Colang 双格式：

**config.yml 结构**：
- `models[]`：LLM 模型配置（type/engine/model/parameters）
- `instructions[]`：系统指令
- `rails`：护栏激活配置（input/output/retrieval/execution/dialog）
- `core`：核心配置（嵌入搜索提供者、推理模式等）
- `knowledge_base`：RAG 知识库配置
- `sensitive_data_detection`：PII 检测配置
- `jailbreak_detection`：越狱检测配置
- `injection_detection`：注入检测配置
- `content_safety`：内容安全配置（多语言拒绝消息、推理模式）
- `tracing`：追踪配置
- `streaming`：流式输出配置

**配置文件目录结构**：
```
config/
├── config.yml          # 主配置
├── config.py           # 自定义初始化代码
├── actions.py          # 自定义 Python 动作
├── rails.co            # Colang 护栏定义
├── greeting.co         # 示例对话流
└── ...
```

关键配置能力：
- 支持多 LLM 引擎配置（main + action-specific LLM）
- 支持模型缓存（`ModelCacheConfig`，LFU 策略）
- 支持多语言拒绝消息（`MultilingualConfig`，9 种语言）
- 支持上下文膨胀检测（`ContextBloatDetectionConfig`，基于熵/重复率/运行长度）

---

## 8. 动作系统与扩展机制

动作（Action）是 Colang 流程与外部世界交互的桥梁：

**内置系统动作**：
- `GenerateUserIntent`：用户意图识别
- `GenerateBotMessage`：Bot 消息生成
- `GenerateFlow`：动态流生成
- `AddFlowsAction` / `RemoveFlowsAction`：运行时动态添加/移除流
- `UtteranceBotAction`：发送 bot 消息
- `UtteranceUserAction`：处理用户消息

**自定义动作注册**：
```python
from nemoguardrails.actions import action

@action(is_system_action=True)
async def my_custom_action(param1: str, llm=None):
    # 自定义逻辑
    return ActionResult(return_value="result", context_updates={"key": "value"})
```

**动作服务器**：支持通过 HTTP API 将动作分发到远程服务器执行（`actions_server_url`），实现动作的微服务化部署。

**扩展点**：
- `config.py` 的 `init()` 函数：在初始化时注册额外的 LLM 提供者、嵌入模型等
- `register_embedding_search_provider()`：注册自定义嵌入搜索提供者
- `register_embedding_provider()`：注册自定义嵌入模型
- `passthrough_fn`：旁路模式，跳过 LLM 直接使用自定义函数生成响应

---

## 9. 集成与部署

NeMo Guardrails 提供多种集成方式：

**Python API**（库模式）：
```python
from nemoguardrails import LLMRails, RailsConfig
config = RailsConfig.from_path("PATH/TO/CONFIG")
rails = LLMRails(config)
completion = rails.generate(messages=[{"role": "user", "content": "Hello!"}])
```

**Guardrails Server**（HTTP 服务模式）：
- 内置 FastAPI 服务器
- 支持 Docker 部署（提供 Dockerfile）
- 兼容 OpenAI Chat Completions API 格式

**Actions Server**：
- 独立的动作执行服务
- 通过 HTTP POST `/v1/actions/run` 调用
- 支持系统动作本地执行 + 非系统动作远程执行的混合模式

**CLI 工具**：
- `nemoguardrails server`：启动服务器
- `nemoguardrails evaluate`：运行评估（支持主题护栏、事实核查、审核、幻觉检测）
- `nemoguardrails chat`：交互式对话测试

**异步优先设计**：
- 核心机制基于 Python asyncio 实现
- 所有公共方法同时提供同步和异步版本（如 `generate()` / `generate_async()`）
- 支持流式输出（`stream_async()` 返回 `AsyncIterator`）

---

## 10. 评估与可观测性

**评估工具**：
- `nemoguardrails evaluate`：内置评估命令
- 支持主题护栏、事实核查、审核（越狱和输出审核）、幻觉检测的评估
- LLM 漏洞扫描：针对常见攻击向量的自动化检测

**追踪与日志**：
- `InteractionLogAdapters`：追踪适配器，支持自定义追踪后端
- `ExplainInfo`：可解释性信息，记录 Colang 历史、LLM 调用详情
- `LLMStats`：LLM 调用统计（调用次数、token 用量等）
- `GenerationLog`：生成日志，记录完整的处理管线
- 处理日志（`processing_log`）：记录每个阶段的输入输出

**遥测**：
- 默认收集匿名使用数据（库版本、Python 版本、配置的 LLM 引擎类型等）
- 不收集用户内容、模型名称、API 密钥、IP 地址
- 可通过环境变量 `NEMO_GUARDRAILLS_DISABLE_TELEMETRY=1` 禁用

**缓存**：
- `LFUCache`：最不经常使用缓存策略
- 支持每模型独立缓存配置
- 缓存统计跟踪和日志记录

---

## 架构评价

### 优势
1. **Colang 语言创新**：自研的对话建模语言提供了比纯 YAML/JSON 更表达力的对话流定义方式
2. **五层护栏体系**：覆盖从输入到输出的完整生命周期，每层可独立配置
3. **状态机运行时**：事件驱动的流头状态机支持复杂的对话分支和并行逻辑
4. **丰富的内置库**：开箱即用的安全检测、PII 脱敏、第三方集成
5. **LLM 无关性**：支持多种 LLM 后端，护栏逻辑与模型解耦

### 局限
1. **学习曲线**：Colang 语言需要额外学习成本，文档虽完善但概念较多
2. **性能开销**：多层护栏的嵌入检索和 LLM 调用会增加延迟（特别是 self-check 类护栏）
3. **Colang 版本分裂**：1.0 和 2.x 差异较大，迁移成本高
4. **状态管理复杂**：`events_history_cache` 的隐式缓存在多会话场景下可能引发问题

### 适用场景
- 需要精细控制对话流程的企业级 AI 助手
- RAG 应用的事实核查和输出审核
- 合规敏感场景的数据脱敏和内容审核
- 多轮对话的状态管理和流程编排
