# Smol Developer

## 概述

Smol Developer 是第一个允许开发者将 AI 开发者 Agent 嵌入自己应用的 Python 库。它的核心理念是 **"Build the thing that builds the thing"** — 不是维护一个固定的脚手架模板（如 `create-react-app`），而是创造一个能根据自然语言描述生成任意代码库的"初级开发者"。，主要使用 Python（https://github.com/smol-ai/developer）

## 核心架构

- Smol Developer 的核心是一个 **三阶段串行流水线**，每个阶段都是一次 LLM 调用：
- 用户 Prompt → [plan] → shared_dependencies.md → [specify_file_paths] → 文件列表 → [generate_code] × N → 完整代码库
- Smol Developer 虽然代码量极小，但其设计模式对更复杂的 Agent 系统有深远启示：
- 三阶段流水线暴露为独立函数，每个都可以被替换、跳过或重新编排。这种设计使得库可以被嵌入各种上下文 — 从命令行工具到 Web API 到 IDE 插件。
- 1. **一次性全量 vs 逐步协作** 是代码生成 agent 的根本分叉
- - 一次性: 实现快，bug 难修（gpt-pilot README 批评点）
- - 逐步: 可 debug、人类可介入，但慢
- 2. **上下文过滤**（gpt-pilot）优于全量注入——对大仓库关键

## 关键技术

- python >=3.10,<4.0.0
- openai ^0.27.8          # LLM API 调用
- openai-function-call ^0.0.5  # 结构化输出解析
- tenacity ^8.2.2         # 重试/退避策略
- agent-protocol ^1.0.0   # Agent Protocol API 标准
- - https://github.com/smol-ai/developer（待人工确认可达性）
- - 旁证: `reports/gpt-pilot-l1.md`、`reports/gpt-engineer-l1.md`
- - 相关: `reports/devika-l1.md`、`reports/aider.md`

## 对openmate的启示

- 1. **先做最小闭环**：spec → scaffold → test → 修，避免一上来大而全
- 2. **生成物必须可落盘审查**：比聊天里贴代码更可协作

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
