# chrome-devtools-mcp

## 一句话定位
Chrome DevTools 官方 MCP Server：让 Agent 用 DevTools 协议可控地操作与调试浏览器。

## 核心架构（4点）
1. **MCP Server 包装 CDP**：以 MCP tools 暴露导航、点击、求值、网络与性能能力
2. **官方 DevTools 背书**：对接 Chrome 调试面而非再造浏览器自动化栈
3. **工具粒度清晰**：页面操作、截图、console/network、tracing 分开
4. **本地 Chrome 会话**：可附加已运行浏览器上下文

## 稳定性亮点
- 官方协议比像素猜测更可复现
- 适合把「浏览器调试」变成可审计工具调用
- 与 Claude/Cursor 等 MCP 客户端即插即用

## 对 openmate 借鉴
1. **浏览器能力走 MCP 而不是硬编码 Playwright**：工具面可替换、可权限控制
2. **把 network/console 作为观测工具**：排查「Agent 改了网页但没生效」类问题

## 链接
https://github.com/ChromeDevTools/chrome-devtools-mcp
