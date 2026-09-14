# assafelovic/gpt-researcher — 深度研究流水线调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/assafelovic/gpt-researcher |
| 文档 | https://docs.gptr.dev |
| 语言 | Python ≥ 3.11 |
| License | Apache 2.0 |
| 定位一句话 | 开源深度研究 Agent：Planner 出题 → 并行爬取/检索 → 摘要溯源 → 汇总为带引用长报告 |
| 运行形态 | PIP 包、Docker、uvicorn Web、NextJS 前端、Claude Skill、MCP Server、多 Agent 扩展 |

> 对 openmate：gpt-researcher 把「**研究型长任务**」拆成规划/执行/出版流水线，并在 Deep Research 子产品中明确 **树状广度/深度、并发、进度回调、失败分支跳过**，是个人深度研究场景的直接模板。

---

## 1. 架构

### 1.1 核心流水线（README）

```
研究 query
  → 创建 task-specific agent
  → Planner 生成多条研究问题（形成客观视角）
  → 每个问题启动 crawler/executor 并行采集
  → 对每条资源做摘要 + 溯源
  → 过滤聚合 → 最终研究报告（可 >2000 词，聚合 20+ 源）
  → 导出 PDF / Word / Markdown；可选 AI 行内配图
```

设计论文参照：Plan-and-Solve、RAG；目标对抗幻觉、token 上限、单源偏见。

### 1.2 Deep Research（`report_type="deep"`）

树状递归探索：

| 参数 | 默认 | 含义 |
|---|---|---|
| `deep_research_breadth` | 4 | 每层并行路径数 |
| `deep_research_depth` | 2 | 递归深度 |
| `deep_research_concurrency` | 4 | 最大并发研究操作 |
| `total_words` | 建议 2000+ | 报告篇幅 |

- 异步并发多路径 + 跨分支上下文聚合。
- 典型成本：**约 5 分钟 / $0.4**（o3-mini high reasoning）。

### 1.3 扩展架构

- **MCP Client**：`RETRIEVER=tavily,mcp` 混合 Web + GitHub/DB/自定义源。
- **本地文档**：`DOC_PATH`，支持 PDF/CSV/Excel/MD/PPT/Word 等。
- **多 Agent**：`multi_agents/` 基于 **LangGraph / AG2**，受 STORM 论文启发，产出 5–6 页多格式报告。
- **可观测**：LangSmith（`LANGCHAIN_TRACING_V2`）。
- **MCP Server**：独立仓库 `gptr-mcp`，供 Claude Desktop 等调用深度研究。

---

## 2. 四个关键维度

### 2.1 错误恢复

**Deep Research 官方 Error Handling 策略（最明确）**：

- 失败 query **自动跳过**。
- 部分分支失败 **研究继续**。
- 进度跟踪帮助识别问题点。

**整体健壮性设计**：

| 机制 | 说明 |
|---|---|
| 并行 agent | 单点失败不拖垮全局 |
| 多源聚合取高频 | 降低个别源错误影响 |
| 进度回调 `on_progress` | `current_depth/breadth`、`completed/total_queries`、`current_query` |
| Troubleshooting 文档 | URL 抓取失败 → 重启重试；Chrome/chromedriver 版本；WeasyPrint/glib/pango 依赖 |
| 抓取层 | JS 抓取 + 可配置 scraper；失败站点建议重跑 |

未提供 Dify 式「节点默认值/失败分支」可视化；恢复语义是 **跳过 + 继续 + 重跑**。

### 2.2 沙箱

- 默认 **不内置代码执行沙箱**；研究以检索/写作为主，非任意代码执行 Agent。
- 可选 **Docker Compose** 隔离整个服务栈（api + frontend）。
- MCP 工具若接 GitHub 等，凭据经环境变量注入，隔离依赖调用方 MCP 进程。
- 本地文档研究限定 `DOC_PATH` 目录，避免开放式文件系统读取。

### 2.3 长运行作业

| 特性 | 说明 |
|---|---|
| 标准研究 | 异步 `conduct_research()` + `write_report()` |
| Deep Research | ~5 分钟级；可调 breadth/depth/concurrency |
| 多 Agent 研究 | 更长；LangGraph 图内多阶段 |
| 前端进度 | 轻量静态页或 NextJS，实时进度条 |
| 成本控制 | 参数化并发与深度；推荐 reasoning 模型才跑 deep |
| 观测 | LangSmith 追踪多 Agent 交互 |

注意：官方未描述跨进程 **checkpoint/resume**；中断多靠整任务重跑（配合跳过已失败查询的韧性）。

### 2.4 人工审批

- **产品定位是自动研究报告生成**，HITL 非一等公民。
- 可介入点：
  - 研究前：自定义 query、report_source（web/local/hybrid）、配置文件。
  - 研究中：`on_progress` 回调可做外部监控/中止（调用方实现）。
  - 研究后：报告人工编辑、多格式导出。
- 多 Agent / Claude Skill 形态下，可在外层 Agent（Claude 等）插入审批后再写盘/发送。

**结论**：适合作为「**无人值守出稿**」引擎；对外发布前的审批需 openmate 在编排层外挂。

---

## 3. 接口速览

```python
from gpt_researcher import GPTResearcher
import asyncio

async def main():
    researcher = GPTResearcher(
        query="Why is Nvidia stock rising?",
        report_type="deep",  # 或 research_report / detailed_report 等
    )
    await researcher.conduct_research()
    report = await researcher.write_report()

asyncio.run(main())
```

环境变量示例：`OPENAI_API_KEY`、`TAVILY_API_KEY`、`OPENAI_BASE_URL`、`DEEP_RESEARCH_*`、`DOC_PATH`、`RETRIEVER`。

Docker：`docker compose up --build` → API :8000 + React :3000。

---

## 4. 对 openmate 的可借鉴点

1. **Planner / Executor / Publisher 三段式**可直接映射「研究任务」工具协议。
2. **Deep Research 的 breadth/depth/concurrency** 是清晰的资源旋钮，便于成本预算。
3. **失败跳过 + 进度回调**是长研究任务的最小可用韧性模型。
4. **多源高频聚合降偏见**作为写作质量策略。
5. **MCP 混合检索**（Web + 内部源）符合企业/个人知识库场景。
6. HITL 需外层补：研究出稿后的「发送/发布」应默认人工确认。

---

## 5. 参考链接

- README：https://github.com/assafelovic/gpt-researcher
- Deep Research：https://docs.gptr.dev/docs/gpt-researcher/gptr/deep_research
- Troubleshooting：https://docs.gptr.dev/docs/gpt-researcher/gptr/troubleshooting
- PIP 包：https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package
- MCP：https://github.com/assafelovic/gptr-mcp
- 多 Agent：https://github.com/assafelovic/gpt-researcher/tree/master/multi_agents
