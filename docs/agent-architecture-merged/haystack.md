# Haystack

## 概述

Haystack 是一个NLP/RAG应用框架。

**仓库**: https://github.com/deepset-ai/haystack | **License**: Apache-2.0

## 核心架构

> **项目**: [deepset-ai/haystack](https://github.com/deepset-ai/haystack)
> **定位**: 开源 AI 编排框架，用于构建生产级 LLM 应用（RAG、Agent、语义搜索、多模态应用）
> **版本**: Haystack 3.0（2024年发布，重大重构版本）
> **许可证**: Apache-2.0
> **分析时间**: 2026-09

Haystack 的核心思想是将 AI 应用拆解为**可组合的组件（Component）**，通过**有向无环图（DAG）管道**连接。每个组件有明确的输入/输出接口，管道负责数据流转、调度执行。

每个组件的运行被封装为独立的执行单元，支持同步和异步两种路径：

[详见源码]

Haystack 支持多种 LLM 提供商，通过统一的 `ChatGenerator` 协议抽象：

- OpenAI / Azure OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Mistral / Cohere
- Hugging Face
- AWS Bedrock
- 本地模型（llama.cpp、Ollama 等）

from haystack.tools import ComponentTool

| 维度 | Haystack | LangChain | AutoGen |
|------|----------|-----------|---------|
| **核心抽象** | Pipeline (DAG) + Component | Chain + Agent | Conversation + Agent |
| **工具系统** | JSON Schema + Toolset | Function Calling | Function Calling |
| **状态管理** | 显式 State + Schema | 隐式 Memory | 对话历史 |
| **钩子系统** | 6 个生命周期钩子 | Callbacks | 事件驱动 |
| **断点调试** | 原生支持（快照） | 有限 | 有限 |
| **流式处理** | 原生 AsyncIterator | 回调 | 回调 |
| **Tracing** | OpenTelemetry 深度集成 | LangSmith | 有限 |
| **并发工具** | 原生支持（信号量） | 有限 | 支持 |

---

## 关键技术

Haystack 的核心思想是将 AI 应用拆解为**可组合的组件（Component）**，通过**有向无环图（DAG）管道**连接。每个组件有明确的输入/输出接口，管道负责数据流转、调度执行。

while True:
    candidate = self._get_next_runnable_component(priority_queue, component_visits)

    # 如果没有可运行的组件，退出循环
    if candidate is None:
        break

    priority, component_name, component = candidate

    # 如果下一个组件被阻塞，检查管道是否可能被卡住
    if priority == ComponentPriority.BLOCKED:
        if self._is_pipeline_possibly_blocked(current_pipeline_outputs=pipeline_outputs):
            self._find_components_blocking_pipeline(
                priority_queue=priority_queue, component_visits=component_visits, inputs=inputs
            )
        # 总是退出循环，因为无法运行下一个组件
        break

    # 如果下一个组件已经调度，等待任务完成以取得进展
    if component_name in scheduled_components:
        async for partial_outputs in self._wait_for_tasks(
            running_tasks, scheduled_components, return_when=asyncio.FIRST_COMPLETED
        ):
            yield partial_outputs
        continue

    # HIGHEST 优先级组件必须单独运行
    if priority == ComponentPriority.HIGHEST:
        async for partial_outputs in self._run_component_in_isolation(...):
            yield partial_outputs
        continue

    # READY 优先级组件可以并发调度
    if priority == ComponentPriority.READY:
        self._schedule_component(...)
        # 尽可能调度更多 READY 任务
        while len(priority_queue) > 0 and not ready_sem.locked():
            peek_priority, peek_name = priority_queue.peek()
            if peek_priority != ComponentPriority.READY:
                break
[详见源码]

Haystack 的工具系统设计精巧，提供了从简单函数到复杂管道的多层次工具抽象。

`Tool` 是工具系统的核心数据类，使用 JSON Schema 定义参数：

[详见源码]

Haystack 提供了 `@tool` 装饰器，通过类型注解自动生成 JSON Schema：

[详见源码]

`Toolset` 是工具的集合，支持静态组合和动态加载：

[详见源码]

Haystack 还提供了多种高级工具类型：

[详见源码]

def _create_tool_span(tool, tool_call, parent_span):
    return tracing.tracer.trace(
        "haystack.agent.step.tool",
        tags={"haystack.tool.name": tool_call.tool_name, "haystack.tool.description": tool.description},
        parent_span=parent_span,
   

## 对openmate的启示

> 仓库: https://github.com/deepset-ai/haystack  
> 抓取通道: cdn.jsdelivr.net/gh/deepset-ai/haystack@main  
> 版本快照: main @ 2026-09-13（`haystack/components/agents/agent.py` 63KB + `haystack/__init__.py` + `haystack/core/pipeline/pipeline.py` 66KB 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 循环、Hook 系统、退出原因分类、Pipeline 执行与工具并发借鉴

---

| Haystack | openmate 建议 |
|----------|---------------|
| `_EXIT_REASON_*` 四值 | `exit_reason: text\|length\|content_filter\|max_steps` |
| `_RUN_METADATA_STATE_KEYS` | 运行元数据保留且禁用户重定义 |
| `_INTERNAL_STATE_KEYS` | 内部控制键不暴露 |
| `_consume_continue_run` 消费语义 | 读取后重置，防跨尝试泄漏 |
| `tool_concurrency_limit >= 1` | 硬校验 |
| `raise_on_tool_invocation_failure` | 工具失败策略开关 |
| Hook `allowed_hook_points` | Hook 注册点位限制 |
| `@hook` 装饰器强制 | 拒绝裸函数 |
| `context_tokens` best-effort | 供 compaction hook 读取 |
| 空响应不退出 | 配 max_steps + 空响应计数 |

---

_EXIT_REASON_* 4 values map to exit_reason enum.
_RUN_METADATA_STATE_KEYS map to reserved metadata keys.
_INTERNAL_STATE_KEYS map to internal control keys.
_consume_continue_run maps to read-then-reset protocol.
tool_concurrency_limit>=1 maps to hard validation.
raise_on_tool_invocation maps to tool failure policy switch.
allowed_hook_points maps to hook registration restriction.
context_tokens maps to compaction hook input.
---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（13-haystack.md）
- MiMo报告（haystack-l1.md）
- MiMo卡片（haystack.md）
