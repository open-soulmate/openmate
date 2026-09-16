# 源代码深度研究进度（更新）

更新时间：2026-09-16 04:00
方法：web_extract读取raw.githubusercontent.com源代码文件

## 已完成深度研究（真正读了源代码）

| # | Agent | 读取文件数 | 核心发现 |
|---|-------|-----------|----------|
| 01 | OpenClaw | 8个文件 | ContextEngine委托+容器隔离+快照+Agent Consult |
| 06 | Mem0 | 2个文件 | Memory类+向量存储+嵌入+LLM提取+遥测 |
| 07 | Letta | 4个文件 | 记忆块+MDX模板+多风格提示词+技能系统 |
| 09 | AutoGen | 2个文件 | AgentRuntime+消息传递+发布订阅+状态管理 |
| 10 | Browser Use | 2个文件 | AgentService+Browser+任务执行 |
| 16 | LangGraph | 2个文件 | StateGraph+节点+边+Reducer+消息去重 |
| 17 | OpenAI Agents | 4个文件 | 泛型上下文+护栏+工具+会话持久化 |
| 18 | Google ADK | 4个文件 | 流程系统+回调+长运行工具+插件+工件 |
| 19 | Smolagents | 4个文件 | 步骤记忆+@tool装饰器+回调+Jinja2模板 |
| 20 | Dify | 3个文件 | Agent Runner工厂+提示词模板+TokenBufferMemory+文件支持 |
| 22 | MetaGPT | 4个文件 | 角色系统+消息传递+团队+序列化 |
| 57 | Firecrawl | 2个文件 | 任务队列+并发限制+分布式追踪+积分系统 |

**总计**：12个agent，41个源代码文件

## 第二轮（2026-09-16 21:30）追加

| # | Agent | 方式 | 核心发现 |
|---|-------|------|----------|
| 28 | CrewAI | clone | Hooks四点拦截、Fingerprint实体指纹 |
| 03 | deepseek-harness | clone | 能力接缝、spill溢写、循环guard、Goal+round、沙箱四档、session迁移链、运行时自改 |
| 04 | opencode | clone | 文件快照git对象库、工具级权限通配符规则集、CodeMode受限执行、Patch引擎、Session V2持久准入 |
| 05 | AutoGPT | clone | LLM目录即代码+retire迁移、计费闭环、凭证租约、LLM干跑模拟器、集群锁、工作流版本控制 |

**累计**：16个agent源码级深读

## 第三轮（2026-09-16 12:15，cron自动）追加

| # | Agent | 方式 | 核心发现 |
|---|-------|------|----------|
| 22 | Cline | clone | git快照checkpoint三父提交+私有ref、事务性回滚绑定消息历史、10事件HookControl可改写工具输入、command-guard黑名单+mask预处理、SQLite跨实例工作区锁、Focus Chain文件即UI |
| 23 | AnythingLLM | 本地clone | 文档同步队列(7类外部源过期re-ingest)、技能rerank取top15注入、按用户粒度技能白名单三层治理、规则双模式模型路由、双层记忆+注入硬上限、hotdir热目录摄取 |
| 18 | DeerFlow | clone | 单图+50+中间件链、loop检测哈希滑窗延迟注入、HITL结构化表单7字段、subagent身份双键(tool_call_id/execution_id)、定时任务状态机+唯一约束、fail-open数据结构(None vs [])、CI级技能安全治理SHA-256 waiver |

**累计**：19个agent源码级深读（reports: 22-cline-source.md / 23-anything-llm-source.md / 23-deer-flow-source.md）

## 第四轮（2026-09-17 00:xx，cron自动）追加 — 功能清单对比专题

| # | Agent | 方式 | 核心发现 |
|---|-------|------|----------|
| 36 | Huginn | clone（74个Agent类型，1096行核心模型） | 事件增量JOIN游标、readonly!干跑、Liquid插值保存期校验、ControlLink自调节、Scenario引用计数删除、working?业务活性三态、事件TTL |
| 39 | LibreChat | clone（packages/api/src 160+模块） | 调度run状态机+租约+misfire宽限+逐行reconcile、GitHub技能同步、后台完成唤醒、排队轮次、steering中途插话、stepBudget、孤儿运行收编、activity phases时间线、Flow generation租约 |

