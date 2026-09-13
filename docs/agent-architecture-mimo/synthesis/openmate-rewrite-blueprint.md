# openmate 重构蓝图（基于 Wave A/B/C 深读）

> 状态：Wave A+B+C 第一批 17 个项目深读完成；其余项目按「读一个写一个」继续  
> 背景：openmate = 编码 Agent + 个人助手混合体；已能跑，测试暴露问题，准备重构  
> 日期：2026-09-13

---

## 0. 一句话结论

**openmate 不该先换模型或堆功能，而应先抄「可恢复的运行时骨架」：事件源状态 + 分层超时 + Writer 防竞争 + 权限策略层 + 可观测。**  
自我进化（记忆/技能）放在骨架稳定之后，否则是「盲改」。

对标共识（17 份报告交叉验证）：

| 能力 | 最强参考 | 核心手法 |
|---|---|---|
| 会话/状态持久化 | LangGraph / OpenClaw / OpenHands | Checkpoint 链 / Writer fencing / 不可变事件日志 |
| 并发与队列 | OpenClaw | Lane-aware queue + 全局并发上限 + interrupt lane |
| 超时与预算 | OpenClaw | 分层：runtime budget / model idle / provider HTTP / wait-only |
| 权限与安全 | Claude Code / Codex / Gemini CLI | 模式正交审批 + OS 沙箱 + 参数级 Policy |
| 编辑正确性 | Aider | SEARCH/REPLACE 容错梯度 + 结构化失败反射 |
| 工具失败 | CrewAI / Cline | 三级策略 ignore/warn/raise + abort 级联取消 |
| 记忆进化 | Hermes / Mem0 / Gemini Auto Memory | 有界记忆 + ADD-only + 人审 inbox |
| 可观测 | Langfuse / OpenClaw OTel | Session→Trace→Observation + 评测门禁 |
| 工具协议 | MCP | Tool/Resource/Prompt 分权、无状态、双错误通道 |

---

## 1. 目标架构（建议）

