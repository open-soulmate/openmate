# Microsoft Agent Framework (#80, 8k★, SK+AutoGen继任者) 功能研究

研究时间：2026-09-16 18:10（cron自动）
源码：codeload tarball → ~/agent-research-src/ms-agent-fw（14MB，tar校验OK，python/全量源码级）
定位：Microsoft统一agent框架（SK与AutoGen均向其收敛：SK已内置`as_agent_framework_tool()`桥接）。dotnet/go/python三语言，40+包。
行业信号：AGENTS.md规定function-calling loop改动必须对照docs/specs/004规范（approval resume是"stable contract"）——**审批恢复已成为需要规范文档保证的核心契约**。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **工具审批双粒度scope**：`tool`（同名工具永远批准）vs **`tool_with_arguments`（参数序列化(sort_keys+分隔符规范化)后精确匹配才算已批）**+always_approve规则回调+queued_approval_requests队列+function_invocation_budget预算状态 | _harness/_tool_approval.py 666行 | acp_approval_request有ACP审批UI事件 | 无 | 部分有 | "Always批准"按参数粒度记忆——goose三档的精细化版本，P0参照 |
| 2 | **审批恢复契约（spec 004）**：approval request用function call **occurrence id**做request id；恢复/重放时**过滤approval request/response包装**只留结果；**occurrence-aware审批transcript归一化器**防stale approval authority重放；hosted-service工具的审批决策归属远端服务 | docs/specs/004-python-function-calling-loop.md | 无 | 无 | 完全没有 | 会话压缩/重启后审批状态不失真——OpenSoul做HITL必须先设计此契约 |
| 3 | **函数调用循环规范文档化**：spec 004含sequence图+scenario-to-test映射+覆盖缺口表，改动须逐条对照——"orphan call/result pairs、重复副作用、streaming与非streaming分叉"列为已知风险 | docs/specs/ | 无 | 无 | 完全没有 | 工程实践范本：核心循环配规范+测试映射 |
| 4 | **Todo内置harness**：agent自带todo工具+注入Todo Items指令块+session上下文持久化（_storage_key_segment安全存储键）——任务跟踪是框架一等能力非用户自建 | _harness/_todo.py 588行 | 无 | 无 | 完全没有 | 与claude-code todo工具互证；OpenSoul will/可直接加 |
| 5 | **FileMemory harness**：文件型agent记忆（585行）+_file_access.py文件访问控制+_filesystem.py私有安全助手（**symlink/hardlink检测、storage-key派生防路径穿越**） | _harness/ | 无 | 无 | 完全没有 | 文件安全助手几十行可移植进limb/ |
| 6 | **BackgroundAgents**：后台agent运行（_background_agents.py）+_mode.py模式切换 | _harness/ | 无 | 无 | 完全没有 | |
| 7 | **SecretString类型**：非str包装——str()/format/join/JSON编码全部输出掩码，`get_secret_value()`显式取真值——**类型系统防凭证泄漏**（比正则脱敏早一步） | _settings.py | 无 | 无 | 完全没有 | 与claude-code JWT claim脱敏互补：一个防输出、一个防驻留 |
| 8 | **Compaction完整实现**：2107行独立模块（SK只有标志位） | _compaction.py | 无 | sessions_api标志位 | 完全没有 | 学习其compaction与审批/流式交互的边界处理 |
| 9 | **Evaluation模块**：2082行框架内建评估 | _evaluation.py | 无 | benchmark 5维自评 | 部分有 | 与ag2 eval/langfuse互证 |
| 10 | **AgentHooks**：1746行hook系统+_agent_hooks.py | 无 | 无 | 完全没有 | 与33事件清单互补 |
| 11 | **Vector store统一API**：@vectorstoremodel声明字段+Filter/FilterGroup可变过滤树+**Param类型化工具参数**（omit_if_none空参自动剔除）+create_vector_search_tool把任何向量库变成agent工具+InMemoryStore开发兜底 | _vectors.py | 无 | hippo自研 | 部分有 | "任何向量库→一个agent工具"值得抄 |
| 12 | **Declarative agents**：YAML/JSON声明式agent定义（独立包declarative） | packages/declarative/ | 无 | gene/templates | 部分有 | |
| 13 | **Hyperlight包**：WebAssembly微VM沙箱执行不可信代码 | packages/hyperlight/ | 无 | mirror/sandbox.py假沙箱 | 完全没有 | 真隔离方案新选项（比容器轻） |
| 14 | **Monty包（alpha）**：Monty-backed **CodeAct**——模型输出代码作为动作 | packages/monty/ | 无 | 无 | 完全没有 | CodeAct路线观察 |
| 15 | **Purview包**：数据治理集成（敏感数据扫描/合规） | packages/purview/ | 无 | immune/ | 部分有 | 政企卖点，概念可参考 |
| 16 | **hosting全家桶**：hosting-mcp/hosting-a2a/hosting-responses/**hosting-telegram**（IM托管）+foundry_hosting | packages/hosting-*/ | 无 | acp-proxy自研 | 部分有 | "框架托管协议端点"模式 |
| 17 | **chatkit/ag-ui协议包**：标准化agent-UI协议（与ag2的ag_ui同协议——**两家大厂共推，值得OpenMate对齐**） | packages/ag-ui chatkit | 无 | 无 | 完全没有 | OpenMate聊天层可评估ag-ui协议兼容 |
| 18 | **mem0/azure-cosmos-memory包**：记忆层外置可插拔 | packages/mem0 | 无 | hippo内置 | 部分有 | |
| 19 | **Feature生命周期治理**：_feature_stage.py实验/预览/稳定分级+**feature-usage-bit-registry**遥测位注册表（每个特性一个bit，统计真实使用率再promote） | _feature_stage.py docs/specs/feature-usage-bit-registry.md | 无 | 无 | 完全没有 | "用遥测数据决定特性去留"——正对"没有进化"痛点 |
| 20 | **安全原语公开模块**：security.py公开security primitives+middleware+tools（含Purview集成点） | security.py | 无 | immune/ | 部分有 | |

