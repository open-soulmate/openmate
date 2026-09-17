# chrome-devtools-mcp 功能研究（源码级升级）

> 升级自 32-44-csv-remaining-batch.md 的 README 级条目 → **源码级**
> 源码：codeload tarball 3.4MB（`main` 分支），tar 校验通过，本地留存 `~/agent-research-src/cdm/`
> 实际读取：`src/tools/`（ToolDefinition.ts 结构 / categories.ts 全文 / slim/tools.ts / 目录级 4,506 行）+ `src/utils/pagination.ts` 全文 + `src/utils/WaitForHelper.ts` 前 80 行 + `src/formatters/` 目录级 + 根 `AGENTS.md` 全文；共 83 个 TS 文件
> CSV 第 33 行，52k★，TypeScript，agent-infrastructure（Google 官方）

## 修正旧报告认知
- 旧报告只记到"性能 trace + CrUX + `--slim` 工具分档"。源码级读完后发现：**它也随产品发布了 6 个 agent 技能**，且工具定义层的工程化程度（分类 / 只读提示 / 对话框阻塞声明 / 文件校验）远超"一个 MCP wrapper"。
- 它是 **Google 官方**项目，工程质量可视为 Google 对"如何给 AI 写浏览器工具"的表态。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **工具元数据四件套**（`ToolDefinition.ts` 556 行）：每个工具声明 `annotations.category`（11 类枚举）+ `annotations.readOnlyHint` + **`blockedByDialog: boolean`**（该工具是否会被页面对话框阻塞）+ **`verifyFilesSchema`**（文件参数校验 schema） | 无 | 无 | **完全没有** | **本轮最有价值**。MCP 的 `readOnlyHint` 是标准字段但没人认真用；`blockedByDialog` 是自定义扩展——**工具自己声明"我会不会被 modal 卡住"**，调度器据此决定要不要先处理对话框 |
| 2 | **11 类工具分类枚举**（`categories.ts` 全文）：INPUT / NAVIGATION / EMULATION / PERFORMANCE / NETWORK / DEBUGGING / EXTENSIONS / THIRD_PARTY(`experimentalThirdParty`) / MEMORY / WEBMCP(`experimentalWebmcp`) / PWA，每类带人类可读 label | 无 | 无 | 完全没有 | 分类即权限边界与 token 预算单位；实验性能力用 `experimental` 前缀标记 |
| 3 | **`--slim` 工具子集**（`tools/slim/tools.ts` 106 行）：只保留 `screenshot` + `navigate` 等最小集，**独立实现而非过滤**（自包含的 definePageTool） | 无 | 无 | 完全没有 | 已记要点，源码确认是"另写一套"而非"从全集筛"——slim 版本可以更简单（如 screenshot 不带 filePath 校验） |
| 4 | **URL 校验门**（`navigate` 里的 `validateUrl(url, {javascriptEvaluation, categoryExtensions})`）：`javascript:` 等危险 scheme 按配置/类别拦截 | 无 | 无 | 完全没有 | 导航工具的输入消毒；agent-browser 是出网白名单，这是 **scheme 白名单**，互补 |
| 5 | **DOM 稳定等待**（`WaitForHelper.ts` 317 行）：MutationObserver + **100ms 稳定期去抖** + 3000ms 超时；**CPU 超时与网络超时分别有独立 multiplier**（`cpuTimeoutMultiplier` / `networkTimeoutMultiplier`），按环境缩放 | 无 | 无 | 完全没有 | "等页面稳定"是浏览器 agent 最常踩的坑；**双 multiplier**（CPU 密集 vs 网络慢的环境用不同系数）是很成熟的调参设计 |
| 6 | **等待期不能占着工具互斥锁**（同上，注释即规格）："Without this cap a paused renderer (e.g. an open dialog) would make `evaluateHandle` hang until protocolTimeout (default 180s) **while the tool mutex is held**" —— 故意给 `evaluateHandle` 也套一层 `Promise.race` 超时 | 无 | 无 | **完全没有** | **本轮最好的工程教训**：长等待必须连"设置等待"这一步也限死，否则一个 modal 就把整个工具锁住 180 秒 |
| 7 | **对话框检测双标志**：`#dialogHandled`（已处理）与 `#dialogDetected`（**检测到即算，因为对话框会暂停 renderer**）分开 | 无 | 无 | 完全没有 | 与第 6 条同源：renderer 被暂停的语义要单独建模 |
| 8 | **分页带 `invalidPage` 诚实标志**（`pagination.ts` 84 行全文）：请求的页码越界时**返回第 0 页并置 `invalidPage: true`**，同时给出 `hasNextPage` / `hasPreviousPage` / `startIndex` / `endIndex`；未传分页参数则整体返回且 `totalPages: 1` | 无 | 无 | 完全没有 | 不静默改页码——把"你要的页不存在"明确告诉模型。OpenSoul 任何列表型工具都该这样做 |
| 9 | **6 个随产品发布的 agent 技能**（`skills/`）：`troubleshooting` / **`debug-optimize-lcp`**（含 4 篇 references：lcp-breakdown / elements-and-size / optimization-strategies / lcp-snippets）/ `cookie-debugging` / **`memory-leak-debugging`**（references/common-leaks.md）/ **`a11y-debugging`**（references/a11y-snippets.md）/ `chrome-devtools` / `chrome-devtools-cli` | 无 | 无 | **完全没有** | **本轮第三个"工具自带技能"**（agent-browser / chrome-devtools-mcp / AstrBot 技能同步）。且技能内容是**领域专长**（怎么调 LCP、怎么找内存泄漏），不是"怎么调用我"——**工具卖的是能力，技能卖的是判断力** |
| 10 | **分层 formatter**（`src/formatters/` 7 个）：Snapshot / Css / Issue / Console / Network / HeapSnapshot / Comment 各一个格式化器 | 无 | 无 | 部分 | "原始 CDP 数据 → 模型可读文本"独立成层；与 agent-browser convert 层同思想 |
| 11 | **性能 trace 处理器**（`processors/PerformanceTrace.ts` 148 行 + `HeapSnapshotManager.ts`） | 无 | 无 | 完全没有 | 已记要点 |
| 12 | **daemon 化**（`src/daemon/`：daemon.ts / client.ts / types.ts）：MCP server 与浏览器 daemon 分离 | 无 | 无 | 部分 | 与 agent-browser daemon 同构 |
| 13 | **screencast 工具**（`tools/screencast.ts`）+ `emulation.ts`（设备/网络/地理位置模拟） | limb 有 screenshot stub | 无 | 部分 | 已记要点 |
| 14 | **PWA / Lighthouse / 内存（heap snapshot）专项工具** | 无 | 无 | 完全没有 | 性能与内存是 coding agent 少见的深度能力 |
| 15 | **`gemini-extension.json` + `plugin.json` + `mcp.json` + `server.json` 四种分发清单** | 无 | 无 | 完全没有 | 同一份工具同时可被 Gemini CLI 扩展 / Claude 插件 / 通用 MCP / registry 消费——**多宿主分发**的工程化 |
| 16 | **遥测可关闭且 CI 自动禁用**（`src/telemetry/` 8 文件 + `--no-usage-statistics`） | 无 | 无 | 部分 | 政企部署需确认 |

