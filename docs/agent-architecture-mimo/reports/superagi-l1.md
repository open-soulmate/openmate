# SuperAGI 架构深度研究报告

> 仓库: https://github.com/TransformerOptimus/SuperAGI  
> 版本快照: main branch · Commits 2,342  
> 星数: ~17.7k · Fork ~2.2k  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Action Console 权限门控、Toolkits 市场解耦、异步队列与 Token 遥测借鉴  
> License: MIT（GitHub 页显示 MIT；早期文档曾写 GPL，以仓库 LICENSE 为准）

---

## 0. 元信息与现状

| 项 | 值 |
|---|---|
| 语言 | Python（FastAPI）+ GUI（React / Next） |
| 异步 | Celery + Redis |
| DB | PostgreSQL + Alembic 迁移 |
| 向量库 | Pinecone 等多向量库 |
| 部署 | Docker Compose（多服务：api/celery/redis/postgres/gui/nginx） |
| 本地 LLM | `local-llm` / `local-llm-gpu` + `Dockerfile-gpu` |
| 特点 | Action Console 人工审批 · Toolkits 市场 · Performance Telemetry · Token 管控 |
| 状态 | 活跃度较峰值下降；架构模式仍值得读 |

> 对 openmate：SuperAGI 的 **Action Console 权限门控** 与 **Toolkits 市场解耦** 是生产向 Agent 平台的成熟模式。openmate 个人助手高风险操作必须有等价审批面。

---

## 1. 系统架构

### 1.1 顶层模块图

```
┌──────────────────────────────────────────────────────────┐
│  GUI（gui/ + tgwui/）                                     │
│   Agent 管理 · Action Console · 设置 · 指标              │
├──────────────────────────────────────────────────────────┤
│  API 网关（main.py + FastAPI + nginx/）                   │
├──────────────────────────────────────────────────────────┤
│  Agent 运行时 superagi/agent/                             │
│   ReAct 循环 · 工具调用 · 任务队列 · Workflow steps      │
├──────────────────────────────────────────────────────────┤
│  Toolkits superagi/tools/                                 │
│   Twitter/GitHub/Jira/Slack/搜索/代码/文件等可插拔包    │
├──────────────────────────────────────────────────────────┤
│  记忆                                                      │
│   superagi/vector_store/ + vector_embeddings/             │
├──────────────────────────────────────────────────────────┤
│  异步与编排                                               │
│   Celery + Redis · superagi/worker.py · jobs/             │
├──────────────────────────────────────────────────────────┤
│  遥测                                                      │
│   superagi/apm/ · Performance Telemetry · Token 用量      │
└──────────────────────────────────────────────────────────┘
```

### 1.2 真实源码布局（经 GitHub tree 核实）

```
SuperAGI/
├── superagi/
│   ├── agent/
│   │   ├── prompts/                          # prompt 模板资源
│   │   ├── types/
│   │   ├── agent_iteration_step_handler.py   # ReAct 迭代步
│   │   ├── agent_tool_step_handler.py        # 工具步
│   │   ├── agent_workflow_step_wait_handler.py
│   │   ├── queue_step_handler.py             # 队列步
│   │   ├── task_queue.py
│   │   ├── agent_message_builder.py
│   │   ├── agent_prompt_builder.py
│   │   ├── agent_prompt_template.py
│   │   ├── tool_builder.py
│   │   ├── tool_executor.py
│   │   ├── output_handler.py
│   │   ├── output_parser.py
│   │   ├── workflow_seed.py
│   │   └── common_types.py
│   ├── apm/                                  # Application Performance Monitoring
│   ├── config/
│   ├── controllers/                          # FastAPI 路由
│   ├── helper/
│   ├── image_llms/
│   ├── jobs/                                 # 后台任务
│   ├── lib/
│   ├── llms/                                 # 模型封装
│   ├── models/                               # ORM 模型
│   ├── resource_manager/
│   ├── tools/
│   │   ├── base_tool.py
│   │   ├── tool_response_query_manager.py
│   │   ├── code/ · file/ · thinking/
│   │   ├── google_search/ · google_serp_search/ · searx/ · duck_duck_go/
│   │   ├── github/ · jira/ · slack/ · email/ · twitter/ · instagram_tool/
│   │   ├── google_calendar/ · knowledge_search/ · webscaper/
│   │   ├── image_generation/ · apollo/ · resource/
│   ├── types/
│   ├── vector_embeddings/
│   ├── vector_store/
│   ├── tool_manager.py
│   ├── worker.py                             # Celery worker
│   └── __init__.py
├── migrations/                               # Alembic
├── gui/ · tgwui/                             # 前端
├── nginx/ · static/ · workspace/
├── main.py                                   # API 入口
├── run_gui.py · run_gui.sh · ui.py
├── cli2.py
├── config_template.yaml                      # 复制为 config.yaml
├── docker-compose.yaml · docker-compose-gpu.yml · docker-compose-dev.yaml
├── Dockerfile · Dockerfile-gpu · DockerfileCelery · DockerfileRedis
├── entrypoint.sh · entrypoint_celery.sh
├── alembic.ini · requirements.txt · tools.json
└── local-llm · local-llm-gpu
```