## 源码亮点
1. **spec 004审批恢复的刁钻细节**：occurrence id区分同一function call的多次出现；重放时过滤审批包装避免把请求当结果喂回provider；stale approval authority（旧审批决定被误用于新调用）被列为一级风险。**这些坑OpenSoul做HITL时一个都不会少**。
2. **Param()过滤参数**：向量搜索工具的参数可声明default=None+omit_if_none——空参叶子自动从过滤树剔除，空组递归清除——"删干净"的防御式过滤树构造。
3. **lazy loading三件套同步纪律**：_LAZY_MODULE_EXPORTS/_LAZY_EXPORTS/__init__.pyi三处必须同步，AGENTS.md明令——monorepo大包的import性能治理。
4. 40+包的生态布局本身就是情报：存储(cosmos/mongo/postgres/redis/qdrant)、协议(a2a/mcp/ag-ui/chatkit)、治理(purview)、沙箱(hyperlight)、IM(telegram)。

## 可复用设计
1. **P0：审批恢复契约**（occurrence id+重放过滤+归一化）——OpenSoul HITL设计前置必读。
2. **P0：tool_with_arguments参数粒度审批**+SecretString——安全双件。
3. **P1：Todo harness框架内置化**+FileMemory+_filesystem安全助手（symlink检测/storage-key防穿越）。
4. **P1：feature-usage-bit遥测驱动特性promote/demote**——治理"进化"的机制化。
5. **P2：ag-ui协议**（与ag2共推）——OpenMate聊天层协议对齐候选。

## grep确认（OpenMate src/ + OpenSoul src/）
NONE：tool_with_arguments / always_approve / SecretString / hyperlight / codeact / purview / file_memory / background_agent / todo_tool / function_invocation_budget / declarative_agent
部分：approval_request=OpenMate acp_approval_request（ACP协议审批UI事件，无参数粒度/无恢复契约）；occurrence=skill共现统计（同名巧合）；compacted=标志位
