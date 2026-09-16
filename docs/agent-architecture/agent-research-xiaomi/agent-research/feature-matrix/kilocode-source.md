# kilocode（Kilo-Org/kilocode，opencode fork）源码级功能研究

> 源码：~/agent-research-src/kilocode（184MB git clone，bun monorepo 38 packages）
> 研究日期：2026-09-17 深夜轮7（cron）
> 定位：不在CSV top100内（前几轮TODO遗留目标）；opencode的商业化fork+VS Code/JetBrains多端。对OpenMate（前端+workspace管理）参考价值极高

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | 🔴 **Agent Manager多会话编排面板**：VS Code内多session并行面板+**git worktree隔离**（每agent一个worktree）+fork-session/fork-handoff（从现有会话分叉出新worktree会话）+command-budget（每会话命令预算）+base-branch/base-update（基线分支管理）+discard/delete worktree+GitStatsPoller实时diff统计 | packages/kilo-vscode/src/agent-manager/（50+文件） | 部分（workspace有tab，无worktree隔离/无并行agent面板） | 没有 | 部分有 | **P0**。"多agent并行改代码互不干扰"=worktree-per-agent是行业答案（kilocode/continue/claude-code三家），OpenMate workspace补git worktree子目录即得 |
| 2 | 🔴 **Wakeup定时唤醒**：agent给自己schedule未来唤醒（MIN_DELAY/MAX_HORIZON/MAX_PER_SESSION三约束+InvalidTime/PastTime/TooMany结构化错误+**adopt收编孤儿wakeup**（目录级扫描接管别的实例留下的待触发）+cancelSession批量取消 | kilocode/wakeup/（index/resume/schema） | 没有 | 部分（hermes_cron是外部cron，非agent自主唤醒） | 部分有 | **P0**。"90分钟后提醒我"/"跑完叫我"=agent自主定时，与hermes_cron互补：这是session内的自醒，OpenSoul cortex加wakeup工具即可 |
| 3 | **跨agent会话导入**：session-import/service.ts+types.ts（消息v2 schema：parentID/cost/tokens含cache read+write/reasoning/structured/variant/finish）+session-resume/import.ts+task-resume+session-portability（cumulative-diff/session-diff-restore**会话携带累积diff可迁移恢复**） | kilocode/session-{import,resume,portability}/、task-resume.ts | 没有 | 没有 | 完全没有 | P1。与goose import_formats（本轮另一发现）双方向互证：**会话可迁移已成行业标配**——kilocode侧重"导出携带diff"，goose侧重"导入别家格式" |
| 4 | **沙箱策略层**：@kilocode/sandbox独立包（backend支持探测+unrestricted档+Profile）；policy.ts per-session信号量/引用计数/三张锁表；limits=mode+allowedHosts+writablePaths（~展开）；inheritance.ts（子进程沙箱继承）+network-tools.ts（网络工具也过沙箱） | kilocode/sandbox/（12文件）+packages/sandbox | 没有 | 部分（mirror/sandbox.py有代码执行沙箱，无文件/网络粒度策略） | 部分有 | P1。CowAgent scope声明（arg-level非OS sandbox）+kilocode真沙箱=威胁模型到实现的对照组 |
| 5 | **Marketplace三类安装**：mcp/agent/skill三kind×project/global两scope；McpInstallationMethod带parameters（placeholder/optional）+prerequisites（前置条件清单）+suggest_for（按filename/vscode_extension推荐）；detection.ts自动检测+installer.ts | kilocode/marketplace/ | 没有 | 部分（api/marketplace.py有，需对照补installation method结构） | 部分有 | P1。OpenSoul marketplace补"带参安装方法+前置条件+按场景推荐"三件 |
| 6 | **kilo-memory包**：marker.ts（记忆标记进上下文，MemoryMarkerMeta）+turn.ts（turn级记忆触发）+events.ts（status/updated/error三事件走Bus）+runtime.ts——记忆是独立Effect包，宿主通过setSink注入事件系统 | packages/kilo-memory + kilocode/memory/ | 没有 | 部分（hippo内嵌，无marker可观测） | 部分有 | P1。"记忆何时被注入/更新"全程发事件——用户可观测性在记忆维度的解 |
| 7 | **Snapshot快照体系**：track.ts（trackState跟踪）+materialize/seed/diff-full/cleanup——"Continue with snapshots"续跑时重置slow-track guard；snapshot hash做续跑边界 | kilocode/snapshot/（7文件） | 没有 | 没有 | 完全没有 | P1。与Cline git快照/opencode文件快照互证，kilocode补的是"快照=续跑边界"语义 |
| 8 | **question规范化+Deferred**：ask-user问题normalize（换行折叠/option label清洗）+Deferred挂起+dismissAll批量撤销——HITL问题队列管理 | kilocode/question/ | 部分（审批modal） | 没有 | 部分有 | P2 |
| 9 | **presence在线状态**：context/policy/service——多面板（sidebar/editor tab/Agent Manager）共享连接时的"谁在看着"策略 | kilocode/presence/ | 没有 | 没有 | 完全没有 | P2。多端同时打开同一会话时的显示策略，OpenMate未来多端会用到 |
| 10 | **上游fork隔离工程**：kilocode_change标记+镜像文件规则（Kilo逻辑抽到src/kilocode/<同路径>.ts，上游文件只留一行import+标记）+CI注解检查+workflow allowlist+knip死代码ratchet——**大规模fork可持续合并的工程范式** | AGENTS.md+script/check-opencode-annotations.ts | — | — | 参照 | OpenMate若fork上游组件（如xyflow）照此模式 |
| 11 | **杂项可抄**：pii.ts（PII处理）、parent-watchdog.ts（父进程看门狗）、remote-tui.tsx（远程TUI）、http-recorder（HTTP录制回放=VCR）、effect-sqlite（Effect化SQLite）、control-plane、board（context/notice/store公告板）、command-timeout.ts、enhance-prompt.ts（prompt增强） | kilocode/各文件 | 部分 | 部分 | 部分有 | P2。http-recorder对OpenSoul测试体系（VCR cassette，openllmetry轮已指出缺口）再+1方 |

## 源码亮点
- AGENTS.md本身就是agent协作工程的标杆：质量检查矩阵（区域×命令表）、"最小相关检查"原则、"说ready前跑没跑检查要如实声明"。
- worktree-family.ts/worktree-cleanup.ts：worktree不是撒出去不管——有家族关系追踪和清理生命周期。
- fork-handoff：从既有会话**带上下文交接**到新worktree——"这个任务变复杂了，分个身"。
- Effect-TS全面采用（Semaphore/Deferred/Layer/Fiber）：并发原语声明式化。

## 可复用设计（Top-5）
1. **worktree-per-agent+Agent Manager面板**（#1）：OpenMate workspace差异化机会。
2. **Wakeup自主唤醒**（#2）：cortex加一个wakeup工具的成本，体验提升显著。
3. **会话携带diff迁移**（#3）：与goose导入器合起来=会话互操作完整方案。
4. **沙箱三要素limits**（#4）：mode/allowedHosts/writablePaths。
5. **记忆marker事件化**（#6）：hippo可观测升级。
