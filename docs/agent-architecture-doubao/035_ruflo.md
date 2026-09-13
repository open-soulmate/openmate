# Ruflo 源码级调研报告（Rank 35）

> 调研对象：`ruvnet/ruflo`（前身 claude-flow）
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Ruflo（曾用名 claude-flow） |
| GitHub | https://github.com/ruvnet/ruflo |
| Star | 约 7.2w（清单快照 72,262） |
| 主要语言 | TypeScript / Node.js（npm 包 + CLI），内嵌 Rust/WASM 引擎 |
| 许可证 | MIT |
| 一句话定位 | **搭在 Claude Code / Codex 之上的 Agent "元 harness"：自身不跑模型主循环，靠宿主执行，Ruflo 负责把多个 agent 编排成 swarm，并补上记忆、学习、联邦通信** |

**目标用户/场景**：已用 Claude Code/Codex、想要"多 agent 蜂群 + 自学习记忆 + 跨机联邦"的进阶用户。`npx ruflo init` 后照常写代码即可。

**成熟度**：活跃。生态下载量 8.1M+（README），提供 UI Beta（flo.ruv.io）、35 个插件、配套 RuVector 向量库；底层宣称基于 Cognitum.One 架构与 Rust AI 引擎。

---

## 2. 源码结构总览

经 README（raw HTTP 200）确认，它是 **npm 包 + 插件体系**：

```
ruflo/
├── plugins/
│   ├── ruflo-core/        # 基础：server、health check、插件发现
│   ├── ruflo-swarm/       # 多 agent 团队协调
│   ├── ruflo-autopilot/   # 自主循环
│   ├── ruflo-loop-workers/# 定时器后台任务
│   ├── ruflo-workflows/   # 可复用多步任务模板
│   ├── ruflo-federation/  # 跨机 agent 安全协作
│   ├── ruflo-agentdb/ ruflo-rag-memory/ ruflo-ruvector/  # 记忆/向量/RAG
│   ├── ruflo-intelligence/        # 从成功案例学习
│   ├── ruflo-graph-intelligence/  # 图推理(PageRank/增量更新)
│   └── ruflo-goals/ ...
├── data/                  # clone 数据台账
└── docs/ruflo-explained.md#  14 章教程
```

**两种安装路径**（README 表格，文档确认）：
- Path A **Claude Code Plugin**：只加 slash command + skills，工作区零文件，不装 hooks。
- Path B **CLI `npx ruflo init`**：完整回路——98 agents、60+ 命令、30 skills、MCP server、hooks、daemon，写入 `.claude/`、`.claude-flow/`、`CLAUDE.md`。

---

## 3. 系统架构分析

**编排模式：Multi-Agent 蜂群 + 宿主寄生（文档确认）**。README 自绘架构：

```
User --> Ruflo(CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers
                                   ^                          |
                                   +-------- Learning Loop <--+
```

关键判断：**Ruflo 不持有 Agent 主循环**。模型推理循环由宿主 Claude Code/Codex 执行；Ruflo 是"宿主外面的神经系统"——通过 hooks 自动路由任务、通过 MCP 工具（`memory_store`、`swarm_init`、`agent_spawn` 等）协调多 agent、注入记忆与学习回路。

**多 agent 拓扑**：README 提及 hierarchical / mesh / adaptive 蜂群、Queen-Worker 层级、Raft/Byzantine/Gossip 共识、漂移控制检查点、HNSW 集体记忆、三级成本路由、跨机零信任联邦（来自清单 architecture_notes，文档级）。

---

## 4. 功能拆解

- **Router→Swarm**：hooks 自动把任务路由给合适 agent；`agent_spawn` 派生子 agent。
- **自学习记忆**：`ruflo-intelligence` 让 agent 从过去成功案例学习；`ruflo-rag-memory` 混合检索/图跳/多样性排序；`ruflo-rvf` 跨会话存恢复记忆。
- **工作流**：`ruflo-workflows` 可复用多步模板；`ruflo-loop-workers` 定时后台任务。
- **联邦**：`ruflo-federation` 跨机安全协作，不泄露数据。
- **工具接入**：复用宿主原生工具 + hook，并通过 MCP/`registerTool` 接入；工具名带插件前缀（`mcp__plugin_ruflo-core_ruflo__memory_store`）。

