# UI-TARS-desktop 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/bytedance/UI-TARS-desktop  
> 抓取通道: cdn.jsdelivr.net/gh/bytedance/UI-TARS-desktop@main  
> 版本快照: main @ 2026-09-13（README 16KB + `apps/ui-tars/package.json` 5KB 实读；agent-tars 目录清单实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供桌面 Agent、Electron 架构、多 Provider LLM、MCP、IPC 与安全边界借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `README.md`（16262 bytes）
  - `apps/ui-tars/package.json`（5192 bytes）
- **文件清单实读**（data.jsdelivr.com flat listing）：
  - `apps/agent-tars/` 完整目录（main / renderer / llmProvider / mcp / ipcRoutes）
- `apps/agent-tars/src/renderer/src/agent/AgentFlow.ts` CDN 返回 404（可能路径变更）。
- 本报告基于 README + package.json + 目录清单；不发明行号。

---

## 1. 项目定位（README 实读）

UI-TARS Desktop 是字节跳动开源的 **桌面 GUI Agent**：

- 基于 UI-TARS 视觉-语言模型
- 控制鼠标/键盘操作电脑
- Electron 桌面应用（macOS / Windows）
- 含两个应用：`ui-tars`（基础）与 `agent-tars`（增强，含 MCP / 搜索 / 文件系统）

README 关键能力：

- 屏幕截图 → VLM 推理 → 坐标点击/输入
- 多 Provider 支持（OpenAI / Anthropic / Azure / Gemini / Mistral / DeepSeek）
- MCP 集成
- 本地文件系统访问

---

## 2. 仓库结构（flat listing 实读）

```
UI-TARS-desktop/
├── apps/
│   ├── ui-tars/          # 基础桌面 Agent
│   └── agent-tars/       # 增强版（MCP / 搜索 / 文件系统）
│       ├── src/main/     # Electron 主进程
│       │   ├── index.ts
│       │   ├── ipcRoutes/  # action, filesystem, llm, mcp, search, settings
│       │   ├── llmProvider/
│       │   │   ├── ProviderFactory.ts
│       │   │   └── providers/
│       │   │       ├── AnthropicProvider.ts (10322)
│       │   │       ├── AzureOpenAIProvider.ts (7050)
│       │   │       ├── GeminiProvider.ts (10187)
│       │   │       ├── MistralProvider.ts (6987)
│       │   │       ├── OpenAIProvider.ts (6963)
│       │   │       └── BaseProvider.ts (1850)
│       │   ├── mcp/
│       │   │   ├── client.ts (3042)
│       │   │   └── tools.ts (1750)
│       │   ├── customTools/
│       │   │   ├── index.ts
│       │   │   └── search.ts (4649)
│       │   └── utils/
│       │       ├── logger.ts (7467)
│       │       ├── maskSensitiveData.ts (1584)
│       │       ├── errorReporter.ts
│       │       ├── systemPermissions.ts
│       │       └── updateApp.ts
│       └── src/renderer/
│           └── src/agent/
│               ├── AgentFlow.ts (14087)
│               ├── Aware.ts (8227)
│               ├── EventManager.ts (11526)
│               └── Executor/
│                   ├── index.ts (6535)
│                   └── tools.ts
├── packages/  # 共享包
└── .github/workflows/  # e2e-agent-tars, e2e-ui-tars, release-*
```

---

## 3. apps/ui-tars/package.json 实读

```json
{
  "name": "ui-tars",
  "version": "...",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "...",
    "build": "...",
    "e2e": "..."
  }
}
```

Electron 应用典型结构：`main` 进程 + `preload` + `renderer`。

---

## 4. LLM Provider 抽象（目录 + 大小实读）

### 4.1 ProviderFactory 模式

```
llmProvider/
├── ProviderFactory.ts (4054)
├── interfaces/LLMProvider.ts (1459)
└── providers/
    ├── BaseProvider.ts (1850)
    ├── AnthropicProvider.ts (10322)
    ├── AzureOpenAIProvider.ts (7050)
    ├── GeminiProvider.ts (10187)
    ├── MistralProvider.ts (6987)
    └── OpenAIProvider.ts (6963)
```

**设计**：

- 统一 `LLMProvider` 接口（1.4KB）
- `BaseProvider` 薄基类（1.8KB）
- 每个厂商独立 Provider
- `ProviderFactory` 按配置选择

### 4.2 Provider 大小暗示的复杂度

| Provider | 大小 | 推断复杂度 |
|----------|------|-----------|
| Anthropic | 10322 | 最高（thinking / 缓存） |
| Gemini | 10187 | 高（多模态 / inline） |
| AzureOpenAI | 7050 | 中 |
| Mistral | 6987 | 中 |
| OpenAI | 6963 | 中 |
| Base | 1850 | 薄基类 |

---

## 5. IPC 路由（Electron 主进程 ↔ 渲染进程）

