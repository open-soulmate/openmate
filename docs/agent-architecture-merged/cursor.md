# Cursor

## 概述

Cursor 是一个AI编程IDE。

**仓库**: https://github.com/getcursor/cursor | **语言**: Python

## 核心架构

Cursor hosts many models with explicit context windows:

| Model | Provider | Default ctx | Max ctx | Caps |
|-------|----------|-------------|---------|------|
| Claude 4.5 Sonnet | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Claude 4.6 Opus | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Claude 4.7 Opus | Anthropic | 300k | 1M | Agent, Thinking, Images |
| Claude Opus 5 | Anthropic | 300k | 1M | Agent, Thinking, Images |
| Claude Sonnet 5 | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Composer 2.5 | **Cursor** | 200k | - | Agent, Thinking, Images |
| GPT-5.x / Codex | OpenAI | 272k | up to 1M | Agent, Thinking, Images |
| Gemini 3.x | Google | 200k | 1M | Agent, Thinking, Images |
| Grok 4.5 / 4.6 | Cursor×SpaceXAI | 256k | - | Agent, Thinking |
| Kimi K3 | Moonshot | 200k | 1M | Agent, Thinking, Images |
| GLM 5.2 | Z.ai | 200k | - | Agent, Thinking |
| Muse Spark 1.3 | Meta | 300k | 1M | Agent, Thinking, Images |

**First-party models:** Composer (Cursor), Grok 4.5/4.6 (joint with SpaceXAI).

What the public surface strongly implies:

```
Cursor Client (VS Code fork)
    ├─ Indexer (codebase embeddings / structural index)
    ├─ Agent runtime
    │    ├─ Planner (Plan Mode)
    │    ├─ Tool executor (edit, terminal, browser, search)
    │    ├─ MCP client
    │    └─ Context builder (rules + skills + retrieval)
    ├─ Tab model (first-party autocomplete)
    └─ Cloud relay
...

**Evidence for cloud relay:** usage-based pricing, Max Mode, model routing, privacy mode, regional Bedrock/Vertex surcharges.

**Evidence for local indexing:** "Understand your code / Trace how a repo fits together" + standard AI-IDE practice. Exact index tech (embeddings vs AST vs both) is **not public**.

**Evidence for first-party models:** Composer 2.5 and Grok 4.5/4.6 listed with Cursor as provider.

These are real operational constraints from the docs table:

| Mechanic | Detail |
|----------|--------|
| Long-context surcharge | Claude 4 Sonnet 1M: **2x cost whe

## 关键技术

**代码索引安全**（来自 Cursor 官方博客）：
- **Merkle Tree 内容证明**：当工作区从复制的索引启动时，客户端上传完整 Merkle Tree 和 SimHash，服务器将每个加密路径与哈希关联，存储为"内容证明"
- **加密路径**：代码路径在服务器端加密存储
- **零知识索引**：服务器可以在不读取源码的情况下验证文件一致性

**Agent 沙箱**：
- Cloud Agent 运行在隔离的 Ubuntu VM 中（AWS Firecracker microVM）
- Local Agent 虽然有完整文件系统访问，但通过权限控制限制危险操作
- Git Worktree 提供了变更隔离，Agent 的修改不会直接影响工作分支

| 维度 | Cursor | Claude Code | GitHub Copilot |
|------|--------|------------|----------------|
| 基座 | VS Code Fork | 终端原生 | VS Code 扩展 |
| Agent 能力 | 8 并行 Agent | 单 Agent | 有限 Agent |
| 索引机制 | Merkle Tree + 向量 | 无持久索引 | 仓库级索引 |
| 自研模型 | Tab Model + Composer 2 | 无（使用 Claude） | 无（使用 OpenAI） |
| 执行环境 | Local/Worktree/Cloud | Local | Cloud |
| 规则系统 | .cursor/rules (MDC) | CLAUDE.md | 无 |

*本文基于 getcursor/cursor GitHub 仓库、Cursor 官方博客及第三方架构分析文章综合整理。*

## 对openmate的启示

1. **Capabilities as explicit model metadata** (`Agent`, `Thinking`, `Images`) — UI and router can gate features per model.
2. **Hidden-by-default models** — reduce choice paralysis; power users opt in.
3. **Separate Plan Mode from apply mode** — scope before mutate.
4. **First-party models** for latency/cost-critical paths (Composer for tab/agent).
5. **Cache pricing surfaced in product docs** — operators can reason about cost.
6. **Rules + Skills + MCP + Plugins in one customization hub** — not four scattered config systems.
7. **Long-context as a paid "Max Mode"** — economic control on 1M w

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 我们（78-cursor.md）
- MiMo报告（cursor-l1.md）
- MiMo卡片（cursor.md）
