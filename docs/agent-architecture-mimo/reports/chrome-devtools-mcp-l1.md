# ChromeDevTools/chrome-devtools-mcp — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/ChromeDevTools/chrome-devtools-mcp  
> 抓取通道: cdn.jsdelivr.net/gh/ChromeDevTools/chrome-devtools-mcp@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供浏览器 MCP / 性能追踪 / slim 模式 / 工具分组 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整、`src/tools/tools.ts`（createTools 工具分组源码）
- 未打开: 各工具实现文件（comments.js 等）
- npm: `chrome-devtools-mcp`
- License: Apache-2.0（源码文件头）

---

## 1. 项目定位（README 实读）

**Chrome DevTools for agents** — MCP server，让 coding agent（Antigravity/Claude/Cursor/Copilot）控制和检查 live Chrome。

关键能力:
1. **性能洞察**: DevTools 录 trace + 可行动性能建议
2. **高级调试**: 网络请求、截图、console（source-mapped stack traces）
3. **可靠自动化**: puppeteer + 自动等待

也提供 **CLI**（不走 MCP）。

---

## 2. 工具分组（tools.ts 源码实读）

```typescript
export const createTools = (args: ParsedArguments) => {
  const rawTools = args.slim
    ? Object.values(slimTools)
    : [
        ...(args.devtoolsComments ? Object.values(commentsTools) : []),
        ...Object.values(consoleTools),
        ...Object.values(cssTools),
        ...Object.values(emulationTools),
        ...Object.values(extensionTools),
        ...Object.values(inputTools),
        ...Object.values(lighthouseTools),
        ...Object.values(memoryTools),
        ...Object.values(networkTools),
        ...Object.values(pagesTools),
        ...Object.values(performanceTools),
        ...Object.values(pwaTools),
        ...Object.values(screencastTools),
        ...Object.values(screenshotTools),
        ...Object.values(scriptTools),
        ...Object.values(snapshotTools),
        ...Object.values(thirdPartyDeveloperTools),
        ...Object.values(webmcpTools),
      ];
  // 工厂函数 or 静态对象
  // 按 name.localeCompare 排序
};
```

### 2.1 完整工具组（18 组 + slim）

| 模块 | 职责域 |
|------|--------|
| commentsTools | DevTools comments（可选 `--devtools-comments`） |
| consoleTools | console 消息 |
| cssTools | CSS 检查/修改 |
| emulationTools | 设备/网络仿真 |
| extensionTools | 扩展相关 |
| inputTools | 输入事件 |
| lighthouseTools | Lighthouse 审计 |
| memoryTools | 内存分析 |
| networkTools | 网络请求 |
| pagesTools | 页面导航/标签 |
| performanceTools | 性能 trace |
| pwaTools | PWA |
| screencastTools | 实时投屏 |
| screenshotTools | 截图 |
| scriptTools | 脚本执行 |
| slimTools | **--slim 精简集** |
| snapshotTools | 页面快照 |
| thirdPartyDeveloperTools | 第三方开发者工具 |
| webmcpTools | Web MCP |

**设计**: 工具可以是 **工厂函数**（接收 args）或 **静态对象**；最终按 name 排序。

---

## 3. 使用方式（README 实读）

