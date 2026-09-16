# MCP Python SDK (#79, 10k★, 官方参考实现) 功能研究

研究时间：2026-09-16 18:55（cron自动）
源码：codeload tarball → ~/agent-research-src/mcp-pysdk（4MB，tar校验OK，源码级）
版本：v2主线，实现2026-07-28规范（SEP-2575订阅、SEP-2133扩展框架等）。CI要求100%分支覆盖率+conformance套件对齐。
注：OpenSoul mcp/server.py已消费此SDK（MCPServer导入），但只用了基础工具服务——**SDK的高级能力大量闲置**。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **MCP Apps（工具结果携带交互UI）**：tool的`_meta.ui.resourceUri`指向`ui://` HTML资源，host在**沙箱iframe**渲染——工具不只返回文本，返回一个可交互界面；`client_supports_apps(ctx)`分支优雅降级（未协商Apps的client仍拿文本） | server/apps.py（SEP-2133） | 无 | mcp/server.py已装SDK但未用Apps | 完全没有 | **OpenMate的天然优势场景**：OpenSoul MCP工具返回OpenMate可渲染的交互卡片（图表/表单/审批按钮），iframe sandbox经验已有（allow-scripts教训在案） |
| 2 | **Elicitation三态+schema门**：AcceptedElicitation/Declined/Cancelled三结果+Typed Pydantic模型校验（PrimitiveSchemaDefinition作spec合法性的gate）——MCP协议级的"向用户提问" | server/elicitation.py | acp_approval_request（ACP侧） | 无 | 完全没有 | 与ag2 ElicitationPolicy、ms-agent-fw审批恢复三方互证——HITL协议层词汇已收敛（accept/decline/cancel），OpenSoul照此实现可同时兼容MCP和ACP |
| 3 | **subscriptions/listen服务端推送（SEP-2575）**：无常驻GET流——client发`subscriptions/listen`请求，**该请求的response即事件流**；SubscriptionBus可插拔fan-out（**默认InMemory，可换Redis pub/sub支持多副本部署**）；ack先行+每帧带subscriptionId meta+按client请求过滤事件类型；fire-and-forget无replay（断流重订阅重取） | server/subscriptions.py | 无 | 无 | 完全没有 | OpenSoul推实时状态给OpenMate的协议级方案（与devika socket广播、ag2 stream互补——这是标准化的那个） |
| 4 | **Extension扩展框架（SEP-2133）**：`MCPServer(extensions=[...])`——扩展贡献tools/resources并声明capability，**不拦截任何核心方法**；优雅降级是规范义务 | server/mcpserver/ + extension.py | 无 | 无 | 完全没有 | 比OpenHands plugin hooks更克制的扩展模型 |
| 5 | **MCPServer新高层API**：mcpserver/包（server/tools/resources/prompts/context/resolve子模块）——比lowlevel Server更声明式 | server/mcpserver/ | 无 | 已用MCPServer | 已有 | |
| 6 | **OAuth服务端完整实现**：auth/{handlers,middleware,provider,routes,settings}——MCP server可自带OAuth授权服务器 | server/auth/ | 无 | 无 | 完全没有 | 与Composio授权托管互证；政企SSO对接点 |
| 7 | **transport_security传输安全层**：独立模块（DNS rebinding防护等） | server/transport_security.py | 无 | 无 | 完全没有 | 本地MCP server安全默认 |
| 8 | **caching.py声明式缓存** + **_otel.py OTel内建** | server/ | 无 | reflex/cache有语义缓存 | 部分有 | |
| 9 | **os/posix/win32平台助手**：跨平台进程/文件原语 | os/ | 无 | 无 | 完全没有 | 细节 |

## 源码亮点
1. **MCP Apps是"工具结果可视化"的协议级答案**：此前调研中工具结果只有文本+溢出处理（spill/large_response_handler）；Apps直接让工具返回可交互UI，且host用沙箱iframe渲染——**OpenMate作为host端做这件事有先发位置**。
2. **订阅协议的克制设计**：fire-and-forget+无replay+"断了就重新订阅+重取"——放弃了恢复语义换取实现简单和多副本可行（Redis fan-out无缝替换）。
3. **conformance suite作为CI门禁**：新spec特性必须先有conformance测试通过才能合并——协议实现的纪律。
4. AGENTS.md工程规范可读性极高（100%分支覆盖+strict-no-cover+pragma审计命令）。

## 可复用设计
1. **P0：MCP Apps方向评估**——OpenSoul MCP工具+OpenMate host渲染交互卡片，是OpenMate区别于终端agent的UI差异化机会。
2. **P0：Elicitation三态（accept/decline/cancel）作为OpenSoul HITL协议词汇**——MCP/ACP/ag2三方已收敛，别自创。
3. **P1：subscriptions/listen模式**做OpenSoul→OpenMate实时推送（替代自研WS协议，Redis fan-out留多副本后路）。
4. **P2：transport_security默认开**（本地server防DNS rebinding）。

## grep确认
NONE：elicitation / resourceUri / "ui://" / apps_extension / PrimitiveSchema / transport_security
部分：subscription=仅i18n字符串；OpenSoul mcp/server.py已用MCPServer基础能力（工具服务），Apps/Elicitation/Subscriptions三大高级能力全部闲置