## 源码亮点
- **`AGENTS.md` 的 TypeScript 规则是"禁用逃生舱"**：不用 `any` / 不用 `as` 类型断言 / 不用 `!` / 不用 `@ts-ignore` / 不用 `@ts-nocheck` / 不用 `@ts-expect-error`。一个 agent 密集型仓库，把"AI 最爱用的绕过类型系统的手段"全部禁掉。
- **测试策略写在 AGENTS.md 里并给出反模式**："优先 mock 单测，不要用 `withMcpContext` 或起真浏览器，除非测试确实需要真实浏览器/CDP 集成——Puppeteer 上游已经测过浏览器行为了"；"**不要在 mock 里重新实现业务逻辑或状态跟踪**"。这是防止 AI 写出"测 mock 而不是测代码"的显式防线。
- **mock 规范机械化**：必须用 `sinon.createStubInstance(Class)`（不许手搓 mock 对象）、必须用 `sinon.assert.calledOnceWithExactly`（不许 `assert.ok(stub.calledOnce)`）、必须 `afterEach(() => sinon.restore())`、命名用 `mock` 不用 `fake`。
- **`waitForStableDom` 用 `using` 声明**（TC39 显式资源管理）保证 observer 一定被释放。
- **分页器的 `noPaginationOptions()` 判空**：两个参数都没传时走"不分页"路径，而不是默认第 0 页——语义区分"要全部"与"要第一页"。

## 可复用设计
1. **工具元数据四件套，尤其 `blockedByDialog`**（第 1 条）→ OpenSoul MCP 工具注册加 `category` / `readOnlyHint` / 是否易被阻塞
2. **"连设置等待也要限超时"**（第 6 条）→ 任何长等待型工具，通用工程教训
3. **分页 `invalidPage` 诚实标志**（第 8 条）→ OpenSoul 所有列表工具
4. **工具自带领域技能包**（第 9 条）→ 与 agent-browser 薄发现桩互补的第二种形态：**技能内容是领域专长而非 API 说明**
5. **多宿主分发清单**（第 15 条）→ 一份能力四个 manifest
6. **AGENTS.md 的"禁用逃生舱 + mock 反模式"规约**（源码亮点）→ OpenMate/OpenSoul 的 AI 协作规范

## 行业信号
- **"工具自带 agent 技能"本轮已三方**（agent-browser `skill-data/`、chrome-devtools-mcp `skills/`、AstrBot 技能三源同步）。加上 goose / ChatDev2.0 / FastGPT / OpenHands / Warp 的 `.agents/skills/` 目录标准——**技能正在从"用户的资产"变成"工具厂商的交付物"**。
- **Google 官方给 MCP 工具加了 `blockedByDialog` 这类非标准注解**，说明 MCP 原生 annotations 不够用，行业在各自扩展。OpenSoul 做 MCP 消费侧时应预留自定义注解通道。
- **"AI 写代码的规约"本身成了开源交付物**（chrome-devtools-mcp AGENTS.md 禁逃生舱 + mock 反模式 / AstrBot AGENTS.md KISS + 内联优先 / agent-browser AGENTS.md 五处文档同步）。这些文件的价值不亚于代码。