### 1.3 进程/线程模型

多服务部署（docker-compose）：

| 服务 | 职责 | 入口 |
|---|---|---|
| api | FastAPI HTTP | `main.py` / entrypoint.sh |
| celery | 异步 Agent 执行 | `superagi/worker.py` / entrypoint_celery.sh |
| redis | 队列 + 缓存 | DockerfileRedis |
| postgres | 主库 | migrations/ + alembic.ini |
| gui | React 前端 | gui/ 或 tgwui/ |
| nginx | 反代 | nginx/ |

并发 Agent：Celery 队列调度，多 worker 并行；同一 Agent 的 step 经 `task_queue.py` 串行化。

### 1.4 与 LLM 的调用链路

```
用户在 GUI 创建 Agent（目标 + 工具包）
  → controllers/ API 入队
  → Celery worker（superagi/worker.py）消费
    → workflow_seed.py 播种工作流步
    → agent_iteration_step_handler.py：
         LLM → output_parser → tool_call
    → Action Console：高风险暂停等人工确认
    → tool_executor.py 执行 Toolkit
    → vector_store 写入记忆
  → models/ 状态/结果回写 DB → GUI 展示
```

失败路径：
- Celery worker 崩溃 → 任务卡在队列；需 Redis 持久化 + 人工重跑（无自动 resume 会话）
- Toolkit 异常 → 回传 LLM 自修正；仍失败则 step 标记失败
- Action Console 无人应答 → 步骤阻塞（可配置超时，版本相关）
- Redis 重启 → 未持久化消息丢失风险

---

## 2. 核心机制深潜

### 2.1 Agent Loop

核心文件：
- `superagi/agent/agent_iteration_step_handler.py` — ReAct 预定义步骤 + LLM 决策
- `superagi/agent/agent_tool_step_handler.py` — 工具步执行
- `superagi/agent/workflow_seed.py` — 工作流种子（定义步骤序列）
- `superagi/agent/task_queue.py` — 任务队列
- `superagi/agent/output_parser.py` / `output_handler.py` — LLM 输出解析

停止条件：目标完成、步数上限、用户停止、审批拒绝。

### 2.2 工具系统

| 机制 | 文件 | 说明 |
|---|---|---|
| BaseTool | `tools/base_tool.py` | 工具基类，统一 schema |
| ToolManager | `superagi/tool_manager.py` | 工具注册/发现 |
| Toolkit 包 | `tools/<name>/` | 成套工具，可安装/卸载 |
| 响应查询 | `tools/tool_response_query_manager.py` | 工具结果落库/查询 |

内置 Toolkit 目录（经 tree 核实）：
`apollo`, `code`, `duck_duck_go`, `email`, `file`, `github`, `google_calendar`, `google_search`, `google_serp_search`, `image_generation`, `instagram_tool`, `jira`, `knowledge_search`, `resource`, `searx`, `slack`, `thinking`, `twitter`, `webscaper`

设计要点：
- 工具与 Agent 解耦：Agent 引用 toolkit，不硬编码工具
- 市场模式：社区贡献工具包扩展能力
- Action Console：人工输入与权限确认（GUI 队列）

### 2.3 上下文管理

- Agent 记忆 + 向量库检索（`vector_store/` + `vector_embeddings/`）
- Token 优化与用量管控（`apm/` 遥测辅助）
- 深度压缩策略中等；无 OpenClaw 式 memory flush 协同

### 2.4 状态与持久化

- Postgres：Agent、运行、配置、工具响应（`models/` + Alembic `migrations/`）
- 向量库：长期记忆
- Redis：Celery 队列与缓存
- `workspace/`：Agent 工作目录产物

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

| 场景 | 行为 |
|---|---|
| Celery 任务失败 | 可配置 retry；无完整 checkpoint |
| 工具异常 | 回传 LLM；仍失败则 step 失败 |
| 进程/容器重启 | 队列任务依赖 Redis 持久化；**无 durable transcript commit** |
| 配置错误 | `config.yaml` 从 `config_template.yaml` 复制；缺 key 启动失败 |

### 3.2 会话恢复

- 运行记录可查；**中续跑有限**
- 队列重启丢失风险需实测
- 无 writer claim、无 expectedWriterRunId

### 3.3 隔离

- Action Console：高风险操作人工门控（**这是核心安全特性**）
- 工具同进程执行；代码执行需外挂沙箱
- Docker 多服务进程隔离（api/celery/redis/pg 分容器）

