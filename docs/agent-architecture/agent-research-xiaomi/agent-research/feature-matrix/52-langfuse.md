# Langfuse 功能研究

研究时间：2026-09-16（cron第26轮）
GitHub: https://github.com/langfuse/langfuse （MIT，TypeScript/Next.js monorepo，ClickHouse后端）
研究方式：shallow clone源码，逐一阅读web/src/features/目录结构

## 架构概述

Langfuse是**开源LLM工程平台**，定位"开发→监控→评估→调试"闭环。
- **web/**（Next.js前端 + API routes）
- **worker/**（后台任务：评估执行、数据导出、批处理）
- **packages/shared/**（共享Prisma schema、SDK）
- **ai-gateway/**（LLM代理网关，路由+成本追踪）
- 后端：ClickHouse（trace存储，高吞吐）、Postgres、Redis、S3兼容blob存储

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Trace追踪**：每次LLM调用记录span/generation/event树，含prompt、completion、token、延迟、成本 | ❌无 | 部分：timeline/store.py记录事件，vital/collector.py收集指标，但非LLM专用trace树 | 完全没有 | 最高优先级。OpenSoul在LLM调用入口加trace记录（SQLite表即可起步），每次调用写：模型、prompt哈希、completion、token数、耗时、成本 |
| 2 | **Prompt Management**：集中管理prompt、版本控制、协作迭代、服务端强缓存 | ❌无 | 部分：gene/模板系统 | 部分有 | gene/已有模板，缺版本控制和diff。加版本号+历史即可 |
| 3 | **Datasets & Experiments**：创建测试数据集、跑实验对比、版本化数据集 | ❌无 | 部分：src/benchmark/ | 部分有 | benchmark目录可扩展为"数据集+实验对比"模式 |
| 4 | **Evals评估**：自动化评估（LLM-as-judge、自定义评估器）、在线/离线评估、注释队列(annotation-queues)人工标注 | ❌无 | 部分：cortex/quality.py质量评估 | 部分有 | quality.py已有LLM评估，缺"批量评估+人工标注队列"。注释队列是亮点：人工反馈回路 |
| 5 | **Dashboards & Metrics**：自定义看板、图表、成本分析、延迟分布、token统计 | ❌无 | 部分：vital/health.py、OpenMate有运维页面 | 部分有 | 用户极度重视可观测性，应做"LLM成本+调用统计"面板进OpenMate |
| 6 | **Sessions会话追踪**：把多次trace归组为会话，回放完整对话流 | ✅OpenMate有会话UI | 部分：sessions已有 | 部分有 | OpenSoul已有会话，缺"每个会话的LLM调用明细" |
| 7 | **Users用户追踪**：按最终用户维度聚合trace、成本、行为 | ❌无 | ❌无 | 完全没有 | 企业级功能，售前场景价值高（按客户/项目分账） |
| 8 | **AI Gateway**（ai-gateway/）：LLM代理，统一入口路由多provider、成本追踪、负载均衡、重试、fallback | ❌无 | 部分：acp-proxy管调度超时重试缓存成本 | 部分有 | acp-proxy已覆盖部分，缺"统一LLM代理入口"和"provider级fallback链" |
| 9 | **Annotations & Comments**：对trace/generation添加评论、标注、人工打分 | ❌无 | ❌无 | 完全没有 | 中价值。售前团队可标注bad case，形成反馈集 |
| 10 | **Batch Exports**：把trace/score导出到S3、BigQuery等 | ❌无 | ❌无 | 完全没有 | 低优先级，SQLite→CSV导出即可满足 |
| 11 | **Scores评分系统**：对trace/generation打分（自动+人工），score-configs自定义评分维度 | ❌无 | 部分：cortex/quality.py | 部分有 | quality.py扩展为"可配置评分维度+历史趋势" |
| 12 | **Model Costs模型成本库**：内置100+模型单价，自动计算每次调用成本 | ❌无 | ❌无 | 完全没有 | 高价值低成本。建一张模型单价表（维护成本数据），LLM调用时算成本。用户关心资源，必做 |
| 13 | **Natural Language Filters**：用自然语言生成trace过滤条件 | ❌无 | 部分：intelligence/意图识别 | 部分有 | 意图识别转查询DSL，中优先级 |
| 14 | **Command K Menu**：全局快捷命令面板 | ❌无 | ❌ | 完全没有 | OpenMate前端可加cmdk，提升操作效率（低成本高体验） |
| 15 | **RBAC多租户**：组织→项目→成员角色权限 | ❌无 | 部分：immune/access_control.py | 部分有 | access_control已有，缺"项目/组织"层级 |
| 16 | **Audit Logs审计日志**：操作审计 | ❌无 | ✅immune/audit.py | 已有 | 已有 |
| 17 | **Integrations**：OpenAI/Anthropic/LangChain/LlamaIndex等SDK自动埋点、PostHog/Mixpanel、Slack通知 | ❌无 | 部分：MCP已支持 | 部分有 | 重点是"LLM调用自动埋点"——在OpenSoul的LLM调用封装处统一加trace钩子 |
| 18 | **In-app Agent**（features/in-app-agent/）：平台内嵌AI助手，可查询自己平台的trace数据、quick actions | ❌无 | ✅OpenSoul本身就是agent大脑 | 已有（方向不同） | OpenSoul比它强——但"agent查询自身运行数据"的能力可借鉴：让Hermes能查OpenSoul的trace |
| 19 | **Media支持**：trace中记录图片/音频等多模态内容 | ❌无 | 部分：vision/voice模块 | 部分有 | 低优先级 |
| 20 | **Feature Flags & Entitlements**：功能开关+付费分层 | ❌无 | ❌无 | 完全没有 | 自用场景不需要 |

## 源码亮点

1. **features/目录即功能清单**：每个功能一个目录（evals/、monitors/、datasets/、scores/…），内部统一components/hooks/server/types结构。OpenMate的功能页面可以学这个组织方式。
2. **trace数据模型三层**：Trace（一次用户交互）→ Span（一个步骤）→ Generation（一次LLM调用）。OpenSoul做trace时直接用这个三层模型，不发明新轮子。
3. **ai-gateway作为独立子产品**：LLM代理层独立成目录，说明"网关"和"观测"解耦是对的——OpenSoul的acp-proxy应保持执行层定位，trace数据落库由vital/负责。
4. **ClickHouse选型**：trace是高吞吐时序数据，SQLite扛不住长期。OpenSoul起步用SQLite够用，但表结构要为迁移ClickHouse/Postgres留余地（避免大JSON塞字段）。
5. **annotation-queues**：人工标注队列是评估闭环的关键——自动评估不准的case进队列，人工标注后回流成训练/测试数据。

## 可复用设计（针对OpenSoul）

- **最小可用Trace系统**（2-3天）：
  ```
  opensoul/src/vital/llm_trace.py
  - 表llm_traces(id, session_id, model, prompt_tokens, completion_tokens, 
    duration_ms, cost_usd, prompt_hash, created_at)
  - 表llm_spans(trace_id, parent_span_id, type, name, metadata)
  - 在LLM调用统一入口（acp-proxy或opensoul的llm封装）加装饰器自动记录
  ```
- **模型成本表**：抄langfuse的models表结构（模型名、provider、input/output单价、日期区间），OpenMate运维页面展示"本月LLM成本"。
- **评估闭环**：cortex/quality.py的评估结果落库+趋势图，bad case进"待标注"列表（复用OpenMate现有列表组件）。

## 与OpenMate的对接

用户极度重视可观测性（"我都不知道他们在干嘛"）。建议：
- OpenMate新增"LLM观测"页面（复用现有运维页面框架）：调用瀑布图、成本趋势、延迟分布、bad case列表
- 实时tail式日志流（用户明确要求"类tail日志流"）：WebSocket推送LLM调用实时日志
