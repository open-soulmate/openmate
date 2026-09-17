# 65. Nanobot 架构深度分析

> **项目地址**: https://github.com/HKUDS/nanobot
> **Stars**: 48,048 | **Forks**: 8,496 | **License**: MIT
> **定位**: 超轻量级、开源、自托管的个人 AI Agent 框架（Python）
> **核心能力**: WebUI、工具系统、记忆管理、MCP 协议、多 Agent 工作流、自动化调度、聊天应用

---

## 一、整体架构设计

Nanobot 采用**消息驱动的分层架构**，核心数据流如下：

```
Channel (CLI/WebUI/Chat Apps)
  → MessageBus (InboundMessage)
    → AgentLoop (session, workspace, context)
      → AgentRunner (provider/tool loop)
        → Provider (LLM Backend)
          → AgentRunner (tool execution + feedback)
```

这种设计将**通道层**、**编排层**、**执行层**、**模型层**清晰分离。Channel 负责外部平台的消息转换，MessageBus 负责事件分发，AgentLoop 负责会话级编排，AgentRunner 负责模型调用和工具循环。每一层都可以独立替换和扩展，体现了**单一职责原则**。

与 Hermes Agent 的集中式架构不同，Nanobot 更强调**轻量级和模块化**——整个框架可以作为 Python 包安装（`pip install nanobot-ai`），无需复杂的基础设施依赖。

---

## 二、Agent Loop vs Agent Runner 的职责分离

这是 Nanobot 架构中最精妙的设计之一。两个核心组件各司其职：

**AgentLoop**（`nanobot/agent/loop.py`）负责**通道侧的轮次管理**：
- 接收入站消息
- 确定有效的会话和工作区范围
- 构建上下文（Context Building）
- 连接钩子、进度通知和通道元数据
- 发布出站消息

**AgentRunner**（`nanobot/agent/runner.py`）负责**模型侧的对话循环**：
- 向选定的 Provider 发送消息
- 处理流式增量（streaming deltas）和推理块（reasoning blocks）
- 执行工具调用
- 将工具结果反馈给模型
- 当产生最终答案或达到运行时限制时停止

这种分离使得调试路径非常清晰：如果问题涉及**通道路由、会话密钥、工作区选择或出站投递**，从 `loop.py` 开始排查；如果涉及**Provider 调用、工具调用、流式传输或迭代限制**，从 `runner.py` 开始排查。

---

## 三、Provider 系统

Provider 的元数据集中在 `nanobot/providers/registry.py`，配置字段定义在 `nanobot/config/schema.py`。

**Provider 选择策略**（按优先级）：
1. 显式配置的 `agents.defaults.provider` 或预设 Provider
2. Provider 注册表关键词匹配
3. API 密钥前缀和 API Base URL 提示
4. 配置了 `apiBase` 时的本地 Provider 回退
5. 可路由多种模型族的 Gateway 回退

**实现层次**：
- 大多数托管 Provider 使用**通用的 OpenAI 兼容实现**
- Anthropic、Azure OpenAI、AWS Bedrock、OpenAI Codex、GitHub Copilot 有**专用实现路径**

特别值得注意的是 **Model Fallback 机制**：支持超时、连接错误、5xx 服务器错误、429 速率限制、过载、认证/权限失败、配额/余额耗尽等场景的自动切换。不适用于格式错误的请求、内容过滤/拒绝或上下文长度/消息格式错误。

**Model Presets** 系统允许用户定义可复用的模型配置组合，并支持 OAuth Provider（如 GitHub Copilot）的无密钥登录流程。

---

## 四、通道（Channel）系统

通道是 Nanobot 与外部世界交互的桥梁，负责将外部平台的消息转换为 `InboundMessage` 事件，并将 `OutboundMessage` 事件发回平台。

**架构设计**：
- **基类合约**: `nanobot/channels/base.py` 定义了通道的标准接口
- **通道包**: `nanobot/channels/<channel>/` 每个通道一个独立包
- **发现与生命周期**: `nanobot/channels/manager.py` 负责通道的自动发现和管理
- **WebSocket/WebUI**: `nanobot/channels/websocket/` 实现浏览器端实时通信

