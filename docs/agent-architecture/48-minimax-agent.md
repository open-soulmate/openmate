# MiniMax Mini-Agent 架构深度分析

> 项目地址：https://github.com/MiniMax-AI/Mini-Agent
> Stars: 3,017 | Forks: 442 | License: MIT
> 语言：Python | 包管理：uv | 最低 Python：3.10+

## 一、项目定位与设计哲学

Mini-Agent 是 MiniMax 官方推出的**极简但专业的单 Agent 演示项目**，旨在展示使用 MiniMax M2.5 模型构建 Agent 的最佳实践。其核心设计理念是"最小可行但生产级"——用最少的代码量（核心模块约 15 个文件）实现一个完整的 Agent 执行循环，同时保持架构的可扩展性。

项目采用 **Anthropic 兼容 API**，完全支持交错思维（Interleaved Thinking），能够解锁 M2 模型在处理长、复杂任务时的推理能力。这不是一个玩具项目，而是一个经过精心设计的参考实现，适合作为构建更高级 Agent 的起点。

## 二、整体架构：分层解耦

项目采用清晰的四层架构：

```
┌─────────────────────────────────────┐
│          CLI 层 (cli.py)            │  ← 用户交互、命令解析、终端 UI
├─────────────────────────────────────┤
│        Agent 层 (agent.py)          │  ← 核心执行循环、上下文管理
├─────────────────────────────────────┤
│   LLM 层 (llm/) + 工具层 (tools/)   │  ← 模型调用抽象 + 工具注册/执行
├─────────────────────────────────────┤
│   基础设施层 (config, schema, retry) │  ← 配置、数据模型、重试机制
└─────────────────────────────────────┘
```

目录结构：

```
mini_agent/
├── agent.py             # 核心 Agent 循环
├── cli.py               # 命令行交互界面
├── config.py            # 配置管理（Pydantic 模型）
├── logger.py            # 请求/响应日志记录
├── retry.py             # 通用异步重试装饰器
├── llm/                 # LLM 客户端抽象层
│   ├── base.py          # 抽象基类 LLMClientBase
│   ├── llm_wrapper.py   # 统一包装器 LLMClient
│   ├── anthropic_client.py  # Anthropic API 实现
│   └── openai_client.py     # OpenAI API 实现
├── schema/              # 数据模型定义
│   └── schema.py        # Message, LLMResponse, ToolCall 等
├── tools/               # 工具系统
│   ├── base.py          # Tool 基类 + ToolResult
│   ├── file_tools.py    # ReadTool, WriteTool, EditTool
│   ├── bash_tool.py     # BashTool, BashOutputTool, BashKillTool
│   ├── note_tool.py     # SessionNoteTool（持久化记忆）
│   ├── mcp_loader.py    # MCP 协议工具加载器
│   ├── skill_loader.py  # Claude Skills 加载器
│   └── skill_tool.py    # Skills 工具接口
├── acp/                 # Agent Communication Protocol 服务器
│   └── server.py        # ACP 入口（Zed 编辑器集成）
├── skills/              # Claude Skills（git submodule）
└── utils/               # 工具函数
```

## 三、核心执行循环（Agent 层）

`Agent` 类是整个系统的心脏，实现了经典的 **ReAct 循环**（Reasoning + Acting）：

1. **消息管理**：维护 `messages: list[Message]` 作为对话历史，首条消息为 system prompt
2. **LLM 调用**：将消息历史和工具 schema 发送给 LLM，获取响应
3. **工具执行**：解析 LLM 响应中的 `tool_calls`，逐个执行并收集结果
4. **结果反馈**：将工具执行结果作为新消息追加到历史，回到步骤 2
5. **终止条件**：达到 `max_steps` 上限、LLM 返回 `end_turn`、或用户取消

关键设计细节：

- **取消机制**：通过 `asyncio.Event` 实现的 `cancel_event`，允许外部（如 Esc 键）中断执行
- **不完整消息清理**：取消时通过 `_cleanup_incomplete_messages()` 清理当前步骤的半成品消息，保证消息历史一致性
- **Token 计数**：使用 `tiktoken` 的 `cl100k_base` 编码器精确估算 token 数
- **自动摘要**：当 token 数超过 `token_limit`（默认 80000）时，自动触发对话历史摘要，支持无限长任务

## 四、LLM 客户端抽象（策略模式）

LLM 层采用经典的**策略模式 + 工厂模式**：

- `LLMClientBase`（抽象基类）定义了 `generate()` 和 `_prepare_request()` 接口
- `AnthropicClient` 和 `OpenAIClient` 分别实现两个主流 API 协议
- `LLMClient`（包装器）根据 `provider` 参数自动选择底层实现

智能 API 路径处理：

```python
# MiniMax 域名自动追加后缀
if "api.minimax.io" in api_base or "api.minimaxi.com" in api_base:
    if provider == "anthropic":
        api_base += "/anthropic"
    elif provider == "openai":
        api_base += "/v1"
# 第三方 API（如 SiliconFlow）保持原样
```

这种设计使得同一套代码可以无缝切换 MiniMax 原生 API、第三方代理、甚至其他兼容 API（如 OpenRouter）。

## 五、工具系统设计

### 5.1 工具基类

`Tool` 基类定义了统一接口：

```python
class Tool:
    name: str           # 工具名称
    description: str    # LLM 可理解的描述
    parameters: dict    # JSON Schema 格式的参数定义
    async def execute(**kwargs) -> ToolResult  # 异步执行
    def to_schema() -> dict     # Anthropic 格式
    def to_openai_schema() -> dict  # OpenAI 格式
```

