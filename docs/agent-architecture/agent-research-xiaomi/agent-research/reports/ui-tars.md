# bytedance/UI-TARS-desktop — Computer Use Agent 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/bytedance/UI-TARS-desktop |
| 语言 | TypeScript（Electron 桌面应用 + Agent TARS CLI） |
| License | Apache 2.0 |
| 定位一句话 | 字节多模态 Agent 栈：**Agent TARS**（通用多模态 CLI/Web UI）+ **UI-TARS Desktop**（基于 UI-TARS 模型的 GUI 操作 Agent） |
| 模型 | UI-TARS / UI-TARS-1.5、Seed-1.5-VL/1.6；支持 VolcEngine Doubao、HuggingFace Endpoints 等 VLM Provider |
| 论文 | arXiv:2501.12326（UI-TARS: Pioneering Automated GUI Interaction with Native Agents） |

> 对 openmate：UI-TARS 线是「**看见屏幕 → 输出坐标/动作 → 控制本机/浏览器**」的 computer-use 完整实现；Agent TARS 侧已接入 **AIO agent Sandbox** 与 Event Stream 上下文工程，适合 openmate 的桌面/浏览器操作类工具层参考。

---

## 1. 产品拆分

### 1.1 双项目表

| | **Agent TARS** | **UI-TARS Desktop** |
|---|---|---|
| 形态 | CLI + Web UI（headful）+ headless server | Electron 桌面应用 |
| 驱动 | 多模态 LLM + MCP 工具 + GUI/Vision | UI-TARS / Seed 系列 VLM |
| 浏览器 | Hybrid：GUI Agent / DOM / 混合策略 | Computer Operator + Browser Operator |
| 亮点 | Event Stream、Sandbox、MCP 内核 | 精确鼠标键盘、本地/远程 Operator |

### 1.2 Agent TARS 核心特性

- **一键 CLI**：`npx @agent-tars/cli@latest`（Node ≥ 22）。
- **Hybrid Browser Agent**：视觉 grounding、DOM、或混合。
- **Event Stream**：协议化事件流驱动 **Context Engineering** 与 Agent UI。
- **MCP 原生**：内核基于 MCP，可挂载外部 MCP Servers。
- **v0.3.0（2025-11）**：shell/多文件流式工具、运行时耗时统计、Event Stream Viewer、**AIO agent Sandbox**。

### 1.3 UI-TARS Desktop 特性

- 自然语言控制 + 截图视觉识别 + 精确鼠标键盘。
- 跨平台：Windows / macOS / Browser。
- 实时反馈与状态展示。
- **完全本地处理**（隐私卖点）；模型可本地/自托管 Endpoint。
- Remote Computer / Browser Operator 免费公测已于 **2025-08-20 停止**，迁移至火山引擎 OS Agent 模板部署。

---

## 2. Computer Use 任务循环（从文档与模型设定归纳）

```
用户指令（自然语言）
  → VLM 看当前屏幕截图 / 页面
  → 输出动作原语（点击坐标、输入、滚动、快捷键、结束等）
  → 执行器注入系统输入事件
  → 再截图 / 观察 → 下一动作 → 任务完成
```

要点：

- 动作解析强依赖 **VLM Provider 配置正确**（文档反复强调选择对应 Provider，否则 Action parsing 失败）。
- 桌面场景 **仅支持单显示器**；多显示器会导致部分任务失败。
- macOS 需授 **Accessibility + Screen Recording** 权限。
- Browser Operator 需本机安装 Chrome/Edge/Firefox。

---

## 3. 四个关键维度

### 3.1 沙箱（Sandbox）

| 层级 | 现状 |
|---|---|
| **AIO agent Sandbox** | Agent TARS CLI v0.3.0 官方特性：隔离的「全能工具执行环境」（依赖 `agent-infra/sandbox`），用于 shell 等工具执行隔离 |
| **本地 GUI 权限** | UI-TARS Desktop 直接操作真实桌面 —— **非多租户硬隔离**；靠 OS 权限与用户可见性约束 |
| **远程 Operator** | 原免费远程计算机/浏览器算子已停服；自部署走火山引擎 CUA / BUA 模板 |
| **模型部署** | UI-TARS-1.5 可 HuggingFace Endpoint 部署或 Doubao API；Base URL 需 `/v1/` |

