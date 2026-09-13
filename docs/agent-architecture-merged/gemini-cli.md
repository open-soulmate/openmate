# Gemini CLI

## 概述

Gemini CLI 是一个Gemini命令行工具。

**仓库**: https://github.com/google-gemini/gemini-cli | **语言**: TypeScript

## 核心架构

> 研究对象：https://github.com/google-gemini/gemini-cli  
> 定位：Google 官方开源终端 AI Agent（TypeScript / Node.js）  
> 研究日期：2026-09-13

[详见源码]

| 组件 | 位置 | 职责 |
|---|---|---|
| `ToolRegistry` | `packages/core/src/tools/` | 注册、发现、启停所有工具 |
| `mcp-client.ts` | core/tools | MCP 发现与连接 |
| `mcp-tool.ts` | core/tools | 将 MCP 工具包装为本地 Tool |
| ReAct Loop | core client | 模型推理 ↔ 工具调用循环 |
| Hooks 引擎 | core | 在 Agent 生命周期点插入用户脚本 |
| Policy Engine | core | 细粒度工具参数级 allow/deny |
| Sandbox Manager | core+cli | 多后端隔离执行 |

1. Project：`.gemini/settings.json`
2. User：`~/.gemini/settings.json`
3. System：`/etc/gemini-cli/settings.json`
4. Extensions 提供的默认配置

内置工具全景：

| 类别 | 工具 |
|---|---|
| Execution | `run_shell_command`（可交互/后台） |
| File System | `glob` `grep_search` `list_directory` `read_file` `read_many_files` `replace` `write_file` |
| Interaction | `ask_user` `write_todos` |
| Planning | `enter_plan_mode` `exit_plan_mode` |
| Memory | `activate_skill` `get_internal_docs` |
| Web | `google_web_search` `web_fetch` |
| MCP | `list_mcp_resources` `read_mcp_resource` |
| Task Tracker（实验） | `tracker_create/update/get/list/add_dependency/visualize` |

工具安全分级：
- **Read 类**：通常自动执行
- **Mutator 类**（`replace` `write_file` `run_shell_command`）：需用户确认（显示 diff 或确切命令）
- 快捷触发：`@path` → `read_many_files`；`!cmd` → `run_shell_command`

[详见源码]
openmate-cli (UI)
    │
openmate-core
    ├── ReAct Loop + Hooks 钩子总线
    ├── ToolRegistry（风险分级）
    │     ├── built-in tools
    │     └── MCP discovery/execution
    ├── Policy Engine (argsPattern)
    ├── Sandbox（多后端 + expansion）
    ├── Auto-Memory（inbox 人审）
    └── Telemetry (OTel)
```

---

## 关键技术

| 组件 | 位置 | 职责 |
|---|---|---|
| `ToolRegistry` | `packages/core/src/tools/` | 注册、发现、启停所有工具 |
| `mcp-client.ts` | core/tools | MCP 发现与连接 |
| `mcp-tool.ts` | core/tools | 将 MCP 工具包装为本地 Tool |
| ReAct Loop | core client | 模型推理 ↔ 工具调用循环 |
| Hooks 引擎 | core | 在 Agent 生命周期点插入用户脚本 |
| Policy Engine | core | 细粒度工具参数级 allow/deny |
| Sandbox Manager | core+cli | 多后端隔离执行 |

1. Project：`.gemini/settings.json`
2. User：`~/.gemini/settings.json`
3. System：`/etc/gemini-cli/settings.json`
4. Extensions 提供的默认配置

内置工具全景：

| 类别 | 工具 |
|---|---|
| Execution | `run_shell_command`（可交互/后台） |
| File System | `glob` `grep_search` `list_directory` `read_file` `read_many_files` `replace` `write_file` |
| Interaction | `ask_user` `write_todos` |
| Planning | `enter_plan_mode` `exit_plan_mode` |
| Memory | `activate_skill` `get_internal_docs` |
| Web | `google_web_search` `web_fetch` |
| MCP | `list_mcp_resources` `read_mcp_resource` |
| Task Tracker（实验） | `tracker_create/update/get/list/add_dependency/visualize` |

工具安全分级：
- **Read 类**：通常自动执行
- **Mutator 类**（`replace` `write_file` `run_shell_command`）：需用户确认（显示 diff 或确切命令）
- 快捷触发：`@path` → `read_many_files`；`!cmd` → `run_shell_command`

| 维度 | 评估 |
|---|---|
| 语言/运行时 | Node.js + TS；生态丰富，但冷启动与内存高于 Rust 方案 |
| 发布治理 | preview → stable 两级晋升 + nightly；有 CI 与 behavioral evals |
| 可观测性 | OpenTelemetry：模型调用、工具调度、trace 可导出 Genkit/Jaeger/GCP |
| 会话可靠 | Checkpointing、Rewind、session resume、token caching |
| 企业能力 | Enterprise 配置、trusted folders、telemetry、GitHub Action |
| 生命线风险 | 免费层已迁 Antigravity CLI；开源核心仍在，但战略重心转移需关注 |
| 工具面稳定 | 核心 FS/shell 工具成熟；Task Tracker、Subagents、Auto Memory 仍标实验 |

**风险点**：
- 实验特性多，API 面可能变动
- Node 单文件打包体积大
- 产品战略向 Antigravity 过渡带来的不确定性

```
本地 session transcript (~/.gemini/tmp//chats/)
        │
        ▼  后台扫描（idle ≥3h 且 ≥10 条用户消息）
 提取 Agent（preview Flash）
        │  脱敏 secrets → 草稿
        ▼
 Review Inbox（项目本地）
   ├── memory .patch
   └── SKILL.md 草稿
...

安全边界：
- **不能**直接改活的 memory/settings/凭证/项目 GEMINI.md
- Patch 先 dry-run；人工批准后

## 对openmate的启示

| 组件 | 位置 | 职责 |
|---|---|---|
| `ToolRegistry` | `packages/core/src/tools/` | 注册、发现、启停所有工具 |
| `mcp-client.ts` | core/tools | MCP 发现与连接 |
| `mcp-tool.ts` | core/tools | 将 MCP 工具包装为本地 Tool |
| ReAct Loop | core client | 模型推理 ↔ 工具调用循环 |
| Hooks 引擎 | core | 在 Agent 生命周期点插入用户脚本 |
| Policy Engine | core | 细粒度工具参数级 allow/deny |
| Sandbox Manager | core+cli | 多后端隔离执行 |

```
openmate-cli (UI)
    │
openmate-core
    ├── ReAct Loop + Hooks 钩子总线
    ├── ToolRegistry（风险分级）
    │     ├── built-in tools
    │     └── MCP discovery/execution
    ├── Policy Engine (argsPattern)
    ├── Sandbox（多后端 + expansion）
...

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 豆包（013_gemini-cli.md）
- MiMo报告（gemini-cli.md）
