# browser-use/browser-use — 浏览器 Agent 循环与 DOM 抽象调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/browser-use/browser-use |
| 文档 | https://docs.browser-use.com（Cloud API V4 为当前主路径；开源 Python 库文档独立） |
| 语言 | Python ≥ 3.11（开源库）；Cloud 另有 TS/Python SDK |
| License | MIT（开源库） |
| 定位一句话 | 像人一样操作浏览器的 AI Agent：Agent 循环 + DOM/视觉抽象 + 本地/云浏览器基础设施 |
| 产品形态 | 1) 全托管 Cloud Agent API 2) CLI（浏览器技能注入 Claude Code/Codex/Hermes 等） 3) Python Library 自托管 |

> 对 openmate：browser-use 把 **浏览器运行时生命周期、HITL 现场接管、自愈脚本、并发与限流、失败诊断** 做成完整生产手册，是「工具型长任务 Agent」最强参考之一；注意 Cloud 与开源库 API 不同，V4 为当前主 API。

---

## 1. 架构与 Agent 循环

### 1.1 三条产品路径

```
Cloud API V4：提交 task → 托管 agent + stealth 浏览器 + workspace/profile
CLI：给外部 coding agent 接入本地/云浏览器（skill install）
Python 库：Agent(task, llm, browser, tools) 本地运行，可连 cloud browser
```

### 1.2 开源库核心循环（概念）

```
task → system prompt（内置，可用 extend/override）→ LLM 规划动作
     → 浏览器动作（click/type/scroll/extract/navigate…）
     → 观察页面状态 → 下一轮 → is_done
     → is_successful（agent 自报结果；重要外部动作需人工/系统独立核验）
```

- **模型**：推荐 `ChatBrowserUse(model='bu-2-0')`（浏览器优化模型）；亦可 OpenAI/Anthropic/Gemini 包装或 gateway 前缀模型 ID。
- **工具扩展**：`Tools()` 注册 Python 函数，返回 `ActionResult`。
- **DOM 抽象**：视觉 + DOM/可访问性树混合抽取，把页面压成可决策的交互表示（文档「Available Tools」与 Actor 遗留能力）；Cloud 可直接 CDP 交给 Playwright/Puppeteer/Selenium。

### 1.3 Cloud 对象模型（V4）

| 对象 | 职责 |
|---|---|
| **Run** | 一次任务执行；可 cancel；事件有序分页 |
| **Session** | 跨多轮对话；队列消息；分享链接 |
| **Workspace** | 跨 run 文件；上传/产出物；配额 |
| **Profile** | cookies/浏览器状态复用 |
| **Browser** | 托管浏览器生命周期；录制；代理 |

---

## 2. 四个关键维度

### 2.1 错误恢复 / 自愈

| 机制 | 说明 |
|---|---|
| **Rerunnable scripts** | 将任务存为可重跑脚本，用于「重复活数据抽取 + **self-healing runs**」 |
| **状态区分** | `is_done` 仅表示终止动作；`is_successful` 为 agent 自报；**外部副作用需独立核验** |
| **超时语义分离** | Cloud timeout ≠ API client timeout ≠ model timeout ≠ 任务完成；客户端等待超时**不会**取消服务端 run |
| **失败诊断表** | 401/402/404/409/413/422/429 分类排障（见 troubleshooting） |
| **409 细分** | 会话忙碌 vs workspace 文件覆盖冲突，动作不同 |
| **429 双桶** | HTTP 请求限流 vs 浏览器并发槽占用；前者降轮询，后者停浏览器/降并发 |
| **重试前检查** | 先查既有 run 状态，避免表单已提交后重复创建 |
| **CAPTCHA** | Cloud 自动求解器 + stealth；「新浏览器 ≠ 新 IP/必过挑战」明确写入文档 |
| **Lifecycle Hooks** | 开源库 before/after action、导航、抽取、**错误处理回调** |

### 2.2 沙箱 / 隔离运行时