对 openmate：桌面操作类工具**默认即高权限**，必须默认最小权限 + 审批；Agent TARS 的 AIO Sandbox 是「工具执行」隔离方向，GUI 驱动本身难沙箱化。

### 3.2 错误恢复

文档层面未展开平台级重试框架，可归纳的工程实践：

| 点 | 说明 |
|---|---|
| Provider 配置校验 | Provider/Base URL/Model Name 不一致导致动作解析失败是首要故障源 |
| 单显示器约束 | 多屏直接失败 —— 环境前置检查应写入工具契约 |
| 权限缺失 | macOS 未开辅助功能/录屏则无法操作 |
| Event Stream Viewer | v0.3 提供数据流跟踪调试，便于定位工具失败步骤 |
| 运行时统计 | 工具调用与深度思考计时，辅助超时预算 |
| 浏览器依赖 | 缺 Chrome/Edge/Firefox 则 Browser Operator 不可用 |

建议 openmate 若参考：在工具入口做 **环境预检清单**（显示器数、浏览器存在、无障碍权限、模型 endpoint 健康）。

### 3.3 长运行作业

| 机制 | 说明 |
|---|---|
| 任务会话 | 桌面 App 以 chat/任务轮次组织 GUI 操作 |
| Headless server | Agent TARS 支持无界面服务化执行 |
| Event Stream | 长步骤上下文可截断/摘要式的工程化通道 |
| 实时反馈 UI | 长任务可观测（当前状态展示） |
| 远程算力（历史） | Remote Operator 曾承担长 GUI 任务；现需自托管云机 |

未观察到与 Dify/Flowise 同级的「检查点续跑 / 跨重启恢复」产品化能力；长 GUI 任务更依赖会话内连续执行。

### 3.4 人工审批

- 桌面形态天然 **人在环**：用户可看着 Agent 点屏幕，随时接管键鼠。
- 文档未描述结构化 **Approve/Reject API** 或工具级审批钩子。
- Agent TARS Web UI 提供可交互界面，适合插入人工观察点，但非正式 HITL 协议。

**结论**：computer-use 产品通常靠「屏幕可见性 + 用户可随时打断」做弱审批；若做自动转账/下单类，需 openmate 自建动作白名单与二次确认。

---

## 4. 快速接入摘要

```bash
# Agent TARS CLI
npx @agent-tars/cli@latest
agent-tars --provider volcengine --model doubao-1-5-thinking-vision-pro-250428 --apiKey ...
# 或 anthropic 等

# UI-TARS Desktop：下载 release / brew install --cask ui-tars
# 设置 VLM Provider / BaseURL / API Key / Model Name
```

SDK：仓库提供 UI-TARS SDK（`docs/sdk.md`），跨平台 GUI 自动化工具包。

---

## 5. 对 openmate 的可借鉴点

1. **Hybrid 浏览器策略**（GUI / DOM / 混合）比纯视觉更稳、更省 token。
2. **Event Stream 协议**作为上下文工程与 UI 同步的统一管道。
3. **MCP 内核 + 外挂 MCP Server**，工具生态对齐行业标准。
4. **AIO Sandbox** 方向：工具/shell 隔离与 GUI 驱动分离。
5. **环境预检**（显示器、权限、浏览器、模型 endpoint）应成为 computer-use 工具的强制前置。
6. 弱 HITL：可见即审批；高危动作需另建确认层。

---

## 6. 参考链接

- 仓库 README：https://github.com/bytedance/UI-TARS-desktop
- Quick Start：https://github.com/bytedance/UI-TARS-desktop/blob/main/docs/quick-start.md
- 模型仓库：https://github.com/bytedance/UI-TARS
- Agent TARS 文档站：https://agent-tars.com（访问失败时以 GitHub README 为准）
- Sandbox 依赖：https://github.com/agent-infra/sandbox
