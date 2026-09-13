# Qwenpaw

## 概述

- **项目名称**：QwenPaw（PyPI 包 `qwenpaw`；GitHub: https://github.com/agentscope-ai/QwenPaw ），主要使用 Python（https://github.com/agentscope-ai/QwenPaw）

## 核心架构

- > 说明：QwenPaw 以 pip 包分发，源码经 `pip install qwenpaw` 安装；本次以 README + v2.0 发布说明 + 架构说明为主要证据，未逐文件拉取源码树（仓库较大、Python 源码经打包发布）。
- ├── (Agent OS)
- │   ├── Resources/    # 每个 Agent 的资源，透明落在磁盘上
- │   ├── Governance/   # allow / deny / ask / sandbox 四级策略

## 关键技术

- 1. **Agent OS 三柱（Resources/Governance/Sandbox）**：把"能力可管、资源透明、危险隔离"做成一等架构，而非事后补丁。
- 2. **Scroll Context vs 摘要**：长会话不靠摘要硬压——每轮落盘、挤出后建索引按需召回，信息不丢，工程上比"摘要压缩"更保真。
- 3. **ReMe 自演化记忆**：对话/资源持续转成可编辑 Markdown 知识库，且开源独立仓库（agentscope-ai/ReMe）。
- 4. **Driver 协议中立 + 每调用策略门**：MCP/A2A/ACP 统一接入，凭证加密、每次调用过策略，安全与扩展兼得。
- 5. **本地小模型**：自带 2B/4B/9B agent-tuned 模型，无云依赖也能跑——隐私与成本友好。

## 对openmate的启示

- - **P0｜"前置拦截 + 四级治理"安全模型**：openmate 给工具/文件/命令做 `allow/deny/ask/sandbox` 分级，危险操作执行前先过策略门。比"跑完再后悔"安全得多。预期：本地桌面/手机端跑 AI 时不破坏用户文件。
- - **P0｜Scroll Context：长会话"落盘 + 索引召回"而非摘要压缩**：openmate 长对话不要靠 LLM 摘要硬压历史（会丢信息），而是每轮落盘、挤出的轮次建索引、需要时按需召回原文。预期：长会话不丢关键事实、幻觉更少。
- - **P0｜三层记忆分层**：openmate 明确分"当前工作上下文 / 逐字历史 / 提炼后的长期知识库"，三层职责不同、各自管理。预期：短期不爆上下文、长期知识可积累可维护。

## 参考来源

- 豆包
