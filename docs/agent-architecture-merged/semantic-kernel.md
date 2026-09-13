# Semantic Kernel

## 概述

Semantic Kernel（SK）是微软推出的模型无关 SDK，其核心设计理念是将 LLM 能力与传统代码通过统一的 **Kernel（内核）** 模式整合。架构分为四层：，主要使用 Python（https://github.com/microsoft/semantic-kernel）

## 核心架构

- Semantic Kernel（SK）是微软推出的模型无关 SDK，其核心设计理念是将 LLM 能力与传统代码通过统一的 **Kernel（内核）** 模式整合。架构分为四层：
- ┌─────────────────────────────────────────────┐
- │            Agent Layer (Agent 抽象)           │
- │  ChatCompletionAgent / AzureAIAgent / ...    │
- ├─────────────────────────────────────────────┤
- semantic-kernel/
- ├── python/
- │   └── semantic_kernel/

## 关键技术

- Kernel 内置了完整的自动工具调用流程，处理 LLM 返回的 FunctionCall：
- async def invoke_function_call(
- self, function_call: FunctionCallContent, chat_history: ChatHistory, *,
- arguments=None, execution_settings=None, function_call_count=None,
- request_index=None, is_streaming=False, function_behavior=None,
- - README：https://github.com/microsoft/semantic-kernel
- - Learn：https://learn.microsoft.com/semantic-kernel
- - 迁移 MAF：https://learn.microsoft.com/agent-framework/migration-guide/from-semantic-kernel

## 对openmate的启示

- 1. **统一函数抽象**值得借鉴——将插件、Prompt、Agent 统一为可调用的函数单元
- 2. **Filter 管道**比 Callback 更适合企业场景——结构化的 AOP 优于松散的回调
- 3. **声明式 Agent 定义**是多 Agent 编排的正确方向——YAML 可版本化、可审计
- 1. **Kernel = 工具注册中心**：把工具/提示/连接统一成 plugin 接口，Agent 只认一种调用面
- 2. **多 Agent 用「分诊 Agent + 子 Agent 作 plugin」** 而非另起框架

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
