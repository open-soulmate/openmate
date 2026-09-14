# 56 - Roo Code 架构分析

> **项目**: Roo Code (prev. Roo Cline)  
> **仓库**: [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) (原 RooVetGit/Roo-Code)  
> **许可**: Apache 2.0 © 2026 Roo Code, Inc  
> **状态**: 已于 2026 年 5 月 15 日关闭，仓库归档只读。社区分支 [ZooCode](https://github.com/Zoo-Code-Org/Zoo-Code/) 延续开发  
> **定位**: VS Code 扩展形式的 AI 自主编码代理，提供"编辑器中的 AI 开发团队"

---

## 1. 整体架构概览

Roo Code 采用 **VS Code Extension + WebView UI** 的经典双进程架构，是一个运行在编辑器中的 AI 自主编码代理。其核心是一个 **Task 循环引擎**——用户发起任务后，系统通过 LLM 驱动的 ReAct 循环（推理→工具调用→观察→推理）自主完成编码工作。

项目使用 **pnpm monorepo + Turborepo** 管理，包含以下主要包：

```
packages/
├── build/          # 构建配置
├── config-eslint/  # ESLint 共享配置
├── config-typescript/ # TypeScript 共享配置
├── core/           # 核心逻辑库
├── ipc/            # 进程间通信
├── types/          # 共享类型定义 (@roo-code/types)
└── vscode-shim/    # VS Code API 兼容层
```

主应用源码位于 `src/`，分为 `core/`（核心引擎）、`api/`（LLM 提供商适配）、`services/`（基础设施服务）、`integrations/`（编辑器集成）、`shared/`（共享工具函数）等模块。

---

## 2. 核心引擎：Task 循环

`src/core/task/Task.ts` 是整个系统的中枢，约 2000+ 行，管理一次完整的 AI 编码会话。Task 类的关键职责：

- **ReAct 循环驱动**：接收用户消息 → 构建系统提示 → 调用 LLM → 解析工具调用 → 执行工具 → 将结果回传 LLM → 循环直到任务完成
- **消息管理**：通过 `MessageManager` 维护 API 消息历史，支持消息合并（`mergeConsecutiveApiMessages`）、工具结果 ID 校验（`validateAndFixToolResultIds`）
- **错误恢复**：指数退避重试（最大 10 分钟）、连续错误计数（`consecutiveMistakeLimit`，默认限制）、上下文窗口溢出自动裁剪（保留 75%，最多重试 3 次）
- **子任务支持**：支持 `rootTask` / `parentTask` 层级关系，可委派子任务
- **检查点系统**：集成 `RepoPerTaskCheckpointService`，支持任务级别的 git 检查点保存与恢复

Task 的生命周期由 `ClineProvider`（WebView 提供者）管理，通过 `TaskProviderEvents` 事件总线与 UI 层通信。

---

## 3. 多模式系统 (Modes)

Roo Code 最显著的架构特征是 **可配置的多模式系统**。内置 5 种模式：

| 模式 | 用途 | 工具组 |
|------|------|--------|
| **Code** | 日常编码、文件编辑 | 完整工具集 |
| **Architect** | 系统规划、技术设计 | 只读工具 + 规划工具 |
| **Ask** | 问答、文档查询 | 只读工具 |
| **Debug** | 问题诊断、日志追踪 | 完整工具集 + 调试工具 |
| **Custom** | 用户自定义角色 | 可配置工具组 |

模式通过 `src/shared/modes.ts` 定义，每个模式包含：
- `slug`：唯一标识
- `roleDefinition`：角色定义（注入系统提示）
- `customInstructions`：模式专属指令
- `groups`：工具组权限列表（`ToolGroup` 数组）

**自定义模式** 是 Roo Code 的核心差异化能力——用户可以创建无限数量的专业化角色（安全审计、性能优化、文档工程师等），每个角色有独立的工具权限和系统提示。`CustomModesManager` 负责持久化管理自定义模式配置。

模式切换通过 `SwitchModeTool` 实现，Agent 可以在运行时自主切换模式。

---

## 4. 工具系统架构

工具系统采用 **BaseTool 抽象基类 + 具体工具实现** 的模式。核心工具位于 `src/core/tools/`：

**文件操作类**：
- `WriteToFileTool`：写入文件（含 diff 预览、写保护检查、rooIgnore 验证）
- `SearchFilesTool`：搜索文件内容
- `SearchAndReplaceTool` / `SearchReplaceTool`：搜索替换编辑

**执行类**：
- `RunSlashCommandTool`：执行斜杠命令
- `UseMcpToolTool`：调用 MCP 外部工具
- `accessMcpResourceTool`：访问 MCP 资源

**辅助类**：
- `SwitchModeTool`：模式切换
- `SkillTool`：技能系统
- `UpdateTodoListTool`：待办列表管理
- `ToolRepetitionDetector`：工具调用重复检测（防止无限循环）

每个工具通过 `BaseTool<T>` 泛型基类统一接口，执行流程：
1. 部分消息处理（partial message handling）
2. 参数解析（nativeArgs）
3. 核心执行（execute 方法）
4. 结果推送（pushToolResult）

工具权限通过 **ToolGroup** 机制控制，不同模式拥有不同的工具组权限。`ALWAYS_AVAILABLE_TOOLS` 定义了始终可用的基础工具。

---

## 5. LLM 提供商适配层

`src/api/` 实现了统一的 `ApiHandler` 接口，适配 25+ 种 LLM 提供商：

**主要提供商**：
- **Anthropic**：`AnthropicHandler`（Claude 系列）
- **OpenAI**：`OpenAiHandler`、`OpenAiCodexHandler`、`OpenAiNativeHandler`
- **Google**：`GeminiHandler`、`VertexHandler`、`AnthropicVertexHandler`
- **AWS**：`AwsBedrockHandler`
- **DeepSeek**：`DeepSeekHandler`
- **Moonshot**：`MoonshotHandler`
- **Mistral**：`MistralHandler`
- **xAI**：`XAIHandler`（Grok）
- **MiniMax**：`MiniMaxHandler`

**代理/聚合类**：
- `OpenRouterHandler`：OpenRouter 聚合
- `RequestyHandler`：Requesty 路由
- `LiteLLMHandler`：LiteLLM 统一接口
- `PoeHandler`：Poe 平台

**特殊类**：
- `VsCodeLmHandler`：VS Code 内置语言模型
- `NativeOllamaHandler`：本地 Ollama 模型
- `FakeAIHandler`：测试用模拟

统一接口 `ApiHandler` 定义：
```typescript
interface ApiHandler {
  createMessage(systemPrompt, messages, metadata?): ApiStream
  getModel(): { id: string; info: ModelInfo }
  countTokens(content): Promise<number>
}
```

`buildApiHandler` 工厂函数根据配置动态创建对应的处理器实例。提供商支持 **原生工具调用（Native Tool Calling）** 和流式响应（`ApiStream`）。

---

## 6. 上下文管理与压缩

上下文管理是 Roo Code 的关键工程挑战，涉及多个子系统：

**上下文窗口监控**（`src/core/context-management/`）：
- 实时跟踪 token 使用量
- 检测上下文窗口溢出错误（`checkContextWindowExceededError`）
- 触发自动裁剪（保留 75% 上下文）

**对话压缩**（`src/core/condense/`）：
- `summarizeConversation`：将历史对话压缩为摘要
- `getMessagesSinceLastSummary`：提取自上次摘要以来的消息
- `transformMessagesForCondensing`：将工具调用块转换为文本表示（避免 Bedrock 等提供商的 tools 参数限制）
- 可配置压缩阈值（`MIN_CONDENSE_THRESHOLD` 5% ~ `MAX_CONDENSE_THRESHOLD` 100%）

**文件上下文追踪**（`src/core/context-tracking/`）：
- `FileContextTracker`：追踪哪些文件被读取/修改
- 记录来源（`RecordSource`）

**提及系统**（`src/core/mentions/`）：
- `processUserContentMentions`：处理用户消息中的 @提及
- 支持文件、代码片段的上下文注入

---

## 7. MCP 集成架构

Roo Code 深度集成 **Model Context Protocol (MCP)**，通过 `src/services/mcp/McpHub.ts` 实现：

**连接管理**：
- 支持三种传输协议：`stdio`、`SSE`、`StreamableHTTP`
- 使用 `@modelcontextprotocol/sdk` 官方 SDK
- `McpConnection` 判别联合类型（connected/disconnected）
- 支持 `watchPaths` 文件监听自动重启

**配置验证**：
- Zod schema 验证（`BaseConfigSchema`）
- 每服务器可配置：`disabled`、`timeout`（1-3600s）、`alwaysAllow`、`disabledTools`

**工具/资源管理**：
- `ListToolsResultSchema`：列出 MCP 工具
- `CallToolResultSchema`：调用 MCP 工具
- `ListResourcesResultSchema` / `ReadResourceResultSchema`：资源访问
- `MAX_MCP_TOOLS_THRESHOLD`：MCP 工具数量上限保护

**自动审批**（`src/core/auto-approval/`）：
- `AutoApprovalHandler`：自动审批处理器
- 分层审批：`tools.ts`（工具级）、`commands.ts`（命令级）、`mcp.ts`（MCP 级）
- `checkAutoApproval`：检查是否需要用户确认

---

## 8. 安全与权限控制

Roo Code 实现了多层安全机制：

**文件访问控制**：
- `RooIgnoreController`（`src/core/ignore/`）：基于 `.rooignore` 文件的访问控制，类似 `.gitignore` 语法
- `RooProtectedController`（`src/core/protect/`）：写保护机制，防止 Agent 修改关键文件

**工具调用安全**：
- `validateToolUse`：工具调用合法性验证
- `ToolRepetitionDetector`：检测并阻止工具调用循环
- 连续错误限制（`consecutiveMistakeLimit`，默认值 `DEFAULT_CONSECUTIVE_MISTAKE_LIMIT`）
- MCP 工具数量阈值保护

**自动审批策略**：
- 工具级白名单（`alwaysAllow`）
- 命令级正则匹配
- MCP 工具级配置
- 工作区外路径检测（`isPathOutsideWorkspace`）

---

## 9. WebView UI 与通信

`ClineProvider`（`src/core/webview/ClineProvider.ts`）是 VS Code WebView 的提供者，也是整个扩展的"外壳"：

**职责**：
- 管理 WebView 生命周期（创建、销毁、恢复）
- 状态管理（`GlobalState`、`ProviderSettings`）
- Task 创建与调度
- 消息路由（`webviewMessageHandler`）
- 主题集成（`getTheme`）
- TTS 集成

**通信机制**：
- Extension → WebView：`ExtensionMessage`（状态推送、UI 更新）
- WebView → Extension：`WebviewMessage`（用户操作、配置变更）
- 事件总线：`RooCodeEventName` 枚举定义事件类型

**配置管理**：
- `ContextProxy`：全局状态代理
- `ProviderSettingsManager`：提供商配置管理
- `CustomModesManager`：自定义模式管理

---

## 10. 服务层与基础设施

`src/services/` 提供底层基础设施：

| 服务 | 路径 | 职责 |
|------|------|------|
| **Checkpoints** | `services/checkpoints/` | Git 检查点保存/恢复/差异比较 |
| **Code Index** | `services/code-index/` | 代码索引（语义搜索） |
| **Command** | `services/command/` | 命令执行服务 |
| **Glob** | `services/glob/` | 文件模式匹配 |
| **MCP** | `services/mcp/` | Model Context Protocol 集成 |
| **Ripgrep** | `services/ripgrep/` | 高性能文本搜索 |
| **Roo Config** | `services/roo-config/` | 配置管理 |
| **Search** | `services/search/` | 搜索服务 |
| **Skills** | `services/skills/` | 技能系统 |
| **Tree-sitter** | `services/tree-sitter/` | AST 解析（代码理解） |

其中 **Code Index** 和 **Tree-sitter** 是 Roo Code 实现代码语义理解的关键——前者提供向量索引和语义搜索，后者提供语法级的代码结构分析。

**检查点系统** 特别值得注意：
- `ShadowCheckpointService`：影子检查点，后台自动保存
- `RepoPerTaskCheckpointService`：每个 Task 独立的检查点空间
- 支持 `checkpointSave`、`checkpointRestore`、`checkpointDiff` 操作
- 可配置超时（`MIN_CHECKPOINT_TIMEOUT_SECONDS` ~ `MAX_CHECKPOINT_TIMEOUT_SECONDS`）

---

## 架构评价

**优势**：
1. **模式系统设计精妙**：通过可配置的角色+工具组实现了一种轻量级的"多 Agent"架构，无需真正的多进程
2. **提供商适配层抽象良好**：统一的 `ApiHandler` 接口使得 25+ 提供商的切换对上层透明
3. **上下文管理工程扎实**：压缩、裁剪、追踪三层机制确保长对话的可持续性
4. **MCP 集成深度**：不只是工具调用，还包括资源访问、配置管理、自动重启
5. **安全模型完善**：ignore/protect/auto-approval 三层防护

**局限**：
1. **Task 类过于庞大**：2000+ 行的 God Object，职责过多（消息管理、工具执行、错误处理、检查点、上下文管理全在一个类中）
2. **单会话限制**：虽然是"开发团队"的定位，但实际是单 Task 串行执行，子任务支持有限
3. **已停止维护**：2026 年 5 月关闭，技术债务和安全问题不再修复
4. **WebView 通信开销**：Extension ↔ WebView 的序列化通信在高频交互场景下可能成为瓶颈

**对 OpenMate 的启示**：
- 模式系统（Modes）的设计思路值得借鉴——用配置驱动的"人格"切换替代硬编码的多 Agent
- 上下文压缩（condense）的实现策略可以复用——特别是工具调用块到文本的转换
- MCP 集成的深度和广度是 Agent 系统的标杆
- Task 类的教训提醒我们需要更早进行职责拆分