通道通过**扫描 `nanobot/channels/` 下的自包含包**来自动发现，新增通道只需贡献一个遵循 `channel-package-guide.md` 规范的包。这种**插件式发现机制**使得扩展非常便捷。

---

## 五、工具系统

工具是 Agent 与外部世界交互的能力接口。Nanobot 的工具系统覆盖了广泛的场景：

| 工具类别 | 源文件 | 功能 |
|---------|--------|------|
| Shell 执行 | `nanobot/agent/tools/shell.py` | 命令行执行 |
| 文件系统 | `nanobot/agent/tools/filesystem.py` | 文件读写操作 |
| Web 搜索/抓取 | `nanobot/agent/tools/web.py` | 网络搜索和页面获取 |
| MCP 工具 | `nanobot/agent/tools/mcp.py` | MCP 协议工具集成 |
| 定时任务 | `nanobot/agent/tools/cron.py` | Cron 调度 |
| 图像生成 | `nanobot/agent/tools/image_generation.py` | AI 图像生成 |
| 运行时自检 | `nanobot/agent/tools/self.py` | Agent 自我检查 |

**工具基类与模式**: `nanobot/agent/tools/base.py` 和 `nanobot/agent/tools/schema.py` 定义了工具的标准接口和 JSON Schema。

**关键设计原则**: 工具行为是模型合约的一部分。用户可见的工具名称、Schema 和错误消息必须保持稳定，除非变更是有意为之。这保证了模型和工具之间的可靠交互。

工具从两个来源发现：`nanobot/agent/tools/` 目录和**插件入口点（plugin entry points）**，支持内置工具和第三方扩展的统一管理。

---

## 六、记忆与会话系统

Nanobot 将**会话历史**和**长期记忆**做了明确区分：

**会话历史（Session History）**: 存储在 `<config-dir>/sessions/<workspace-id>/` 下的 JSONL 文件中，是近期对话的回放记录。支持**会话压缩（Compaction）**机制，在 `session/manager.py` 中实现，避免上下文窗口溢出。

**长期记忆（Long-term Memory）**: 存储在 `<workspace>/memory/MEMORY.md`，是工作区级别的持久化状态。**Dream 机制**（`nanobot/agent/memory.py`）是 Nanobot 最具特色的记忆管理功能——它在后台自动整合和压缩历史信息，模拟人类睡眠时的记忆巩固过程。

**引导身份文件**:
- `<workspace>/SOUL.md` — Agent 的人格和行为定义
- `<workspace>/USER.md` — 用户偏好和信息
- `nanobot/templates/` 下的模板文件

**Heartbeat 机制**: 读取 `<workspace>/HEARTBEAT.md`，如果文件中有 `## Active Tasks`，Nanobot 会自动执行这些任务，并仅将有用/可操作的结果发送到最近活跃的聊天目标。例行的"无变化"结果会被静默抑制。

---

## 七、WebUI 与 Gateway

`nanobot gateway` 命令启动完整的网关服务，包括：
- 已启用的聊天通道
- WebSocket 通道（当配置时）
- 工作区级别的 Cron 服务
- 系统任务（如 Dream 和 Heartbeat）
- 健康检查端点

**服务端点**：
| 接口 | 默认地址 |
|------|---------|
| 健康检查 | `http://127.0.0.1:18790/health` |
| WebUI/WebSocket | `http://127.0.0.1:8765` |

WebUI 源码位于 `webui/` 目录，使用 Bun 构建（`webui/`），生产构建输出到 `nanobot/web/dist/` 并打包到 wheel 中。WebUI 支持：
- 多项目、多工作区管理
- 文档和图片附件
- MCP 服务器连接和工具管理
- Skills 管理和 Agent 插件配置
- 定时任务调度

---

## 八、安全边界

Nanobot 在多个层面建立了安全边界：

| 安全边界 | 源文件 | 功能 |
|---------|--------|------|
| 工作区范围 | `nanobot/security/workspace_access.py`, `workspace_policy.py` | 文件访问范围控制 |
| Shell 沙箱 | `nanobot/agent/tools/shell.py` | 命令执行隔离 |
| SSRF/网络检查 | `nanobot/security/network.py`, `web.py` | 防止服务端请求伪造 |
| PTH 防护 | `nanobot/security/` | 路径遍历攻击防护 |
| 通道访问控制 | `nanobot/channels/*.py` 配置 | 通道级权限控制 |

