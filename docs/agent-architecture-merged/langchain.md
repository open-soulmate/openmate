# LangChain

## 概述

LangChain 是一个LLM应用开发框架。

**仓库**: https://github.com/langchain-ai/langchain | **语言**: Python

## 核心架构

> 基于 langchain-ai/langchain 源码分析，覆盖 langchain-core 与 langchain 两个核心包

LangChain 的核心设计哲学是 **"一切皆 Runnable"**。所有组件——LLM、Prompt、OutputParser、Tool、Retriever——都继承自同一个泛型基类 `Runnable[Input, Output]`，从而获得统一的调用接口和组合能力。

[详见源码]

关键设计决策：
- **LCEL（LangChain Expression Language）**：通过 `|` 管道运算符实现声明式链式组合，`RunnableSequence`、`RunnableParallel` 是核心组合原语
- **同步/异步双模**：每个 Runnable 同时提供 `invoke/ainvoke`、`stream/astream`、`batch/abatch`，异步默认通过线程池桥接同步实现
- **Pydantic 驱动的 Schema**：输入/输出类型通过泛型参数自动推导，生成 JSON Schema 用于验证和文档

[详见源码]python
class BaseTool(RunnableSerializable[str | dict[str, Any] | ToolCall, Any]):
    """Base class for all LangChain tools."""

    name: str
    """The unique name of the tool that clearly communicates its purpose."""

    description: str
    """Used to tell the model how/when/why to use the tool."""

    args_schema: Annotated[ArgsSchema | None, SkipValidation()] = Field(default=None)
    """Pydantic model class to validate and parse the tool's input arguments."""

    return_direct: bool = False
    """Whether to return the tool's output directly. Setting True means
    AgentExecutor will stop looping after this tool is called."""

    handle_tool_error: bool | str | Callable | None = False
    """Handle ToolException raised by tool execution."""

    response_format: Literal["content", "content_and_artifact"] = "content"
    """The tool response format."""
[详见源码]python
def stream(self, input: Input, config: RunnableConfig | None = None, **kwargs) -> Iterator[Output]:
    """Default implementation of stream, which calls invoke.
    Subclasses must override this method if they support streaming output."""
    yield self.invoke(input, config, **kwargs)
[详见源码]

LangChain 在工具层面实现了精细的错误处理策略：

```python

LangChain 定义了丰富的消息类型层次结构，支持多模态内容：

```python

LangChain 的可观测性建立在回调系统之上：

```python

## 关键技术

工具系统在 `langchain_core/tools/base.py` 中实现，`BaseTool` 同时继承 `RunnableSerializable`，使工具可以无缝嵌入 LCEL 链。

[详见源码]

工具定义支持多种方式：
- 继承 `BaseTool` 实现 `_run` / `_arun`
- 使用 `@tool` 装饰器从函数自动生成 Schema
- 支持 `InjectedToolArg` 注入运行时参数（不暴露给 LLM）

[详见源码]python
class RunnableConfig(TypedDict, total=False):
    tags: list[str]           # 用于过滤和分类
    metadata: dict[str, Any]  # 追踪元数据
    callbacks: Callbacks      # 回调处理器
    run_name: str             # 运行名称
    max_concurrency: int      # 最大并发数
    recursion_limit: int      # 递归深度限制
    configurable: dict[str, Any]  # 可配置字段
[详见源码]python

__all__ = (
    "AIMessage", "AIMessageChunk",           # AI 回复
    "HumanMessage", "HumanMessageChunk",      # 用户输入
    "SystemMessage", "SystemMessageChunk",    # 系统提示
    "ToolMessage", "ToolMessageChunk",        # 工具返回
    "FunctionMessage", "FunctionMessageChunk", # 函数调用
    "ChatMessage", "ChatMessageChunk",        # 自定义角色
    "RemoveMessage",                          # 消息修改器
    # 多模态内容块
    "TextContentBlock", "ImageContentBlock", "AudioContentBlock",
    "VideoContentBlock", "FileContentBlock", "DataContentBlock",
    "ReasoningContentBlock",  # 推理内容
    # 工具调用
    "ToolCall", "ToolCallChunk", "InvalidToolCall",
    "ServerToolCall", "ServerToolResult",
    # 消息操作工具函数
    "filter_messages", "trim_messages", "merge_message_runs",
    "convert_to_messages", "convert_to_openai_messages",
    "get_buffer_string",
)
[详见源码]

**组合扩展：** 通过 `RunnableLambda` 包装任意函数
```python
sequence = RunnableLambda(lambda x: x + 1) | RunnableLambda(lambda x: x * 2)
```

**回调扩展：** 自定义 `BaseCallbackHandler` 监听所有生命周期事件
**工具扩展：** 通过 `@tool` 装饰器或继承 `BaseTool` 创建自定义工具
**集成扩展：** 通过 `langchain-community` 包扩展模型、向量存储、检索器等

```python

## 对openmate的启示

> 仓库: https://github.com/langchain-ai/langchain（monorepo）  
> 抓取通道: cdn.jsdelivr.net/gh/langchain-ai/langchain@master/libs/core/...  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Runnable 组合子 / Retry / Fallback / Agent 协议借鉴

---

| 需求 | langchain / langgraph 机制 | 可复用度 |
|------|---------------------------|----------|
| 组合子式重试/降级 | with_retry / with_fallbacks | **高** |
| 可配置退避 | ExponentialJitterParams | 高 |
| 图级 checkpoint | LangGraph Checkpoint + thread_id | **高** |
| pending_writes 恢复 | CheckpointTuple | **高** |
| Agent 动作协议 | AgentAction/AgentFinish | 中 |
| 轻量单文件 | 否，依赖较重 | 中 |
| DeltaChannel | deepagents 扩展 | 高 |

1. **with_retry / with_fallbacks 作为一等 Runnable**。
2. **ExponentialJitterParams 四字段**（initial/max/exp_base/jitter）。
3. **Checkpoint + pending_writes + thread_id**。
4. **RetryPolicy / TimeoutPolicy 独立于节点逻辑**（LangGraph）。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（01-langchain.md）
- 豆包（008_langchain.md）
- MiMo报告（langchain.md）
