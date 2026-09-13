# langchain-ai/open_deep_research — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/langchain-ai/open_deep_research  
> 抓取通道: cdn.jsdelivr.net/gh/langchain-ai/open_deep_research@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供深度研究编排 / 多模型分工 / MCP / 评测 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md`（完整）、`src/open_deep_research/configuration.py`（完整 Configuration + SearchAPI + MCPConfig）
- 未打开: graph 节点实现、subagent 定义
- 所有默认值与 token 上限均源码实读

---

## 1. 项目定位（README 实读）

**可配置、全开源的深度研究 agent**，跨多模型 provider、搜索工具、MCP server。Deep Research Bench 排名曾 #6（RACE 0.4344），后 GPT-5 达 0.4943。

### 1.1 版本节点

| 日期 | 事件 |
|------|------|
| 2025-08-14 | 免费课程 + deep_research_from_scratch |
| 2025-08-07 | GPT-5 支持 + Bench 更新 |
| 2025-08-02 | Bench #6，RACE 0.4344 |
| 2025-07-30 | blog: bitter lesson 演化 |
| 2025-07-16 | blog + video |

### 1.2 评测结果（README 表实读）

| 配置 | Summarization | Research | Compression | Cost | Tokens | RACE |
|------|---------------|----------|-------------|------|--------|------|
| GPT-5 | gpt-4.1-mini | gpt-5 | gpt-4.1 | — | 204,640,896 | **0.4943** |
| Defaults | gpt-4.1-mini | gpt-4.1 | gpt-4.1 | $45.98 | 58,015,332 | 0.4309 |
| Claude Sonnet 4 | gpt-4.1-mini | claude-sonnet-4 | gpt-4.1 | $187.09 | 138,917,050 | 0.4401 |
| Bench Submission | gpt-4.1-nano | gpt-4.1 | gpt-4.1 | $87.83 | 207,005,549 | 0.4344 |

**成本警告**: 跑 100 例约 **$20–$100**（视模型）。

---

## 2. Configuration 全量常量（configuration.py 源码实读）

### 2.1 SearchAPI 枚举

```python
class SearchAPI(Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    TAVILY = "tavily"
    NONE = "none"
```

默认: `SearchAPI.TAVILY`

### 2.2 MCPConfig

```python
class MCPConfig(BaseModel):
    url: Optional[str] = None
    tools: Optional[List[str]] = None
    auth_required: bool = False
```

### 2.3 Configuration 默认值（全部源码实读）

| 字段 | 默认 | UI 元数据 min/max |
|------|------|-------------------|
| max_structured_output_retries | **3** | 1–10 |
| allow_clarification | **True** | boolean |
| max_concurrent_research_units | **5** | 1–20 step 1 |
| search_api | **TAVILY** | select |
| max_researcher_iterations | **6** | 1–10 |
| max_react_tool_calls | **10** | 1–30 |
| summarization_model | **openai:gpt-4.1-mini** | text |
| summarization_model_max_tokens | **8192** | number |
| max_content_length | **50000** | 1000–200000 |
| research_model | **openai:gpt-4.1** | text |
| research_model_max_tokens | **10000** | number |
| compression_model | **openai:gpt-4.1** | text |
| compression_model_max_tokens | **8192** | number |
| final_report_model | **openai:gpt-4.1** | text |
| final_report_model_max_tokens | **10000** | number |
| mcp_config | None | mcp |
| mcp_prompt | None | text |

### 2.4 从 RunnableConfig 加载（源码）

```python
@classmethod
def from_runnable_config(cls, config=None):
    configurable = config.get("configurable", {}) if config else {}
    values = {
        field_name: os.environ.get(field_name.upper(), configurable.get(field_name))
        for field_name in field_names
    }
    return cls(**{k: v for k, v in values.items() if v is not None})
```

- **ENV 优先**: `FIELD_NAME.upper()` 覆盖 configurable
- None 值被过滤
- `x_oap_ui_config` metadata 驱动 Open Agent Platform UI（slider/select/text/mcp）

### 2.5 Pydantic 配置

```python
class Config:
    arbitrary_types_allowed = True
```

---

## 3. 四模型分工（README + configuration.py 实读）

| 角色 | 默认模型 | max_tokens | 职责 |
|------|----------|------------|------|
| Summarization | openai:gpt-4.1-mini | 8192 | 压缩搜索结果 |
| Research | openai:gpt-4.1 | 10000 | 搜索 agent 主模型 |
| Compression | openai:gpt-4.1 | 8192 | 压缩子 agent 发现 |
| Final Report | openai:gpt-4.1 | 10000 | 写最终报告 |

约束: 选定模型需支持 **structured outputs + tool calling**。

---

## 4. 编排架构（README 实读）

### 4.1 当前实现

```
User question
  → (optional) clarification（allow_clarification）
  → Research Supervisor
      → max_researcher_iterations=6 轮 reflection
      → 并行 sub-researchers（max_concurrent_research_units=5）
          → ReAct: max_react_tool_calls=10
          → Search (Tavily/OpenAI/Anthropic/None/MCP)
          → max_content_length=50000 截断后 summarize
      → Compression 聚合
  → Final Report model
```

### 4.2 Legacy 实现（`src/legacy/`）

1. **Workflow** (`legacy/graph.py`): Plan-and-Execute + 顺序 section + HITL
2. **Multi-Agent** (`legacy/multi_agent.py`): Supervisor-Researcher + 并行 + MCP

### 4.3 部署

```bash
uvx --refresh --from "langgraph-cli[inmem]" --with-editable . \
  --python 3.11 langgraph dev --allow-blocking
# API: http://127.0.0.1:2024
# Studio: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

也可部署到 LangGraph Platform 或 Open Agent Platform (OAP)。

---

## 5. 与 openmate 映射

| 需求 | ODR 机制 | 可复用度 |
|------|---------|----------|
| 多模型分工 | 4 角色 4 模型 | **高** |
| 并行研究单元 | max_concurrent_research_units=5 | **高** |
| ReAct 工具上限 | max_react_tool_calls=10 | **高** |
| Supervisor 迭代 | max_researcher_iterations=6 | **高** |
| 结构化输出重试 | max_structured_output_retries=3 | **高** |
| 网页内容上限 | max_content_length=50000 | **高** |
| MCP 集成 | MCPConfig + mcp_prompt | **高** |
| 澄清问题 | allow_clarification | 高 |
| UI 配置元数据 | x_oap_ui_config | **高** |
| ENV 覆盖 | FIELD.upper() | 高 |
| 评测成本意识 | $20-100 / 100 例 | 中 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| max_structured_output_retries | 3 (1-10) | configuration.py |
| max_concurrent_research_units | 5 (1-20) | configuration.py |
| max_researcher_iterations | 6 (1-10) | configuration.py |
| max_react_tool_calls | 10 (1-30) | configuration.py |
| summarization_model_max_tokens | 8192 | configuration.py |
| research_model_max_tokens | 10000 | configuration.py |
| compression_model_max_tokens | 8192 | configuration.py |
| final_report_model_max_tokens | 10000 | configuration.py |
| max_content_length | 50000 (1k-200k) | configuration.py |
| allow_clarification | True | configuration.py |
| search_api | tavily | configuration.py |
| API 端口 | 2024 | README |
| Python | 3.11（langgraph dev） | README |
| 评测成本 | ~$20-100 / 100 例 | README |

---

## 7. 失败路径

```
模型不支持 structured outputs / tool calling
  → 配置失败（README Note）

OpenRouter / Ollama
  → 需 issue 指引配置

搜索 API 与模型不匹配
  → UI description 警告

max_content_length 超限
  → 截断到 50000 后 summarize

structured output 解析失败
  → max_structured_output_retries=3

并发过高
  → rate limits（UI slider 描述明确警告）

评测预算
  → $20-$100，需 LangSmith dataset

mcp auth_required=True
  → 需额外认证配置
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **四模型分工**: summarization / research / compression / final_report 各自 model + max_tokens
2. **并行研究单元上限** 默认 5，slider 1-20
3. **ReAct tool calls 上限** 默认 10，slider 1-30
4. **Supervisor reflection 迭代** 默认 6
5. **max_content_length** 默认 50000，防上下文爆炸
6. **structured output 重试** 默认 3
7. **allow_clarification** 开始前可问澄清问题
8. **MCPConfig** url/tools/auth_required 三元组
9. **x_oap_ui_config metadata** 驱动配置 UI（type/default/min/max/description/options）
10. **ENV 覆盖 configurable**（FIELD.upper()）

### P1 — 应抄

- SearchAPI 枚举: tavily / openai / anthropic / none
- mcp_prompt 额外 MCP 工具说明
- Legacy 双实现保留作对照

### P2 — 可选

- Deep Research Bench 集成
- OAP 公共 demo 部署

---

## 9. 应避免的坑

- 勿默认开 max_concurrent_research_units=20（rate limit）
- 评测 100 例成本 $20-100，需预算
- 模型必须支持 structured outputs + tool calling
- OpenRouter/Ollama 需额外配置（issue 链接）
- 勿发明 graph 节点路径

---

## 10. 源码锚点速查

```
src/open_deep_research/configuration.py
  SearchAPI: anthropic|openai|tavily|none
  MCPConfig: url, tools, auth_required
  Configuration:
    max_structured_output_retries=3
    allow_clarification=True
    max_concurrent_research_units=5
    search_api=TAVILY
    max_researcher_iterations=6
    max_react_tool_calls=10
    summarization_model=openai:gpt-4.1-mini (8192)
    research_model=openai:gpt-4.1 (10000)
    compression_model=openai:gpt-4.1 (8192)
    final_report_model=openai:gpt-4.1 (10000)
    max_content_length=50000
    mcp_config, mcp_prompt
  from_runnable_config: env.upper() > configurable
  x_oap_ui_config metadata on every field

README.md
  LangGraph server: uvx langgraph-cli[inmem] --python 3.11
  API: 127.0.0.1:2024
  Bench: 100 tasks, $20-100, RACE metric
  Legacy: src/legacy/graph.py, multi_agent.py
  Deploy: LangGraph Platform / OAP
```

**未本轮打开**: graph 节点、subagent 实现。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | ReAct 上限 + 搜索 API 枚举 |
| 权限/安全边界 | 3 | MCP auth_required |
| 容错与会话恢复 | 3 | structured retries=3 |
| 上下文工程 | 5 | 4 模型分工 + content cap + compress |
| 可扩展（技能/MCP） | 5 | MCP + 多搜索 API |
| 可观测与可评测 | 5 | Deep Research Bench + LangSmith |
| 生产可用成熟度 | 4 | LangGraph Platform / OAP |

**综合**: **深度研究编排黄金参考**。openmate 抄四模型分工、并行/迭代/工具上限、content cap、UI metadata 与 MCP 三元组。

---

## 12. 关键链接

- https://github.com/langchain-ai/open_deep_research
- https://huggingface.co/spaces/Ayanami0730/DeepResearch-Leaderboard
- https://github.com/langchain-ai/deep_research_from_scratch
- 相关: `reports/langgraph.md`、`reports/gpt-researcher.md`、`reports/storm.md`、`reports/mcp.md`

---

## 13. 附录 A — 四模型分工 openmate 配置（P0）

```yaml
models:
  summarization:
    id: "openai:gpt-4.1-mini"
    max_tokens: 8192
  research:
    id: "openai:gpt-4.1"
    max_tokens: 10000
  compression:
    id: "openai:gpt-4.1"
    max_tokens: 8192
  final_report:
    id: "openai:gpt-4.1"
    max_tokens: 10000

limits:
  max_structured_output_retries: 3      # 1-10
  max_concurrent_research_units: 5      # 1-20
  max_researcher_iterations: 6          # 1-10
  max_react_tool_calls: 10              # 1-30
  max_content_length: 50000             # 1000-200000
  allow_clarification: true

search_api: tavily   # tavily|openai|anthropic|none

mcp:
  url: null
  tools: null
  auth_required: false
  prompt: null
```

UI metadata 驱动: type/default/min/max/description/options。

---

## 14. 附录 B — 编排时序

```
user question
  → allow_clarification? 澄清
  → supervisor (max_researcher_iterations=6)
      → 并行 sub-researchers (≤5)
          → ReAct (≤10 tool calls)
          → search (tavily|openai|anthropic|none|mcp)
          → content >50000 → truncate → summarize (8192)
      → compression (8192)
  → final_report (10000)
```

失败路径:
```
并发过高 → rate limit → 降 max_concurrent_research_units
structured 失败 → 重试 3 → 仍失败则降级文本
content 超限 → 截断 50000
模型不支持 tools/structured → 启动校验失败
OpenRouter/Ollama → 需 issue 指引
评测 100 例 → $20-100 预算
```

---

## 15. 附录 C — x_oap_ui_config 模式（P0）

每个 Configuration 字段带 metadata:

```python
max_concurrent_research_units: int = Field(
    default=5,
    metadata={
        "x_oap_ui_config": {
            "type": "slider",
            "default": 5,
            "min": 1, "max": 20, "step": 1,
            "description": "Maximum number of research units..."
        }
    }
)
```

类型: number | boolean | slider | select | text | mcp

openmate: 配置 schema 即 UI schema；单一来源。

---

## 16. 附录 D — ENV 覆盖

```python
os.environ.get(field_name.upper(), configurable.get(field_name))
```

- ENV 优先于 configurable
- None 过滤
- 字段名 upper 即 env 名

openmate: 同模式；非法值 fail-loud（对齐 TradingAgents `_coerce`）。

---

## 17. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| retries | 3 | configuration.py |
| concurrent units | 5 (1-20) | configuration.py |
| researcher iters | 6 (1-10) | configuration.py |
| react tool calls | 10 (1-30) | configuration.py |
| content length | 50000 | configuration.py |
| summarization tokens | 8192 | configuration.py |
| research tokens | 10000 | configuration.py |
| compression tokens | 8192 | configuration.py |
| final tokens | 10000 | configuration.py |
| search_api | tavily | configuration.py |
| Bench RACE GPT-5 | 0.4943 | README |
| 评测成本 | $20-100 / 100 例 | README |
| API 端口 | 2024 | README |

---

## 18. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | ReAct 上限 + SearchAPI 枚举 |
| 权限安全 | 3 | MCP auth_required |
| 容错恢复 | 3 | structured retries=3 |
| 上下文 | 5 | 4 模型 + content cap + compress |
| 可扩展 | 5 | MCP + 多搜索 |
| 可观测 | 5 | Deep Research Bench |
| 成熟度 | 4 | LangGraph Platform / OAP |

**净推荐**: openmate 深度研究模块以本仓 **常量表 + 四模型 + UI metadata** 为 P0 黄金参考。