### 3.1 MCP 客户端配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### 3.2 Slim 模式（基础浏览器任务）

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--headless"]
    }
  }
}
```

### 3.3 首个 prompt

```
Check the performance of https://developers.chrome.com
```

**注意**: 连接 MCP server **不会**自动启动浏览器；首次需要浏览器的工具调用时才启动。

---

## 4. 配置与隐私（README 实读）

### 4.1 要求

- Node.js **LTS**
- Chrome **current stable 或更新**
- npm

### 4.2 Usage Statistics（默认开启）

Google 收集: tool invocation success rates、latency、environment。

关闭:
```json
"args": ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]
```
或 env: `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` 或 `CI`。

**独立于 Chrome 浏览器的 metrics**；关 Chrome metrics 不自动关本工具。

### 4.3 Update checks

默认定期查 npm registry。关闭: `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS`

### 4.4 Performance CrUX

性能工具可能发 trace URL 到 Google CrUX API 取 real-user 数据。关闭: `--no-performance-crux`

### 4.5 安全免责（README 实读）

> "exposes content of the browser instance to the MCP clients allowing them to inspect, debug, and modify any data in the browser or DevTools. Avoid sharing sensitive or personal information"

官方支持: **Google Chrome** 和 **Chrome for Testing**。其他 Chromium 不保证。

---

## 5. 高级用法（README 链接）

| 主题 | 文档 |
|------|------|
| 并发会话 | docs/advanced-usage.md |
| 持久 user data dir | 同上 |
| 连接已运行 Chrome | 同上 |
| Android 调试 | 同上 |
| WebSocket 配置 | docs/configuration.md |
| 设计原则 | docs/design-principles.md |
| 故障排查 | docs/troubleshooting.md |
| 完整工具参考 | docs/tool-reference.md |
| Slim 工具参考 | docs/slim-tool-reference.md |
| CLI | docs/cli.md |
| 客户端配置 | docs/client-configurations.md |

### 5.1 作为浏览器 subagent

推荐基于 Chrome DevTools for agents 构建集成 browser subagent。参考实现: **Gemini CLI browser agent**。

---

## 6. 与 openmate 映射

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
| Headless | --headless | 高 |

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Node | LTS | README |
| Chrome | current stable+ | README |
| 官方支持浏览器 | Google Chrome, Chrome for Testing | README |
| Usage stats 默认 | 开启 | README |
| 关 stats | --no-usage-statistics 或 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS 或 CI | README |
| Update check | 默认开；CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS 关 | README |
| CrUX | --no-performance-crux 关 | README |
| Slim | --slim | README + tools.ts |
| Headless | --headless | README |
| Comments 工具 | --devtools-comments | tools.ts |
| 工具组数 | 18（+slim） | tools.ts |
| 排序 | name.localeCompare | tools.ts |
| License | Apache-2.0 | 源码头 |

---

## 8. 失败路径 / 边界

```
非 Chrome Chromium
  → 不保证行为

连接 server 不启浏览器
  → 首次需要浏览器的工具才启动

敏感数据
  → 全暴露给 MCP client；勿共享敏感信息

Usage stats 默认开
  → 隐私敏感场景必须显式关闭

Chrome metrics 与本工具 stats 独立
  → 关一个不关另一个

Performance CrUX 外发
  → --no-performance-crux

过时 Node
  → 需 LTS

Chrome 版本过旧
  → 需 current stable+
```

---

## 9. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **createTools(args) 工厂模式**: 工具可静态或依赖配置的工厂
2. **工具按功能域分模块**（18 组），可整体启用/禁用
3. **--slim 模式**: 基础任务只加载精简集
4. **懒启动重资源**: 连接不启浏览器，首次工具调用才启
5. **可选工具组条件加载**（如 comments）
6. **Usage/update/CrUX 三层外发均可关**（flag + env + CI）
7. **官方支持范围诚实声明**（仅 Chrome/CfT）
8. **安全免责前置**: 浏览器内容全暴露给 client
9. **工具按 name 排序**保证稳定 schema
10. **作为 subagent 的参考实现链接**（Gemini CLI）

### P1

- Headless 组合 slim
- advanced-usage: 并发会话 / 持久 profile / 连已有 Chrome / Android
- design-principles.md 单独成文

### P2

- Lighthouse / PWA / screencast 深度工具
- webmcpTools

---

## 10. 应避免的坑

- 勿假设连接即启动浏览器
- 勿在隐私场景留默认 usage stats
- 勿承诺非 Chrome 浏览器支持
- 勿把敏感数据放进被控浏览器
- 勿发明各工具实现文件名（本轮只读 tools.ts 分组）

---

## 11. 源码锚点速查

```
src/tools/tools.ts
  createTools(args: ParsedArguments)
  slim → slimTools only
  else → 18 modules:
    comments (if devtoolsComments), console, css, emulation,
    extension, input, lighthouse, memory, network, pages,
    performance, pwa, screencast, screenshot, script,
    snapshot, thirdPartyDeveloper, webmcp
  tool = factory(args) | static
  sort: a.name.localeCompare(b.name)

