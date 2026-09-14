# 59. Daytona 架构分析

> **项目**: [daytonaio/daytona](https://github.com/daytonaio/daytona)
> **Stars**: 71,727 | **Forks**: 5,647 | **语言**: Go + TypeScript (NestJS)
> **定位**: Secure and Elastic Infrastructure for Running AI-Generated Code
> **开源状态**: 2026年6月起核心开发转为私有代码库，公开仓库不再维护，但可自由 fork 使用

---

## 1. 项目定位与核心价值

Daytona 是一个面向 AI 生成代码执行和 Agent 工作流的安全弹性基础设施运行时。其核心抽象是 **Sandbox（沙箱）**——一个完整的可组合计算机，拥有独立的 Linux 内核、文件系统、网络栈，以及分配的 vCPU、RAM 和磁盘资源。

与传统的容器即服务不同，Daytona 强调的是"**全功能可组合计算机**"而非单纯的容器。沙箱可在 90ms 内从代码到执行启动，支持 Python、TypeScript、JavaScript 等语言的任意代码运行。基于 OCI/Docker 兼容性，支持大规模并行化和无限持久化，为 Agent 工作流提供一致、可预测的执行环境。

Daytona 的目标用户包括：
- **AI Agent 开发者**：需要安全隔离的代码执行环境
- **平台工程团队**：需要标准化的开发环境管理
- **企业组织**：需要多租户、合规的代码执行基础设施

---

## 2. 三层平面架构（Plane Architecture）

Daytona 采用经典的**三层平面分离架构**，将系统职责清晰划分为：

### 2.1 接口平面（Interface Plane）
提供用户和 Agent 与 Daytona 交互的所有客户端接口：
- **SDK**：Python、TypeScript、Ruby、Go、Java 五种语言的客户端库
- **CLI**：命令行工具，覆盖沙箱生命周期管理、快照、卷、SSH 等全部操作
- **Dashboard**：Web 界面，可视化沙箱管理和监控
- **MCP Server**：Model Context Protocol 服务器，供 AI Agent 工具集成
- **SSH**：安全 Shell 直接访问运行中的沙箱

### 2.2 控制平面（Control Plane）
中心协调层，负责所有沙箱操作的编排：
- **API**：基于 NestJS 的 RESTful 服务，是所有平台操作的入口点，处理认证、沙箱生命周期、快照、卷和资源分配
- **Proxy**：HTTP 代理，基于主机路由将外部流量转发到正确的沙箱（`{port}-{sandboxId}.{proxy-domain}`）
- **Snapshot Builder**：从 Dockerfile 或预构建镜像创建沙箱快照
- **Sandbox Manager**：沙箱调度、状态协调和生命周期管理策略执行

控制平面的基础设施依赖：
- **Redis**：缓存、会话管理、分布式锁
- **PostgreSQL**：元数据和配置的主持久化存储
- **Auth0/OIDC**：基于 OpenID Connect 的用户和服务认证
- **PostHog**：平台分析和使用指标

### 2.3 计算平面（Compute Plane）
基础设施层，沙箱实际运行的地方：
- **Sandbox Runner**：计算节点，托管多个沙箱，每个沙箱分配专用资源，水平扩展
- **Sandbox Daemon**：运行在每个沙箱内部的代码执行 Agent，暴露 Toolbox API
- **Snapshot Store**：基于 OCI 分发规范的内部注册表，存储沙箱快照镜像
- **Volumes**：跨沙箱共享的持久化存储，基于 S3 兼容对象存储

---

## 3. Sandbox 运行机制

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

---

## 4. SDK 多语言架构

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

---

## 5. Toolbox API 与 Sandbox Daemon

Sandbox Daemon 是运行在每个沙箱内部的代码执行 Agent，它暴露 **Toolbox API**，提供对沙箱环境的直接访问能力：

- **文件系统操作**：读写文件、目录遍历、上传下载
- **Git 操作**：克隆、提交、推送、拉取
- **进程执行**：命令执行、代码运行、会话管理
- **Computer Use**：屏幕截图、鼠标键盘操作
- **日志流**：实时日志输出
- **终端会话**：交互式终端

Toolbox API 是 Agent 与沙箱交互的核心桥梁。SDK 中的 `toolbox-api-client-*` 包就是针对这个 API 的客户端。

---

## 6. 网络与代理架构

Daytona 的网络设计采用**基于主机的路由代理**模式：

- 每个沙箱通过 `{port}-{sandboxId}.{proxy-domain}` 格式的 URL 可达
- Proxy 解析目标 Runner，注入认证头，转发请求
- 支持 HTTP 和 WebSocket 协议
- 沙箱可配置网络访问白名单（`network-allow-list`）或完全阻断网络（`network-block-all`）

SSH 访问通过令牌认证实现，支持从 CLI、Dashboard、SDK 创建 SSH 访问令牌，可直接连接 VS Code Remote SSH 或 JetBrains Gateway。

---

## 7. 认证与多租户

- **认证**：基于 Auth0/OIDC 提供者，支持 API Key 和 OAuth 两种方式
- **多租户**：组织级多租户，每个沙箱、快照、卷都属于一个组织，访问控制在组织边界实施
- **组织管理**：支持创建、删除、切换组织，CLI 和 Dashboard 均可操作
- **SMTP**：用于组织邀请、账户通知、告警邮件

---

## 8. MCP 集成与 AI Agent 生态

Daytona 提供原生的 **Model Context Protocol (MCP) Server**，使 AI Agent 能够以标准化方式与沙箱交互：

- 支持 Claude、Cursor、Windsurf 等主流 AI Agent 平台
- 通过 `daytona mcp init <agent>` 一键初始化
- MCP 工具覆盖：沙箱管理、文件系统操作、Git 操作、进程执行、Computer Use、预览

这意味着 AI Agent 可以：
1. 创建和管理沙箱生命周期
2. 在沙箱中执行任意代码
3. 读写文件、操作 Git 仓库
4. 获取执行结果和日志

Daytona 的默认快照预装了大量 AI/ML 相关包（OpenAI、Anthropic、LangChain、LlamaIndex、Transformers、PyTorch 等），开箱即用。

---

## 9. OCI/Docker 兼容性与镜像生态

Daytona 完全基于 OCI/Docker 标准构建：

- **快照注册表**：内部 OCI 兼容注册表，使用 S3 兼容对象存储后端
- **镜像源**：支持 Docker Hub、Google Artifact Registry、GHCR、Amazon ECR、任意私有 OCI 注册表
- **Docker-in-Docker**：沙箱内可运行 Docker Compose 和 Kubernetes（k3s）
- **声明式构建器**：通过 SDK 代码定义依赖，而非导入镜像
- **Runner 操作**：从快照存储拉取镜像，创建/启动/停止/销毁/调整大小/备份沙箱

---

## 10. 项目演进与社区

**时间线**：
- 2024年2月：项目创建
- 快速增长至 71,727 Stars、2,744 Commits
- 2026年6月：核心开发转为私有代码库，公开仓库归档

**开源策略**：
- 公开仓库在 v0.190.0 版本归档
- 采用宽松许可证，可自由 fork 和构建
- 私有版本继续维护和更新

**社区生态**：
- Slack 社区活跃
- 多语言 SDK 持续迭代（Java 最新支持）
- MCP 集成持续推进 AI Agent 生态

---

## 架构总结

Daytona 的架构设计体现了几个关键原则：

1. **平面分离**：接口、控制、计算三层解耦，各层独立演进和扩展
2. **OCI 标准化**：基于容器标准构建，兼容整个 Docker/OCI 生态
3. **Agent 优先**：从 SDK 到 MCP，为 AI Agent 提供原生集成能力
4. **安全隔离**：Linux 命名空间级别的完整隔离，而非简单的进程隔离
5. **弹性调度**：Runner 水平扩展，沙箱按需调度到可用计算节点
6. **多语言覆盖**：5 种语言 SDK + 同步/异步双版本，覆盖主流开发生态

Daytona 本质上是一个**面向 AI 时代的代码执行基础设施**，将传统的容器编排（Kubernetes-like）与 AI Agent 的特殊需求（快速启动、状态持久化、工具集成）相结合，构建了一个完整的沙箱即服务（Sandbox-as-a-Service）平台。
