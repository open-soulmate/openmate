# 001 · obra/superpowers 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：superpowers（作者 obra，即 Jesse Vincent / structuredthinking 体系作者）
- **GitHub 地址**：https://github.com/obra/superpowers
- **Star 数**：约 285,946（调研时点，批次数据）
- **主要语言**：Shell（仓库标记），实际为 **Markdown 技能文件 + 少量 shell/node/ts 脚本**
- **一句话定位**：一套可组合的 **agentic 软件开发方法论（skill 层）**，作为"插件"叠加在 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Pi、Devin、Kimi、Hermes 等编码 harness 之上，本身不实现独立的 agent 运行时或工具协议。
- **目标用户/场景**：使用上述编码 agent、希望把"工程纪律"（TDD、系统化调试、头脑风暴、子代理驱动开发、worktree 隔离）固化为可复用技能的开发者。
- **成熟度**：非常活跃。`docs/superpowers/plans/` 下规划文档从 2025-11 一直延续到 2026-08，存在 `RELEASE-NOTES.md`（约 94KB）、`.version-bump.json`、`scripts/bump-version.sh`、pre-commit、issue/PR 模板，具备完整版本工程与 CI 纪律。

> 重要定性：**这不是一个"可独立运行的 agent 程序"**，而是一套以 Markdown 为载体的提示工程/方法论资产。它的"源码"主要是 `skills/*/SKILL.md` 与其附带的 prompt 模板和辅助脚本。因此本报告第 6/7/8 章的"稳定性/高可用/自我进化"是**提示层方法论意义上的机制**，而非进程级重试、连接池、熔断等运行时机制——下文会严格区分。

## 2. 源码结构总览

顶层结构（经 `git/trees/main?recursive=1` 核实）：

```
superpowers/
├── skills/                      # 核心：技能（方法论资产）
│   ├── using-superpowers/       # 元技能：强制"先调用技能再回答"
│   ├── brainstorming/           # 设计先行头脑风暴（含本地可视化 server）
│   │   └── scripts/ server.cjs / start-server.sh / stop-server.sh / helper.js
│   ├── subagent-driven-development/  # 【核心】子代理驱动开发（32KB SKILL.md）
│   │   ├── implementer-prompt.md / task-reviewer-prompt.md / re-review-prompt.md
│   │   └── scripts/ review-package / sdd-workspace / task-brief
│   ├── dispatching-parallel-agents/   # 并行子代理调度
│   ├── executing-plans/         # 跨会话执行计划
│   ├── systematic-debugging/    # 系统化调试（含 defense-in-depth/root-cause-tracing）
│   ├── test-driven-development/ # TDD 红绿重构
│   ├── requesting-code-review/  # 发起代码评审（含 code-reviewer.md 评审模板）
│   ├── receiving-code-review/    # 接收/响应评审
│   ├── using-git-worktrees/     # Git worktree 隔离工作区
│   └── finishing-a-development-branch/
├── hooks/                       # 宿主钩子：session-start / hooks.json / run-hook.cmd
├── scripts/                     # 版本与打包：bump-version.sh / lint-shell.sh / sync-to-codex-plugin.sh
├── .claude-plugin/ .codex-plugin/ .cursor-plugin/ .devin-plugin/
│   .hermes-plugin/ .kimi-plugin/ .opencode/ .pi/   # 各宿主适配清单
├── docs/plans/ docs/superpowers/{plans,specs}/    # 自身的研发计划与设计文档
├── CLAUDE.md / GEMINI.md / AGENTS.md / README.md / RELEASE-NOTES.md
```

**核心源码文件清单（真实路径）**：
- `skills/subagent-driven-development/SKILL.md`（约 32KB，全项目的"主循环"）
- `skills/subagent-driven-development/implementer-prompt.md`、`task-reviewer-prompt.md`、`re-review-prompt.md`
- `skills/subagent-driven-development/scripts/{task-brief,review-package,sdd-workspace}`
- `skills/using-superpowers/SKILL.md`（元调度规则）
- `skills/systematic-debugging/SKILL.md`、`skills/test-driven-development/SKILL.md`
- `skills/requesting-code-review/code-reviewer.md`
- `hooks/session-start`、`hooks/hooks.json`