### 3.4 幂等性与可观测

- 无 WS idempotency key
- **Performance Telemetry**（`superagi/apm/`）：延迟、错误率
- **Token 用量与成本指标**（GUI 指标面）
- 日志基础；无 OpenTelemetry 全链路

---

## 4. 自我进化

| 维度 | 现状 | OpenClaw 对照 |
|---|---|---|
| 记忆 | 多向量库 Agent 记忆 | 四层记忆文件 + 混合搜索 |
| 技能 | Toolkits 市场 | SKILL.md + Workshop |
| 评测 | 弱 | 无内建 |
| 反馈 | 记忆学习适应（基础） | Dreaming + Self-Learning |

---

## 5. 对 openmate 的借鉴

### 直接可抄（P0/P1）

1. **Action Console 权限门控**  
   - 高风险操作前插入人工确认，是生产稳定性的关键  
   - openmate 等价：exec/send-money/delete-repo 级工具走审批队列
2. **Toolkits 市场模式**  
   - 工具与 Agent 解耦，社区贡献工具包即可扩展  
   - openmate：toolkit = 目录 + base_tool 派生类 + 配置 schema
3. **异步队列并发 Agent**  
   - Celery/Redis 式 worker，避免单进程阻塞  
   - openmate：长任务 offload，主循环保持响应
4. **Token 用量遥测**  
   - `apm/` 默认可观测成本  
   - openmate P0：每次 run 记录 tokens/cost

### 应避免的坑

- 多服务部署运维重；个人助手要裁剪为单进程 + 可选 worker
- 无完整 durable，长任务需 Writer Claim 加固
- 工具同进程执行，代码类工具必须外挂沙箱
- 前端双目录（gui/ + tgwui/）增加维护成本

### 重构优先级

- **P0**：敏感操作人工审批（Action Console 等价物）
- **P0**：Token/成本遥测
- **P1**：工具包解耦与安装式扩展
- **P1**：队列化并发运行（可选 worker）
- **P2**：多向量库记忆

---

## 6. 源码阅读笔记

| 路径 | 作用 |
|---|---|
| `superagi/agent/agent_iteration_step_handler.py` | ReAct 迭代 |
| `superagi/agent/tool_executor.py` | 工具执行 |
| `superagi/agent/task_queue.py` | 任务队列 |
| `superagi/agent/workflow_seed.py` | 工作流定义 |
| `superagi/tools/base_tool.py` | 工具基类 |
| `superagi/tool_manager.py` | 工具注册 |
| `superagi/worker.py` | Celery 入口 |
| `superagi/apm/` | 遥测 |
| `superagi/controllers/` | API 路由 |
| `config_template.yaml` | 配置模板 |
| `docker-compose.yaml` | 多服务编排 |

值得摘录：
- Action Console：工具调用待确认队列，用户批准/拒绝/改参
- Toolkit 插件结构：统一入口 + 工具列表 + 配置 schema
- `workflow_seed.py`：把 ReAct/tool/wait/queue 步串成工作流

失败/边界路径备忘：
- `config.yaml` 未从 template 复制 → 启动失败
- Redis 不可达 → Celery 挂起
- Alembic 未 migrate → schema 不匹配
- GPU 本地 LLM 需 `docker-compose-gpu.yml` + `Dockerfile-gpu`

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 3 | ReAct + Toolkit + workflow steps |
| 权限/安全边界 | **4** | Action Console 人工门控 |
| 容错与会话恢复 | 2 | 队列重试有；恢复弱 |
| 上下文工程 | 3 | 记忆 + token 管控 |
| 可扩展（技能/MCP） | 4 | Toolkit 市场 |
| 可观测与可评测 | 3 | apm 遥测有 |
| 生产可用成熟度 | 3 | 曾生产向；维护波动 |

**综合**：3.1 / 5 — **审批与工具市场模式**值得抄；整体需精简。

---

## 8. 关键链接

- README：https://github.com/TransformerOptimus/SuperAGI  
- Docs：https://docs.superagi.com/（历史）  
- 相关报告：`cards/superagi.md`、`reports/openclaw.md`、`reports/autogpt-l1.md`

---

## 9. 验证深度诚实声明

- **已核实**：顶层目录与 `superagi/` 子树（agent/tools/apm/controllers/llms/models/worker/tool_manager）、agent 子文件名列表、tools 子目录列表、docker/Dockerfile* 存在、main.py/alembic.ini/config_template.yaml、GitHub 显示 MIT。
- **未能逐文件打开**：具体 ReAct prompt、Action Console 前端交互代码、Celery retry 配置数值。
- **推断标注**：Postgres 为主库（Alembic + requirements 常见）、GUI 具体框架版本、部分「版本相关」行为。
- 本报告路径均来自 GitHub HTML tree 与 README，**无捏造路径**。
