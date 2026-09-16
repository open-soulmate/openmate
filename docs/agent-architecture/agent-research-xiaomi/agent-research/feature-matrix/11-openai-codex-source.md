# OpenAI Codex (#11, 124k stars, Rust) 功能研究 — 源码级

源码：~/agent-research-src/codex（118MB，codex-rs/ 共 **112个crate**）
研究时间：2026-09-16 深夜轮

## 功能清单（24项，源码确认）

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | 两阶段记忆管线：Phase1每会话提取结构化输出 → Phase2 consolidation agent合并，含memory workspace diff、MemoryVersion版本化、旧extension资源修剪 | memories/write/src/{phase1,phase2,workspace,storage}.rs | ❌无 | ⚠️部分（hippo有记忆CRUD+FTS5，无分阶段提取/合并agent/版本化） | **完全没有** | P0。Phase1可直接用LLM结构化输出跑；Phase2用现有delegate_task做consolidation agent；版本号字段加进hippo表 |
| 2 | 记忆引用解析+使用遥测分类（memory citation parsing、read-usage telemetry） | memories/read/src/{citations,usage,metrics}.rs | ❌ | ❌ | 完全没有 | P1。记忆注入system prompt时带[id]，回答中解析引用，衡量记忆命中率 |
| 3 | execpolicy命令策略引擎：Starlark语法prefix_rule(pattern,decision=allow/prompt/forbidden,justification,match/not_match)，规则自带加载时验证的单元测试样例 | execpolicy/README.md + src/ | ❌ | ⚠️部分（casbin是用户RBAC，不解析shell命令token） | **完全没有** | P0。Python有starlark解释器(pypi: starlark)或自写token前缀匹配；决策三档接入现有审批流 |
| 4 | 多平台沙箱：Linux bwrap(内置fallback二进制+版本检测+argv0兼容路径)、macOS Seatbelt、Windows MXC BaseContainerRunner/AppContainer、windows-sandbox-service独立服务 | linux-sandbox/ mxc-sandbox/ windows-sandbox-rs/ sandboxing/ | ❌ | ❌ | 完全没有 | P0安全关键。Linux先做bwrap（用户是Arch，有bwrap）；OpenSoul exec加sandbox参数 |
| 5 | 本地网络策略代理：HTTP(127.0.0.1:3128)+SOCKS5(:8081)，allow/deny/**limited只读模式**，端口占用自动ephemeral降级 | network-proxy/ | ❌ | ❌ | 完全没有 | P1。这是"agent能联网但不能外传数据"的关键能力，Python可用mitmproxy或自写 |
| 6 | elicitation服务：工具结果投递前暂停会话（引用计数多个并发elicitations、暂停超时进度订阅、已捕获结果等待） | core/src/elicitation.rs | ⚠️部分（前端有确认对话框） | ❌（会话级暂停协调无） | 部分有 | P1。OpenSoul会话状态机加paused态+watch channel |
| 7 | 设备身份验证：Secure Enclave/Keychain硬件密钥、UserVerificationProof签名、生命周期锁、跨平台unsupported降级 | user-verification/ | ❌ | ❌ | 完全没有 | P2（依赖硬件，服务器场景低优） |
| 8 | 密钥管理：OS keyring存储(credentials) + secrets crate的redact_secrets（写rollout前自动脱敏） | keyring-store/ secrets/ | ❌ | ❌ | 完全没有 | **P0低成本高价值**：写日志/记忆前正则脱敏API key，几十行Python |
| 9 | workload-identity联邦：文件断言+federation_rule_id换ChatGPT token | workload-identity/ | ❌ | ❌ | 完全没有 | P2 |
| 10 | agent-identity：Curve25519加密+Ed25519签名的会话身份（crypto_box/ed25519_dalek，base64 URL_SAFE JWT） | agent-identity/ | ❌ | ❌ | 完全没有 | P2。多agent互信时需要 |
| 11 | agent-graph-store：线程派生agent的**parent/child拓扑持久化**（存储中立trait+local实现，ThreadSpawnEdgeStatus边状态） | agent-graph-store/ | ❌ | ⚠️部分（delegate_task有id但无持久拓扑图） | 部分有 | P1。一张SQLite边表(parent_id,child_id,status)即可 |
| 12 | agent-roles：角色文件发现+加载+解析（AgentRoleConfig），配合collaboration-mode-templates(plan.md/default.md模板) | agent-roles/ collaboration-mode-templates/ | ❌ | ❌ | 完全没有 | P1。OpenSoul/gene模板系统天然承载角色定义 |
| 13 | Guardian：**同步审查+异步打分双模式安全代理**，ContextSection组合（授权区/信任区/转录区/retained指令），contributor注册按scope收集，失败即中止不返回部分上下文 | guardian-context/ + context/guardian_*.rs | ❌ | ⚠️部分（immune管安全但无"第二双眼睛"审查agent） | **完全没有** | **P0亮点**：每个危险动作先过一个轻量审查agent；异步打分做质量后验。架构分层上属OpenSoul/immune扩展 |
| 14 | tool_search/tool_discovery：大工具集按需搜索加载（ToolSearchEntry→LoadableToolSpec物化，output schema共享延迟丢弃） | tools/src/{tool_search,tool_discovery}.rs | ❌（工具全量注入） | ❌ | 完全没有 | P1。OpenSoul tools多了以后必须做（Hermes的tool_search已是同思路，可参考） |
| 15 | 动态工具+运行时插件安装请求：dynamic_tool.rs、request_plugin_install.rs（模型可请求装插件） | tools/src/ | ❌ | ❌ | 完全没有 | P2 |
| 16 | code-mode：受限代码执行（grpc_session/remote_session，独立code-mode-host进程，protocol分离） | code-mode/ code-mode-host/ code-mode-runtime/ | ❌ | ⚠️部分（execute_code是自由执行非受限） | 部分有 | P1。参考opencode CodeMode：只允许调schema声明的宿主工具 |
| 17 | external-agent-migration：**从Claude Code/Codex旧版等竞品迁移**配置、MCP、hooks、记忆、插件、模型设置，含detect检测+rewrite重写+reporting报告 | external-agent-migration/ | ❌ | ❌ | 完全没有 | P1商业价值：降低用户迁移门槛，应做成"一键导入Claude Code配置" |
| 18 | file-watcher：订阅式文件/目录变更路由（notify crate，BTreeSet匹配+归属subscriber路由+防抖） | file-watcher/ | ⚠️部分（Next.js HMR只管自己源码） | ❌ | 部分有 | P2 |
| 19 | 会话持久化三层：rollout JSONL(append-only规范历史) + thread-store(LiveThread元数据同步trait，本地SQLite) + message-history(~/.codex/history.jsonl全局O_APPEND单write(2)原子追加防并发交错) | rollout/ thread-store/ message-history/ | ⚠️部分（OpenMate会话存DB） | ⚠️部分（trajectory有轨迹） | 部分有 | P1。O_APPEND原子写技巧值得抄 |
| 20 | 语音：voice-host独立GStreamer进程（继承pipe生命周期、hello/ready握手、7插件初始化、fail-closed）+ realtime-webrtc（SDP协商、ALSA、AudioControls） | voice-host/ realtime-webrtc/ | ❌ | ❌ | 完全没有 | P2。Hermes已有TTS，缺实时双向 |
| 21 | responses-api-proxy：录制回放调试代理（dump request/response对到目录，base_url重定向即可用） | responses-api-proxy/ | ❌ | ❌ | 完全没有 | **P1低成本**：调试LLM问题的利器，Python Flask转发+落盘即可 |
| 22 | hooks引擎：config_rules+schema+registry+**output_spill**（工具输出溢写文件）+mcp桥+legacy_notify | hooks/ | ❌ | ❌ | 完全没有 | P1（deepseek-harness也提过spill，两个顶级项目都有，优先级升P0） |
| 23 | otel追踪：otel crate + otel-trace-websocket（追踪走websocket上报） | otel/ otel-trace-websocket/ | ❌ | ❌ | 完全没有 | P1（langfuse调研已覆盖方案选型） |
| 24 | compact_remote_v2：远程历史压缩（图片预算、v2 attempt、模型降级fallback链） | core/src/compact*.rs | ⚠️部分 | ⚠️部分（opensoul有compaction） | 部分有 | P1。图片预算单独核算这点容易漏 |

## 源码亮点

1. **crate爆炸式分层**：112个crate，每个单一职责（连"当前时间"都有current_time.rs）。说明Rust团队用编译边界做架构治理。
2. **context/目录是宝藏**：50+个context片段文件，每个是一种注入prompt的场景（guardian_budget_omission、multi_agent_usage_hint、image_resize_notice、turn_aborted...）。这是"什么情况下给模型塞什么提示词"的完整枚举，**OpenSoul的cortex/intelligence应该抄这个清单**。
3. **store trait化**：ThreadStore/AgentGraphStore都是trait+local实现，为云端存储留缝。
4. **fail-closed哲学**：voice-host、mxc-sandbox所有异常路径都是拒绝而非降级放行。
5. **AGENTS.md自述规则**：模块<500行、format!内联、argument_comment_lint——工程规范本身也是功能。

## 可复用设计（直接抄到OpenSoul）

1. **secrets redact**（P0，1天）：所有写入记忆/日志/轨迹的文本过redact_secrets，正则覆盖常见key格式。
2. **execpolicy三档决策**（P0，3天）：allow/prompt/forbidden + justification理由字段，审批弹窗直接显示理由。
3. **Guardian审查代理**（P0，1周）：OpenSoul/immune新增reviewer子代理，危险动作（删文件/外发/装包）同步审查；异步打分挂learn。
4. **context片段清单**（P1，2-3天）：把codex context/的50+场景翻译成OpenSoul的prompt注入点清单。
5. **tool_search**（P1，1周）：工具>50个后必做，参考Hermes tool_search的分组返回格式。
6. **responses-api-proxy录制回放**（P1，2天）。
7. **memories两阶段管线**（P0-P1，1-2周）：Phase1结构化提取（LLM调用，OpenSoul已有）→ Phase2 consolidation agent + 版本化。
