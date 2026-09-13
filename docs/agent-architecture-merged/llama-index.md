# LlamaIndex

## 概述

LlamaIndex 是一个RAG/LLM数据框架。

**仓库**: https://github.com/run-llama/llama_index | **语言**: Python | **License**: MIT

## 核心架构

> **项目**: [run-llama/llama_index](https://github.com/run-llama/llama_index)
> **Stars**: 52.1k | **Forks**: 8.1k | **Commits**: 7,930
> **许可证**: MIT
> **定位**: 面向数据增强的 LLM 应用框架，核心解决「如何用私有数据增强 LLM」的问题

LlamaIndex 采用**核心+集成**的双层包结构：

[详见源码]

**包导入命名约定**：
- `from llama_index.core.xxx` —— 使用核心包
- `from llama_index.xxx.yyy` —— 使用集成包

这种设计允许用户通过 `pip install llama-index`（全家桶）或 `pip install llama-index-core`（最小安装 + 按需集成）灵活选择。

`AgentWorkflow` 是多 Agent 协作的顶层编排器，支持：

- **多 Agent 注册**：将多个 Agent 组合为一个工作流
- **Handoff 机制**：Agent 之间通过专用 `handoff` 工具转移控制权
- **权限控制**：`can_handoff_to` 字段定义 Agent 间的转移权限图
- **共享状态**：所有 Agent 共享同一个 `Context` 中的 state

Agent 的记忆通过 `BaseMemory` 接口管理，默认实现 `ChatMemoryBuffer`：

- **滑动窗口**：保留最近 N 条消息
- **Token 限制**：基于 token 数截断
- **持久化**：通过 `StorageContext` 支持磁盘持久化
- **AgentWorkflow 级别共享**：多 Agent 共享同一 memory 实例

Agent 的 `finalize()` 方法负责将 scratchpad/reasoning 中的临时对话写入 memory。

LlamaIndex 的差异化能力在于索引系统：

- **VectorStoreIndex**：向量索引，基于嵌入相似度检索
- **Knowledge Graph Index**：知识图谱索引
- **Tree Index**：树形层级索引
- **Keyword Table Index**：关键词表索引
- **Composable Graph**：组合多种索引的图结构

每个索引都可包装为 `QueryEngineTool`，供 Agent 作为工具调用。

[详见源码]

**LlamaIndex 的架构哲学**：以数据为中心，通过索引将私有数据转化为 LLM 可用的知识；通过工作流引擎将 Agent 执行标准化为事件驱动的步骤序列；通过多 Agent 协作支持复杂任务分解。其最显著的工程特点是三重继承的 Agent 基类设计——每个 Agent 同时是可配置的数据模型、可执行的工作流、和可管理的提示系统。

## 关键技术

LlamaIndex（原名 GPT Index）由 Jerry Liu 于 2022 年创建，定位为**文档处理与 AI 数据框架**。其核心价值主张是：

- **数据连接器**：从 API、PDF、文档、SQL 等多种来源摄取数据
- **数据结构化**：通过索引（Index）和图（Graph）组织数据，使其可被 LLM 高效使用
- **高级检索/查询接口**：将任意 LLM 提示输入转换为检索上下文和知识增强输出
- **应用框架集成**：与 LangChain、Flask、Docker、ChatGPT 等无缝集成

与 LangChain 偏向通用 Agent 编排不同，LlamaIndex 的差异化在于**数据为中心**——索引构建、检索优化、文档解析是其一等公民能力。

每个 Agent 必须实现三个核心方法，定义了 Agent 的完整生命周期：

[详见源码]python
async def handoff(ctx: Context, to_agent: str, reason: str) -> str:
    """将聊天控制权移交给指定 Agent"""
    # 1. 验证目标 Agent 存在
    # 2. 验证当前 Agent 有权移交
    # 3. 设置 next_agent 标记
    # 4. 返回移交说明
[详见源码]

`to_openai_tool()` 方法将元数据转换为 OpenAI function calling 格式。

FunctionTool 是最核心的工具实现，具有以下特性：

- **自动 schema 生成**：从函数签名和类型注解自动生成 Pydantic schema
- **同步/异步互转**：`sync_to_async` / `async_to_sync` 自动适配
- **Context 感知**：检测函数参数是否为 `workflow.Context`，自动注入
- **Callback 机制**：支持执行前后回调，可覆盖默认输出
- **LangChain 互操作**：`to_langchain_tool()` / `to_langchain_structured_tool()` 转换

```python
class ToolOutput(BaseModel):
    blocks: List[ContentBlock]  # 支持 TextBlock, ImageBlock, AudioBlock 等
    tool_name: str
    raw_input: Dict[str, Any]
    raw_output: Any
    is_error: bool = False
```

工具输出已从纯文本升级为**多模态内容块**，支持文本、图片、音频、视频、文档等。

Agent 的记忆通过 `BaseMemory` 接口管理，默认实现 `ChatMemoryBuffer`：

- **滑动窗口**：保留最近 N 条消息
- **Token 限制**：基于 token 数截断
- **持久化**：通过 `StorageContext` 支持磁盘持久化
- **AgentWorkflow 级别共享**：多 Agent 共享同一 memory 实例

Agent 的 `finalize()` 方法负责将 scratchpad/reasoning 中的临时对话写入 memory。

from llama_index.core.llms import LLM

## 对openmate的启示

> 仓库: https://github.com/run-llama/llama_index  
> 抓取通道: cdn.jsdelivr.net/gh/run-llama/llama_index@main  
> 版本快照: main @ 2026-09-13（README + `llama-index-core/llama_index/core/agent/workflow/base_agent.py` 31KB 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Workflow Agent、工具调用循环、结构化输出、早停与迭代上限借鉴

---

| 需求 | LlamaIndex 机制 | 可复用度 |
|------|-----------------|----------|
| Agent 循环 | BaseWorkflowAgent 事件驱动 | 高 |
| 迭代上限 | DEFAULT_MAX_ITERATIONS=20 | 高 |
| 结构化输出 | output_cls 优先于 structured_output_fn | 高 |
| 早停 | DEFAULT_EARLY_STOPPING_PROMPT | 高 |
| 超时 | Workflow(timeout=...) | 高 |
| 工具异步化 | _ensure_tools_are_async | 中 |

---

| LlamaIndex | openmate 建议 |
|------------|---------------|
| `DEFAULT_MAX_ITERATIONS = 20` | `OPENMATE_MAX_ITERATIONS = 20` |
| `output_cls` > `structured_output_fn` | 结构化输出单一配置源 |
| `DEFAULT_EARLY_STOPPING_PROMPT` | 达限友好早停回复 |
| 空流式 → `ValueError` | 显式拒绝空响应 |
| `_ensure_tools_are_async` | 工具异步化包装 |
| `_get_waiting_for_event_exception` | 等待外部事件控制流 |
| `Workflow(timeout=...)` | 步骤级超时 |
| 命名空间 `core` vs integration | 核心与集成包分离 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（22-llamaindex.md）
- MiMo报告（llama-index-l1.md）
- MiMo卡片（llama-index.md）
