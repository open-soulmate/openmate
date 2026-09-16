# MCP TypeScript SDK v2（#82, 8k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/mcp-tssdk（14MB，v2 monorepo，源码级深读）

官方TS SDK（Python SDK #79已研究，本篇记v2独有信号）。monorepo六包：core-internal/core/client/server/server-legacy/codemod/middleware。

## 功能清单（聚焦v2独有/与python-sdk差异项）
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. Streamable HTTP可恢复性（EventStore接口：storeEvent+replayEventsAfter，断线后lastEventId重放已发事件，流id去重） | 无 | mcp/server无 | 完全没有 | 长任务MCP调用断网不丢结果；OpenSoul生产MCP server应实现EventStore |
| 2. 工具结构化输出（outputSchema+structuredContent结果，Zod校验） | 无 | 无 | 完全没有 | 工具结果schema化→前端可渲染表格/表单而非纯文本 |
| 3. Elicitation双模式（form字段表单 / **URL模式跳转授权页**） | OpenMate审批事件 | 无 | 部分有 | URL模式对应OAuth式复杂授权；HITL协议词汇（第5方确认accept/decline/cancel） |
| 4. Client middleware（请求中间件链，可观测/重试/改写注入点） | 无 | 无 | 完全没有 | MCP调用统一拦截层（挂日志/限流/审计的位置） |
| 5. codemod包（v1→v2自动迁移工具+mapping文件驱动） | 无 | 无 | 工程借鉴 | SDK破坏性升级的工业级善后；"协议必须用最新标准"的护航 |
| 6. 公共API纪律（Zod-free公共面/schema归@modelcontextprotocol/core单一包/barrelClean测试禁node builtin泄漏到browser入口） | 无 | 无 | 工程借鉴 | 包边界CI守卫；OpenSoul如拆SDK可照抄 |
| 7. JSDoc @example同步机制（examples.ts#region→注释/文档自动sync:snippets） | 无 | 无 | 工程借鉴 | 文档与代码同步的自动化 |
| 8. server-legacy包（旧transport平滑期并存） | 无 | 无 | 参考 | 协议升级不弃旧端 |
| 9. 框架适配middleware包（express/hono/node薄集成层"不加新功能"的明文约束） | 无 | 无 | 参考 | 集成层与核心解耦纪律 |
| 10. OAuth 2.0完整服务端+客户端实现（auth-extensions含OpenID） | 无 | mcp/server零认证 | 完全没有 | 与swarms MCPDeployer auth互证（第2方）→OpenSoul生产MCP补认证的现成方案 |

## 源码亮点
- **Protocol基类一层管所有**：请求/响应关联+能力协商+transport管理，Client/Server都继承——OpenSoul mcp重构时的分层参照
- resumability设计细节：事件id已写入即标记replayEventsAfter已投递，await期间不重复投递——并发正确性细节值得抄
- CLAUDE.md明文"experimental目录当前为空"——实验特性隔离区预留

## 可复用设计
1. EventStore接口（~50行接口+内存实现）→ OpenSoul mcp生产server断线恢复
2. Client middleware → OpenSoul mcp/client.py加审计/重试拦截层
3. outputSchema→OpenMate工具结果渲染器（表格/JSON树/表单）
4. OAuth server目录 → OpenSoul mcp认证的直接移植源
