# Cline 架构深度分析

> **项目**: [cline/cline](https://github.com/cline/cline)
> **Stars**: 67.9K | **License**: Apache-2.0 | **语言**: TypeScript
> **定位**: 自主编码Agent——IDE扩展、CLI工具、SDK三位一体

---

## 1. 项目定位

Cline 是一个**开源自主编码Agent**，最初作为 VS Code 扩展（名为 Claude Dev）起步，现已发展为覆盖多种运行时形态的统一Agent平台：

- **VS Code 扩展**：Marketplace 安装，侧边栏交互，diff 可视化
- **JetBrains 插件**：IntelliJ/PyCharm/WebStorm 全家族支持
- **CLI 工具**：`npm i -g cline`，支持交互式和 headless 模式（CI/CD 集成）
- **Desktop App**：Tauri + Next.js 原生桌面应用（macOS/Windows）
- **SDK**：`@cline/sdk`，供开发者构建自定义Agent和集成

与 Cursor、Copilot 等竞品不同，Cline 的核心差异化在于：**Human-in-the-loop 审批机制**——每个文件编辑和终端命令都需要用户明确批准，同时支持自动批准策略配置。这使其在安全性和可控性上优于完全自动化的方案。

---

## 2. 整体架构

Cline 采用**三层分离架构**，核心组件职责清晰：

```
┌─────────────────────────────────────────────┐
│              Webview (React)                 │
│  ExtensionStateContext → useExtensionState   │
│  消息流 UI / 设置面板 / 对话界面             │
└──────────────┬──────────────────────────────┘
               │ VSCode message passing
┌──────────────▼──────────────────────────────┐
│            Controller                        │
│  单一状态源 / 任务管理 / API配置 / MCP协调    │
│  全局状态 / 工作区状态 / Secrets存储          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│              Task                             │
│  API请求 / 流式响应 / 工具执行 / 浏览器/终端  │
│  每个任务独立实例，隔离状态管理               │
└─────────────────────────────────────────────┘
```

**WebviewProvider** 管理 Webview 生命周期和 CSP 安全策略；**Controller** 是整个扩展的状态中心，管理全局状态、工作区状态和 Secrets 三类持久化存储；**Task** 负责实际的AI请求和工具执行，每个任务运行在独立的 Task 实例中。

项目采用 monorepo 结构：`apps/vscode/`（VS Code扩展）、`apps/cli/`（CLI工具）、`apps/examples/desktop-app/`（桌面应用）、`sdk/`（SDK包）。共享核心逻辑通过 `@cline/shared` 包复用。

---

## 3. Agent 循环

Cline 的核心是一个**递归式任务执行循环**（Task Execution Loop）：

```
while (!this.abort) {
  // 1. 发起API请求，流式接收响应
  const stream = this.attemptApiRequest()

  // 2. 解析响应为内容块（text / tool_use）
  for await (const chunk of stream) {
    this.assistantMessageContent = parseAssistantMessage(chunk.text)
    await this.presentAssistantMessage()  // 实时推送到UI
  }

  // 3. 等待工具执行完成（含用户审批流程）
  await pWaitFor(() => this.userMessageContentReady)

  // 4. 递归继续，将工具结果反馈给LLM
  const recDidEndLoop = await this.recursivelyMakeClineRequests(
    this.userMessageContent
  )
}
```

关键设计：
- **流式处理**：响应以 chunk 为单位实时处理，使用锁机制（`presentAssistantMessageLocked`）防止竞态条件
- **递归调用**：`recursivelyMakeClineRequests` 实现了工具结果→LLM推理→新工具调用的循环
- **中断恢复**：任务可通过 `resumeTaskFromHistory` 从中断点恢复，自动处理被中断的工具调用
- **Checkpoint 机制**：每次工具执行后通过 Git commit 创建检查点，支持任意回滚

---

## 4. 工具系统

### 内置工具（ClineCore）

| 工具 | 类别 | 描述 |
|------|------|------|
| `bash` | 执行 | Shell命令执行，实时输出流 |
| `editor` | 代码操作 | 文件查看与编辑 |
| `read_files` | 代码操作 | 批量读取多个文件 |
| `apply_patch` | 代码操作 | 应用 unified diff 补丁 |
| `search` | 代码操作 | Ripgrep 驱动的代码搜索 |
| `fetch_web` | 外部检索 | HTTP请求 + HTML→Markdown |
| `ask_question` | 人机交互 | 向用户提问获取输入 |

### 工具执行流程

```
executeToolWithApproval(block) {
  // 1. 检查自动批准设置
  if (shouldAutoApproveTool(block.name)) → 直接执行
  // 2. 请求用户批准
  else → askApproval("tool", message)
  // 3. 执行工具
  const result = await executeTool(block)
  // 4. 保存检查点
  await saveCheckpoint()
  // 5. 返回结果给LLM
  return result
}
```

### 工具错误处理

Cline 实现了**渐进式错误恢复**策略：
- 第1次失败：提供通用建议
- 第2次失败：强烈建议替代方案（如用 `replace_in_file` 替代 `write_to_file`）
- 第3次失败：**强制切换策略**，禁止重试同一方法

对于 `write_to_file` 还有特殊的 Token 预算感知——当上下文窗口超过 50% 时，会警告剩余输出预算不足并建议分段写入。

---

## 5. 模式系统（Plan/Act）

Cline 实现了**双模式系统**，将规划与执行分离：

### Plan 模式
- 用途：信息收集、上下文构建、澄清问题、制定执行计划
- 专用工具：`plan_mode_respond`（对话式规划，不执行操作）
- 特点：只读不写，鼓励用户参与讨论

### Act 模式
- 用途：执行计划、修改文件、运行命令、实施解决方案
- 可用工具：除 `plan_mode_respond` 外的所有工具
- 特点：聚焦实现，每次操作需用户批准

### 模式切换流程
1. 保存当前模型配置到模式特定状态
2. 恢复另一模式的模型配置
3. 更新 Task 实例的模式
4. 通知 Webview 状态变更
5. 捕获遥测事件

**关键特性**：Plan 和 Act 模式可以配置使用**不同的LLM模型**——例如用 Claude 3.5 Sonnet 做规划，用 GPT-4o 做执行。

---

## 6. LLM 适配

Cline 通过**模块化 API Provider 系统**支持多种LLM：

### Provider 架构
```
src/api/providers/     → Provider特定实现
src/api/transform/     → 流转换工具
API Configuration      → 用户设置
API Factory            → 创建适当Handler的工厂函数
```

### 支持的 Provider
- **Anthropic**：Claude 系列直接集成
- **OpenRouter**：多模型元Provider
- **AWS Bedrock**：Amazon AI服务
- **Gemini**：Google AI模型
- **Ollama**：本地模型托管
- **LM Studio**：本地模型托管
- **VSCode LM**：VS Code 内置语言模型

### Token 管理
- 每请求 Token 计数
- 累计使用量追踪
- 成本计算
- 缓存命中监控
- 自动重试失败请求（OpenRouter 特殊处理）

---

## 7. 安全控制

Cline 的安全模型是其核心设计哲学：

### 多层审批机制
1. **工具级审批**：每个工具可独立配置审批策略
2. **自动批准规则**：低风险工具（read/search）可自动批准；高风险工具（bash/write）默认需审批
3. **连续自动批准计数**：`consecutiveAutoApprovedRequestsCount` 追踪连续自动批准次数
4. **用户拒绝处理**：`didRejectTool` 标记 + 拒绝原因反馈给LLM

### 文件访问控制
- **`.clineignore`**：用户指定 Cline 不应访问的文件/目录
- **LOCK_TEXT_SYMBOL**：锁定文件保护
- 访问被阻止的文件时返回 `clineIgnoreError`，引导LLM绕过

### 命令权限控制
- **CLINE_COMMAND_PERMISSIONS**：细粒度命令执行权限
- 权限被拒绝时返回 `permissionDeniedError`

### MCP 工具安全
- MCP 工具可配置自动批准/手动批准
- 每个 MCP 服务器独立的安全策略

---

## 8. MCP 集成

Cline 深度集成了 **Model Context Protocol (MCP)**：

### McpHub 架构
- **McpHub 类**：`src/services/mcp/McpHub.ts`，中央管理器
- 管理 MCP 服务器连接的完整生命周期
- 支持两种传输协议：**Stdio**（命令行）和 **SSE**（HTTP Server-Sent Events）

### MCP 功能
- 服务器发现与连接
- 健康监控与自动重连
- 工具和资源注册
- 自动批准规则配置
- 超时管理

### MCP Marketplace
- 在线 MCP 服务器目录
- 一键安装
- README 预览
- 服务器状态监控

### 配置方式
MCP 服务器配置存储在 `.cline/mcp.json` 中，与内置工具统一加载，用户可在同一任务中混合使用本地工具和外部 MCP 集成。

---

## 9. 上下文管理

### ContextManager 系统

Cline 实现了**模型感知的上下文窗口管理**：

| 模型 | 上下文窗口 | 保留缓冲区 |
|------|-----------|-----------|
| DeepSeek | 64K | 27K |
| 大多数模型 | 128K | ~35K |
| Claude | 200K | 40K |

### 截断策略
- **主动截断**：监控 Token 使用量，接近限制时预防性截断
- **智能保留**：始终保留原始任务消息，维护用户-助手对话结构
- **自适应策略**：中等压力→删除一半对话；严重压力→删除四分之三

### 上下文压缩
- `contextTruncationNotice`：通知LLM历史对话已被压缩
- `condense`：生成对话摘要后继续，LLM 被指示只询问下一步
- `duplicateFileReadNotice`：移除重复的文件读取以节省空间
- `processFirstUserMessageForTruncation`：截断后的继续提示

### 错误恢复
- 检测不同 Provider 的上下文窗口溢出错误
- 自动重试 + 更激进的截断
- 用户提示重试作为最终兜底

---

## 10. 扩展机制

### Plugin 系统（SDK）
```typescript
import { Agent, createTool } from "@cline/sdk"

const deployTool = createTool({
  name: "deploy",
  description: "Deploy the current branch to staging.",
  inputSchema: { type: "object", properties: { env: { type: "string" } } },
  execute: async (input) => { /* 部署逻辑 */ },
})

const agent = new Agent({ tools: [deployTool] })
```

### Skills 系统
- `.clinerules` 文件定义项目特定规则（编码标准、架构约定、部署流程等）
- Skills 让模型在需要时加载特定规则
- CLI、VS Code 扩展、JetBrains 插件自动识别

### Multi-Agent Teams
- 协调多个Agent协作处理复杂任务
- 协调器Agent分解任务，委派给专家Agent
- 团队状态跨会话持久化
```bash
cline --team-name auth-sprint "Plan and implement user authentication with tests"
```

### Scheduled Agents
- Cron 调度的自动化Agent
- 定时 PR 摘要、依赖检查、代码库健康报告
- 调度跨重启持久化
```bash
cline schedule create "PR summary" --cron "0 9 * * MON-FRI" \
  --prompt "List all open PRs and their review status"
```

### 消息平台集成
- Telegram、Slack、Discord、Google Chat、WhatsApp、Linear
- 每个对话线程映射到一个Agent会话
- 访问控制限制交互权限

### Browser 自动化
- Puppeteer 驱动，固定 900×600 分辨率
- 坐标点击、键盘输入、截图捕获
- 单实例生命周期管理，任务完成自动清理

---

## 总结

Cline 的架构设计体现了几个核心理念：

1. **Human-in-the-loop 优先**：安全审批机制贯穿始终，不追求完全自动化
2. **模块化 Provider 系统**：支持 10+ LLM Provider，Plan/Act 可用不同模型
3. **三层分离**：Webview/Controller/Task 职责清晰，状态管理集中
4. **MCP 原生集成**：标准化的工具扩展协议，社区生态
5. **渐进式错误恢复**：工具执行失败有 3 级升级策略
6. **Git-based Checkpoint**：每次操作可回滚，任务可中断恢复
7. **多形态统一**：同一核心引擎驱动 IDE 扩展、CLI、桌面应用、SDK

这种架构使 Cline 成为目前最成熟、最可扩展的开源编码Agent之一，其 SDK 设计更是为构建自定义Agent应用提供了标准化基础。
