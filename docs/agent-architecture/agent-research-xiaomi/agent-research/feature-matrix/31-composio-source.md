# Composio 功能研究（#31, 工具集成平台, TS+Python 双SDK monorepo）

研究方式：`git clone --depth 1` → ~/agent-research-src/composio（211MB）
重点：ts/packages/core/src/{models,provider,types} + ts/packages/providers（10个框架适配器）

Composio = **统一工具接入层 + 凭证/授权中台**。它自己不造工具，而是把 500+ 第三方工具
(Gmail/GitHub/Slack/…) 用一套统一 schema 暴露给任意 agent 框架，并托管授权。对 OpenSoul
的价值在**"工具即服务 + 授权托管 + 会话级工具路由"**，正是 OpenSoul limb/mcp 最缺的一层。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **14 种授权方案**：OAuth1/OAuth2/API_KEY/BASIC/BEARER/SERVICE_ACCOUNT/SAML/DCR_OAUTH/S2S_OAUTH2/JWT 等统一建模 (AuthSchemeTypes) | ❌ | 🟡 仅 api/user.py 有零散 oauth | 完全没有 | P0。把"工具需要什么授权"标准化，OpenSoul 现在每个连接器各写一套 |
| 2 | **Connected Accounts 托管**：第三方账号连接态集中存取、刷新、多账号 | ❌ | ❌ 无 connected_account | 完全没有 | P0。政企多系统 SSO 的地基 |
| 3 | **Connection Request / OAuth 流程托管**：发起授权、回调、状态机管理 | ❌ | ❌ | 完全没有 | P0。用户要"连一下企业微信/钉钉"，现在无标准流程 |
| 4 | **Session 级工具路由**：composio.sessions.create(userId,{toolkits}) → 每会话一个隔离 MCP endpoint(url+headers)，只暴露该用户被授权的工具 | ❌ | ❌ 无会话级工具隔离 | 完全没有 | **P0**。安全关键：不同用户/会话可见工具集不同，OpenSoul 现 mcp/server 是全局共享 |
| 5 | **Tool Modifiers（before/after execute 拦截）**：执行前改写参数(注入 auth header/request-id)、执行后转换结果 | ❌ | ❌ 无 before_execute/tool_modifier | 完全没有 | P0。与 CrewAI Hooks、OpenHands Hook 同族——OpenSoul 缺统一工具拦截层 |
| 6 | **Custom Tools / Custom Toolkits**：用户自定义工具并打包成 toolkit，同 schema 暴露 | ❌ | 🟡 limb/tasks.py 有 BUILTIN_TEMPLATE 固定动作 | 部分有 | 中。让自定义工具走统一 schema |
| 7 | **框架 Provider 适配器**：openai/anthropic/google/langchain/llamaindex/mastra/vercel/cloudflare/openai-agents/claude-agent-sdk 十个适配器，把工具转成各框架原生 shape | ❌ | ❌ 无 provider_adapter | 完全没有 | P1。OpenSoul 只对接自家 acp，若要开放生态需此层 |
| 8 | **Triggers + Webhook 订阅**：工具事件触发器，webhook 验签 + payload 三版本 schema + Pusher 实时推送 | ❌ | 🟡 link/connector.py 有 webhook 雏形 | 部分有 | 中。把外部工具事件接进 will/ 触发器 |
| 9 | **JSON Schema 归一化 + 去重**：deduplicateJsonSchemaRequiredArrays，各 provider 发出前统一规范化 | ❌ | ❌ | 完全没有 | 低。跨框架兼容细节 |
| 10 | **Proxy Params Transform**：把工具调用经 Composio 代理，托管凭证不外泄 | ❌ | ❌ | 完全没有 | 中。凭证永不进 agent 上下文，直击安全痛点 |
| 11 | **Remote Files / File Mount**：跨会话挂载远程文件，workerd/node 双平台适配 | ❌ | ❌ | 完全没有 | 低 |
| 12 | **Telemetry 内建**：每次工具调用打点 | ❌ | 🟡 vital 有运维指标 | 部分有 | 低 |
| 13 | **Zod 边界校验纪律**：所有外部 API payload 用 zod schema 解析，禁止 `'x' in obj` 手写守卫/`as` 断言 | ✅ 工程规范 | — | 可复用 | 抄进 OpenSoul API 边界 |
| 14 | **工具→MCP 一键桥**：任何 toolkit 通过 `session.mcp.url` 直接变 MCP server 给 agent 用 | ❌ | 🟡 mcp/server_registry 已能连外部 MCP server | 部分有 | 反向：OpenSoul 已能"消费"MCP，缺"生产"带授权的 MCP 端点 |

## 源码亮点

- **Session = ToolRouter 的子类**（`class Sessions extends ToolRouter`）：一个设计——"会话"本质就是"带工具路由作用域的上下文"。每次 create 返回隔离 MCP endpoint。**这个抽象可直接抄**：OpenSoul 会话应内生携带"本会话可用工具白名单"。
- **AuthSchemeTypes 14 种枚举 + AuthConfigType 二分**（`use_custom_auth` / `use_composio_managed_auth`）：用户可选择"自己管凭证"或"托管"。这种**凭证主权二分**对政企客户是卖点。
- **Modifiers 用纯函数拦截**（`beforeExecute({params,toolSlug,toolkitSlug}) => params`）：不侵入执行器，靠函数改写参数。比 OpenHands 的 Hook 更轻。可直接做成 OpenSoul limb/executor 的中间件。
- **双 SDK 严格 parity**（cross-sdk-parity skill + parity-variance.json）：TS 和 Python 行为必须一致，有专门校验。OpenSoul 若做多语言 SDK 可借鉴。

## 可复用设计

1. **会话级工具路由**（session 带 toolkit 白名单 + 生成隔离 MCP 端点）→ OpenSoul 会话安全模型，P0
2. **14 种 AuthScheme 标准化枚举** → OpenSoul 连接器授权统一层
3. **before/after execute 纯函数 Modifier** → limb/executor 中间件，与 Hook 体系统一
4. **凭证主权二分**（自管 vs 托管）→ 政企合规卖点
5. **Proxy 托管凭证**（凭证不进 agent 上下文）→ 安全

## OpenSoul 现状确认（grep）
- limb/{executor,tasks}.py：RPA 任务执行器（队列/优先级/历史/模板），**固定内置动作，无统一授权/工具 schema**
- mcp/server.py：把 OpenSoul 自身工具经 stdio 暴露（**生产 MCP**，但无授权隔离）
- mcp/server_registry.py：登记外部 MCP server（stdio/sse/http）及其工具（**消费 MCP**）
- 无 oauth 流程 / connected_account / toolkit / auth_scheme / provider_adapter / tool_modifier / custom_tool / 会话级工具隔离
- 与前几轮结论一致：OpenSoul 有 MCP 生产+消费，但**缺授权托管 + 会话隔离 + 工具拦截**这层"中台"