```
ipcRoutes/
├── index.ts (689)        # 汇总注册
├── action.ts (7828)      # Agent 动作（点击/输入/滚动）
├── filesystem.ts (1793)  # 文件系统访问
├── llm.ts (7437)         # LLM 调用转发
├── mcp.ts (3939)         # MCP 管理
├── search.ts (2635)      # 搜索
└── settings.ts (1764)    # 设置
```

**安全相关**：

- `maskSensitiveData.ts`（1584）：敏感数据脱敏
- `systemPermissions.ts`（1496）：系统权限检查
- `logger.ts`（7467）：结构化日志

---

## 6. Agent 循环（renderer 侧）

```
agent/
├── AgentFlow.ts (14087)   # 主循环
├── Aware.ts (8227)        # 环境感知
├── EventManager.ts (11526) # 事件总线
└── Executor/
    ├── index.ts (6535)    # 动作执行
    └── tools.ts
```

**流程** `[推断，基于目录与产品形态]`：

```
屏幕截图 → Aware 感知 → LLM Provider 推理
  → AgentFlow 决策 → Executor 执行（IPC → main）
    → 动作结果回传 → 下一轮
```

`mockEvents.ts`（78535 bytes）：大量 mock 事件，用于开发与测试。

---

## 7. MCP 集成

```
mcp/
├── client.ts (3042)
└── tools.ts (1750)
```

- 主进程内 MCP client
- 工具注册到 Agent 可调用集
- `ipcRoutes/mcp.ts` 暴露管理接口

---

## 8. CI / 发布（workflows 清单）

| Workflow | 用途 |
|----------|------|
| `e2e-agent-tars.yml` | agent-tars 端到端测试 |
| `e2e-ui-tars.yml` | ui-tars 端到端测试 |
| `release-agent-tars.yml` | agent-tars 发布 |
| `release-ui-tars.yml` (8117) | ui-tars 发布（更大，含多平台） |
| `benchmark.yml` | 基准测试 |
| `scorecard.yml` | 安全评分 |

---

## 9. 失败路径与边界

| 场景 | 处理 `[推断]` |
|------|---------------|
| LLM Provider 超时 | Provider 内重试；细节未本轮展开 |
| 坐标越界 | Executor 校验 |
| 权限不足 | systemPermissions 拦截 |
| MCP 连接失败 | mcp/client 重连策略 |
| 敏感数据泄漏 | maskSensitiveData 脱敏 |
| 更新失败 | updateApp 回滚 |

---

## 10. 对 openmate 的借鉴

### 10.1 直接可抄（P0）

1. **ProviderFactory + 统一接口 + 薄基类**：多厂商 LLM 可插拔。
2. **IPC 路由按域拆分**（action / llm / mcp / search / settings / filesystem）。
3. **maskSensitiveData 前置**：日志与上报前脱敏。
4. **systemPermissions 检查**：桌面权限显式化。
5. **mockEvents 大规模 mock**：无模型也能开发 UI。

### 10.2 应避免的坑

- Electron 双进程复杂度：openmate 若非桌面场景，可跳过。
- 渲染进程跑 Agent 循环：安全上应放主进程。
- CDN 对部分 TS 路径 404：需 clone 兜底。

### 10.3 重构优先级

- **P0**：LLM Provider 统一接口 + Factory
- **P0**：敏感数据脱敏默认开
- **P0**：IPC/通道按域拆分
- **P1**：MCP client 集成
- **P1**：系统权限显式检查
- **P2**：完整桌面壳（按需）

---

## 10.4 Agent 循环详细流程（目录推断）

