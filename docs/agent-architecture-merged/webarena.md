# Webarena

## 概述

WebArena 是由 CMU 等机构提出的**真实 Web 环境基准测试平台**，其核心设计理念是：，主要使用 Python（https://github.com/web-arena-x/webarena）

## 核心架构

- WebArena 采用**四层解耦架构**：
- ┌─────────────────────────────────────────────┐
- │           run.py (入口/编排层)                │
- ├──────────┬──────────┬──────────┬─────────────┤
- │  Agent   │ Browser  │  Eval    │  LLM        │
- | 参数 | 含义 |
- |------|------|
- | headless | 无头模式 |

## 关键技术

- - https://github.com/web-arena-x/webarena
- - https://github.com/ServiceNow/AgentLab/
- - https://the-agent-company.com
- - https://arxiv.org/abs/2307.13854
- - 相关: `reports/mind2web-l1.md`、`reports/browser-use.md`、`reports/agentbench-l1.md`

## 对openmate的启示

- 1. **为「长网页任务」单独设计状态**：当前页、意图、已完成子目标要显式持久化
- 2. **可复现环境 > 永远爬公网**：个人自动化也应有本地 fixture 供回归

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