**工作区访问模式**区分了三个层次的路径所有权：
- **Agent 配置工作区**: 拥有会话命名空间、SOUL.md、USER.md、记忆和自定义 Skills
- **有效项目工作区**: 拥有项目 AGENTS.md、相对工具路径和 Shell 工作目录
- **会话工作区范围**: 拥有工作区访问模式和项目元数据

`ContextBuilder` 将项目指令与 Agent 自有的 Profile 和记忆组合，同时保持跨根能力的**只读性和显式性**——不会将整个 Agent 工作区视为允许的根目录。

---

## 九、扩展点体系

Nanobot 提供了**7 个维度的扩展点**：

1. **Provider 扩展**: 在 `providers/registry.py` 添加 `ProviderSpec`，在 `config/schema.py` 添加配置字段
2. **Channel 扩展**: 导出 `ChannelPlugin` 描述符，遵循 `channel-package-guide.md`
3. **工具扩展**: 在 `agent/tools/` 下实现工具，或通过插件入口点暴露
4. **Agent 插件**: 在 `<workspace>/plugins/` 下添加 v1 包，从 Apps 启用
5. **MCP 集成**: 配置 `tools.mcpServers` 或在 Agent 插件中捆绑服务器
6. **Skill 扩展**: 在 `<workspace>/skills/` 下添加工作区 Skills，或在 Agent 插件中捆绑
7. **CLI App**: 添加到 CLI Apps 目录，安装器管理其可执行文件生命周期

**MCP（Model Context Protocol）集成**是 Nanobot 的重要扩展机制。MCP 连接是应用级基础设施——组合根创建 `MCPProvider`，将其 `ToolRegistry` 共享给 `AgentLoop`，在使用前确保 `connect()` 完成，并在关闭时保证 `aclose()`。这种**生命周期管理的显式所有权**避免了资源泄漏。

---

## 十、部署与配置模型

**安装方式**:
- `pip install nanobot-ai` — 从 PyPI 安装预编译包
- 源码安装 — 需要 Python 3.11+、Git 和 Bun
- Docker 部署 — 提供 `Dockerfile`
- 一键部署 — 支持 Render 的 Blueprint 部署

**配置路径**:
| 路径 | 默认位置 |
|------|---------|
| 配置文件 | `~/.nanobot/config.json` |
| 工作区 | `~/.nanobot/workspace/` |
| 会话 | `<config-dir>/sessions/<workspace-id>/*.jsonl` |
| 记忆 | `<workspace>/memory/` |
| Cron 存储 | `<workspace>/cron/jobs.json` |

配置 Schema 同时接受 **camelCase 和 snake_case** 键名，但保存时使用 camelCase 别名。支持环境变量引用（如 `${GITHUB_TOKEN}`），并兼容 1Password、pass、Bitwarden 等密钥管理工具的启动加载。

**Web 工具**默认使用 AnySearch（无需密钥的匿名配额）进行搜索，使用 Jina Reader 将网页转换为 Markdown 格式，本地回退基于 `readability-lxml`。

---

## 总结

Nanobot 作为一个**48K+ Stars** 的 AI Agent 框架，其架构设计体现了以下核心理念：

1. **轻量级优先**: 整个框架可作为 Python 包安装，无需复杂基础设施
2. **职责清晰**: AgentLoop/AgentRunner 的分离是架构的精华
3. **插件化扩展**: 7 个维度的扩展点覆盖了所有常见的定制需求
4. **安全内建**: 多层安全边界从工作区隔离到 Shell 沙箱
5. **记忆管理创新**: Dream 机制模拟人类记忆巩固，Heartbeat 实现后台自动执行
6. **MCP 原生支持**: 将 MCP 作为一等公民集成，但保持生命周期的显式管理

与 Hermes Agent 相比，Nanobot 更偏向**个人自托管场景**，强调轻量和简洁；而 Hermes 更偏向**企业级多 Agent 协作**，强调网关化和插件生态。两者在工具系统、MCP 集成和记忆管理上有许多共通之处，可以相互借鉴。
