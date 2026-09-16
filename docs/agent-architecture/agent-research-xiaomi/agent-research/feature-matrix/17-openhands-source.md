# OpenHands (#17, 87k★) 功能研究 — 源码级深读

研究时间：2026-09-17 01:30
源码：~/agent-research-src/openhands（前端Canvas, 28MB）+ ~/agent-research-src/openhands-sdk（Python SDK+Agent Server, 28MB）
重要背景：OpenHands 已拆成 4 仓库：OpenHands(Canvas前端) / software-agent-sdk(Python后端) / typescript-client(生成客户端) / automation(调度)。前端**禁止直连**agent-server（CI测试 `no-direct-agent-server-calls.test.ts` 强制走typed client）——接口契约纪律值得抄。

## 功能清单

| # | 功能 | OpenMate(前端) | OpenSoul(后端) | 差距 | 实现建议 |
|---|------|----------------|----------------|------|----------|
| 1 | **Hook系统**：6事件(PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/SessionEnd/Stop)，HookMatcher通配/regex匹配，双类型hook（command外部脚本stdin JSON / LLM型prompt+tools+max_iterations），返回allow/deny决策 | 没有 | 没有（grep pre_tool_use/HookDecision零命中） | **完全没有** | P0。与codex/gemini-cli三方互证，HookRegistry是行业标配。OpenSoul在cortex推理管线上加6个挂载点，deny直接阻断工具执行 |
| 2 | **子Agent定义文件**：`.agents/agents/*.md`（YAML frontmatter+正文system prompt），6级优先级（程序注册>插件>项目.agents>.openhands>用户~/.agents>legacy），自动注册进delegate registry按名调用 | agent-installer.ts有雏形 | 没有AgentDefinition | **部分有** | P0。OpenMate已有agent安装概念，补标准目录+frontmatter规范，后端注册表对齐 |
| 3 | **并行工具执行+资源锁**：tool_concurrency_limit线程池，ResourceLockManager按`declared_resources()`声明的资源(文件/终端/browser)自动串行化，不同资源真并发 | 没有 | 没有 | **完全没有** | P1。OpenSoul工具执行是串行的；先让工具声明资源，再上锁管理器 |
| 4 | **Critic迭代精化**：APIBasedCritic打0-1分，success_threshold+max_iterations，低于阈值Conversation.run()自动带followup_prompt重试 | 没有 | intelligence/analyzer只有文本分析非评分重试 | **完全没有** | P1。直击"结果没人验收"；在cortex加critic评分环节，连同TradingAgents延迟回填一起做 |
| 5 | **ask_oracle第二意见工具**：约定优于配置——存一个名为"oracle"的LLM profile即自动生效，卡壳时咨询另一个模型 | 没有 | 没有 | **完全没有** | P2，实现成本极低（gland已有ModelRouter，加profile约定即可） |
| 6 | **workflow动态编排工具**：agent生成Python脚本`async def main(wf)`，wf对象协调子agent任务，max_concurrency 1-64限流 | 没有 | will/dag_planner.py有DAG调度雏形 | **部分有** | P1。把dag_planner暴露成工具让LLM写编排脚本 |
| 7 | **task_tracker工具**：todo/in_progress/done三态清单持久化到workspace文件，带notes | cortex-client有TaskItem UI | 没有 | **部分有** | P2。补后端持久化+工具化 |
| 8 | **Marketplace（插件+技能市场）**：MarketplaceEntry(plugin.json目录/SKILL.md)，source支持github/URL/local，含owner/version/category，注册表registry+registration | marketplace页面+skills-client | api/marketplace.py已有skill sources同步(ClawHub/腾讯SkillHub/自定义) | **部分有** | 差在：插件级marketplace、版本/签名校验。P2增量 |
| 9 | **Plugin系统**：plugin.json+discovery/loader/fetch/installed，插件可携带skills/commands/agents（Plugin.agents参与子agent注册优先级） | plugin-manager.ts/plugin-nav.ts | plugin_loader.py+plugins/(pomodoro等) | **部分有** | 差在：插件携带agent定义、远程fetch安装链 |
| 10 | **安全分析器族**：shell_parser+_shell_ast(命令AST级解析)、llm_analyzer、ToolShield、GraySwan、ensemble多分析器集成、defense_in_depth、risk打分、confirmation_policy | 没有 | immune只有RBAC/audit/rate_limiter/intrusion，无命令级AST分析 | **完全没有** | P0（安全关键）。先做shell AST解析+risk打分接进工具审批流 |
| 11 | **Conversation Lease多实例所有权**：owner_lease.json+FileLock，TTL 45s，generation递增+takeover，记录owner_host/owner_pid做crash recovery | 没有 | 没有 | **完全没有** | P1。OpenSoul若要多实例部署必须有；防两会话同时操作一个workspace |
| 12 | **Secrets管理**：secrets-settings路由，`X-Expose-Secrets: encrypted`头按需解密，credential_binding绑定到会话 | 没有 | 没有（无SecretStore） | **完全没有** | P0。用户已有"文件不上云"要求，secret要本地加密存储 |
| 13 | **MCP OAuth**：mcp_oauth_store（MCP server授权码存取） | 没有 | src/mcp无oauth（仅api/user.py用户登录oauth） | **完全没有** | P2 |
| 14 | **Backend Registry多后端**：多agent-server注册(local/cloud)，健康存储health-store持久化，fallback选健康local后端，URL参数切换，NO_BACKEND哨兵防误用 | 没有（单后端8090） | 没有 | **完全没有** | P2。用户单机场景价值低，但NAS+本机双部署时需要 |
| 15 | **Automation独立服务**：调度/webhook/run历史/dispatch独立仓库，automation-templates模板、automation-git-sync(git同步自动化定义) | agent-types.ts有automation字样 | will/proactive.py有调度雏形 | **部分有** | P1。open-webui rrule+OpenHands automation双重印证，把proactive升级为带run历史的automation |
| 16 | **Canvas Extensions**：从github/file源装UI扩展（iframe应用），canvas_extensions_router后端托管 | plugins页面(本地opensoul插件) | 没有远程UI扩展 | **部分有** | P2 |
| 17 | **launch_child_conversation工具**：LLM一键开子会话，target=local(同workspace)/cloud(docker沙箱)，父子关系记录，结果以CHILD_CONVERSATION_RESULT_PREFIX回传，子会话看不到父历史(任务brief必须自包含) | 没有 | 没有（hermes-agent有delegate_task但OpenSoul无） | **完全没有** | P0。用户"多agent协作"需求的最小实现；isolation三档可先只做local |
| 18 | **Condenser可配置上下文凝结**：sdk/context/condenser独立模块+condenser-settings路由按section配参，malformed tool history错误单独分类走condensation恢复 | 没有 | sessions_api只有compacted标志位，无策略配置 | **部分有** | P1。compaction已有，补"策略可配置+错误恢复路径" |
| 19 | **Settings Schema导出+迁移链**：export_settings_schema()给前端动态渲染表单，schema_version=5迁移链+golden fixture+CI门禁(`check_persisted_settings_compat.py`)，SettingsFieldSchema刻意不导出required(看Python typing) | 没有 | heredity/migration.py是DB迁移非设置 | **完全没有** | P1。前端表单由schema生成=永不失同步；golden fixture防迁移破坏老数据 |
| 20 | **Shared conversation分享**：shared-conversation路由 | 没有 | 没有 | **完全没有** | P3 |
| 21 | **LLM balance/subscription**：llm-balance-service余额+llm-subscription-service订阅 | gland-client有token计量 | gland/token_meter.py已有budget_limit+alert_threshold+按用户/模型聚合 | **部分有** | 差在前端余额/订阅展示。P3 |
| 22 | **Device Flow授权**：device-flow-client+device-verify路由(设备码验证) | 没有 | 没有 | **完全没有** | P3（CLI/手机配对场景） |
| 23 | **前端"契约纪律"**：API访问只能走typescript-client，CI守卫测试拦截直接HTTP调用 | 没有类似守卫 | — | **完全没有** | P1（工程规范）。OpenMate可加ESLint守卫：禁止组件直fetch 8090 |

