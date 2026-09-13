# Vibe Trading

## 概述

- **项目名称**：Vibe-Trading（GitHub: https://github.com/HKUDS/Vibe-Trading ），主要使用 Python（https://github.com/HKUDS/Vibe-Trading）

## 核心架构

- Vibe-Trading/
- │   ├── cli.py                 # ★ CLI 入口（100KB，命令行主控）
- │   ├── mcp_server.py          # MCP Server 模式（把能力暴露给外部 Agent）
- │   ├── SKILL.md               # agentskills.io 技能说明

## 关键技术

- 1. **五层渐进式上下文压缩（零成本优先）**：先做不花钱的 microcompact/collapse，实在不行才调 LLM 摘要，且摘要时保留尾部 token 预算——把"上下文爆炸"的成本压到最低，还支持增量更新摘要。
- 2. **生成代码的纵深沙箱**：`core/runner.py` 对 Agent 生成的策略代码做 UID 降权（`vibe-sandbox` 用户）+ `RLIMIT_AS`（4GB 虚存）+ `RLIMIT_NOFILE`（512）+ 隔离 HOME（只软链 cache/data-bridge/qveris，`.env`、sessions.db、live mandate 台账不可见）+ 环境变量 allowlist（不继承 LLM/券商/实盘凭证）。这是"Agent 能写代码"类应用的安全范本。
- 3. **确定性计算防重复**：`_verification_ledger` 从历史中提取已通过的 `calc`/`verify_market_cap`/`verify_valuation` 结果，压缩后重新附上，避免模型在上下文被清后把同一道计算题重跑 5–9 遍。
- 4. **token 成本精细化核算**：`_record_llm_usage` 逐轮记录 input/output/total + `cache_read_tokens`/`cache_creation_tokens`，原子写入 `llm_usage.json`（tmp + replace）。

## 对openmate的启示

- - **P0｜五层渐进式上下文压缩，先免费后付费**：openmate 长会话必遇上下文爆炸。直接照搬策略：先做不调 LLM 的 microcompact（裁剪旧工具结果）和 context_collapse（折叠长文本），真不够再调 LLM 摘要；摘要时保留尾部 token 预算；多次摘要在旧摘要上增量更新。预期：成本大幅下降且不丢近期上下文。
- - **P0｜三层超时：LLM 调用级 + 僵尸看门狗 + 流式指数退避**：openmate 的 Agent 循环必须给每次 LLM 调用设硬超时（防静默卡死），给整个 run 设无进展看门狗（防 zombie），流式失败按 1/2/4s 封顶退避。预期：杜绝"任务永远 running"。
- - **P0｜执行 Agent 生成代码必须沙箱隔离**：openmate 若允许 Agent 写脚本/执行命令，照搬 runner.py：独立子进程 + 资源上限（内存/文件描述符）+ HOME 隔离 + 环境变量 allowlist（不把 API key/实盘凭证传给生成代码）+ 只暴露必要目录。预期：安全且崩溃隔离。

## 参考来源

- 豆包
