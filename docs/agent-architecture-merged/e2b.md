# E2B

## 概述

E2B 是一个云端代码沙箱。

**仓库**: https://github.com/e2b-dev/e2b | **语言**: Python

## 核心架构

> **项目**: [e2b-dev/e2b](https://github.com/e2b-dev/e2b)
> **定位**: 开源安全沙箱基础设施，让 AI Agent 在云端隔离环境中运行生成的代码
> **语言**: TypeScript (JS SDK) + Python (Python SDK) + Terraform (基础设施)
> **许可证**: Apache-2.0
> **分析日期**: 2026-09

E2B 采用**四层分离架构**：

[详见源码]

这种分层设计使得每层可独立演进：SDK 可以快速迭代 API 接口，编排层可以替换底层容器运行时（理论上从 Firecracker 迁移到其他方案），而 API 层作为中间件解耦了用户交互与底层基础设施。

E2B 的基础设施代码位于独立仓库 [e2b-dev/infra](https://github.com/e2b-dev/infra)，使用 **Terraform** 进行基础设施即代码（IaC）管理，**Nomad** 作为工作负载编排器，**Consul** 作为服务发现和配置中心。

AWS 部署包含以下节点池（EC2 Auto Scaling Groups）：

| 节点池 | 用途 | 默认实例类型 |
|--------|------|-------------|
| Control Server | Nomad/Consul 服务器 | 3× t3.medium |
| API | API 服务器、Ingress、Client Proxy、OTel、Loki | t3.xlarge |
| Client | Firecracker 编排节点（需嵌套虚拟化） | m8i.4xlarge |
| Build | 模板构建器（Template Manager） | m8i.2xlarge |
| ClickHouse | 分析数据库 | t3.xlarge |

Client 节点必须支持**嵌套虚拟化**（nested virtualization），因为 Firecracker 需要 KVM 支持。在 AWS 上，`m8i` 系列实例提供了此能力。

- **Cloudflare**: DNS 管理 + TLS 证书自动签发
- **PostgreSQL**: 元数据存储（用户、团队、模板、沙箱状态）
- **Redis**: 可选的缓存层（支持 ElastiCache 托管服务）
- **S3/GCS**: 模板镜像、内核、Firecracker 二进制文件的存储
- **ClickHouse**: 使用分析和指标存储
- **Grafana + Loki + OTel**: 可选的可观测性栈

从 JS SDK 源码中可以看到 `sandbox/mcp.d.ts` 类型定义文件，表明 E2B 原生支持 **MCP 协议**。这意味着：

- 沙箱可以作为 MCP Server 暴露工具给 AI Agent
- AI Agent 可以通过标准 MCP 协议调用沙箱内的命令执行、文件操作等能力
- 无需自定义 API 集成，符合 Anthropic 推动的 Agent 工具标准化趋势

MCP 支持使 E2B 从"代码执行沙箱"升级为"Agent 工具服务器"，在 Agent 生态中的定位更加核心。

---

## 关键技术

E2B（Environment to Build）是一个面向 AI Agent 的云端代码执行沙箱平台。其核心理念是：**AI 生成的代码不应直接在宿主机上执行**，而应在安全隔离的虚拟机环境中运行。E2B 基于 Firecracker 微虚拟机技术，提供毫秒级启动的轻量级沙箱，每个沙箱拥有独立的文件系统、网络栈和进程空间。

E2B 的核心价值体现在三个层面：
- **安全性**: 通过 Firecracker microVM 实现硬件级隔离，防止恶意代码逃逸
- **速度**: 沙箱启动延迟极低（~150ms），适合 AI Agent 的实时交互场景
- **开放性**: 基础设施完全开源，支持 AWS/GCP 自托管部署

- **Cloudflare**: DNS 管理 + TLS 证书自动签发
- **PostgreSQL**: 元数据存储（用户、团队、模板、沙箱状态）
- **Redis**: 可选的缓存层（支持 ElastiCache 托管服务）
- **S3/GCS**: 模板镜像、内核、Firecracker 二进制文件的存储
- **ClickHouse**: 使用分析和指标存储
- **Grafana + Loki + OTel**: 可选的可观测性栈

E2B 的安全设计围绕**多层防御**展开：

| 层级 | 机制 | 说明 |
|------|------|------|
| 硬件隔离 | Firecracker + KVM | 每个沙箱是独立的虚拟机，拥有独立内核 |
| 网络隔离 | VPC + 网络策略 | 沙箱间网络隔离，可配置出站规则 |
| 认证 | API Key | SDK 调用需要 API Key 认证 |
| 资源限制 | Firecracker 配置 | CPU、内存、磁盘 I/O 限制防止资源耗尽攻击 |
| 临时性 | 销毁即清理 | 沙箱销毁后所有状态清除 |

与 Docker 容器方案相比，Firecracker microVM 提供了更强的隔离性：Docker 共享宿主内核，存在内核漏洞逃逸风险；而 Firecracker 每个实例运行独立内核，逃逸需要同时突破 VMM 和 KVM 两层防线。

---

## 对openmate的启示

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（31-e2b.md）
