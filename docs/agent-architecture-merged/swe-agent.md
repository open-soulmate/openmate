# Swe Agent

## 概述

SWE-agent 是一个让大语言模型（LLM）自主修复 GitHub Issue 的自动化软件工程代理。其核心设计哲学是 **"最大化代理自由度"（Maximal Agency）**——尽可能少地约束 LLM 的行为，通过精心设计的 Agent-Computer Interface（ACI）让模型自由探索代码仓库、执行命令、生成补丁。，主要使用 Python（https://github.com/SWE-agent/SWE-agent）

## 核心架构

- Agent 层是 SWE-agent 的大脑，采用 **多态 Agent 设计**，通过 Pydantic 配置区分三种 Agent 类型：
- | Agent 类型 | 配置类 | 用途 |
- |-----------|--------|------|
- | `DefaultAgent` | `DefaultAgentConfig` | 标准单次 Agent，核心循环 |
- | `RetryAgent` | `RetryAgentConfig` | 多次尝试 + 评审机制 |
- sweagent/agent/models.py
- RetryConfig: retries=20, min_wait=10, max_wait=120
- GenericAPIModelConfig:

## 关键技术

- 工具系统是 SWE-agent 的 ACI 核心，分为三层：
- 通过黑名单机制过滤危险命令（如 `vim`、`nano` 等交互式命令），防止 Agent 陷入交互式程序。
- - 工具以 **bundle** 形式打包（registry / edit_anthropic / review_on_submit_m）
- - `enable_bash_tool: true`：开启 bash
- - `parse_function.type: function_calling`：用原生 function calling 而非文本解析
- - 编辑工具针对 Anthropic 风格优化（`edit_anthropic`）

## 对openmate的启示

- 1. **ACI 设计哲学**：为 LLM 设计工具接口 ≠ 人类 CLI，要考虑 token 效率与错误恢复
- 2. **单一配置文件**：Agent 行为可完全由一个 YAML 定义，便于版本控制与复现

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