```
┌─────────────────────────────────────────────────┐
│  Renderer Process                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Aware.ts │→│ AgentFlow│→│ EventManager  │  │
│  │ 屏幕感知 │  │ 主循环   │  │ 事件总线      │  │
│  └──────────┘  └────┬─────┘  └───────────────┘  │
│                     │                            │
│                ┌────▼─────┐                      │
│                │ Executor │                      │
│                │ 动作执行 │                      │
│                └────┬─────┘                      │
└─────────────────────┼───────────────────────────┘
                      │ IPC
┌─────────────────────▼───────────────────────────┐
│  Main Process                                    │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ ipcRoutes/   │  │ llmProvider/             │  │
│  │  action.ts   │  │  ProviderFactory.ts      │  │
│  │  llm.ts      │→│  providers/*.ts           │  │
│  │  mcp.ts      │  │  Anthropic/Gemini/OpenAI │  │
│  │  filesystem  │  └──────────────────────────┘  │
│  │  search.ts   │  ┌──────────────────────────┐  │
│  │  settings.ts │  │ mcp/client.ts + tools.ts │  │
│  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────────────────────────────────┐    │
│  │ utils/                                   │    │
│  │  maskSensitiveData.ts (1584)             │    │
│  │  systemPermissions.ts (1496)             │    │
│  │  logger.ts (7467)                        │    │
│  │  errorReporter.ts / updateApp.ts         │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## 10.5 Provider 复杂度分析

| Provider | 大小 | 推断的特殊处理 |
|----------|------|----------------|
| Anthropic (10322) | 最高 | thinking 块、prompt cache、tool use 格式 |
| Gemini (10187) | 高 | 多模态 inline、function calling 格式差异 |
| AzureOpenAI (7050) | 中 | Azure 端点、API version、AD 认证 |
| Mistral (6987) | 中 | 标准 OpenAI 兼容 |
| OpenAI (6963) | 中 | 标准 |
| Base (1850) | 薄 | 抽象接口 + 公共工具 |

**设计启示**：Provider 差异主要在 **thinking / 多模态 / 认证**；openmate 应为这三类差异预留扩展点。

---

## 10.6 IPC 路由安全设计

| 路由 | 大小 | 安全关注 |
|------|------|----------|
| `action.ts` (7828) | 最大 | 鼠标/键盘动作 = 高权限 |
| `llm.ts` (7437) | 大 | API key 不出主进程 |
| `mcp.ts` (3939) | 中 | MCP server 权限边界 |
| `filesystem.ts` (1793) | 小 | 路径穿越防护 |
| `search.ts` (2635) | 小 | 网络请求 |
| `settings.ts` (1764) | 小 | 配置写入 |

**关键**：`action.ts` 最大——GUI 控制是核心且高风险能力。

---

## 10.7 mockEvents.ts 的价值

`mockEvents.ts`（78535 bytes）提供大规模 mock：

- 无模型即可开发/测试 UI
- 事件流回放
- E2E 测试基础

**对 openmate**：为 Agent 事件流建立 mock 层，UI 开发不阻塞于模型。

---

## 10.8 与 openmate 对照

| UI-TARS | openmate 建议 |
|---------|---------------|
| ProviderFactory + LLMProvider 接口 | 多厂商 LLM 可插拔 |
| BaseProvider 薄基类 | 公共逻辑上提 |
| IPC 按域拆分 | action/llm/mcp/search/settings/filesystem |
| maskSensitiveData | 日志与上报前脱敏 |
| systemPermissions | 桌面权限显式化 |
| mockEvents 大规模 mock | 无模型可开发 UI |
| action.ts 最大 | GUI 控制 = 高权限核心 |
| Agent 循环在 renderer | **应放主进程**（安全） |
| MCP client 主进程内 | 工具注册到可调用集 |
| Electron 双进程 | 非桌面场景可跳过 |

---

## 11. 源码锚点速查

```
README.md
  UI-TARS Desktop（字节跳动）
  两应用: ui-tars + agent-tars
  VLM 控制鼠标键盘
  macOS / Windows

apps/ui-tars/package.json
  Electron main → dist/main/index.js

apps/agent-tars/src/main/
  llmProvider/ProviderFactory.ts (4054)
  llmProvider/interfaces/LLMProvider.ts (1459)
  llmProvider/providers/AnthropicProvider.ts (10322)
  llmProvider/providers/GeminiProvider.ts (10187)
  llmProvider/providers/OpenAIProvider.ts (6963)
  llmProvider/providers/BaseProvider.ts (1850)
  ipcRoutes/action.ts (7828)
  ipcRoutes/llm.ts (7437)
  ipcRoutes/mcp.ts (3939)
  mcp/client.ts (3042)
  utils/maskSensitiveData.ts (1584)
  utils/systemPermissions.ts (1496)
  utils/logger.ts (7467)

apps/agent-tars/src/renderer/src/agent/
  AgentFlow.ts (14087)
  Aware.ts (8227)
  EventManager.ts (11526)
  Executor/index.ts (6535)
  mockEvents.ts (78535)

workflows: e2e-agent-tars, e2e-ui-tars, release-*, benchmark, scorecard

License: Apache-2.0
```

**本轮未打开**：AgentFlow.ts 全文（CDN 404）、Provider 实现细节、Executor 坐标计算。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | GUI 动作 + MCP |
| 权限/安全边界 | 4 | systemPermissions + maskSensitiveData |
| 容错与会话恢复 | 2 | 非重点 |
| 上下文工程 | 3 | 屏幕截图序列 |
| 可扩展（技能/MCP） | 4 | MCP client |
| 可观测与可评测 | 3 | logger + benchmark workflow |
| 生产可用成熟度 | 3 | 桌面产品级 |

**综合**：**桌面 GUI Agent 的工程化标杆**。openmate 抄 ProviderFactory、IPC 按域拆分、脱敏与权限检查；非桌面场景可跳过 Electron 壳。

---

## 13. 关键链接

- 仓库：https://github.com/bytedance/UI-TARS-desktop  
- 相关报告：`reports/deer-flow.md`、`reports/browser-use.md`、`reports/agent-browser.md`
