# AgentOps

## 概述

AgentOps 是一个Agent可观测性平台。

**仓库**: https://github.com/AgentOps-AI/agentops | **语言**: Python | **License**: MIT

## 核心架构

> **项目**: [AgentOps-AI/agentops](https://github.com/AgentOps-AI/agentops)
> **定位**: AI Agent 可观测性与开发工具平台
> **Stars**: 5,800+ | **License**: MIT | **语言**: Python (主) + TypeScript (Alpha)
> **分析版本**: v0.4+ (基于 OpenTelemetry 的 Span 架构)

AgentOps 采用**分层架构**，从底层到上层依次为：

[详见源码]

关键设计决策：v0.4 版本从自定义"事件（Event）"模型迁移到**基于 OpenTelemetry 的 Span 模型**，这是一个重大的架构转型，使得 AgentOps 能够利用 OpenTelemetry 生态的标准化能力。

配置系统使用 Python `dataclass` 实现，采用**环境变量优先**策略：

- 所有配置项均有对应的环境变量（如 `AGENTOPS_API_KEY`、`AGENTOPS_EXPORTER_ENDPOINT`）
- 支持类型安全的配置验证（API Key 使用 UUID 格式校验）
- 支持自定义 `SpanExporter` 和 `SpanProcessor`，允许高级用户替换导出逻辑

关键配置项：
| 配置 | 默认值 | 说明 |
|------|--------|------|
| `max_wait_time` | 5000ms | 队列刷新最大等待时间 |
| `max_queue_size` | 512 | 事件队列最大容量 |
| `export_flush_interval` | 1000ms | 自动导出间隔 |
| `auto_start_session` | True | 是否自动开始 Session |
| `instrument_llm_calls` | True | 是否自动插桩 LLM 调用 |

AgentOps 提供丰富的装饰器，用于声明式地标记代码的可观测性：

[详见源码]

关键特性：
- **批量导出**：减少网络请求次数，提高吞吐量
- **JWT 认证**：每次请求携带 JWT Token，Token 在初始化时预取
- **队列管理**：最大队列 512，超时 5 秒自动刷新
- **环境数据采集**：自动采集 Python 版本、已安装库等系统信息（可 opt-out）

1. **最小侵入**：两行代码集成，不改变用户代码结构
2. **渐进增强**：从简单监控到深度调试，按需启用
3. **标准化优先**：基于 OpenTelemetry 标准，而非自建协议
4. **框架无关**：支持所有主流 Agent 框架，不绑定特定技术栈

v0.4 版本的核心变化是从 Event 模型迁移到 Span 模型：

| 维度 | v0.3 (Event) | v0.4 (Span) |
|------|-------------|-------------|
| 数据模型 | 自定义 Event 类 | OpenTelemetry Span |
| 上下文传播 | 手动管理 | 自动传播 |
| 导出协议 | 自定义 API | OTLP 标准协议 |
| 生态兼容 | 封闭 | 兼容 OTel 生态 |
| 扩展性 | 有限 | 通过 OTel 扩展 |

## 关键技术

AgentOps 是一个专注于 AI Agent 全生命周期管理的可观测性平台。它解决的核心问题是：**AI Agent 在从原型到生产的过程中，缺乏标准化的监控、调试和评估工具**。

其三大核心价值：
- **全面可观测性**：追踪 Agent 性能、用户交互和 API 使用情况
- **实时监控**：通过 Session Replay、指标和实时监控工具获取即时洞察
- **成本控制**：监控和管理 LLM 与 API 调用的花费

AgentOps 的设计哲学是"两行代码集成"——通过极低的接入成本为开发者提供强大的可观测性能力。

配置系统使用 Python `dataclass` 实现，采用**环境变量优先**策略：

- 所有配置项均有对应的环境变量（如 `AGENTOPS_API_KEY`、`AGENTOPS_EXPORTER_ENDPOINT`）
- 支持类型安全的配置验证（API Key 使用 UUID 格式校验）
- 支持自定义 `SpanExporter` 和 `SpanProcessor`，允许高级用户替换导出逻辑

关键配置项：
| 配置 | 默认值 | 说明 |
|------|--------|------|
| `max_wait_time` | 5000ms | 队列刷新最大等待时间 |
| `max_queue_size` | 512 | 事件队列最大容量 |
| `export_flush_interval` | 1000ms | 自动导出间隔 |
| `auto_start_session` | True | 是否自动开始 Session |
| `instrument_llm_calls` | True | 是否自动插桩 LLM 调用 |

SDK 核心基于 OpenTelemetry 构建，包含：

- **TracerProvider**：管理所有 Span 的创建和生命周期
- **BatchSpanProcessor**：批量处理 Span，减少网络开销
- **AuthenticatedOTLPExporter**：带 JWT 认证的 OTLP 导出器，数据发送至 `https://otlp.agentops.ai/v1/traces`
- **MeterProvider**：指标采集，支持 LLM 调用计数和成本追踪

架构图中定义的核心概念：
1. **Session**：作为根 Span 的主 Trace，所有子 Span 必须归属于某个 Session
2. **Span**：表示不同类型的操作（Agent、Tool、LLM 等），按层级组织
3. **TraceContext**：管理 Span 的父子关系和上下文传播

AgentOps 最强大的特性之一是**基于 Python import 钩子的自动插桩**：

```python

数据流路径：

```
用户代码 → 装饰器/插桩 → Span 创建 → SpanProcessor → SpanExporter → AgentOps Backend
                                      ↓
                              BatchSpanProcessor (批量聚合)
                                      ↓
                              AuthenticatedOTLPExporter (JWT 认证)
                                      ↓
                              https://otlp.agentops.ai/v1/traces
```

关键特性：
- **批量导出**：减少网络请求次数，提高吞吐量
- **JWT 认证**：每次请求携带 JWT Token，Token 在初始化时预取
- **队列管理**：最大队列 512，超时 5 秒自动刷新
- **环境数据采集**：自动采集 Python 版本、已安装库等系统信息（可 opt-out）

AgentOps 提供完整的自托管方案，包含：
- **Dashboard**：Web 前端界面
- **API Backend**：后端服务
- **数据存储**：支持本地数据持久化

自托管架构意味着企业可以在自己的基础设施上运行完整的 AgentOps 平台，满足数据合规和安全要求。这对于金融、医疗等对数据敏感的行业尤为重要。

---

## 对openmate的启示

> 仓库: https://github.com/AgentOps-AI/agentops  
> 抓取通道: cdn.jsdelivr.net/gh/AgentOps-AI/agentops@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 可观测 / 装饰器 spans / 框架集成 借鉴

---

| 需求 | AgentOps 机制 | 可复用度 |
|------|--------------|----------|
| 装饰器 spans | session/agent/operation/task/workflow | **高** |
| 嵌套 span 层级 | @agent 内 @operation | **高** |
| 一行 init + end_session | 成功/失败字符串 | **高** |
| tags 参数 | 会话标签 | 高 |
| 异步/生成器支持 | 装饰器全支持 | **高** |
| I/O + 异常记录 | 默认 | **高** |
| 框架 callback handler | LangChain 等 | **高** |
| init 后再 import 工具 | Camel 顺序要求 | **P0 教训** |
| OpenAI Agents 双语言 | Python + TS | **高** |
| PromptArmor 集成 | honeypot + 注入检测 | **高** |
| API bill tracking | ✅ | 高 |
| Multi-agent 可视化 | ✅ | 高 |
| Self-host app 开源 | app/ 目录 | **高** |
| MIT | 宽松 | 高 |

---

```
@session          → root span（一次用户任务）
  @workflow       → 多步骤编排
    @agent        → Agent 执行
      @operation  → 具体操作（或 @task）
```

嵌套规则:
- session 必须唯一 root
- agent 可嵌套 operation
- workflow 可含多 agent
- 装饰器自动记录 I/O、异常、async、generator

openmate:
```python
from openmate.telemetry import session, agent, operation, workflow

@session
def handle_user_task(...): ...

@agent
class ResearchAgent:
    @operation
    def search(self, q): ...
```

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（85-agentops.md）
- MiMo报告（agentops-l1.md）
- MiMo卡片（agentops.md）
