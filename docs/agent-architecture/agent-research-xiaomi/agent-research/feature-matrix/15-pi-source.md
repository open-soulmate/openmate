# earendil-works/pi (#15, 104k★) 功能研究

> 源码：~/agent-research-src/pi（TypeScript monorepo，11包）
> 研究日期：2026-09-17 深夜轮
> 架构定位：与OpenMate/OpenSoul最接近的"工具箱式"agent——官方哲学：**核心不含MCP/subagent/权限弹窗/plan模式/后台bash，全部做成扩展/包**（coding-agent/docs/usage.md原话）

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **会话=追加树(id/parentId)，分支导航+离开分支自动摘要** | core/session-manager.ts(143行起)、compaction/branch-summarization.ts | 没有 | 没有（sessions_api只有compacted标志位） | 完全没有 | P0。SQLite会话表加parent_id，回溯=取leaf路径；切分支时调LLM生成branch summary注入。这是"时间旅行"的正确实现 |
| 2 | **压缩(compaction)携带文件操作清单**：readFiles/modifiedFiles跨压缩保留 | compaction/compaction.ts CompactionDetails | 没有 | 部分（compacted标志，无细节） | 完全没有 | P0。压缩摘要里结构化保留"读过/改过哪些文件"，下一轮上下文直接引用，防止压缩后丢失文件状态 |
| 3 | **Harness多Lane并行**（LaneBusy/QueueMode/OperationMismatch错误域）+ effect-gate + fork-policy | packages/agent/src/harness/runtime/lane.ts、session/fork-policy.ts | 没有 | 没有 | 完全没有 | P1。一个会话内多条并行操作lane，带互斥门(effect-gate)防冲突写 |
| 4 | **扩展系统=TS模块**：订阅生命周期事件+注册工具+命令+键位+CLI flag+UI原语(dialog/widget/overlay)，RPC模式下UI请求代理到宿主 | core/extensions/types.ts、runner.ts | 部分（plugins页面是UI级插件，非agent生命周期扩展） | plugin_loader.py（工具级） | 部分有 | P0。OpenSoul的plugin_loader缺：生命周期钩子、UI原语、键位/命令注册 |
| 5 | **Hook注册表**（有序、可多个handler、按id注销、错误隔离+上报） | agent/src/harness/hooks.ts HookRegistry | 没有 | 没有 | 完全没有 | P0。三方印证（codex/gemini/langchain也有），推理管线标准钩子 |
| 6 | **包管理器+信任链**：npm式安装扩展包，pi-manifest清单+checksum+semver满足检查+ProjectTrustStore首次打开项目先信任 | core/package-manager.ts、trust-manager.ts、project-trust.ts | 没有 | 部分（marketplace有雏形） | 部分有 | P1。marketplace补：manifest+hash校验+信任门 |
| 7 | **RPC模式**：headless JSON stdin/stdout协议，命令/响应/事件三通道，扩展UI请求+响应配对，stdout接管(output-guard)防工具输出污染协议流 | modes/rpc/rpc-mode.ts、core/output-guard.ts | 没有（ACP是另一层） | acp代理已有类似 | 部分有 | P2。OpenSoul的ACP思路相同；pi的stdout takeover技巧值得抄（工具误写stdout不会打碎JSONL） |
| 8 | **Chord运行时**：插件拆facet分进程跑（后端/浏览器/TUI），类型化service token（singleton/keyed），复制状态+delta增量同步，Go式context取消 | packages/chord/ | 没有 | 没有 | 完全没有 | P1。OpenMate前端和OpenSoul后端的插件双端同步可参考facet+replicated state模型 |
| 9 | **会话后端可插拔**：SQLite后端独立包，核心不强制native依赖，注入runtime-specific factory | packages/session-backends/ | 没有 | SQLite写死 | 部分有 | P2 |
| 10 | **Skills规范**：SKILL.md+frontmatter，name≤64/desc≤1024硬校验，.gitignore/.ignore/.fdignore感知的发现机制，诊断报告 | core/skills.ts | 没有 | gene/skill_learner.py有自动学skill | 部分有 | P0。OpenSoul会自动提炼skill（超前pi），但缺标准目录规范+ignore感知+长度校验 |
| 11 | **Plan模式做成官方扩展**：只读工具白名单+bash安全命令allowlist+"Plan:"章节提取步骤+[DONE:n]执行标记+进度widget | examples/extensions/plan-mode/ | 只有i18n死字符串 | 没有 | 完全没有 | P1。注意pi证明plan mode做成扩展而非内核是对的 |
| 12 | **受限采样(ConstrainedSamplingConfig)**：结构化输出约束在ai层统一 | packages/ai types | 没有 | 部分（extraction.py用response_format） | 部分有 | P1。升为ai层标准能力 |
| 13 | **模型目录管线**：models.dev数据生成models.generated.ts（禁手改，脚本再生）+provider-composer(models.json覆盖层)+Bedrock/OAuth/bun-oauth | packages/ai/scripts/generate-models.ts、core/provider-composer.ts | 没有 | 部分（多provider） | 部分有 | P1。"目录即代码+生成器"与AutoGPT发现互证 |
| 14 | **evals独立包**：harness+docker沙箱+report+plan，文档审计eval(documentation-audit.eval.ts)用LLM检查文档与代码一致性 | packages/evals/ | 没有 | benchmark/evaluator.py | 部分有 | P2。documentation-audit思路可抄（文档漂移检测） |
| 15 | **telemetry包**：OpenTelemetry span贯穿harness(hooks.ts里startHarnessSpan)，脚本生成telemetry文档 | packages/telemetry、agent/src/harness/telemetry.ts | 没有 | vital(运维)部分 | 部分有 | P1 |
| 16 | **工具细节**：edit-diff(结构化diff编辑)、file-mutation-queue(文件写串行化防并发冲突)、output-accumulator、truncate(工具输出截断策略) | core/tools/*.ts | 没有 | limb部分 | 部分有 | P1。file-mutation-queue是多agent同仓并发的必需品 |
| 17 | **HTTP dispatcher**：全局fetch接管，空闲超时5档可配(30s~disabled)，IPv6双栈autoSelectFamily超时调优 | core/http-dispatcher.ts | 没有 | 没有 | 完全没有 | P2。生产长连调优细节 |
| 18 | **questionnaire工具**（结构化向用户提问）+elicitation（计划模式白名单内） | PLAN_MODE_TOOLS含questionnaire | 没有 | 没有 | 完全没有 | P1。与opencode的Question工具互证 |
| 19 | **刻意不含MCP/subagent/权限弹窗**——全部扩展化 | docs/usage.md | — | — | 哲学差异 | 架构决策参考：内核极简+一切可扩展 |
| 20 | **session-export/HTML导出**（export-html带highlight.js vendor） | core/export-html、session-export.ts | 没有 | 没有 | 完全没有 | P3 |

## 源码亮点
- **agent-loop与harness分层**：packages/agent是可嵌入的库（Agent类+subscribe事件流），coding-agent是产品壳。OpenSoul可学：把推理循环做成库，CLI/GUI/RPC都是壳。
- session-manager.ts一处注释"labels are real tree entries"——树形会话连标签都是节点，删除标签要重链防孤儿子树，工程细节到位。
- .pi/目录在自己仓库里放skills/extensions/prompts——自举（dogfooding）。
- AGENTS.md要求"禁inline import、禁any、lockfile变更当代码审查"——工程纪律。

## 可复用设计（给OpenMate/OpenSoul的Top-5）
1. **会话树+分支摘要**（#1）：直接解决"对话走错方向只能重开"的痛点，OpenSoul SQLite加parent_id即可起步。
2. **HookRegistry标准**（#5）：四钩子+错误隔离，和langchain middleware四钩子合并成OpenSoul推理管线标准。
3. **压缩携带文件清单**（#2）：一行结构化数据解决压缩后agent忘记改过什么。
4. **file-mutation-queue**（#16）：OpenMate workspace多agent写文件前必须有。
5. **stdout output-guard**（#7）：ACP/子进程场景防协议流污染。