## 源码亮点
- **AGENTS.md仓库宪法**：每个仓库根有AGENTS.md写清"什么代码属于哪个仓库"，配合CI测试强制（API直连守卫、PR人写章节校验）。四仓库职责边界表直接可抄给OpenMate/OpenSoul/acp-proxy。
- **LLM和Agent是frozen无状态Pydantic模型**，可跨会话共享；interrupt靠asyncio.CancelledError全链路传播，不需要每层interrupt API。
- **错误分类学**：event/error_classification.py 把错误分成FailureKind，AgentErrorEvent带AGENT_OUTCOME，工具失败不是裸exception。
- **Anthropic malformed tool history**单独映射为LLMMalformedConversationHistoryError，用condensation恢复——踩过坑的痕迹。
- hook的LLM型（prompt+tools+max_iterations）意味着hook本身可以是个mini-agent。
- conversation lease用generation单调递增解决split-brain：新owner必须拿更高generation。

## 可复用设计
1. Hook系统设计（事件枚举+Matcher+allow/deny+command/LLM双类型）→ 直接照搬到OpenSoul cortex
2. 子agent markdown定义目录约定+优先级表 → OpenMate agent-installer对齐
3. settings schema导出驱动前端表单 + golden fixture迁移CI → OpenSoul settings改造
4. frontend API守卫测试（禁止直连）→ OpenMate
5. conversation lease（TTL+generation+host/pid）→ OpenSoul多实例化前置
