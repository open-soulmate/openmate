# Warp (#44→CSV#64, warpdotdev/warp, 65k★) 源码级补验 — agent优先开发的完整活标本

研究时间：2026-09-17 深夜轮6（cron）
研究方式：git clone两次卡死（112K停滞）→ codeload tarball master分支124MB下载成功+tar校验通过 → 选择性解压：.agents/（21个skill+specs）、agents/specs/、AGENTS.md（19.5k字符全文）、crates/ai/（1.4MB agent核心）、crates/computer_use/
补充上轮64-warp-source.md（README级）；本轮全部源码级。默认分支=master（2079分支、2387 commits、65k★）。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|---|
| 1 | **specs进仓库**：`agents/specs/`+.agents/specs/存放工单号spec文件（APP-4878/CODE-1890...）——每个spec含Summary/Key design choices/**Design alternatives（为什么选A不选B）**/Root cause（带commit hash+文件:行号）/Risks/编号Validation criteria（含"新测试必须先对pre-change代码失败"） | 无 | 无 | 完全没有 | "ready-to-spec→ready-to-implement"标签流的物化；spec=agent与人的共同合同，可直接抄格式进OpenMate任务系统 |
| 2 | **AGENTS.md"Implementation Validation Order"**：速度优先验证序——①编辑中只跑最小targeted check、②完成后跑相关测试、③clippy、④最后一次性mutating formatter、⑤不重跑全量presubmit开PR；"Local commits are checkpoints rather than validation boundaries"（本地commit是检查点不是验证边界） | 无 | 无 | 完全没有 | agent开发效率纪律的显式规格；与用户"逐步开发每步测试"规则兼容（targeted test≠跳过测试） |
| 3 | **.agents/skills仓库级skill库（21个）**：add-feature-flag/promote-feature/remove-feature-flag/add-telemetry/changelog-draft/classify-changelog-pr/dedupe-issue-local/triage-issue-local/review-pr-local/rust-unit-tests/logging-and-error-reporting/**gui-*与tui-*按前端命名分工**/tui-verify-change... | 无 | skills.py | 部分有 | **skill=仓库重复劳动的固化**（每次加flag的步骤都一样→写成skill）；命名约定"surface-specific skill名字带surface前缀"可抄 |
| 4 | **skills-lock.json标准锁文件**：`npx skills@1.5.6 update -p -y`管理；script/bootstrap安装common skills到repo或~/.agents/skills（显式target防交互挂起、双位置冲突检测、跨checkout全局锁覆盖防护、装后对lock校验） | 无 | 无 | 完全没有 | `.agents/skills/`目录标准第五方定案的配套**安装器工程**（不只是目录约定，还有锁+校验+冲突防护） |
| 5 | **~/.agents/AGENTS.md全局规则**（global_rules.rs 396行）：GlobalRuleSource枚举（可扩展多来源）+HomeDirectoryWatcher+repo DirectoryWatcher**实时监听规则文件变化**（RepositorySubscriber推送delta） | 无 | 无 | 完全没有 | 全局规则+项目规则双层且都是活监听不是启动时读一次 |
| 6 | **diff_validation引擎（1293行）**：双格式ParsedDiff（StrReplaceEdit+V4AEdit/OpenAI cookbook V4A格式含move_to+hunks）；**jaro_winkler模糊匹配**校验search串是否近似命中真实文件内容；行号解析`{number}\|{line}` | 无 | 无 | 完全没有 | 模型生成的编辑先过验证器再落盘——"diff失败"的根治（Roo stale追踪是补救，这是前置门） |
| 7 | **run_agents编排双执行模式**（orchestration_config.rs）：Local vs **Remote{environment_id, worker_host, runner_id}**——子agent可跑在远端环境worker上 | 无 | 无 | 完全没有 | 与Daytona/E2B沙箱方向合流：编排配置声明执行位置 |
| 8 | **编排审批记忆**：OrchestrationConfigStatus Approved/DisApproved——用户批准过某orchestration config后，**匹配该config的run_agents调用跳过确认卡自动launch**（match check对run-wide fields） | 无 | 无 | 完全没有 | "批一次同类放行"=审批疲劳的解法（与goose permission_judge缓存互证，但这是确定性匹配非LLM判定） |
| 9 | **ask_user_question问卷状态机**（550行）：Editing/Completed双相、per-question draft（未答与"有UI状态的草稿"分开存——"frontends restore navigation without manufacturing empty answers"）、多选selected_option_indices+other自由文本+is_other_input_active | OpenMate acp审批卡简单形态 | 无 | 部分有 | HITL表单的Rust完整实现，与DeerFlow 16字段表单卡/ms-agent-fw恢复契约互证 |
| 10 | **computer_use crate**（652KB）：跨mac/linux/windows屏幕录制+截图+overlay（点击拖拽标注）+pointer session+缩略图+recording metadata；**GUI改动用computer_use视觉验证**（AGENTS.md明写"verify visually with computer_use"）；mock recorder在不支持平台演练录制UI | 无 | limb有screenshot stub | 完全没有 | "agent验证自己做的UI"闭环——录屏作为PR附件（spec 9条要求attach screenshot/video artifacts） |
| 11 | **citation.rs**：引用支撑 | citations启发式 | 部分有 | |
| 12 | **repo_metadata crate**：Repository/DirectoryWatcher/RepositoryWatchMode——仓库结构感知订阅 | 无 | 无 | 完全没有 | aider RepoMap之外的另一形态：watch而非全量扫 |

## 源码亮点

- **agent自举开发的完整证据链**：commit作者warp-agent与人类并列；PR模板含"Agent Mode: [x] This PR was created via Warp's AI Agent Mode"；agents/specs里的spec由agent写、验证标准机器可查（"新测试必须fail against pre-change代码"——防测试作弊）。
- **skill按验证目标命名**：tui-verify-change=跑真实PTY/tmux采集视觉证据；review-pr-local/triage-issue-local=PR流程skill化；dedupe-issue-local=去重。**21个skill全是"仓库内高频重复流程"，零花活**。
- AGENTS.md架构图明写"GUI用WarpUI GPU框架、TUI用cell-grid元素库，共享Entity/Handle核心"——**双前端共享核心**的架构文档范本。
- 样本spec（CODE-1890 status line）质量：8条编号validation criteria全部可执行（具体测试名+cargo命令），"Open questions resolved"一次性把设计悬案定死防实现时摇摆。

## 可复用设计

1. **spec模板**（Summary/Design alternatives/Root cause with commit+line/Risks/编号Validation criteria）——OpenMate任务下发格式直接抄
2. **审批记忆**（config匹配→跳确认）——OpenMate acp-approval-modal的下一步
3. **diff验证前置门**（模糊匹配search串）——OpenSoul文件工具加一层
4. **速度优先验证序**写进OpenSoul cortex的工具循环纪律

## 行业信号
- 65k★闭源转开源的商业终端，把**整个开发流程改造成agent消费的格式**（AGENTS.md+specs+skills+lock+验证序）——仓库即agent工作环境，这是"agent友好型开源协作"的最完整实现，此前轮次的五方`.agents/skills/`定案本轮升级为"目录+锁+安装器+全局规则+验证纪律"全套标准。
- Remote执行模式（environment_id/worker_host/runner_id）表明Warp把orchestration押注在云端环境，与Daytona/E2B合流。