- **Cloud sandbox 装饰器（开源侧）**：`@sandbox(cloud_profile_id, cloud_proxy_country_code, cloud_timeout)` 包装任务，由云端代理、鉴权、持久化、LLM；agent 与浏览器同侧，延迟最低。
- **托管浏览器**：stealth Chromium、住宅/自定义代理、国家路由；CDP 接入自有自动化代码。
- **敏感数据**：官方示例 `sensitive-data`——避免把 PII/密码送进 LLM；`secrets` 支持 run 作用域密钥绑定。
- **2FA / 1Password**：登录与 TOTP 自动化路径。
- **数据策略**：ZDR 项目支持 Session 立即 purge。

注意：文档明确 **Box/Bux 旧 sandbox 配额产品已退役**，新集成用 Cloud Agent / Browser Infrastructure。

### 2.3 长运行作业

| 能力 | 细节 |
|---|---|
| **会话队列** | busy session 409；队列最多 20 条待处理消息；可 queue/cancel 消息 |
| **事件流** | `GET run events` 以 `after` 游标增量拉取；终态后 drain `hasMore` |
| **状态轮询分桶** | 轻量 status 端点 vs 全量 run 读取，成本分离 |
| **浏览器寿命** | run 完成或断开 CDP **不会立刻停**浏览器；需 `PATCH /browsers/{id}` `{"action":"stop"}` |
| **并发与限额** | 并发会话限额 vs HTTP RPS 双层；消费层级 10/50/250/500/1000 |
| **边缘限流** | 公共 IP 级 1000 RPS（状态读 2500）；项目默认 25 RPS |
| **Workspace** | 共享文件写应串行 run，完成后再读产出 |
| **录制** | 默认关；stop 后异步处理；live preview ≠ 存档视频 |

### 2.4 人工审批 / Human-in-the-Loop

Cloud 文档专章 **Human in the loop**：

1. 创建 run：任务表述为「打开登录页并停下等人审」。
2. run 停止后从 `browser.ready` 事件取 **`live_view_url`**。
3. 人在实时浏览器中登录/审批/支付/审阅。
4. 用同一 `session_id` 创建后续 run：「从当前页面继续」——保留对话、workspace，复用仍在的 live browser。
5. **live_view_url 按凭据对待**（文档原话）。

典型用途：审批、认证（登录/2FA）、支付、结果核对。

---

## 3. 生产集成清单

| 主题 | 要点 |
|---|---|
| 鉴权 | `X-Browser-Use-API-Key`（无 Bearer） |
| 版本 | 新集成用 **V4**；V2 便宜简单任务；V3 保留 |
| 集成 | MCP Server、Claude Code、Hermes Agent、OpenClaw、n8n、Chat UI 示例 |
| 支付 | 按量 credits、BYOK（模型 token 另计 + 编排/浏览器费）、x402 钱包 |
| 可观测 | 有序事件、录制、OpenLIT、成本追踪 |
| 备份 | `is_successful` 不等于外部世界已变更 —— 生产必须对账 |

---

## 4. 对 openmate 的可借鉴点

1. **HITL = 停任务 → 投递 live_view_url → 人接管 → 同 session 续跑**，语义清晰可抄。
2. **Run/Session/Workspace/Profile/Browser 五分对象**，避免「任务、文件、状态」混成一个 ID。
3. **超时语义四分离 + 客户端超时不取消服务端**：长任务 API 必备心智。
4. **自愈脚本（rerunnable + self-healing）** 适配周期性采集类个人助理。
5. **失败诊断表驱动重试**（先诊断、后重试、勿盲加重值）。
6. **浏览器寿命显式 stop**，防止空闲烧并发与费用。

---

## 5. 参考链接

- 项目 README：https://github.com/browser-use/browser-use
- 文档索引：https://docs.browser-use.com/llms.txt
- HITL：https://docs.browser-use.com/cloud/agent/human-in-the-loop.md
- Troubleshooting：https://docs.browser-use.com/cloud/guides/troubleshooting.md
- Sandbox quickstart：https://docs.browser-use.com/open-source/legacy/sandbox/quickstart.md
- Concurrency：https://docs.browser-use.com/cloud/guides/concurrency.md