**入口/启动流程**：并非传统 `main()`。运行时是宿主 harness；`hooks/session-start` 在会话启动时向模型注入"使用技能"的引导，`using-superpowers/SKILL.md` 规定"任何回答前必须先判断是否有技能适用"。**代码规模**：核心逻辑几乎全在 Markdown（数十个 SKILL.md，单文件最大 32KB），可执行脚本为薄胶水（review-package 约 1.5KB、sdd-workspace 约 1.6KB、task-brief 约 1.2KB）。

## 3. 系统架构分析

- **编排模式**：**Plan-and-Execute + Multi-Agent（控制器/实现者/评审者角色分离）+ Reflection（强制评审回路）**，并以 skill 触发制（skill-driven）驱动。源码证据：`subagent-driven-development/SKILL.md` 内的 `digraph process` 明确画出"分派实现者子代理 → 任务评审 → 修复循环 → 最终整支评审"的有向图。
- **核心组件**：
  1. **Controller（控制器/主会话）**：持有计划与跨任务上下文，负责派发、裁决（ruling）、记账（ledger），**自己不写实现代码**。
  2. **Implementer（实现者子代理）**：每任务一个全新上下文，禁止再派生子代理（"no-subagents contract"，写在 `implementer-prompt.md`）。
  3. **Task Reviewer（任务评审者）**：任务级闸门，同时裁决"规格符合性(spec ✅)"与"代码质量"两维。
  4. **Re-reviewer（复审者）**：只对修复 diff 做 ADDRESSED/NOT ADDRESSED 判定。
  5. **Final Code Reviewer（最终整支评审）**：用 `code-reviewer.md`，指定最强模型。
- **数据流**：计划文件 → `scripts/task-brief` 抽取任务文本为独立 brief 文件 → 控制器按模板拼派发提示词 → 实现者实现/测试/提交并把报告写报告文件 → `scripts/review-package PLAN BASE HEAD` 把 diff 打成单一文件 → 评审者读该文件（**diff 不进入控制器上下文**）→ 结论回写 ledger（`progress.md`）。
- **关键设计原则（源码原文）**："They should never inherit your session's context or history — you construct exactly what they need."（子代理不得继承会话上下文）。

架构示意（Mermaid 思路）：
```
Plan → Controller ──brief文件──> Implementer(新上下文) → report文件
        │                                              │
        └──review-package(diff文件)──> TaskReviewer ──findings──> Fix Loop(≤5轮)
                                          │
                                   全任务完成 → FinalReviewer(最强模型) → finishing-a-development-branch
```

## 4. 功能拆解

- **技能路由（using-superpowers）**：强制"哪怕 1% 可能适用也必须调用技能"，并用一张"红旗表（Red Flags）"列出模型常见的自我合理化借口（如"这只是个简单问题""我先扫一眼代码库"）逐一反驳——这是用提示词对抗模型惰性。
- **子代理驱动开发（SDD）**：见上，是整套系统的主干。
- **头脑风暴（brainstorming）**：设计先行，附带一个零依赖本地可视化服务 `server.cjs`（约 25KB）+ `start/stop-server.sh`，用于视觉化协作；`docs/superpowers/plans/2026-03-11-zero-dep-brainstorm-server.md` 说明其刻意做零依赖。
- **系统化调试（systematic-debugging）**：含 `root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`（反对盲等、要求条件式等待）、`find-polluter.sh`。
- **TDD（test-driven-development）**：红绿重构纪律 + `writing-good-tests.md`。
- **并行调度（dispatching-parallel-agents）**：但 SDD 主循环中明确"**Never dispatch multiple implementation subagents in parallel (conflicts)**"——并行用于无冲突的只读/审查类，实现类严格串行。
- **工具/插件系统**：不实现工具协议，而是通过 `.claude-plugin/plugin.json`、`.codex-plugin/plugin.json` 等把技能注册进各宿主；`docs/porting-to-a-new-harness.md`（约 50KB）是"移植到新 harness"的规范。

## 5. 技术亮点与优势

