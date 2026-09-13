# Chrome DevTools MCP

## 概述

Chrome DevTools MCP 是一个Chrome DevTools MCP集成。

**仓库**: https://github.com/ChromeDevTools/chrome-devtools-mcp | **License**: Apache-2.0

## 核心架构

> 仓库: https://github.com/ChromeDevTools/chrome-devtools-mcp  
> 抓取通道: cdn.jsdelivr.net/gh/ChromeDevTools/chrome-devtools-mcp@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供浏览器 MCP / 性能追踪 / slim 模式 / 工具分组 借鉴

---

## 关键技术

- 官方协议比像素猜测更可复现
- 适合把「浏览器调试」变成可审计工具调用
- 与 Claude/Cursor 等 MCP 客户端即插即用

## 对openmate的启示

> 仓库: https://github.com/ChromeDevTools/chrome-devtools-mcp  
> 抓取通道: cdn.jsdelivr.net/gh/ChromeDevTools/chrome-devtools-mcp@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供浏览器 MCP / 性能追踪 / slim 模式 / 工具分组 借鉴

---

| 需求 | chrome-devtools-mcp 机制 | 可复用度 |
|------|-------------------------|----------|
| 浏览器 MCP server | npx chrome-devtools-mcp | **高** |
| 工具分组工厂 | createTools(args) 18 组 | **高** |
| Slim 精简模式 | --slim 子集 | **高** |
| 性能 trace | performanceTools + lighthouse | **高** |
| 懒启动浏览器 | 首次工具调用才起 | **高** |
| 可选工具组 | devtoolsComments 条件加载 | **高** |
| 工具按名排序 | localeCompare | 中 |
| Usage stats 可关 | --no-usage-statistics / env | **高** |
| Update check 可关 | env | 高 |
| CrUX 可关 | --no-performance-crux | 高 |
| 官方支持范围明确 | Chrome / CfT only | 高 |
| 作为 subagent 参考 | Gemini CLI browser agent | **高** |
| Headless

```ts
export const createTools = (args: ParsedArguments) => {
  const rawTools = args.slim
    ? Object.values(slimTools)
    : [
        ...(args.devtoolsComments ? Object.values(commentsTools) : []),
        ...Object.values(consoleTools),
        // ... 17 组
      ];
  const tools = rawTools.map(t => typeof t === 'function' ? t(args) : t);
...

openmate:
- 工具可为静态对象或工厂函数
- slim 模式只加载精简集
- 可选组条件加载
- 按 name 排序保证 schema 稳定

---

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- MiMo报告（chrome-devtools-mcp-l1.md）
- MiMo卡片（chrome-devtools-mcp.md）