---

## 5. 技术亮点与优势

1. **寄生式编排**：不重造 Agent 循环，复用 Claude Code/Codex 已有的工具与审批——工程上极轻，借力成熟宿主。
2. **蜂群拓扑 + 共识**：把分布式系统的 Raft/Gossip/拜占庭容错搬进 agent 编排（文档宣称）。
3. **自学习闭环**：Learning Loop 把每次任务结果回写记忆，agent "越用越聪明"。
4. **跨机联邦**：零信任跨机器协作。
5. **对 openmate**：展示了"在成熟 Agent 宿主之上做编排层"的另一范式（与 MetaGPT/cline 的自带循环形成对照）。

---

## 6. 稳定性机制【重点】

**部分适用（编排层视角）**：
- **漂移控制检查点**：蜂群执行有检查点（清单 architecture_notes，文档级），可回滚/续跑。
- **共识容错**：宣称 Raft/Byzantine/Gossip 共识用于多 agent 协调（文档级，未读源码验证）。
- **健康检查**：`ruflo-core` 提供 health check（README 插件表）。
- **局限（如实）**：核心循环稳定性其实由宿主 Claude Code/Codex 保证；Ruflo 的重试/超时细节未读源码。标**文档/推断**。

---

## 7. 高可用机制【重点】

**部分适用**：
- **去中心化/联邦**：`ruflo-federation` 跨机、`ruflo-loop-workers` 后台定时任务，宣称无单点（文档级）。
- **成本路由**：三级成本感知路由（清单，文档级）——按任务难度选模型，省钱。
- **局限**：未见服务化/负载均衡实现细节；其"高可用"是多 agent 协作冗余，而非服务端高可用。源码未逐行读。

---

## 8. 自我进化机制【重点】

**这是 Ruflo 的主打（文档级）**：
- **自学习**：`ruflo-intelligence`——agent 从过去成功案例学习并变强；Learning Loop（README 架构图）把执行结果回灌。
- **集体记忆**：HNSW 向量记忆 + RAG 混合检索，跨会话保留经验。
- **图智能**：`ruflo-graph-intelligence` 子线性图推理（PageRank、增量 delta 更新、复杂度感知执行 ADR-123）。
- **局限（如实）**：上述多来自 README/插件描述，未读 Rust/WASM 引擎源码验证其真实算法；"自学习"是否真在线更新权重还是仅检索过往经验，未证实——标**推断**。

---

## 9. openmate 可借鉴点【重点】

- **【P1】"寄生编排层"思路**：openmate 已有 Web 版 Agent，若未来要做多 agent，不必重造循环，可在现有 Agent 外包一层"路由→派发→记忆回写"的编排层，成本低。
- **【P1】学习闭环回写记忆**：把每次任务结果（尤其成功案例）结构化写入向量记忆，供后续相似任务检索——比纯对话历史更"越用越聪明"。
- **【P2】三级成本路由**：按任务难度选模型/路由，openmate 多模型时可借鉴，简单任务走便宜模型。
- **【P2】健康检查 + 检查点**：编排层应自带 health check 与漂移检查点，多 agent 任务可回滚。
- **注意**：Ruflo 宣传性内容较多，openmate 借鉴时应取"路由+记忆回写"的骨架，勿轻信其未经源码验证的共识/联邦宣称。

---

## 10. 源码验证标注

- **文档确认**：两种安装路径、插件清单（ruflo-core/swarm/autopilot/federation/rag-memory/intelligence 等）、Router→Swarm→Agents→Memory→LLM 架构图、Learning Loop、工具名前缀规则（README 全文，raw HTTP 200）。
- **推断/未验证**：Raft/Byzantine/Gossip 共识、HNSW 记忆、三级成本路由、漂移检查点等具体实现未读 Rust/WASM 引擎源码；清单 architecture_notes 称"部分已查证"，本报告将其列为文档级宣称。
- **非自带循环结论**：据 README "harness 不持循环、宿主执行"明确。