```
┌──────────────────────────────────────────────────────────────┐
│                     openmate Gateway（唯一长驻）                │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Channel    │  │ Command      │  │ Session Manager     │   │
│  │ Adapters   │→ │ Queue        │→ │ + Event Store       │   │
│  │ CLI/IDE/IM │  │ (lane-aware) │  │ (SQLite WAL)        │   │
│  └────────────┘  └──────────────┘  └──────────┬──────────┘   │
│                                               │              │
│  ┌────────────────────────────────────────────▼────────────┐ │
│  │                 Agent Runner (可恢复)                     │ │
│  │  loop: plan → tools → observe → compact → continue       │ │
│  │  + Writer Claim Fencing  + 分层超时  + RetryPolicy        │ │
│  └───────┬───────────────────┬──────────────────┬──────────┘ │
│          │                   │                  │            │
│  ┌───────▼──────┐  ┌─────────▼────────┐  ┌──────▼─────────┐  │
│  │ Tool Policy  │  │ Context Engine   │  │ Memory Core    │  │
│  │ + Approvals  │  │ compact/summarize│  │ session/user   │  │
│  │ + Sandbox    │  │ skills on-demand │  │ (ADD-only)     │  │
│  └──────────────┘  └──────────────────┘  └────────────────┘  │
│          │                                                    │
│  ┌───────▼──────────────────────────────────────────────────┐│
│  │ LLM Providers (归一化) + MCP Tools + Custom Tools         ││
│  └──────────────────────────────────────────────────────────┘│
│          │                                                    │
│  ┌───────▼──────────┐  ┌───────────────────────────────────┐ │
│  │ Workspace        │  │ Observability (OTel / Langfuse)   │ │
│  │ Local|Docker|SSH │  │ traces + LLM-judge + regression   │ │
│  └──────────────────┘  └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

设计原则：
1. **UI 与内核分离**（学 OpenCode）：内核 = Headless HTTP + SSE；CLI/TUI/Desktop/Web 都是客户端。
2. **状态唯一真相**（学 OpenHands + LangGraph）：不可变事件日志 + checkpoint，UI 无隐式状态。
3. **副作用必须幂等**（学 LangGraph resume 语义）：中断恢复会重放节点。
4. **危险操作出主进程**（学 Codex/E2B）：沙箱/容器执行，主进程只调度。

---

## 2. P0 — 先修「能稳定跑」（建议 2–4 周量级）

### P0.1 Writer Claim Fencing（防并发写坏会话）— 抄 OpenClaw
- durable 字段 `activeWriterRunId`，事务内校验后再写 transcript
- 同一 session 同时只允许一个 runner 写；第二写者失败并入队
- **直接对应**：测试里「状态偶发错乱 / 双写」

### P0.2 Lane-aware Command Queue — 抖 OpenClaw
- 每 session FIFO 串行；全局并发上限；后台任务独立 lane
- 队列模式：`steer`（打断当前）/ `followup`（排队）/ `collect` / `interrupt`
- **直接对应**：「连点/多消息打爆」「打断后状态不一致」

### P0.3 分层超时 — 抄 OpenClaw
| 层 | 含义 | 默认建议 |
|---|---|---|
| runtime budget | 整轮 agent 预算 | 硬上限，超时 abort |
| model idle | 流式无 token | 60–120s |
| provider HTTP | 单次 API | 可配置 per-provider |
| wait-only | 等待用户/审批 | 不计入 budget |

### P0.4 Schema 版本化状态 + doctor 迁移 — 抄 OpenClaw
- `state_schema_version`、`agent_schema_version`
- 启动时 doctor：迁移、校验、锁目录、拒绝双开

### P0.5 统一权限策略层 — 抄 Claude Code + OpenCode + Gemini
```
mode: plan | ask | auto | full
rules: allow / ask / deny  (glob + argPattern)
hooks: PreToolUse 可 block（bypass 也拦）
```
- 编码路径：Plan 模式禁写盘（学 Cline）
- 个人助手路径：高危（转账/删库/发消息）强制 ask
- `.env`/密钥默认 deny 读（学 OpenCode）

### P0.6 工具失败与中断 — 抄 CrewAI + Cline
- ToolFailure 三级：`ignore | warn | raise`
- abort 级联取消子 agent / 子进程
- 同工具同参连续失败 ≥3 → doom_loop 拒绝并提示（学 OpenCode）

### P0.7 上下文压缩底线 — 抄 OpenCode + Cline + OpenHands
- 触顶自动 compact：保留最近 N 条 + 固定 Work-State 摘要模板
- 先截旧工具输出，再 LLM 摘要；**compact 失败不得破坏会话**
- 工具结果默认截断（如 2k token）

### P0.8 可观测最小集 — 抄 Langfuse
- 每轮：session_id / run_id / trace_id
- 记录：llm_call、tool_call、error、latency、token
- 短命进程必须 flush；否则评测与排障都是瞎的

**P0 验收（测试清单）**
- [ ] 双客户端同时发消息不损坏 transcript
- [ ] 连发 10 条消息：前序完成或有序排队，无状态撕裂
- [ ] 杀掉进程后 resume：从 last checkpoint 续跑
- [ ] 工具超时/抛错：会话可继续，错误可见
- [ ] compact 达到阈值自动触发且可回放摘要前历史（或明确丢弃策略）

---

## 3. P1 — 混合形态正确性（编码 + 个人助手）

### P1.1 双轨 Workspace — 抄 OpenHands
| 模式 | Workspace | 适用 |
|---|---|---|
| coding | Local / Docker / Remote | 改仓库、跑测试 |
| personal | 受限工具集 + 渠道适配 | 日程/搜索/消息，**默认无任意 shell** |

- 危险编码工具绝不暴露给 personal 轨道，除非用户显式切换

### P1.2 Subagent 隔离 — 抄 Claude Code / OpenCode
- Explore/Plan/General 子 agent：独立上下文与工具子集
- 可选 worktree 隔离；子 agent 失败不影响主对话
- 编码深潜用 subagent，避免主上下文爆炸

### P1.3 编辑正确性 — 抄 Aider
- RepoMap：tree-sitter + 图中心性，在 token 预算内选符号
- SEARCH/REPLACE 容错梯度：精确 → 缩进 → `...` → 相似行建议
- 结构化失败反馈触发反射，**上限 3 次**
- dirty-commit / checkpoint 保证 `/undo`（学 Cline：有后续 commit 则拒绝回滚）

### P1.4 Skills 按需加载 — 抄 OpenCode + OpenHands + Hermes
- 不要把全部技能塞 system prompt
- 触发：常驻 / 关键词 / 任务类型 / 路径匹配
- 技能目录版本化；损坏技能可隔离

### P1.5 MCP 作为一等公民 — 抄 MCP + Gemini CLI
- Tool/Resource/Prompt 分权；stdio 子进程隔离；启动超时预算
- 参数级 policy；env 脱敏；OAuth 支持
- MCP 失败不影响内置核心工具

### P1.6 终止条件防失控 — 抖 AutoGen
- 组合：max_turns / wall_clock / token_budget / user_idle / external_cancel
- 每个终止条件可单独配置并落入 trace

---

## 4. P2 — 自我进化（骨架稳后再做）

### P2.1 记忆 — 抖 Hermes + Mem0
- 作用域：`user / agent / session`
- **ADD-only** + 去重；过时靠检索排序压制，不轻易 UPDATE
- 写路径异步、崩溃可重放；无记忆服务时优雅降级（只有 session 上下文）

### P2.2 人审进化 — 抖 Gemini Auto Memory + OpenClaw Skill Workshop
- 后台从 transcript 挖「可复用经验」→ **inbox 人审** → 合并进 skill/memory
- 模式：`auto | propose | off`；默认 `propose`
- 安全扫描：禁止自动写入可执行代码为技能除非用户确认

### P2.3 评测闭环 — 抖 Langfuse + Aider Singularity
- Dataset + Experiment；LLM-as-judge + 规则校验
- CI 回归门禁：改 prompt/工具必须过固定集
- 自举 KPI：任务成功率 / 人工干预率 / edit 反射次数 / compact 后质量

### P2.4 沙箱 fork 实验 — 抖 E2B
- 对「自我进化后的技能/prompt」在 fork 沙箱跑对照，再晋升主配置

---

## 5. 不要抄的坑

| 坑 | 来源 | 原因 |
|---|---|---|
| AutoGen 旧版持久化 | autogen | maintenance mode，checkpoint 弱 |
| Daytona 开源仓停维护风险 | daytona | 2026-06 后开源侧停更；可参考架构不绑死 |
| 全量技能进 system prompt | 部分 skills 仓 | 指令失效、上下文爆炸（Claude Code 官方也强调精简） |
| 双 Gateway 抢状态目录 | 通用 | 必须目录锁 + doctor |
| 只靠 LLM 自觉、无 deterministic policy | 通用失败模式 | 稳定性靠工程分层，不靠「模型更聪明」 |

---

## 6. 重构落地顺序（给 openmate 的施工清单）

```
Phase 0  观测打点 + 现状问题归类（用测试失败样本当 dataset）
Phase 1  Event Store + Writer fencing + 目录锁 + schema version
Phase 2  Lane queue + 分层超时 + retry/timeout policy
Phase 3  Tool Policy 三态 + hooks + doom_loop
Phase 4  Compaction + Work-State 模板
Phase 5  Workspace 分轨（coding vs personal）
Phase 6  Subagent + 编辑反射 + checkpoint/undo
Phase 7  MCP 标准化 + 技能按需
Phase 8  Memory ADD-only + 人审 inbox
Phase 9  评测门禁 + 沙箱 fork
```

---

## 7. 已完成 L1 报告索引（17）

| 文件 | 项目 |
|---|---|
| reports/openclaw.md | OpenClaw |
| reports/opencode.md | OpenCode |
| reports/claude-code.md | Claude Code |
| reports/hermes-agent.md | Hermes Agent |
| reports/openhands.md | OpenHands |
| reports/cline.md | Cline |
| reports/aider.md | Aider |
| reports/openai-codex.md | OpenAI Codex CLI |
| reports/gemini-cli.md | Gemini CLI |
| reports/open-interpreter.md | Open Interpreter |
| reports/langgraph.md | LangGraph |
| reports/autogen.md | AutoGen |
| reports/crewai.md | CrewAI |
| reports/mem0.md | Mem0 |
| reports/mcp.md | MCP |
| reports/sandbox-e2b-daytona.md | E2B/Daytona |
| reports/langfuse.md | Langfuse |

## 8. 队列中（继续「读一个写一个」）

- Wave A 剩余：Roo Code、Continue、Goose、DeepSeek Harness、Pi
- Wave B 剩余：MetaGPT、OpenAI Agents SDK、MS Agent Framework、Google ADK、smolagents、DeerFlow、Agno、Dify、Langflow、Flowise、n8n
- Wave C 剩余：Composio、Firecrawl、browser-use、UI-TARS、gpt-researcher、STORM、AgentOps…
- Wave D：全量 98 清单其余项目一页调研卡

---

## 9. 七维评分速览（已完成项目）

| 项目 | 工具策略 | 权限 | 容错恢复 | 上下文 | 可扩展 | 可观测 | 生产成熟 |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenClaw | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| OpenCode | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| Claude Code | 5 | 5 | 4 | 5 | 5 | 4 | 5 |
| Hermes | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| OpenHands | 4 | 4 | 5 | 5 | 4 | 4 | 5 |
| Cline | 5 | 5 | 5 | 4 | 5 | 3 | 4 |
| Aider | 5 | 3 | 4 | 5 | 3 | 3 | 4 |
| Codex CLI | 4 | 5 | 4 | 4 | 3 | 5 | 4 |
| Gemini CLI | 5 | 5 | 4 | 4 | 5 | 4 | 4 |
| Open Interpreter | 4 | 4 | 4 | 3 | 4 | 3 | 3 |
| LangGraph | 4 | 3 | 5 | 4 | 5 | 4 | 5 |
| AutoGen | 4 | 3 | 3 | 3 | 4 | 3 | 3 |
| CrewAI | 4 | 3 | 4 | 3 | 4 | 3 | 4 |
| Mem0 | — | 3 | 4 | — | 4 | 3 | 4 |
| MCP | 5 | 5 | 4 | — | 5 | 3 | 5 |
| E2B/Daytona | — | 5 | 4 | — | 4 | 3 | 4 |
| Langfuse | — | — | — | — | 4 | 5 | 5 |

---

## 10. 增量结论（Wave A 补全 + Wave B/C 平台侧，2026-09-13 二批）

### 10.1 会话真相源：三种可并存的模式

| 模式 | 代表 | 适用 |
|---|---|---|
| 不可变事件日志 + checkpoint 链 | OpenHands / LangGraph | 多租户/可重放/评测 |
| 追加式 Session 日志「Model-visible ⟺ Logged」 | DeepSeek Harness | 插件化 runtime，模型可见必须可审计 |
| JSONL 树会话 | Pi | 极简本地、分支/回溯 |

**openmate 建议**：主路径用 **事件日志 + checkpoint**；分支实验用树会话；所有模型可见内容必须可回放（抄 Harness 不变量）。

### 10.2 多 Agent 协调怎么选

| 需求 | 优先参考 | 原因 |
|---|---|---|
| 状态图 + 可恢复执行 | LangGraph | Checkpoint 父链 + interrupt/resume |
| 租约心跳 + worker takeover | DeerFlow 2.0 | 长任务多 worker 恢复最完整 |
| TeamMode 路由/广播 | Agno | coordinate/route/broadcast/tasks |
| 确定性工作流图 | Google ADK Workflow | edges 声明式，适合固定流水线 |
| 代码子 Agent | smolagents Code-Act | 步骤更少，必须配沙箱 |
| 极简 handoff/guardrail | OpenAI Agents SDK | 六概念清晰，Tracing 内建 |
| 任务级 checkpoint/fork | CrewAI | `from_checkpoint` / `Crew.fork` |

**openmate**：个人助手主循环保持单 Agent；编码深潜用 subagent；自动化流水线用「轻量状态图 + 任务 checkpoint」，不必上完整 MetaGPT SOP。

### 10.3 产品化恢复与 HITL（平台侧）

- **Dify**：节点级错误三态 + 失败分支 + `error_type`；Human Input 超时分支 — 错误模型最值得抄  
- **Flowise**：工具级 Require Human Input + 画布检查点落盘重启续跑  
- **browser-use**：对象五分 Run/Session/Workspace/Profile/Browser；客户端超时不取消服务端  
- **goose**：错误当提示回注 + recipe retry + cron  
- **Pi**：Project Trust 分阶段 + 依赖 pin  

### 10.4 对 P0/P1 的增补清单

**P0 增补**
- 会话不变量：模型可见 ⟺ 已落盘（DeepSeek Harness）
- 错误类型化三态 + 失败分支（Dify）
- 工具错误结构化回注模型（goose），禁止静默吞错
- 依赖/技能供应链 pin（Pi）

**P1 增补**
- 长任务：租约心跳 + 原子 takeover（DeerFlow）
- 工具级 HITL 双通道：流程内节点 + 站外审批链接（Flowise）
- Browser/Computer Use 对象寿命管理（browser-use / UI-TARS）
- coding / personal 双 bundle（goose Distro / Roo modes 思路）

**P2 增补**
- 团队协作与白牌 Distro（goose AAIF 模式降低单点公司风险）

### 10.5 本批新增报告索引（累计 34 L1）

roo-code, continue, goose, deepseek-harness, pi, metagpt, openai-agents, google-adk, smolagents, deer-flow, agno, dify, flowise, browser-use, ui-tars, gpt-researcher, storm

### 10.6 仍在队列

Wave D 其余调研卡（进行中）

### 10.7 第三批增量：n8n / Composio / Firecrawl / Langflow / MS Agent Framework

**openmate 若做「长任务 / 定时 / 多 worker」，n8n 是 HA 标杆：**
- Queue Mode：main 入队 → Redis → worker 执行 → 回写 PG
- Multi-Main Leader 选举
- Error Workflow（Error Trigger 节点）独立错误处理流
- **Durable Scheduler**：DB 预写 runs + worker claim + reaper + misfire 策略（崩溃后任务不丢、不双跑）
- Wait 节点：长等待与审批暂停

**Composio（工具/鉴权）：**
- Session 持久化（用户+toolkits+auth+执行状态），可 `use()` 续跑
- Meta Tools 运行时搜索/鉴权/执行，避免工具描述塞满上下文
- 对话内 OAuth：暂停 → 用户连接 → 自动重试

**Firecrawl（长任务协议）：**
- 异步 Job ID + 轮询；Interact 在同一 scrape 上多步
- 自托管：队列 + Worker 分离（采集与 API 解耦）

**Microsoft Agent Framework：**
- 与 openmate 混合形态同构：图式 Workflow（checkpoint/time-travel/HITL）+ Harness Agent（规划/压缩/文件记忆/don’t-ask-again 审批）
- Durable Task 外置编排扩展（可选 Azure）

**对 P0/P1 的最终增补**
- P0：若 openmate 有定时/后台任务 → 抄 n8n durable scheduler（claim + reaper + misfire）
- P0：错误处理流与主业务流分离（Error Workflow 模式）
- P1：工具鉴权会话可暂停恢复（Composio）
- P1：长任务 Job 协议（Firecrawl）
- P1：MAF Harness 能力清单可直接当 openmate 混合形态验收标准

### 10.8 第三批报告索引（累计 L1 ≈ 44）

n8n, composio, firecrawl, langflow, microsoft-agent-framework + 此前 34 份

---

## 11. 全量收官（2026-09-13 · 98/98 L1）

覆盖矩阵见 `reports/COVERAGE-MATRIX.md`：**L1=98，覆盖率 100%**。

### 11.1 跨 98 项目收敛的六条稳定性铁律

1. **状态外置 + 检查点链**（MAF / LangGraph / Deep Agents）：编排状态进 DB，`parent_id` 可回放；禁止只存内存。
2. **工具失败回传模型**（Langroid / Haystack）：schema 失败喂回 LLM 修一次；业务循环不吞异常。
3. **预算与循环硬闸**（Langroid max_cost / max_turns / Swarms 取消传播）：token/费用/轮数/取消信号全局共享。
4. **上下文工程优先于堆历史**（Deep Agents 文件工作记忆 / Skill 延迟加载 / 工具结果卸载）。
5. **敏感面单独设防**（NeMo rail / SuperAGI Console / MAF don't-ask-again）：高风险工具入参校验 + 审批 + 策略可版本化。
6. **评估门禁先于上线**（PromptFlow）：改 prompt/工具必须过数据集。

### 11.2 openmate 最终 P0 施工顺序

```
1 外置模型网关（LiteLLM） → 2 检查点恢复 → 3 工具 hooks + 敏感审批
→ 4 文件工作记忆与压缩 → 5 评估流水线
```

（与 §2–§4 的 Writer fencing / Lane queue / 分层超时 / 权限层并行推进，均为 P0。）

### 11.3 新增高分参考（升级 L1 后）

| 项目 | 分 | 抄什么 |
|---|---:|---|
| agent-browser | 4.7 | snapshot+ref、daemon/doctor、fail-closed |
| Warp | 4.6 | 四档自主、denylist-first、强制 diff review |
| nanobot | — | Gateway 长驻 + 小核心（与 openmate 同构） |
| CowAgent | — | 三层记忆 + Deep Dream、Tools/Skills 分层 |
| LibreChat | — | Resumable Streams、Skills 三档、Code 审批 |
| gpt-pilot | 2.4 | **只抄架构不抄仓库**（供应链事故） |