1. **上下文隔离作为一等公民**：每个任务派发全新子代理、brief/报告/diff 全部走文件而非粘贴进控制器上下文。源码原话："A real session's dispatch hit 42k chars of which 99% was pasted history"——即用真实事故数据反推出"禁止粘贴历史"。
2. **双重独立评审防偏见**：任务级（spec+quality）与最终整支评审分离，且禁止控制器对评审者预判（"never instruct a reviewer to ignore..."），从提示层面消除评审者被"带节奏"。
3. **Ledger 作为崩溃恢复地图**：`progress.md` 首行写计划身份、每任务一行 `Task <N>: complete (commits a..b)`，compaction 后"信任 ledger 与 `git log` 而非记忆"。
4. **按任务复杂度选模型的成本纪律**：机械任务用便宜模型、设计/最终评审用最强模型、修复第 4-5 轮强制升一档，并提醒"turn count beats token price"（轮次比单次 token 价更贵）。
5. **多 harness 一份资产**：同一套 Markdown 经各 `*-plugin/` 清单同步到 10+ 宿主，`scripts/sync-to-codex-plugin.sh` 维持一致性。

## 6. 稳定性机制【重点】

> 说明：本项目无进程级异常栈，"稳定性"体现为**提示层的容错与恢复协议**。以下均为源码直接证据。

- **崩溃恢复 / 检查点（核心亮点）**：`subagent-driven-development/SKILL.md` Setup 节明言："Conversation memory does not survive compaction... controllers that lost their place have re-dispatched entire completed task sequences — the single most expensive failure observed." 对策是用 **ledger 文件**（`<repo>/.superpowers/sdd/<plan-basename>/progress.md`）做持久化检查点：首行记录 plan 身份，见到 `Task <N>: complete` 即跳过，见到 fix round 末行则从下一轮恢复。每个 plan 独占工作区，`scripts/sdd-workspace PLAN_FILE` 负责分配目录。
- **任务状态分类与错误传播**：实现者只能返回四种状态 `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`，控制器对每种有固定处置（BLOCKED 再细分：缺上下文→补上下文重派；要推理→换更强模型；过大→拆任务；计划本身错→裁决后重派）。原话："Never ignore an escalation or force the same model to retry without changes."
- **有界重试与熔断（breaker）**：修复循环**每任务最多 5 轮**。1-3 轮恢复原实现者（上下文仍在），4-5 轮换全新实现者 + 更强模型。第 5 轮仍未收敛即"跳闸"：控制器对每条遗留 finding 做裁决（park 或 ruling），**禁止无限再修**。这是典型的"重试上限 + 退避升级 + 人工/裁决兜底"。
- **并发冲突防护**：实现类子代理**严禁并行派发**（"Never dispatch multiple implementation subagents in parallel (conflicts)"），用 worktree 物理隔离工作区（`using-git-worktrees`）。
- **基线可追溯**：派发前强制记录 `BASE=git rev-parse HEAD`，评审包用 `BASE..HEAD` 而非 `HEAD~1`（否则多 commit 任务会被静默截断）。
- **边界/终止条件**：只有四类操作允许停下来问人——不可逆/破坏性操作、安全敏感动作、worktree 外副作用（merge/push/发布）、计划已坏到每条路都是猜测。其余"裁决（ruling）而非停顿"。

## 7. 高可用机制【重点】

- **容错与降级**：Minor 级发现不进修复循环，记入 ledger 交给最终评审分流；plan-mandated（与计划冲突）的发现先裁决再处理，避免机械返工。
- **调度/等待策略（源码级细节）**：等待子代理结果时"既不能短超时轮询、也不能开死等"；本地有活就先干 ledger/report，真空闲时按 **5–10 分钟有界分段**等待，每段之间汇报一行并核对存活子代理，"chase any that finished without reporting"——保证卡死/丢失的子代理在分钟级被发现，而不是会话结束才发现。
- **资源/上下文管理**：所有大产物（brief、report、review package diff）一律走文件，不进控制器上下文；小而同构的任务**合并成一次派发**（batch），避免每个小改动都重建上下文。最终评审发现的问题也只派**一个**修复子代理带全部发现，而非每发现一个派一个（"Per-finding fixers... cost more than all its tasks combined"）。
- **可观测性**：唯一的"监控面板"就是 ledger——所有裁决以 `Ruling: <决定> — <理由> — <错了代价>` 格式落盘，结束时汇总为"Rulings I made"交还给人复核。
- **横向扩展/去中心化**：不适用（无服务端/无分布式）。其"可移植性"体现在把同一份方法论同步到 10+ 宿主，而非运行时扩展。

## 8. 自我进化机制【重点】

