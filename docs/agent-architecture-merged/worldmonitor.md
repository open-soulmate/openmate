# Worldmonitor

## 概述

﻿# worldmonitor 源码级调研报告（Rank 22），主要使用 TypeScript

## 核心架构

- 项目为 Vercel 驱动的 Next.js 应用，核心逻辑集中在 api/ 目录下的 Edge Functions。关键文件：
- | 路径 | 作用 |
- | api/_summarize-handler.js | LLM 摘要处理入口，封装原始事件到 LLM 到结构化摘要主流程 |
- | api/_upstash-cache.js | Upstash Redis 三层缓存封装，含 stale-if-error 兜底 |

## 关键技术

- 1. Seed/Serve 采集-服务分离：采集与在线服务解耦，采集故障不影响可用性；
- 2. 三层缓存 + stale-if-error：后端失败返回缓存旧数据，任何时刻都有响应；
- 3. 方法论版本化与可追溯：CII v1 到 v8，每条数据标注 methodology_version；
- 4. Agent-First 多方式暴露：MCP + Skills + OpenAPI 覆盖不同技术栈；
- 5. Edge Functions 无服务器：自动扩缩容、全球边缘部署。

## 对openmate的启示

- 1. stale-if-error 缓存兜底：LLM/工具调用失败时返回最近一次成功缓存而非报错。openmate 为 LLM 调用和工具调用增加缓存层，API 抖动时 Agent 仍能继续。收益：瞬时故障用户无感知。
- 2. Seed/Serve 采集-服务分离：后台工作（记忆构建、知识库索引、向量化）与前台用户交互完全隔离。openmate 用独立 worker 进程/队列处理后台任务，后台崩溃不影响当前对话。收益：重任务不阻塞用户交互。
- 3. 配置版本化与可追溯：每次配置变更记录版本，每条输出标注配置版本。openmate 将 Agent 配置（system prompt、工具列表、记忆策略、模型选择）版本化，回复中标注配置版本。收益：行为变更可回溯。

## 参考来源

- 豆包
