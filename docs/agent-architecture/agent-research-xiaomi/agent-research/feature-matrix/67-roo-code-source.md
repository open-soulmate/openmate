# Roo Code（RooCodeInc/Roo-Code, #67, 22k★）功能研究 — 源码级深读

> 源码：~/agent-research-src/roo-code（VS Code插件，src/core 28个子模块；tarball重下修复截断）
> 定位：Cline分支的自主编码agent（SDK/IDE/CLI），工程细节密度高

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **RooProtectedController配置写保护**：硬编码PROTECTED_PATTERNS（.rooignore/.roomodes/.roorules*/.roo/**/.vscode/**/AGENTS.md等）——**auto-approve也拦**：自动批准的写操作碰到这些路径必须转人工 | 无 | 无 | 完全没有 | **"agent不能改自己的规则文件"**——防自我提权的最小实现（~80行ignore库）；OpenSoul gene/templates/immune配置应进保护名单 |
| 2 | **FileContextTracker陈旧上下文追踪**：文件级watcher——文件经工具/mention/edit进入上下文即标active；**外部修改→标记stale→下次工具触碰前强制重读**（修diff编辑失败）；recentlyEditedByRoo/checkpointPossibleFiles分集合 | 无 | 无 | 完全没有 | 与aider watch/goose watchdog互证（第3方）——但Roo多了"stale→强制重读"语义，直接解决"上下文里是旧文件"bug |
| 3 | **RepoPerTaskCheckpointService**：per-task独立checkpoint仓库（git installed检查+init超时5s警告推webview）+checkpoint恢复+DIFF_VIEW对比UI | 无 | trajectory/store.py有checkpoint字样（轨迹非文件） | 完全没有 | 与aider dirty commit/opencode快照/_time_travel四方互证——每任务一个快照仓库是隔离性最好的形态 |
| 4 | **MessageQueueService**：任务执行中用户消息进队列（uuid+isPaused+stateChanged事件）——暂停/继续/逐条消费 | 无 | 无 | 完全没有 | 与goose steer/Khoj interrupt互证（第3方），三实现等价可任选 |
| 5 | **auto-approval分级**：isReadOnlyToolAction（readFile/listFiles/searchFiles/codebaseSearch/runSlashCommand）vs isWriteToolAction（editedExistingFile/appliedDiff/newFileCreated/generateImage）+**commands.ts命令级允许名单**+mcp.ts单独策略 | 无 | 无 | 完全没有 | 与goose permission_judge互证——Roo是静态规则分类（快、零成本），goose是LLM判定（覆盖未知工具）；**两者组合=先规则后LLM** |
| 6 | **RooIgnoreController**：.rooignore文件（gitignore语法）控制agent可见文件——被ignore的文件读/列/搜全挡 | 无 | 无 | 完全没有 | 与Continue DEFAULT_SECURITY_IGNORE互证——用户可声明"这些文件agent别碰" |
| 7 | **@mentions处理器**：@file/@folder/@problems/@url引用解析进消息+图片mention解析 | OpenMate无@引用 | 无 | 完全没有 | 聊天框@文件引用是编码agent标配交互 |
| 8 | **new_task委派+嵌套恢复**：native tool新建子任务，**nested-delegation-resume/history-resume**——父任务可从委派处恢复 | delegate_task有 | 无 | 部分有 | 委派后父任务恢复点的持久化值得抄 |
| 9 | **update_todo_list原生工具**：agent内置TODO清单工具（非外挂） | 无 | 无 | 完全没有 | 与claude-code todo互证——长任务清单是一等能力 |
| 10 | **condense上下文压缩模块**+context-management/独立目录+message-manager（mergeConsecutiveApiMessages合并连续消息） | 无 | 无 | 完全没有 | 上下文工程模块化目录结构参照 |
| 11 | **validateToolResultIds**：工具结果id校验（防tool_call/tool_result错配悬挂） | 无 | 无 | 完全没有 | 与deepagents PatchToolCalls互证——悬挂tool_call兜底 |
| 12 | **ContextProxy单一真相源+cachedState缓冲**：设置页输入绑本地缓存，Save才写回ContextProxy——**防编辑竞态的UI模式** | OpenMate直接绑store | 无 | 部分有 | AGENTS.md明文教训："直接绑live state会race" |
| 13 | **17语言i18n**（package.nls.*）+i18n/目录 | OpenMate有locales | 无 | 部分有 | 参照 |
| 14 | **DiffViewProvider**（VS Code内联diff视图+DIFF_VIEW_URI_SCHEME自定义协议） | OpenMate无编辑diff UI | 无 | 完全没有 | AI改文件的diff可视化审批界面 |

## 源码亮点

- **PROTECTED_PATTERNS把AGENTS.md也列入**：连"项目约定文件"都防auto-approve改写——对齐"agent不能给自己改规则"红线
- **FileContextTracker三集合设计**：active/stale/recentlyEditedByRoo分开记，只在"stale且即将被写"时强制重读——不打扰正常流程
- **checkpoint init超时警告**（WARNING_THRESHOLD_MS=5000）：慢初始化主动告知用户而非静默等待

## 可复用设计

1. **配置文件写保护名单**（~80行）→ immune/或limb/executor写工具前置检查，P0安全件
2. **stale文件强制重读** → limb/读写工具加FileContextTracker语义，防旧内容diff写坏文件
3. **规则优先的auto-approval**：静态只读/写分类→命中不了再LLM判（goose方案兜底）——审批降噪两段式
4. **.rooignore用户级排除** → OpenMate/OpenSoul工作区约定文件
5. **per-task checkpoint仓库** → vein/升级参照，与aider/goose/agent-zero会师