- **技能可组合 + 版本化演进**：技能是独立 Markdown，`using-superpowers` 明确要求"Skills evolve. Read current version."（不要凭记忆用旧版）。仓库 `RELEASE-NOTES.md` 与 `docs/superpowers/plans/*-improvements-from-user-feedback.md` 证明其根据用户反馈持续迭代技能。
- **反思/评审回路（最强的"自我进化"载体）**：双层评审 + 5 轮修复 + 跳闸裁决，本质是"生成—批评—修正"的自反馈闭环；`systematic-debugging` 要求先复现、定位根因再改，反对猜测式修补。
- **技能即经验沉淀**：`systematic-debugging/CREATION-LOG.md` 记录该技能从哪条真实调试经验抽象而来；`docs/superpowers/specs/2026-05-06-lift-drill-into-evals-*` 显示其把"演练(drill)"提炼为**evals（评估集）**，即用可重复评估驱动技能改进——这是最接近"持续学习/评估回路"的源码证据。
- **工具学习**：不适用（不自动发现工具）；跨宿主适配由 `porting-to-a-new-harness.md` 人工/半人工维护。

## 9. openmate 可借鉴点【重点】

openmate 背景：Python 开发、已有 Web 版、规划桌面/手机多端的 AI Agent 应用。

- **P0｜Ledger 检查点 + 状态机恢复**：openmate 的长任务/多步 agent 极容易在模型 compaction 或应用切后台后"失忆重跑"。借鉴 SDD 的 `progress.md`：把任务拆成带 `status` 的步骤，每完成一步把 `step_id + commit/产物指针 + 裁决` 落盘到本地 SQLite/JSON，重启后读账本而非读对话历史。预期收益：多端（桌面/手机）切后台/进程被杀后能精准续跑，避免重复消耗 token。
- **P0｜子代理"文件交接、上下文隔离"协议**：openmate 已有 Web 版，若引入多 agent 编排，应强制"派发提示词只给 brief 路径、产物走文件、不把历史粘贴进子代理上下文"，并用"实现者禁止再派评审者"的层级约束防止评审成本爆炸。预期收益：长任务上下文不膨胀、token 成本可控。
- **P1｜有界重试 + 跳闸裁决器**：把 LLM 工具调用/代码执行的失败做成"≤N 轮修复 + 每轮升级模型/降温 + 到顶后把遗留问题显式呈给用户裁决"，而不是无脑重试或静默丢弃。openmate 的稳定性章节可直接复用这套状态机（DONE/BLOCKED/NEEDS_CONTEXT 四态 + breaker）。
- **P1｜按任务复杂度路由模型档位**：机械步骤用小模型、设计/终审用大模型，做成可配置路由策略，是多端应用控成本的直接抓手。
- **P2｜技能/SOP 即 Markdown 资产 + evals**：把 openmate 沉淀的最佳实践写成可版本化的"技能包"，并配套一小套可重复 eval 用例（对标其 lift-drill-into-evals），让迭代可量化。

## 10. 源码验证标注

**源码直接阅读确认**（经 raw.githubusercontent.com / GitHub trees API 核实）：
- `skills/using-superpowers/SKILL.md`（全文，红旗表、技能优先级、SUBAGENT-STOP）
- `skills/subagent-driven-development/SKILL.md`（全文，process digraph、四状态、5 轮修复、breaker、ledger 协议、模型选择、等待策略）
- 目录树经 `git/trees/main?recursive=1` 核实（skills 清单、hooks、scripts、各 `*-plugin/`）

**来自文档/命名推断（未逐行读源码）**：
- `implementer-prompt.md` / `task-reviewer-prompt.md` / `re-review-prompt.md` / `code-reviewer.md` 的具体文案仅据主 SKILL.md 的引用与描述，未逐字读取。
- `scripts/{task-brief,review-package,sdd-workspace}` 的实现逻辑仅据其调用方式与体积（1–1.6KB）推断为薄胶水。
- `brainstorming/scripts/server.cjs`（可视化服务）未读内部实现。
- `hooks/session-start` 因无扩展名抓取失败，其注入逻辑据 `hooks/hooks.json` 与文档描述推断。
- Star 数、活跃度为批次 JSON 数据，未实时复核。

**源码不可得说明**：`hooks/session-start`（无后缀文件）与 `README.md` 本次抓取分别返回"link fetch error / hit security strategy"，未取得正文，相关结论已标注为推断。
