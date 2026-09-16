# Composio (#74, 16k★) 功能研究

研究时间：2026-09-16 cron第27轮（第二阶段深研）
源码：github.com/ComposioHQ/composio（shallow clone，2026-09快照）
结构：TS+Python双SDK monorepo（ts/packages/{core,cli,cli-local-tools,providers,slim} + python/composio + 13个框架provider适配器）

**重要背景**：Composio已从早期"本地tool执行SDK"演进为**云托管工具平台SDK**——工具注册表、OAuth托管、触发器路由都在云端（composio.dev），本仓库是客户端SDK。核心价值主张："1000+预认证工具包 + 按用户会话 + 托管认证 + 触发器 + 沙箱"。

## 功能清单

| # | 功能 | 源码依据 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **托管OAuth认证编排**：OAuth1/OAuth2/APIKey/Basic/Bearer/GoogleServiceAccount等11种AuthScheme；`initiate()`返回Connect Link（托管授权页），`wait_for_connection()`轮询；`link()`静默重连 | connected_accounts.py(746行)：AuthScheme类11个工厂方法、ConnectionRequest | 无 | 无（src/api/user.py仅有本地登录oauth字样，link/connector.py只有webhook共享密钥） | **完全没有** | OpenSoul/link/加connected_accounts模块：先支持OAuth2授权码流（自托管回调页），API key/basic认证用本地加密存储。价值极高——用户"让AI操作我的钉钉/企微/邮箱"的前置条件 |
| 2 | **连接ACL共享模型**：连接分PRIVATE/SHARED，`update_acl()`控制哪些用户/agent可复用他人授权的账号 | experimental.py: update_acl + ACL_ONLY_FOR_SHARED常量 | 无 | OpenSoul有RBAC但只管本地资源 | 完全没有 | 依赖#1。多用户agent平台必备，单用户可后置 |
| 3 | **触发器系统（app事件订阅）**：triggers.py(1871行)——webhook订阅(HMAC verify_webhook签名验证)、Pusher实时通道订阅(私有频道+presence token)、TriggerEventFilters过滤、分块大事件重组、v1/v2/v3三种payload版本兼容、`subscribe().wait_forever()`长连接自动重连 | triggers.py: TriggerSubscription/_SubcriptionBuilder/_ComposioPusher | 无 | 部分有：link/connector.py有WEBHOOK_IN/OUT+HMAC，echo/dispatcher.py多通道推送。但**无第三方app事件源**（Gmail新邮件/GitHub PR等），无实时通道订阅，无事件过滤器 | 部分有（自建webhook管道在，缺"订阅外部SaaS事件"） | 先做"webhook→OpenSoul统一事件入口→will/工作流触发"，把connector.py的webhook_in接到echo/will作触发源；Pusher式实时通道可用现有WebSocket |
| 4 | **自定义工具装饰器**：`@tool`从Python函数+Pydantic自动推断JSON Schema，ExperimentalToolkit打包成toolkit，序列化上传云端与远程工具混用；inline payload随会话携带 | custom_tool.py(918行)：_infer_tool_from_function、serialize_custom_tools | 无 | 部分有：plugin_loader.py（manifest.json+FastAPI router，仅HTTP API，不是LLM function-calling工具）；skills系统是prompt不是工具 | 部分有 | 在OpenSoul/limb/加`@tool`装饰器：函数签名+类型注解→JSON Schema→注册进ACP工具表。中等工作量，直接扩展agent能力面 |
| 5 | **工具调用中间件Modifiers**：before_execute/after_execute/schema_modifier/before_file_upload四类钩子，可改参数/改结果/动态改schema/拦截文件上传 | _modifiers.py(714行)：Modifier.apply、merge_before_file_upload | 无 | 部分有：acp-proxy/plugin/models.py HOOK_POINTS={before/after_session_create, before/after_tool_call, on_event}，before_*支持cancel | 部分有（我们有before/after_tool_call+cancel，缺schema_modifier和before_file_upload，且是插件级非per-tool内联） | 补schema_modifier（工具schema按上下文裁剪→省token）成本低价值高 |
| 6 | **按用户会话隔离**：`composio.create("user_123")`每用户独立session，工具集/连接/文件都按user_id隔离；SessionContext内嵌proxy_execute让自定义工具回调平台执行远程工具 | sdk.py + session_context.py(198行) | 多会话有，按用户隔离弱 | 无按用户工具隔离概念 | 部分有 | 与#1同期设计：connected_account表加user_id维度 |
| 7 | **Tool Router会话**：隔离MCP会话，provider包装工具，preload配置（PRELOAD_TOOLS_ALL/SESSION_PRESET_DIRECT_TOOLS），custom tool attach | tool_router.py(1321行)+tool_router_session.py(973行) | 无 | OpenSoul mcp/server.py只暴露本地知识/RAG工具（stdio） | 部分有（MCP server在，无"动态生成per-user MCP实例"） | **低成本高价值**：OpenSoul mcp/server.py升级——按请求用户动态生成allowed_tools列表+URL。这就是"MCP驱动工具"愿景的落地形态 |
| 8 | **MCP server云生成**：`mcp.create()`为每用户生成专属MCP URL（allowed_tools+auth_configs绑定），任何MCP客户端即插即用 | mcp.py(500行)：MCPServerInstance{id,url,user_id,allowed_tools} | 无 | 同上 | 部分有 | 同#7 |
| 9 | **工具文件桥接**：_files.py(1459行)——本地文件→云端上传(分块1MB)→远程工具可读；工具输出URL→安全下载(100MB上限/路径穿越防护/上传目录白名单/mimetype推断)；session文件挂载(ToolRouterSessionFilesMount) | _files.py + tool_router_session_files.py(440行) | 部分有：MEDIA标签范式、8092文件下载 | /api/file只读本地 | 部分有（agent↔用户文件通路在，agent↔第三方工具文件通路完全没有） | 依赖#1接SaaS后做；安全下载的allowlist/上限设计值得直接抄 |
| 10 | **CLI工具操作**：search（按用例搜工具）/execute（带schema检查+dry-run+get-schema）/link/run（TS/JS脚本注入helper执行）/proxy（用已连接账号直调第三方API）/tools list --cached schema | ts/packages/cli/README.md | 无 | 无独立CLI（hermes-cli是对话入口非工具CLI） | 完全没有（低优先级） | proxy命令思路可借鉴：给agent一个"直连用户已授权API"的逃生舱 |
| 11 | **13框架Provider适配器**：openai/anthropic/claude_agent_sdk/crewai/autogen/langchain/langgraph/llamaindex/gemini/google_adk…同一工具集转各家schema | python/providers/ + ts/packages/providers | 无 | acp-proxy是自研协议桥 | 不适用（我们不需要兼容别人框架） | 反向参考：ACP协议可出一个"composio provider"接入其工具市场 |
| 12 | **技能自动安装**：`--install-skill <claude\|codex\|openclaw>`把composio用法skill写进目标agent的skills目录 | ts/packages/cli | 无 | OpenSoul skills系统在，无"跨agent安装" | 部分有 | 想法可抄：OpenSoul skill可导出为Hermes/Claude Code格式 |
| 13 | **遥测**：_telemetry.py SDK内使用埋点 | _telemetry.py(170行) | 无 | acp-proxy/telemetry、trace目录 | 已有 | — |
| 14 | **自托管沙箱**（README提及，实现在云端/CLI bin） | cli-local-tools/native | 无 | 无Docker隔离执行 | 完全没有 | 与e2b(#81)合并评估（下一研究对象） |

## 源码亮点

1. **Connect Link模式**：不自己实现OAuth UI，`initiate()`拿一个托管授权URL丢给用户，回调后`wait_for_connection()`轮询拿凭证。自托管版可用"本地授权页+回调端点"等价实现，架构上把"认证编排"与"工具执行"解耦得很干净。
2. **Modifier四钩子设计**：before_execute(改入参)/after_execute(改结果)/schema_modifier(动态schema)/before_file_upload(文件拦截)——比我们before_tool_call粗粒度钩子多两个维度，尤其schema_modifier是token优化利器（按会话上下文裁剪工具描述）。
3. **触发器三通道**：webhook(HMAC)+Pusher实时+长连接订阅自动重连(is_alive/has_errored/restart)，外加事件过滤器和大payload分块传输。工程完整度高。
4. **安全下载防御清单**：100MB响应上限、路径穿越防护(secure_join)、上传目录白名单、敏感路径断言、文件名超长截断——直接可抄进OpenSoul文件模块。
5. **custom_tool序列化双模式**：inline payload随会话携带 vs 上传云端注册，兼顾低延迟与复用。

## 可复用设计（对OpenMate/OpenSoul的落地排序）

| 优先级 | 功能 | 理由 | 工作量 |
|--------|------|------|--------|
| P0 | #7/#8 per-user MCP实例生成 | 命中"MCP驱动工具"架构愿景；OpenSoul mcp/server.py已存在，加用户维度allowed_tools即可 | 2-3天 |
| P0 | #5 schema_modifier钩子 | acp-proxy hooks框架已在，加一个钩子点+裁剪逻辑 | 1天 |
| P1 | #1 OAuth2授权码流+凭证加密存储 | 打通第一个SaaS（建议钉钉/企微，国内刚需），link/connector.py复用HMAC经验 | 1-2周 |
| P1 | #3 webhook_in→will工作流触发 | connector.py已有webhook_in，缺的是接到工作流触发表 | 3-5天 |
| P2 | #4 @tool装饰器 | limb/executor.py加函数→schema注册 | 3-5天 |
| P2 | #9 文件桥接安全清单 | 接SaaS后才有意义，但下载防御可先抄 | 1天(防御部分) |

## 结论

Composio本体是云服务，**自建对标不现实也不必要**（用户要求纯开源+本地化）。正确姿势：
1. 抄它的**客户端架构模式**（Connect Link、Modifiers、per-user MCP、触发器三通道）
2. 用**MCP协议反向接入**Composio工具市场作为可选扩展（它官方支持MCP输出）
3. OpenSoul缺的不是"1000个工具"，而是**认证编排层**（connected_accounts）——这是所有第三方集成的公共前置，目前为零。
