# Daytona

## 概述

Daytona 是一个AI Agent沙箱环境。

**仓库**: https://github.com/daytonaio/daytona | **语言**: Python

## 核心架构

> **项目**: [daytonaio/daytona](https://github.com/daytonaio/daytona)
> **Stars**: 71,727 | **Forks**: 5,647 | **语言**: Go + TypeScript (NestJS)
> **定位**: Secure and Elastic Infrastructure for Running AI-Generated Code
> **开源状态**: 2026年6月起核心开发转为私有代码库，公开仓库不再维护，但可自由 fork 使用

Daytona 采用经典的**三层平面分离架构**，将系统职责清晰划分为：

Daytona 提供 5 种语言的 SDK，每种语言包含三层包结构：

| 层级 | 说明 | Python 示例 |
|------|------|-------------|
| SDK | 高级封装，面向开发者 | `daytona` (pip) |
| API Client | OpenAPI 生成的 REST 客户端 | `api-client-python` |
| Toolbox API Client | 沙箱内工具箱 API 客户端 | `toolbox-api-client-python` |

每种语言还提供同步和异步两个版本（Python 特有 `api-client-python-async`）。

SDK 提供的核心模块包括：
- **Daytona**：主客户端，管理沙箱生命周期
- **FileSystem**：文件系统操作（读写、上传下载）
- **Git**：Git 仓库操作
- **Process**：进程和代码执行
- **Snapshot**：快照管理
- **Volume**：卷管理
- **CodeInterpreter**：代码解释器
- **ComputerUse**：计算机使用能力
- **LspServer**：语言服务器协议支持
- **Secret**：密钥管理

Python SDK 从 v0.198.0 起支持通过 WebSocket（Socket.IO）实时流式推送沙箱状态变更，所有沙箱共享一个 WebSocket 连接，并有轮询兜底机制。

Daytona 的网络设计采用**基于主机的路由代理**模式：

- 每个沙箱通过 `{port}-{sandboxId}.{proxy-domain}` 格式的 URL 可达
- Proxy 解析目标 Runner，注入认证头，转发请求
- 支持 HTTP 和 WebSocket 协议
- 沙箱可配置网络访问白名单（`network-allow-list`）或完全阻断网络（`network-block-all`）

SSH 访问通过令牌认证实现，支持从 CLI、Dashboard、SDK 创建 SSH 访问令牌，可直接连接 VS Code Remote SSH 或 JetBrains Gateway。

Daytona 的架构设计体现了几个关键原则：

1. **平面分离**：接口、控制、计算三层解耦，各层独立演进和扩展
2. **OCI 标准化**：基于容器标准构建，兼容整个 Docker/OCI 生态
3. **Agent 优先**：从 SDK 到 MCP，为 AI Agent 提供原生集成能力
4. **安全隔离**：Linux 命名空间级别的完整隔离，而非简单的进程隔离
5. **弹性调度**：Runner 水平扩展，沙箱按需调度到可用计算节点
6. **多语言覆盖**：5 种语言 SDK + 同步/异步双版本，覆盖主流开发生态

Daytona 本质上是一个**面向 AI 时代的代码执行基础设施**，将传统的容器编排（Kubernetes-like）与 AI Agent 的特殊需求（快速启动、状态持久化、工具集成）相结合，构建了一个完整的沙箱即服务（Sandbox-as-a-Service）平台。

## 关键技术

Daytona 是一个面向 AI 生成代码执行和 Agent 工作流的安全弹性基础设施运行时。其核心抽象是 **Sandbox（沙箱）**——一个完整的可组合计算机，拥有独立的 Linux 内核、文件系统、网络栈，以及分配的 vCPU、RAM 和磁盘资源。

与传统的容器即服务不同，Daytona 强调的是"**全功能可组合计算机**"而非单纯的容器。沙箱可在 90ms 内从代码到执行启动，支持 Python、TypeScript、JavaScript 等语言的任意代码运行。基于 OCI/Docker 兼容性，支持大规模并行化和无限持久化，为 Agent 工作流提供一致、可预测的执行环境。

Daytona 的目标用户包括：
- **AI Agent 开发者**：需要安全隔离的代码执行环境
- **平台工程团队**：需要标准化的开发环境管理
- **企业组织**：需要多租户、合规的代码执行基础设施

每个沙箱作为隔离实例运行，使用独立的 Linux 命名空间（进程、网络、文件系统挂载、IPC）。Runner 为每个沙箱分配专用的 vCPU、RAM 和磁盘资源。

**生命周期状态**：
- 创建 → 运行 → 停止 → 归档 → 删除
- 支持自动停止（auto-stop）、自动归档（auto-archive）、自动删除（auto-delete）策略

**资源规格**（默认三种）：

| 规格 | vCPU | Memory | Storage |
|------|------|--------|---------|
| small | 1 | 1GiB | 3GiB |
| medium | 2 | 4GiB | 8GiB |
| large | 4 | 8GiB | 10GiB |

支持 GPU 沙箱，以及自定义 CPU、内存、磁盘配置。

**快照机制**：快照是基于 Docker/OCI 兼容镜像的沙箱模板。支持从公共镜像、本地镜像、私有仓库、Dockerfile 声明式构建等多种方式创建。快照状态包括 Pending → Building/Pulling → Active → Inactive → Removing。

Sandbox Daemon 是运行在每个沙箱内部的代码执行 Agent，它暴露 **Toolbox API**，提供对沙箱环境的直接访问能力：

- **文件系统操作**：读写文件、目录遍历、上传下载
- **Git 操作**：克隆、提交、推送、拉取
- **进程执行**：命令执行、代码运行、会话管理
- **Computer Use**：屏幕截图、鼠标键盘操作
- **日志流**：实时日志输出
- **终端会话**：交互式终端

Toolbox API 是 Agent 与沙箱交互的核心桥梁。SDK 中的 `toolbox-api-client-*` 包就是针对这个 API 的客户端。

---

## 对openmate的启示

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（59-daytona.md）
