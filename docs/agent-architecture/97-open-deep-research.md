# Open Deep Research 架构深度分析

> 项目地址：[langchain-ai/open_deep_research](https://github.com/langchain-ai/open_deep_research)
> 版本：v0.0.16 | 许可证：MIT | 作者：Lance Martin (LangChain)
> 分析日期：2026-09-13

---

## 一、项目定位与核心价值

Open Deep Research 是 LangChain 团队开源的**深度研究 Agent**，定位为"简单、可配置、完全开源"的自动化深度调研系统。它在 [Deep Research Bench Leaderboard](https://huggingface.co/spaces/Ayanami0730/DeepResearch-Leaderboard) 上取得了第 6 名的成绩（RACE Score 0.4344），与商业深度研究产品（如 Perplexity Pro、Gemini Deep Research）处于同一梯队。

核心设计理念是**"苦涩教训"（Bitter Lesson）**——与其用复杂的工程技巧优化研究流程，不如让模型更强、搜索更广、并发更多。这一理念体现在架构的极简主义上：整个系统只有一个主图（graph），没有复杂的路由逻辑，核心研究能力完全依赖于 LLM 的推理能力和搜索工具的信息覆盖度。

---

## 二、技术栈与依赖分析

### 2.1 核心框架

| 层级 | 技术选型 | 作用 |
|------|----------|------|
| Agent 编排 | **LangGraph** (≥0.5.4) | 状态图驱动的 Agent 循环 |
| LLM 抽象 | **LangChain** (`init_chat_model`) | 统一多模型接口 |
| 搜索集成 | Tavily / OpenAI / Anthropic 原生搜索 | 信息获取 |
| 扩展协议 | **MCP** (`langchain-mcp-adapters`) | 工具扩展 |
| 服务部署 | **LangGraph Platform** / LangGraph CLI | 本地/云端部署 |
| 可观测性 | **LangSmith** | 实验追踪与评估 |

### 2.2 模型依赖

系统支持极其广泛的 LLM 提供商，通过 `init_chat_model()` API 统一接入：
- **OpenAI**: GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, GPT-5, o3, o4-mini
- **Anthropic**: Claude Sonnet 4, Claude Opus 4
- **Google**: Gemini 1.5 Pro/Flash, Gemini Pro
- **其他**: DeepSeek, Groq, AWS Bedrock, Ollama（本地模型）

---

## 三、整体架构设计（10 维度分析）

### 维度 1：图拓扑结构 — 三层嵌套状态机

Open Deep Research 的核心是一张 **LangGraph 状态图**，采用三层嵌套设计：

```
┌─────────────────────────────────────────────┐
│ AgentState (主图)                            │
│  ├─ clarify_node    — 用户澄清               │
│  ├─ research_node   — 研究调度（Supervisor） │
│  │   ┌───────────────────────────────────┐  │
│  │   │ SupervisorState (子图)             │  │
│  │   │  ├─ supervisor — 任务拆分与委派     │  │
│  │   │  ├─ researcher — 并发研究子代理     │  │
│  │   │  │   ┌───────────────────────┐    │  │
│  │   │  │   │ ResearcherState       │    │  │
│  │   │  │   │  ├─ search (Tavily等) │    │  │
│  │   │  │   │  ├─ think_tool        │    │  │
│  │   │  │   │  └─ compress          │    │  │
│  │   │  │   └───────────────────────┘    │  │
│  │   │  └─ compress — 合并压缩             │  │
│  │   └───────────────────────────────────┘  │
│  └─ report_node    — 最终报告生成            │
└─────────────────────────────────────────────┘
```

**主图（AgentState）** 负责顶层流程控制：
1. `clarify_node` — 评估是否需要向用户提问
2. `research_node` — 启动 Supervisor 子图进行研究
3. `report_node` — 汇总所有研究结果生成最终报告

**子图（SupervisorState）** 负责研究任务的拆分和并发执行：
- Supervisor 分析研究问题，决定如何拆分为子任务
- 每个子任务分配给独立的 Researcher 子代理
- 最大并发数可配置（默认 5，上限 20）

**研究子代理（ResearcherState）** 负责单个主题的深度搜索：
- 工具调用循环：搜索 → 反思 → 再搜索
- 每个子代理有独立的消息历史和搜索预算

### 维度 2：状态管理 — 多状态类型 + 自定义 Reducer

系统定义了 **5 种状态类型**，各司其职：

| 状态类型 | 用途 | 关键字段 |
|----------|------|----------|
| `AgentInputState` | 主图输入 | `messages` |
| `AgentState` | 主图完整状态 | `supervisor_messages`, `research_brief`, `raw_notes`, `notes`, `final_report` |
| `SupervisorState` | Supervisor 子图状态 | `supervisor_messages`, `research_brief`, `research_iterations`, `raw_notes` |
| `ResearcherState` | 研究子代理状态 | `researcher_messages`, `tool_call_iterations`, `research_topic`, `compressed_research` |
| `ResearcherOutputState` | 研究子代理输出 | `compressed_research`, `raw_notes` |

核心设计亮点是 **`override_reducer`**：

```python
def override_reducer(current_value, new_value):
    if isinstance(new_value, dict) and new_value.get("type") == "override":
        return new_value.get("value", new_value)
    else:
        return operator.add(current_value, new_value)
```

这个自定义 Reducer 允许状态字段既能**累加**（默认行为，如追加消息），也能**覆盖**（当传入 `{"type": "override", "value": ...}` 时）。这解决了 LangGraph 中"有时需要追加、有时需要替换"的常见痛点。

### 维度 3：模型角色分工 — 四模型架构

系统将 LLM 拆分为 **4 个独立角色**，各用不同模型：

| 角色 | 默认模型 | 职责 | Token 消耗特点 |
|------|----------|------|----------------|
| **Summarization** | `gpt-4.1-mini` | 摘要搜索结果 | 低（每次搜索结果摘要） |
| **Research** | `gpt-4.1` | 驱动搜索 Agent | 高（工具调用循环） |
| **Compression** | `gpt-4.1` | 压缩研究发现 | 中（合并子代理结果） |
| **Final Report** | `gpt-4.1` | 生成最终报告 | 高（长报告生成） |

这种分工的经济逻辑清晰：
- **摘要模型**用便宜的小模型（mini/nano），因为搜索结果量大但任务简单
- **研究模型**用强模型，因为需要复杂的推理来决定搜索策略
- **压缩和报告模型**用强模型，因为需要保持信息完整性和报告质量

从评估数据看，使用 GPT-5 作为研究模型可将 RACE Score 从 0.4309 提升到 0.4943（+14.7%），但 token 消耗从 5800 万飙升到 2 亿。

### 维度 4：搜索集成 — 多源统一抽象

搜索层是系统获取外部信息的唯一入口，支持 4 种搜索后端：

1. **Tavily**（默认）：专业搜索 API，返回结构化结果 + 原始网页内容
2. **OpenAI 原生搜索**：利用 OpenAI 的内置 web search 能力
3. **Anthropic 原生搜索**：利用 Claude 的内置搜索能力
4. **MCP 工具**：通过 Model Context Protocol 接入任意搜索工具

Tavily 的集成最为完整，流程为：
```
查询列表 → 并发执行搜索 → URL 去重 → 并发摘要 → 格式化输出
```

关键设计决策：
- **并行搜索**：多个查询同时执行（`asyncio.gather`）
- **并行摘要**：多个搜索结果同时摘要
- **内容截断**：通过 `max_content_length`（默认 200,000 字符）控制输入长度
- **容错摘要**：摘要超时（60 秒）或失败时，回退返回原始内容

### 维度 5：MCP 扩展 — 标准化工具接入

系统通过 `langchain-mcp-adapters` 实现了完整的 MCP 支持：

```python
class MCPConfig(BaseModel):
    url: Optional[str]        # MCP 服务器 URL
    tools: Optional[List[str]] # 可用工具列表
    auth_required: Optional[bool] # 是否需要认证
```

MCP 工具加载流程：
1. 检查是否需要认证（OAuth token exchange via Supabase）
2. 通过 `MultiServerMCPClient` 连接 MCP 服务器
3. 获取可用工具列表
4. 过滤掉与内置工具冲突的工具名
5. 包装工具，添加 MCP 错误处理（如认证过期、交互要求）

这使得系统可以**零代码接入**任何 MCP 兼容的工具服务器，如数据库查询、API 调用、代码执行等。

### 维度 6：提示工程 — 分层 Prompt 体系

系统使用了 **6 个核心 Prompt**，形成完整的指令链：

| Prompt | 触发时机 | 核心指令 |
|--------|----------|----------|
| `clarify_with_user_instructions` | 首轮对话 | 判断是否需要向用户提问 |
| `transform_messages_into_research_topic` | 研究开始前 | 将对话历史转化为详细研究问题 |
| `lead_researcher_prompt` | Supervisor 激活时 | 指导任务拆分和委派策略 |
| `research_system_prompt` | Researcher 激活时 | 指导搜索策略和反思节奏 |
| `compress_research_system_prompt` | 研究完成后 | 指导信息压缩（保留原文） |
| `final_report_generation_prompt` | 报告生成时 | 指导报告结构和引用格式 |

**关键设计模式**：
- **预算控制**：Prompt 中硬编码了搜索次数上限（简单 2-3 次，复杂最多 5 次）
- **反思机制**：强制要求每次搜索后使用 `think_tool` 进行战略反思
- **语言一致性**：报告必须与用户输入语言一致
- **引用规范**：严格的 `[序号] 标题: URL` 格式

### 维度 7：反思工具（Think Tool）— 显式推理暂停点

`think_tool` 是一个**空操作工具**，其核心价值不是执行任何操作，而是**强制 LLM 在工具调用之间插入显式推理**：

```python
@tool(description="Strategic reflection tool for research planning")
def think_tool(reflection: str) -> str:
    return f"Reflection recorded: {reflection}"
```

设计意图：
- 在搜索后强制暂停，分析"找到了什么、还缺什么、是否足够"
- 避免 LLM 陷入"搜索成瘾"——不停搜索但不评估进展
- 为 Supervisor 和 Researcher 提供**结构化的决策点**

这与 Anthropic 的"extended thinking"理念一致：显式推理比隐式推理更可控。

### 维度 8：容错与边界处理

系统在多个层面实现了容错：

**Token 限制管理**：
- 内置 `MODEL_TOKEN_LIMITS` 字典，覆盖 30+ 模型的上下文窗口
- `_check_*_token_limit` 系列函数检测 OpenAI/Anthropic/Google 的 token 超限错误
- 超限时自动截断消息历史（`remove_up_to_last_ai_message`）

**摘要容错**：
- 摘要超时（60 秒）→ 返回原始内容
- 摘要异常 → 返回原始内容
- 结构化输出失败 → 重试（默认 3 次）

**搜索容错**：
- 搜索结果为空 → 提示用户换查询或换搜索 API
- URL 去重 → 避免重复处理同一页面
- MCP 连接失败 → 静默降级，返回空工具列表

### 维度 9：配置系统 — OAP 兼容的声明式配置

`Configuration` 类使用 Pydantic BaseModel，所有字段都带有 `x_oap_ui_config` 元数据，支持 **Open Agent Platform (OAP)** 的自动 UI 生成：

```python
max_concurrent_research_units: int = Field(
    default=5,
    metadata={
        "x_oap_ui_config": {
            "type": "slider",
            "default": 5,
            "min": 1,
            "max": 20,
            "step": 1,
            "description": "Maximum number of research units..."
        }
    }
)
```

UI 组件类型映射：
- `"number"` → 数字输入框
- `"boolean"` → 开关
- `"slider"` → 滑块
- `"select"` → 下拉选择
- `"text"` → 文本输入

这使得非技术用户可以通过 OAP Web UI 直接调整 Agent 行为，无需修改代码。

### 维度 10：评估体系 — 标准化 Benchmark 集成

系统内置了完整的评估流水线：

1. **数据集**：Deep Research Bench（100 个 PhD 级研究任务，50 英文 + 50 中文，覆盖 22 个领域）
2. **评估指标**：RACE Score（LLM-as-a-Judge，使用 Gemini 作为评判模型）
3. **执行流程**：
   ```
   LangSmith 数据集 → run_evaluate.py → 实验结果
   → extract_langsmith_data.py → JSONL 提交文件
   → Deep Research Bench 排行榜
   ```
4. **成本预估**：100 个样本约 $20-$100（取决于模型选择）

评估结果对比：

| 配置 | RACE Score | Token 消耗 | 成本 |
|------|-----------|-----------|------|
| GPT-5 (研究) | **0.4943** | 204M | — |
| Claude Sonnet 4 (研究) | 0.4401 | 139M | $187 |
| GPT-4.1 默认 | 0.4309 | 58M | $46 |
| GPT-4.1-nano 摘要 + GPT-4.1 研究 | 0.4344 | 207M | $88 |

---

## 四、遗留实现对比

`src/legacy/` 目录包含两种早期实现，提供了不同的设计思路：

### 4.1 Workflow 实现（`legacy/graph.py`）
- **Plan-and-Execute** 模式：先规划报告大纲，再逐章节撰写
- 人机协作：允许用户审批和修改报告计划
- 串行处理：逐章节生成，带反思循环
- 质量优先：通过迭代精炼保证准确性

### 4.2 Multi-Agent 实现（`legacy/multi_agent.py`）
- **Supervisor-Researcher** 模式：协调多个并行研究代理
- 并行处理：多个 Researcher 同时工作
- 速度优先：通过并发加速报告生成
- MCP 支持：广泛的 Model Context Protocol 集成

当前版本实际上**融合了两者优点**：保留了 Supervisor-Researcher 的并发架构，同时通过 `think_tool` 和迭代反思引入了 Workflow 实现的质量控制机制。

---

## 五、架构优势与局限

### 优势
1. **极简核心**：整个系统只有一个主图 + 一个子图，代码量小，易于理解和修改
2. **模型无关**：通过 `init_chat_model()` 支持 10+ LLM 提供商
3. **搜索无关**：支持 Tavily、OpenAI、Anthropic、MCP 四种搜索后端
4. **并发可控**：`max_concurrent_research_units` 精细控制并行度
5. **标准化评估**：内置 Deep Research Bench 评估流水线
6. **OAP 集成**：声明式配置自动生成 Web UI

### 局限
1. **无记忆持久化**：每次研究都是独立会话，没有跨会话的知识积累
2. **无来源验证**：搜索结果直接使用，没有事实核查机制
3. **硬编码预算**：搜索次数上限写在 Prompt 中，不够灵活
4. **单语言报告**：虽然支持多语言输入，但报告语言跟随输入语言，不支持主动翻译
5. **成本敏感**：100 个样本评估就要 $20-$100，生产环境成本需要仔细控制

---

## 六、对 OpenMate 的启示

1. **三层嵌套图**的设计模式值得借鉴：主流程 → 任务调度 → 具体执行
2. **四模型分工**的经济模型可以复用：摘要用小模型、推理用强模型
3. **think_tool** 的反思机制是低成本高收益的质量提升手段
4. **override_reducer** 解决了 LangGraph 中常见的"追加 vs 替换"状态管理难题
5. **OAP 元数据**的配置 UI 自动生成思路可以用于 OpenMate 的 Agent 配置界面

---

*本文档基于 Open Deep Research v0.0.16 源码分析生成。*