**累计**：21个agent源码级深读（feature-matrix/36-huginn-source-deep.md / 39-librechat-source-deep.md）

### 第四轮跨agent共识
1. **OpenSoul缺"事件流原语"**：增量游标/去重/聚合/变更检测/TTL 全无（huginn 74类agent证明纯规则即可让系统从被动问答变主动感知）→ P0
2. **OpenSoul缺"运行韧性"**：调度状态机、租约、misfire宽限、孤儿收编、后台完成唤醒 → P0（直接对应用户"我都不知道他们在干嘛"）
3. **干跑/模拟执行**：huginn readonly! + 既往AutoGPT LLM干跑模拟器，两家独立实现 → P1
4. **能力声明宏 + working? 三态**：huginn独有但成本极低 → P1

### 第三轮跨agent共识（多项目互证 → 更高置信度）
1. **Hook/中间件拦截点已是行业标配**（CrewAI四点、Cline十事件、Claude Code 33事件、DeerFlow全中间件链）→ OpenSoul必须做，P0
2. **Checkpoint+事务性回滚**（Cline把文件回滚和消息历史回滚绑定）→ OpenSoul完全没有，P0
3. **Context预算治理**（AnythingLLM技能rerank+记忆注入上限、DeerFlow token三层预算、Cline溢出三终态）→ 三家同思路，P0
4. **loop/循环检测**（DeerFlow哈希滑窗、deepseek-harness循环guard）→ OpenSoul完全没有，P0
5. **HITL结构化交互**（DeerFlow表单7字段、CrewAI request_human_input、Cline审批回调）→ OpenSoul/OpenMate均缺协议层，P0
6. **定时任务状态机**（DeerFlow queued/launching/running+唯一约束 vs OpenSoul hermes_cron仅CRUD）→ P0，改造成本低

## 核心发现总结

### 1. 记忆系统模式
- **Letta**：记忆块（persona/human/project）+MDX模板+只读标签
- **Mem0**：Memory类+向量存储+嵌入+LLM提取
- **Smolagents**：步骤记忆（ActionStep/PlanningStep/FinalAnswerStep）

### 2. 消息传递模式
- **AutoGen**：AgentRuntime+send_message/publish_message+Topic+Subscription
- **MetaGPT**：Message+publish_message/put_message+MessageQueue+Environment

### 3. 状态管理模式
- **LangGraph**：StateGraph+节点+边+Reducer+检查点
- **AutoGen**：save_state/load_state+JSON序列化

### 4. 工具系统模式
- **Smolagents**：@tool装饰器+类型验证+HuggingFace集成
- **Google ADK**：BaseTool+BaseToolset+FunctionTool+长运行工具
- **OpenAI Agents**：FunctionTool/ComputerTool/ApplyPatchTool/ShellTool

### 5. 护栏模式
- **OpenAI Agents**：InputGuardrail+OutputGuardrail+tripwire_triggered

### 6. 任务队列模式
- **Firecrawl**：BullMQ+并发限制+优先级+超时+通知

### 7. 上下文引擎模式
- **OpenClaw**：ContextEngine委托+可插拔+多层记忆

### 8. 流程系统模式
- **Google ADK**：SingleFlow+AutoFlow+BaseLlmFlow

## OpenMate/OpenSoul实现优先级

### Phase 1（立即实现）
1. **记忆块系统** — Letta模式（persona/human/project+MDX模板）
2. **消息传递系统** — AutoGen/MetaGPT模式
3. **任务队列系统** — Firecrawl模式

### Phase 2（1周内）
4. **状态图模式** — LangGraph模式
5. **工具系统** — Smolagents/@tool装饰器
6. **护栏系统** — OpenAI Agents模式

### Phase 3（1个月内）
7. **上下文引擎** — OpenClaw模式
8. **流程系统** — Google ADK模式
9. **角色系统** — MetaGPT模式

## 下一步行动

1. 继续读剩余agent源代码（CrewAI/Langflow/Deer Flow等）
2. 开始实现Phase 1功能
3. 更新OpenMate/OpenSoul代码库