关键点：工具同时支持 Anthropic 和 OpenAI 两种 schema 格式，与 LLM 层的双协议支持形成对称设计。

### 5.2 内置工具集

| 工具 | 功能 | 特色 |
|------|------|------|
| ReadTool | 文件读取 | 支持 offset/limit 分页、行号输出 |
| WriteTool | 文件写入 | 工作区相对路径解析 |
| EditTool | 文件编辑 | 搜索替换模式 |
| BashTool | Shell 命令执行 | 支持前台/后台进程管理 |
| BashOutputTool | 读取后台进程输出 | 正则过滤、增量读取 |
| BashKillTool | 终止后台进程 | - |
| SessionNoteTool | 持久化记忆 | JSON 文件存储、懒加载 |

### 5.3 MCP 工具集成

`MCPTool` 包装器实现了 MCP（Model Context Protocol）标准：

- 支持三种传输方式：`stdio`、`sse`、`streamable_http`
- 可配置的超时体系：连接超时（10s）、执行超时（60s）、SSE 读取超时（120s）
- 自动将 MCP 工具结果转换为 `ToolResult`
- 通过 `mcp.json` 配置文件声明式管理 MCP Server

### 5.4 Claude Skills 系统

通过 `SkillLoader` 实现了 **Progressive Disclosure**（渐进式披露）模式：

1. **Level 1**：系统 prompt 中仅包含技能名称和描述（元数据）
2. **Level 2**：Agent 按需调用 `get_skill` 工具加载完整技能内容
3. **Level 3+**：技能中的相对路径自动转换为绝对路径，支持嵌套资源访问

技能文件格式为 `SKILL.md`，包含 YAML frontmatter（name、description、license、allowed-tools）和 Markdown 正文。

## 六、持久化记忆机制

`SessionNoteTool` 提供了轻量级的跨会话记忆能力：

- 存储格式：JSON 文件（`.agent_memory.json`）
- 懒加载策略：文件和目录仅在首次记录时创建
- 分类支持：可选的 `category` 标签（如 `user_preference`、`project_info`）
- 时间戳：每条笔记自动附加记录时间

这是一种"Agent 主动记忆"模式——Agent 自主决定什么信息值得记录，而非被动存储所有对话。

## 七、上下文管理与无限长任务

Mini-Agent 实现了智能的上下文窗口管理：

1. **Token 监控**：每轮 LLM 调用后，使用 `tiktoken` 精确计算消息历史的 token 数
2. **自动摘要触发**：当 token 数超过 `token_limit`（默认 80,000）时，自动触发摘要流程
3. **摘要策略**：将早期对话历史压缩为摘要，保留近期对话的完整细节
4. **跳过连续触发**：摘要完成后设置 `_skip_next_token_check` 标志，避免连续触发摘要

这使得 Agent 能够处理理论上无限长的任务，突破了模型上下文窗口的限制。

## 八、容错与重试机制

`retry.py` 提供了通用的异步重试装饰器：

```python
@async_retry(RetryConfig(
    max_retries=3,
    initial_delay=1.0,
    max_delay=60.0,
    exponential_base=2.0
))
async def call_api():
    ...
```

特性：
- **指数退避**：延迟 = `initial_delay × base^attempt`，上限 `max_delay`
- **可配置异常类型**：可指定哪些异常触发重试
- **重试回调**：每次重试时调用 `on_retry` 回调，用于日志记录或 UI 更新
- **完全解耦**：装饰器与业务代码无侵入性耦合

## 九、日志与可观测性

`AgentLogger` 提供了全面的运行日志：

- 日志路径：`~/.mini-agent/log/` 目录，按时间戳命名
- 记录内容：完整的 LLM 请求/响应、工具调用及结果
- JSON 格式：结构化存储，便于后续分析
- CLI 集成：通过 `/logs` 命令查看日志目录、打开文件管理器

每次 Agent 运行创建独立的日志文件，支持事后回溯和调试。

## 十、扩展性与生态集成

### 10.1 自定义工具

通过继承 `Tool` 基类，4 个步骤即可添加新工具：

```python
class MyTool(Tool):
    @property
    def name(self) -> str: return "my_tool"
    @property
    def description(self) -> str: return "..."
    @property
    def parameters(self) -> dict: return {...}
    async def execute(self, **kwargs) -> ToolResult: ...
```

### 10.2 ACP 协议支持

项目支持 Agent Communication Protocol（ACP），可与 Zed Editor 等 IDE 集成：

```json
{
  "agent_servers": {
    "mini-agent": {
      "command": "/path/to/mini-agent-acp"
    }
  }
}
```

### 10.3 双平台支持

MiniMax 提供国内（`api.minimaxi.com`）和海外（`api.minimax.io`）两个平台，代码自动处理 API 路径差异，用户只需配置对应的 `api_base` 即可。

## 总结

Mini-Agent 的架构设计体现了"少即是多"的哲学：

- **简洁性**：核心代码约 1500 行，但覆盖了 Agent 开发的所有关键模式
- **生产级**：重试机制、超时管理、日志系统、取消支持一应俱全
- **可扩展**：工具、MCP、Skills 三层扩展机制，渐进式增强能力
- **协议兼容**：同时支持 Anthropic 和 OpenAI 两套 API 协议
- **跨平台**：国内/海外双平台、macOS/Linux/Windows 三系统支持

作为 MiniMax 官方的参考实现，Mini-Agent 不仅是学习 Agent 开发的优秀教材，也是一个可以直接用于生产环境的轻量级 Agent 框架。其架构模式（ReAct 循环 + 工具抽象 + 渐进式技能加载）对构建更复杂的多 Agent 系统具有重要的参考价值。
