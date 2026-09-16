# Continue (#51, continuedev/continue, 36k★) 功能研究

> 源码：~/agent-research-src/continue-git2（461MB，git clone --depth 1成功；codeload tarball三度超时——
> 本机到GitHub极慢，git clone比tarball可靠，此法已用于goose）。
> **行业重磅信号：Continue Dev, Inc. 已停运**——README以谢幕词结尾（"What we built together pushed the
> boundaries... We hope this codebase continues to serve as a foundation for others"），Apache 2.0遗留。
> 36k星双IDE编码agent之死 = IDE插件agent商业模式崩塌样本（继cursor闭源后第二例）。
> 仓库：core/（共享逻辑，直接是源码根）、gui/（React）、extensions/（VSCode+JetBrains Kotlin）、sync/（**Rust crate**）、eval/、binary/。
> llm/llms/下**81个provider适配**。tools/definitions下19个内置工具。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Model Roles六角色**：chat/autocomplete/edit/apply/embeddings/reranking各自独立配模型 | 无modelRole | gland/router多provider无角色分工 | 完全没有 | **P0**。与deepagents harness profiles/TradingAgents快慢双LLM/STORM五槽位四方互证。OpenSoul至少分：主推理/压缩摘要/embedding/rerank四角色 |
| 2 | **NextEdit预测引擎**（nextEdit/全套）：DocumentHistoryTracker→EditAggregator聚合最近编辑→diff格式化上下文→**PrefetchQueue在用户触发前预取下一处编辑预测**→EditableRegionCalculator算可编辑区→per-model provider（modelSupportsNextEdit能力检测）→NextEditLoggingService记录outcome闭环 | 无 | 无 | 完全没有 | P2（Cursor式前瞻编辑，IDE场景）。但**"编辑历史聚合→预测下一步"**模式可迁移到OpenSoul will/工作流：用户改了A，主动建议B |
| 3 | **Autocomplete七级管线**：prefiltering（debouncer+是否值得补全）→snippets（上下文snippet检索）→templating（FIM模板）→generation（streamer）→filtering（BracketMatchingService括号校验）→postprocessing→classification——生产级FIM工程全套 | 无 | 无 | 完全没有 | P2。OpenMate网页端可做"输入预测"，但七级管线是IDE级工程，参考价值>移植价值 |
| 4 | **代码库索引四索引器**：CodeSnippetsIndex+LanceDbIndex（向量）+FullTextSearchCodebaseIndex+ChunkCodebaseIndex；walkDir+refreshIndex增量刷新；DocsService（文档爬取crawlers+migrations）；**索引热路径用Rust crate**（sync/：gitignore扫描+db） | 无 | hippo有FTS5仅搜记忆 | 完全没有 | **P0**。OpenSoul代码库感知为零（与aider RepoMap互证）。FTS+向量双索引是底线，热路径Rust是性能参考 |
| 5 | **DEFAULT_SECURITY_IGNORE_FILETYPES**：索引硬排除*.env/*.key/*.pem/*.p12/*.db/*.secret等敏感文件——**先于用户配置的安全默认**，isSecurityConcern()统一判定 | 无 | immune有注入检测无文件敏感面管控 | 完全没有 | **P0**。~40行黑名单立即可抄进OpenSoul文件工具层，政企合规刚需 |
| 6 | **Rules条件激活+按需拉取双机制**：.continue/rules/*.md frontmatter globs/regex触发注入；**requestRule工具**——alwaysApply=false且无globs的rule不进prompt，agent按description列表主动调requestRule(name)拉取（规则的progressive disclosure）；agent还可用createRuleBlock**自动创建新rule** | 无 | 无 | 完全没有 | **P0**。"条件注入+按需拉取+agent自建"三件套是规则系统完整形态，与deepagents skills/claude-code ProposeSkills互证 |
| 7 | **19内置工具族**：multiEdit、singleFindAndReplace、readFileRange、requestRule、createRuleBlock、readSkill、searchWeb（**gated门控**）、fetchUrlContent、codebaseTool、runTerminalCommand、globSearch/grepSearch/ls等——工具面按模式裁剪（tools/policies/fileAccess.ts文件访问策略） | 部分 | 部分 | 部分有 | P1。multiEdit（一次多处编辑）和singleFindAndReplace值得OpenSoul文件工具补齐 |
| 8 | **30+ Context Providers**：RepoMap、Terminal（终端输出作上下文）、DebugLocals（调试变量）、Problems（IDE诊断）、FileTree、GitCommit、GitHubIssues、GitLab MR、Jira、Database/Postgres、Docs、MCP、OS、Clipboard、Diff、CurrentFile、OpenFiles等 | 无 | 无统一provider体系 | 完全没有 | P1。@提及体系=上下文供给注册表。OpenMate聊天框可先做8个高价值的：文件/终端/问题面板/git/剪贴板/网页/MCP/数据库 |
| 9 | **Apply专用模型**：chat产出代码块→专用模型精确apply到文件，diff解析独立于对话 | 无 | 无 | 完全没有 | P1。"生成"与"落盘"分离提高编辑成功率 |
| 10 | **Prompt files**：.continue/prompts/*.prompt即斜杠命令，零代码扩展 | 无 | 无 | 完全没有 | P1。OpenMate可做工作区prompt目录 |
| 11 | **三层配置合并**：config.yaml（用户）→.continuerc.json（工作区，mergeBehavior=merge/overwrite显式声明）→config.ts（modifyConfig编程式） | 无 | 无 | 完全没有 | P1。merge/overwrite显式语义防配置意外覆盖 |
| 12 | **.continueignore+安全忽略双层**：用户排除+安全硬排除分层，gitignore语法 | 无 | 无 | 部分有 | P2。配合代码库索引落地 |
| 13 | **81个LLM provider+autodetect**：llm/autodetect.ts按模型自动检测能力（FIM支持/nextEdit支持/tokenizer），asyncEncoder+tokenizer worker池+countTokens精确计量 | 部分 | gland/多provider但远少于81、无能力autodetect | 部分有 | P1。**"模型能力autodetect"**（不靠配置靠探测）值得OpenSoul借鉴 |
| 14 | **Hub配置共享**（已随公司停运） | 无 | api/marketplace.py有skill同步 | 部分有 | P2。教训见下 |

## 源码亮点

- **requestRule的筛选条件极简**：`alwaysApply===false && !globs`——两个条件定义了"什么规则是按需的"，无需额外声明字段
- **sync/用Rust重写索引热路径**（gitignore递归扫描+SQLite同步），Node主进程留编排——与open-interpreter转Rust fork、hermes等互证：**性能敏感路径下沉编译语言已成行业默认**
- autocomplete/util/AutocompleteLruCache+Debouncer+HelperVars：补全工程的三个基本功（缓存/防抖/参数束），OpenMate任何实时输入功能都用得上
- indexing/docs/带crawlers子目录+migrations——文档索引有自己的爬虫和schema迁移，视同数据库对待
- eval/目录独立成体系（自家agent质量回归）
- core/rules.md：协议消息新增检查单（protocol→passThrough→双IDE常量表→实现处四处同步）——多壳项目的契约纪律

## 可复用设计

1. **Rules条件激活+requestRule按需拉取+createRuleBlock自建** → OpenSoul规则/记忆系统三件套（P0，成本低）
2. **DEFAULT_SECURITY_IGNORE_FILETYPES安全硬排除** → immune/文件面管控立即可抄（P0，~40行）
3. **Model Roles（尤其apply独立模型）** → gland/角色化模型层
4. **代码库索引四索引器架构**（FTS+向量+snippet+chunk，Rust热路径） → OpenSoul代码库感知路线图
5. **Context Provider注册表** → OpenMate @提及体系升级蓝图
6. **商业教训**：公司死了，本地资产（rules/prompts/providers/81个provider适配）仍是行业最全参考——SaaS共享层先死，本地资产长存。**OpenMate功能取舍：只做本地资产，不做云端依赖**
