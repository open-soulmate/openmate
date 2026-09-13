# Langflow

## 概述

Langflow 是一个可视化LangChain工作流。

**仓库**: https://github.com/langflow-ai/langflow | **语言**: Python | **License**: MIT

## 核心架构

> **项目**: [langflow-ai/langflow](https://github.com/langflow-ai/langflow)
> **Stars**: 154k+ | **License**: MIT | **语言**: Python + TypeScript
> **定位**: 可视化 AI 工作流构建与部署平台，支持多 Agent 编排

Langflow 采用经典的**前后端分离 + 服务化后端**架构：

后端采用**服务定位器模式（Service Locator Pattern）**管理所有基础设施服务，位于 `langflow/services/`：

API 基于 FastAPI，分为 v1 和 v2 两个版本：

- **`build.py`** — 图构建 API，将 JSON Flow 编译为可执行 Graph
- **`warm_graph.py`** — 图预热，减少首次执行延迟
- **`schemas.py`** — Pydantic 数据模型定义

组件是 Langflow 的核心扩展单元，每个组件是一个 Python 类，定义了：
- **输入端口**: 文本、数字、LLM、向量存储等类型化输入
- **输出端口**: 处理结果的类型化输出
- **执行逻辑**: `build()` 方法中的处理代码
- **元数据**: 名称、描述、图标、分类

组件分为：
1. **内置组件**: 官方提供的 LLM、向量数据库、工具等
2. **自定义组件**: 用户编写的 Python 组件（`CustomComponentVertex`）
3. **商店组件**: 通过 Langflow Store 共享的社区组件

前端使用 React + TypeScript + React Flow：

- **画布引擎**: React Flow 提供节点拖拽、连线、缩放、小地图
- **状态管理**: 状态管理框架处理图的本地状态
- **API 通信**: 通过 REST API + WebSocket（flow_events）与后端交互
- **组件面板**: 左侧组件列表，支持搜索和分类
- **Playground**: 内嵌测试界面，支持逐步调试
- **设计系统**: 完整的 design token 体系（DESIGN.md 定义了 100+ 颜色变量）
- **国际化**: 支持多语言（i18n skill 存在）

1. **可视化 + 代码双模态**: 既降低门槛又不限制能力
2. **服务化后端**: 28+ 个独立服务，关注点分离清晰
3. **图引擎抽象**: 将工作流统一为 DAG，拓扑排序保证执行正确性
4. **组件可扩展**: Python 原生自定义组件，无 vendor lock-in
5. **MCP 集成**: 前瞻性地拥抱 AI Agent 工具协议标准
6. **企业级完备**: 认证、授权、审计、限流、遥测一应俱全

1. **包重构中**: `langflow` → `lfx` 迁移进行中，存在双重维护
2. **服务依赖图复杂**: 28+ 服务的初始化顺序和依赖关系需要仔细管理
3. **前后端耦合**: Flow JSON schema 是前后端的隐式契约
4. **图执行模型**: 状态节点（StateVertex）引入了执行复杂度

## 关键技术

1. **flow=JSON 的可移植性**：编排结果是纯 JSON，可 `run_flow_from_json` 编程调用——设计/产物与运行解耦。
2. **Custom Component 机制**：`--components-path` 指定自定义组件目录，动态扩展节点库。
3. **前后端分离 + 前端画布**：ReactFlow 做可视化、FastAPI 做执行，职责清晰。
4. **模型/向量库中性**：不锁定单一后端。

> 本章 CLI 参数为 README 直接证据；内部实现为推断。

- **超时控制（CLI 直接证据）**：`--timeout` 设置 worker 秒超时（默认 **60s**），`LANGFLOW_TIMEOUT` 可覆盖——服务端有明确的单请求超时上限。
- **缓存（CLI 直接证据）**：`--cache` 可选 `InMemoryCache` / `SQLiteCache`（默认 **SQLiteCache**）——运行结果/LLM 缓存可落 SQLite 或内存。
- **错误边界**：Custom Component 动态加载失败隔离在组件层；节点级错误在图执行中冒泡。
- **状态持久化**：项目与 flow 存数据库；API key 可 `--remove-api-keys` 从已存项目清除（安全/隐私边界）。
- **崩溃恢复**：SQLite 缓存 + 项目持久化支持重启后恢复画布与运行；**图执行断点续跑语义未读源码，推断。**

> CLI 参数为直接证据，其余推断。

- **并发/进程模型（CLI 直接证据）**：`--workers` 设置 worker 进程数（默认 1），`LANGFLOW_WORKERS` 可覆盖——支持多 worker 水平起进程。
- **部署弹性**：提供 K8s 部署文档、Railway/Render 一键模板、GCP Cloud Shell 教程——设计上支持横向部署；托管版 DataStax Langflow + AstraDB 免运维。
- **资源管理**：worker 超时 60s 防止挂死请求；`--log-level`/`--log-file` 可观测。
- **去中心化/扩展**：flow JSON 可在任意 Python 环境 `run_flow_from_json` 独立跑，不强依赖服务器——产物本身可移植到 serverless。
- **监控**：日志文件 `logs/langflow.log`；前端画布内可视化节点运行状态。

**基本不适用（工具/平台型，非自进化 agent）。**
- **反思/记忆**：无内置 self-reflection 主循环、无持久用户记忆；"记忆"由用户在 flow 里用 LangChain 记忆节点自行搭建。
- **工具学习**：组件库与 Store 供用户手动添加/分享组件，非 agent 自动发现或生成。
- **评估回路**：画布内可流式调试、单节点测试，但无自动 eval/A-B。
- **结论**：Langflow 是"搭 agent 的工作台"，把进化留给搭建者（人工调组件/提示）。与 hermes 那种"agent 自己学"是两类产品。

## 对openmate的启示

> Repository: https://github.com/langflow-ai/langflow  
> Fetch channel: cdn.jsdelivr.net/gh/langflow-ai/langflow@main  
> Version snapshot: main @ 2026-09-13 (README full read)  
> Report date: 2026-09-13  
> Research purpose: Provide openmate with visual LangGraph/component orchestration, FastAPI backend architecture, MCP server, component registry and deployment reference

---

| Need | Langflow mechanism | Reusability |
|------|-------------------|-------------|
| Visual orchestration | React canvas + component registry | Medium |
| Python native | FastAPI + uv | High (if openmate uses Python) |
| LangGraph alignment | Native integration | High |
| **Workflow as tool** | **Deploy as MCP server** | **High** |
| Port/deployment | :7860 + Docker + Desktop | Medium |
| Observability | LangSmith / LangFuse | High |
| Component customization | Source code access | High |

---

| Langflow concept | openmate equivalent | Notes |
|------------------|---------------------|-------|
| Component (Python class) | Skill / Tool | Declarative inputs/outputs |
| Canvas edge | Data flow connection | Output -> Input |
| Flow (serialized) | Workflow definition | Versioned JSON |
| Deploy as API | REST endpoint | Auto-generated |
| Deploy as MCP server | MCP tool exposure | **Key pattern** |
| Interactive playground | Step debugger | Step-by-step control |
| Source code access | Skill source viewer | Customize any component |
| LangSmith integration | OTel tracing | Observability |

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（28-langflow.md）
- 豆包（006_langflow.md）
- MiMo报告（langflow.md）