README.md
  npm: chrome-devtools-mcp
  Config: npx -y chrome-devtools-mcp@latest
  Slim: --slim --headless
  Flags: --no-usage-statistics --no-performance-crux --headless --slim --devtools-comments
  Env: CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS, CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS, CI
  Browser: Google Chrome / Chrome for Testing only
  Lazy start: first tool needing browser
  Subagent ref: Gemini CLI browser agent
  Docs: tool-reference, slim-tool-reference, configuration, advanced-usage,
        design-principles, troubleshooting, cli, client-configurations
  License: Apache-2.0
```

**未本轮打开**: 各 `src/tools/*.js` 实现。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | 18 组 + slim |
| 权限/安全边界 | 3 | 免责清晰；无鉴权 |
| 容错与会话恢复 | 3 | 持久 profile 文档 |
| 上下文工程 | 4 | snapshot / slim |
| 可扩展（技能/MCP） | 5 | 原生 MCP + 工厂 |
| 可观测与可评测 | 4 | performance + lighthouse |
| 生产可用成熟度 | 4 | Google 维护 + npx 一键 |

**综合**: **浏览器 DevTools 的 MCP 标准封装**。openmate 抄工具工厂分组、slim 模式、懒启动与外发可关三层。

---

## 13. 关键链接

- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://www.npmjs.com/package/chrome-devtools-mcp
- https://geminicli.com/docs/core/subagents/#browser-agent
- 相关: `reports/mcp.md`、`reports/browser-use.md`、`reports/aihawk-l1.md`

---

## 14. 附录 A — createTools 工厂 openmate 规范（P0）

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
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
```

openmate:
- 工具可为静态对象或工厂函数
- slim 模式只加载精简集
- 可选组条件加载
- 按 name 排序保证 schema 稳定

---

## 15. 附录 B — 18 工具组职责

| 组 | 职责 |
|----|------|
| comments | DevTools comments（可选） |
| console | console 消息 |
| css | CSS 检查/修改 |
| emulation | 设备/网络仿真 |
| extension | 扩展 |
| input | 输入事件 |
| lighthouse | Lighthouse |
| memory | 内存 |
| network | 网络请求 |
| pages | 页面/标签 |
| performance | 性能 trace |
| pwa | PWA |
| screencast | 实时投屏 |
| screenshot | 截图 |
| script | 脚本执行 |
| slim | 精简集 |
| snapshot | 页面快照 |
| thirdPartyDeveloper | 第三方工具 |
| webmcp | Web MCP |

---

## 16. 附录 C — 外发三层可关（P0）

| 外发 | 关闭方式 |
|------|----------|
| Usage statistics | `--no-usage-statistics` 或 `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` 或 `CI` |
| Update checks | `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` |
| CrUX 性能 | `--no-performance-crux` |

openmate: 三层独立；默认生产关 usage stats。

---

## 17. 附录 D — 懒启动 + Slim

```
连接 server ≠ 启动浏览器
首次需要浏览器的工具 → 才启动

--slim --headless
  → 基础浏览任务
  → 更少工具、更低资源
```

openmate: 重资源懒启动；提供 slim 配置档。

---

## 18. 附录 E — 失败路径明细

```
非 Chrome Chromium → 不保证
敏感数据 → 全暴露给 MCP client
usage stats 默认开 → 隐私场景必须关
Chrome metrics 与本工具独立 → 关一个不关另一个
Node 非 LTS → 风险
Chrome 过旧 → 需 stable+
```

---

## 19. 附录 F — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 工具组 | 18 + slim | tools.ts |
| 排序 | name.localeCompare | tools.ts |
| Slim | --slim | README + tools.ts |
| Stats 默认 | 开 | README |
| CrUX | --no-performance-crux | README |
| 浏览器 | Chrome / CfT only | README |
| 懒启动 | 首次工具调用 | README |
| Subagent | Gemini CLI browser agent | README |

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | 18 组 + slim |
| 权限安全 | 3 | 免责清晰 |
| 容错恢复 | 3 | 持久 profile |
| 上下文 | 4 | snapshot / slim |
| 可扩展 | 5 | MCP + 工厂 |
| 可观测 | 4 | performance + lighthouse |
| 成熟度 | 4 | Google + npx |

**净推荐**: openmate 抄 **工具工厂分组 + slim + 懒启动 + 外发三层可关** 为浏览器 MCP P0。
