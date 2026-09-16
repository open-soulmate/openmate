# AnythingLLM (#23) 功能研究 — 源码深读

> 源码：~/agent-research-src/anything-llm/（完整克隆，重点 server/ 与 collector/）
> 研究日期：2026-09-16
> 定位：自托管RAG+Agent平台。Node.js + Prisma(SQLite) 后端，server/models/ 37个模型（8980行），agent框架叫 aibitat（server/utils/agents/aibitat/），自带 collector 独立摄取服务。
> 核心观察：AnythingLLM的价值不在算法而在**产品化治理层**——技能白名单、技能重排序、规则式模型路由、文档监视同步、嵌入Widget限额，全是"把agent能力管起来"的机制。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **Agent技能白名单（按用户粒度）**：每个user一套`user_{id}_whitelisted_agent_skills`白名单，单用户模式存全局label；切多用户时清空单用户白名单防泄漏 | models/agentSkillWhitelist.js（100行，add/remove/isWhitelisted） | 没有（plugin-manager.ts仅声明permissions字段，无白名单机制） | 部分（hermes_cron每任务可传`skill: list[]`，但无全局按用户白名单） | 部分差距 **P0** | OpenSoul加`user_skill_whitelist`表+immune/access_control校验；OpenMate加管理UI |
| 2 | **技能重排序器（IntelligentSkillSelector）**：技能多时用embedding reranker对技能描述打分，只注入top-N（默认15）技能给LLM，防上下文爆炸 | agents/aibitat/utils/toolReranker.js + EmbeddingRerankers/native，env可调`AGENT_SKILL_RERANKER_TOP_N` | 没有 | 没有（grep "rerank"零命中） | 完全缺失 **P0** | OpenSoul技能超15个后必装；用qdrant对skill description做向量检索取topN再拼prompt |
| 3 | **规则式模型路由引擎**：calculated规则基于条件（prompt内容contains/matches、token数gt、消息数、当前小时between、有无图片附件）AND组合→路由到指定provider/model；或llm规则用一句自然语言描述由小模型分类命中；带priority排序 | models/modelRouterRule.js（336行）+ modelRouter.js + aibitat/plugins/model-router-cooldown.js（命中后冷却） | 部分（gland-client.tsx有路由UI） | 部分（gland/router.py仅TaskType+failover+冷却，无内容条件规则） | 部分差距 **P1** | OpenSoul ModelRouter加`RouterRule(condition→provider/model)`层，比AnythingLLM再加LLM规则 |
| 4 | **MCP Hypervisor兼容层**：MCP server配置化启动，每个server的tools自动转成aibitat插件（`@@mcp_{name}`），支持按server抑制指定tool（suppressedTools），agent无感使用 | utils/MCP/index.js（MCPCompatibilityLayer单例）+ hypervisor/ | 没有 | 部分（mcp/server_registry.py存server/tool配置，但无"tool→agent插件"转换与抑制机制） | 部分差距 **P1** | OpenSoul把registry里的MCP tools动态注册进limb工具表，加suppressed字段 |
| 5 | **Agent Flows（JSON定义的多步骤流程当工具用）**：flow以JSON文件存storage/plugins/agent-flows/，steps类型含api-call/llm-instruction/web-scraping，agent可像调skill一样调flow | utils/agentFlows/{index,executor}.js + executors/ | 部分（workflow-store.ts有xyflow编排llm/tool/condition/loop/code/knowledge/http节点） | 没有 | 部分差距 **P1** | OpenMate已有画布，缺"保存为flow→注册为agent可调用工具"的闭环；OpenSoul加flow executor |
| 6 | **定时Agent任务+运行历史+agent自建任务**：cron任务存prompt+tools白名单，later.js算nextRunAt（UTC，前端换算本地），scheduledJobRun记录每次运行；更狠的是agent在对话里能用`create-scheduled-job`插件给自己建定时任务（多用户模式禁用此skill防越权） | models/scheduledJob.js（499行）/scheduledJobRun.js + aibitat/plugins/create-scheduled-job/ | 有（cron-picker.tsx/clock-face） | 有（api/hermes_cron.py：schedule+prompt+skill[]） | 部分差距 P1 | 补两点：运行历史表；"agent对话中自建cron"（单用户限定的安全设计值得抄） |
| 7 | **文档监视/同步队列（Live File Sync）**：link/youtube/confluence/github/gitlab/gitea/drupalwiki七类源可"监视"，过期（默认7天，env可调，最小1小时防打爆embedding）由后台worker自动重同步，连续失败5次自动剪枝 | models/documentSyncQueue.js（274行）+ documentSyncRun.js + utils/BackgroundWorkers/ + collector/extensions/resync/ | 没有 | 没有（knowledge.py只有一次性上传+chunk+embed） | 完全缺失 **P0** | 这是知识库保鲜的杀手级机制。OpenSoul知识库加`watch_source`字段+定时re-ingest worker，先支持github/gitlab URL |
| 8 | **可嵌入聊天Widget（Embed Config）**：生成embed uuid供iframe嵌第三方站；域名白名单、每日/每会话聊天上限、消息条数上限、是否允许覆盖模型/温度/prompt逐项开关；embedChats单独统计 | models/embedConfig.js（265行）+ embedChats.js + endpoints/embed/ | 没有（grep无iframe/embed widget） | 没有 | 完全缺失 P2 | OpenMate出公开分享页时直接抄这套限额字段 |
| 9 | **多用户治理全家桶**：users角色（admin/default）、workspace_users工作区成员粒度、invite邀请注册、passwordRecovery找回、eventLogs按user审计 | models/{user,workspaceUsers,invite,passwordRecovery,eventLogs}.js + middleware/ | 部分（login-page.tsx存在） | 部分（middleware/auth.py有require_role/admin，nest/tenant.py租户；无邀请制） | 部分差距 P1 | 补邀请注册+工作区成员表即可对齐 |
| 10 | **工作区线程（Threads）**：每个workspace下多条命名线程（slug化+uuid兜底），线程内独立聊天历史，thread可归属特定user；删thread级联清理chats | models/workspaceThread.js（175行）+ endpoints/workspaceThreads.js | 部分（conversation-tree.tsx是会话树，但无"工作区⊃线程"两级模型） | 部分（hippo按session隔离） | 部分差距 P1 | OpenSoul会话表加workspace_id+slug维度 |
| 11 | **双层显式记忆+注入上限**：Memory表分workspace/global两种scope，global每人上限5条、workspace上限20条、单次注入最多5条——用硬上限防记忆污染prompt；agent的memory插件自动CRUD | models/memory.js（461行）+ aibitat/plugins/memory.js | 没有 | 部分（hippo：短期session记忆+LongTermMemoryStore四层分类FTS5，但无scope上限治理） | 部分差距 **P0** | OpenSoul hippo加scope(workspace/global)+LIMIT常量+注入预算；这与TradingAgents(#14)的轮转预算同思路 |
| 12 | **系统提示词动态变量**：system prompt里`{time}{date}{username}{workspace}`等变量运行时替换；变量分system/user/workspace/static四类，多用户模式标记multiUserRequired按用户取值 | models/systemPromptVariables.js（375行，DEFAULT_VARIABLES内置） | 没有 | 部分（echo/templates.py有{{}}模板） | 部分差距 P2 | OpenSoul统一成"变量注册表"而非散落模板 |
| 13 | **Prompt历史版本审计**：workspace的系统prompt每次修改都记prompt_history（谁改的、何时）；另有slashCommandsPresets斜杠命令预设和workspacesSuggestedMessages开场建议消息 | models/promptHistory.js + slashCommandsPresets.js + workspacesSuggestedMessages.js | 部分（command-menu.tsx有命令面板，无持久预设/历史） | 没有 | 部分差距 P2 | prompt改动审计成本极低，一张表的事 |
| 14 | **@agent多agent调用+invocation追踪**：prompt以`@agent`开头即解析@句柄批量调用多个agent，每次调用落workspace_agent_invocations表（uuid/closed/thread关联）可回溯 | models/workspaceAgentInvocation.js + agents/defaults.js（WORKSPACE_AGENT定义） | 没有 | 部分（api/agent_collaboration.py有注册/消息/handoff；无@mention入口和invocation日志） | 部分差距 P1 | OpenMate聊天框加@agent选择器（agent-selector.tsx已有底子）+invocation审计表 |
| 15 | **浏览器扩展通道+临时token+一次性agent**：专用browserExtensionApiKey鉴权，temporaryAuthToken发短时token，ephemeral.js定义无状态agent会话，浏览器插件可把当前网页直接丢给agent | models/browserExtensionApiKey.js（190行）+ temporaryAuthToken.js + endpoints/browserExtension.js + agents/ephemeral.js | 没有 | 没有 | 完全缺失 P2 | "从浏览器右键发给agent"入口；短时token模式可复用到OpenMate分享链接 |
| 16 | **向量库/Embedding引擎多vendor抽象**：11种向量库（lance/chroma/chromacloud/pgvector/qdrant/pinecone/weaviate/milvus/zilliz/astra）+14种embedding引擎（openai/ollama/native/voyage/gemini/cohere/lmstudio…）统一base接口即插即用；另有独立EmbeddingRerankers层 | utils/vectorDbProviders/ + utils/EmbeddingEngines/ + EmbeddingRerankers/ | 没有 | 部分（database/qdrant.py单一向量库，embedding经gland但无多实现抽象） | 部分差距 P2 | OpenSoul把qdrant访问抽`VectorStore`接口即可，不必真接11种 |
| 17 | **Hotdir热目录批量摄取**：往hotdir文件夹丢文件即批量解析入库，collector独立进程（processRawText/processLink/convertAudioToWav），支持音频转写后摄取 | collector/hotdir/ + collector/{processLink,processRawText,convertAudioToWav}/ | 没有 | 没有（knowledge.py走HTTP上传） | 完全缺失 P2 | 本地部署场景实用；OpenSoul可做一个watchdog目录监听 |
| 18 | **站外触达通道**：Telegram Bot完整接入（utils/telegramBot/，含chat适配）、Web Push（endpoints/webPush.js）、移动设备注册+推送（models/mobileDevice.js+PushNotifications/）、多STT引擎（openai/groq/deepgram/lemonade）+TTS | utils/{telegramBot,PushNotifications,SpeechToText,TextToSpeech}/ | 没有 | 部分（api/notifications.py是站内聚合feed；voice/有tts_engine+asr） | 部分差距 P2 | OpenSoul已有voice件，缺的是telegram/push这类"最后一公里"通道 |

## 源码亮点
- **defaults.js的技能治理三层结构**：DEFAULT_SKILLS默认开 → SINGLE_USER_ONLY_SKILLS多用户禁用（create-scheduled-job）→ SKILL_FILTER_CONFIG按可用性检查+子技能禁用开关。"同一agent能力在单/多用户模式下自动降级"这套安全设计是产品级的。
- **toolReranker.js只有~150行**就实现"技能太多塞不进prompt"的通用解法：技能描述截断1000字符（词边界）→ embedding rerank → top15注入，env一键开关。
- **documentSyncQueue把"过期"做成产品参数**：staleAfter默认7天、下限1小时（防打爆embedding配额）、失败5次剪枝——每个常量都有理由，是外部数据源接入的防御性范本。
- **modelRouterRule的规则双模式**：calculated（结构化条件AND）+ llm（自然语言描述让小模型判命中）——用户不会写条件表达式时的优雅降级。
- **aibitat本身**：自研多agent框架（providers/40+ LLM后端、plugins=技能、interrupt机制、USER agent定义"always interrupt"人工监督角色），不是langchain套壳。

## 可复用设计（Top-3）
1. **#7 文档监视同步队列**：OpenSoul知识库加`sync_queue`表（source_url/type/stale_after/last_synced/failures）+后台worker定期re-ingest——直接解决"知识库上传完就过期"问题，且GitHub/GitLab源和OpenMate的git基因天然契合。
2. **#2 技能重排序器 + #11 记忆注入上限**：两者同一个思想——**context预算治理**。OpenSoul技能和记忆都在增长，不装预算控制器迟早炸prompt。
3. **#3 规则式模型路由**：OpenSoul gland/router已有failover底子，加content条件规则（"带图→vision模型""深夜→便宜模型"）就是AnythingLLM级的产品功能，且用户可省钱诉求直接对上。
