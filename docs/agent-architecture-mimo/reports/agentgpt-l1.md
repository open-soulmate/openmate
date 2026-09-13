# AgentGPT 架构深度研究报告

> 仓库: https://github.com/reworkd/AgentGPT  
> 版本快照: main @ archived 2026-01-28（仓库已 read-only）  
> 星数: ~36.3k · Fork ~9.3k · Commits 1,500  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate（混合编码 + 个人助手）提供「命名即部署」UX 与目标驱动任务分解借鉴  
> License: GPL-3.0

---

## 0. 元信息与现状

| 项 | 值 |
|---|---|
| 语言 | TypeScript（Next.js 13 create-t3-app）+ Python（FastAPI + Poetry） |
| ORM | Prisma（前端侧）+ SQLModel（平台侧） |
| DB | MySQL / PlanetScale |
| Auth | Next-Auth.js |
| LLM 工具层 | Langchain |
| Schema | Zod（TS）+ Pydantic（Py） |
| 部署 | `setup.sh` / `setup.bat` / `docker-compose.yml` |
| 状态 | **2026-01-28 归档**，产品演示价值仍在，生产基建勿当基线 |

> 对 openmate：AgentGPT 是 **「命名即部署」UX** 与 **目标→任务自分解** 的轻量实现。openmate 个人助手应抄上手门槛与目标驱动循环，而非其浅层稳定性。GPL-3.0 对闭源集成有传染风险，仅可读架构不可直接拷贝代码。

---

## 1. 系统架构

### 1.1 顶层模块图

```
┌──────────────────────────────────────────────────────────┐
│  前端 next/（create-t3-app · Next.js 13）                  │
│   命名 Agent · 输入目标 · 实时任务列表 · 设置 · Auth       │
├──────────────────────────────────────────────────────────┤
│  API 层                                                   │
│   tRPC + REST · 会话与运行管理 · Next-Auth               │
├──────────────────────────────────────────────────────────┤
│  平台 platform/reworkd_platform/（FastAPI + Poetry）      │
│   目标 → 任务列表 → 逐步执行 → 从结果学习               │
│   env 前缀: REWORKD_PLATFORM_*                            │
├──────────────────────────────────────────────────────────┤
│  数据层                                                   │
│   Prisma（next/db）+ SQLModel（platform/db）+ MySQL      │
├──────────────────────────────────────────────────────────┤
│  外部集成                                                 │
│   Langchain · Serper 搜索 · Replicate · OpenAI API       │
└──────────────────────────────────────────────────────────┘
```

### 1.2 真实源码布局（经 GitHub tree 核实）

```
AgentGPT/
├── cli/                         # CLI 工具
├── db/                          # 数据库迁移/脚本
├── docs/
├── next/                        # 前端 T3 应用
│   ├── prisma/                  # Prisma schema（推断，随版本）
│   └── src/                     # 页面、tRPC、组件
├── platform/                    # Python Agent 运行时（fastapi_template 生成）
│   ├── reworkd_platform/
│   │   ├── db/
│   │   │   ├── dao/             # Data Access Objects
│   │   │   └── models/          # SQLModel / ORM
│   │   ├── schemas/             # 请求/响应 Pydantic schema
│   │   ├── services/            # 外部服务封装（LLM/搜索等）
│   │   ├── tests/
│   │   ├── web/
│   │   │   ├── api/             # 路由处理器
│   │   │   ├── application.py   # FastAPI app
│   │   │   └── lifetime.py      # startup/shutdown
│   │   ├── __main__.py          # uvicorn 入口
│   │   ├── constants.py
│   │   ├── logging.py
│   │   ├── settings.py          # pydantic BaseSettings
│   │   └── timer.py
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── poetry.lock
│   └── pyproject.toml
├── scripts/
├── docker-compose.yml
├── setup.sh / setup.bat
└── README.md
```

关键事实（来自 platform/README 与代码树）：
- 平台由 **fastapi_template** 生成，配置前缀固定为 `REWORKD_PLATFORM_`
- 示例 env：`REWORKD_PLATFORM_RELOAD=True`、`REWORKD_PLATFORM_PORT=8000`、`REWORKD_PLATFORM_ENVIRONMENT=development`
- 测试库用 bitnami/mysql:8.0.30，库名/用户/密码均为 `reworkd_platform`
- Poetry 管理依赖；`poetry run python -m reworkd_platform` 启动
- Swagger 文档路径：`/api/docs`

### 1.3 进程/线程模型

- 前端 SPA（Next.js）；后端 API（FastAPI/uvicorn）+ 可选 Celery/worker（早期版本）。
- 执行为 **队列式任务推进**，非实时双向协作；前端轮询/SSE 刷新任务状态。
- Docker Compose / `setup.sh` 一键本地部署（env + MySQL + 后端 + 前端）。

### 1.4 与 LLM 的调用链路

```
用户：命名 Agent + 目标（前端表单）
  → tRPC/REST 提交 → platform web/api 路由
  → services/ 调 Langchain：LLM 生成 JSON 任务列表
  → 持久化任务行（SQLModel → MySQL）
  → 逐任务执行：prompt = 目标 + 任务描述 + 前序结果摘要
       → 可选工具：Serper 搜索 / 网页 / 代码（版本相关）
  → 结果写回任务行 → 前端轮询刷新
  → 「从结果学习」：用已完结果调整后续任务 prompt（浅层）
```

失败路径：
- LLM 生成非 JSON → schema 校验失败 → 重试或标记任务失败
- 工具 API 超时/配额尽 → 任务标记失败，循环可继续下一任务或停止
- 进程被杀 → **无 durable checkpoint**，运行中断不可从中间恢复

---

## 2. 核心机制深潜

### 2.1 Agent Loop

**目标 → 任务分解 → 逐步执行**（非复杂多 Agent）：

1. 用户输入 goal 字符串 + agent 名称
2. LLM 生成结构化任务列表（JSON）
3. 前端展示可编辑/可重排任务列表（产品层能力）
4. 逐步执行：每任务独立 prompt 调用
5. 停止条件：任务全部完成、用户手动停止、或步数/轮次上限

约束：
- 单 Agent + 工具，无 subagent 树
- 无 lane 队列、无 writer claim
- 步数上限与 token 预算依赖早期配置，非生产级

### 2.2 工具系统

| 机制 | 说明 |
|---|---|
| Langchain 工具层 | 搜索（Serper）、网页、代码（版本相关） |
| 可选启用 | 工具开关，核心循环不强绑 |
| schema | 较简单，无细粒度权限策略 |
| 沙箱 | **无**；工具为外部 API 或同进程执行 |

失败路径：
- Serper key 缺失 → 搜索工具不可用，任务降级或失败
- 代码工具若启用则同进程，无隔离

### 2.3 上下文管理

- **任务列表作为工作记忆**：每任务独立 prompt：目标 + 任务描述 + 前序结果摘要
- 长目标易截断；无 compaction、无 memory flush、无 token 预算硬门控
- 跨任务传递靠摘要，信息损失大

### 2.4 状态与持久化

- MySQL：Agent 定义、运行、任务、结果
- 前端 Prisma 模型 + 平台 SQLModel 双栈，一致性靠应用层保证
- 历史运行可查看（只读为主）；**中续跑能力弱**
- 无 SQLite writer claim、无 transcript fenced commit

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

| 路径 | 行为 |
|---|---|
| 单任务失败 | 标记失败；可继续下一任务或停止 |
| LLM 瞬态错误 | 有限重试（依赖 Langchain 默认） |
| 进程崩溃 | **无 durable checkpoint**，运行中断 |
| API 网关失败 | 前端重试有限；无幂等 key |

对比 OpenClaw：无 rate-limit 10 次尝试、无 90s 窗口 8 重试、无 exponential backoff + jitter、无 provider pacing。

### 3.2 会话恢复

- 运行记录可查看；**不能从中间 step 续跑**
- 无 gateway 重启自动 resume、无 3 次失败启动预算

### 3.3 隔离

- **无代码沙箱**
- 工具为外部 API 或同进程 Python
- 部署面向自托管，权限模型简单（Next-Auth 登录即可）

### 3.4 幂等性与可观测

- 无 WS idempotency key、无 dedupe cache
- 前端任务列表实时状态；日志基础（logging.py）；无深度 trace / OpenTelemetry
- 无 Token 成本遥测（早期版有简单用量展示）

---

## 4. 自我进化

| 维度 | 现状 | OpenClaw 对照 |
|---|---|---|
| 记忆 | 运行内任务结果；跨运行弱 | USER.md / MEMORY.md / daily notes / DREAMS.md 四层 |
| 技能 | 工具开关 | SKILL.md + Workshop + Self-Learning |
| 评测 | 无内建 | 无直接等价，但有 transcript 可回放 |
| 反馈 | 「从结果学习」浅层调整后续任务 | Dreaming 六信号 ranking + taint gate |

---

## 5. 对 openmate 的借鉴

### 直接可抄（P0）

1. **「命名即部署」UX**：给 Agent 起名字 + 目标一句话，极大降低上手门槛  
   - openmate：个人助手首次启动只问 name + 一句话目标
2. **目标→任务列表 UI**：用户可见、可编辑、可停止  
   - 对应 openmate 任务面板：状态、重试、跳过
3. **前后端分离 + 标准化 setup**：`setup.sh`/`setup.bat` 一键可跑
4. **任务结果回填列表**：每步状态透明

### 应避免的坑

- 稳定性浅：无恢复、无预算、无审批 → openmate 必须先落 Writer Claim + 超时体系
- 自主循环易烧 token 且产出质量不稳
- **GPL-3.0**：闭源集成有传染风险，仅可读架构
- 双 ORM（Prisma + SQLModel）增加一致性成本，openmate 应单栈

### 重构优先级

- **P0**：目标→任务→执行的透明 UI
- **P0**：一键本地 setup
- **P1**：任务可编辑/停止/重试 + durable checkpoint
- **P1**：执行审批（高风险工具）
- **P2**：跨运行记忆
- **P2**：Token/成本遥测

---

## 6. 源码阅读笔记

| 路径 | 作用 |
|---|---|
| `platform/reworkd_platform/settings.py` | pydantic BaseSettings，env 前缀 `REWORKD_PLATFORM_` |
| `platform/reworkd_platform/constants.py` | 运行常量 |
| `platform/reworkd_platform/timer.py` | 计时/超时辅助 |
| `platform/reworkd_platform/web/application.py` | FastAPI 应用装配 |
| `platform/reworkd_platform/web/lifetime.py` | startup/shutdown 钩子 |
| `platform/reworkd_platform/web/api/` | 路由 |
| `platform/reworkd_platform/services/` | LLM/搜索等外部服务 |
| `platform/reworkd_platform/db/dao/` | 数据访问 |
| `platform/reworkd_platform/db/models/` | SQLModel 模型 |
| `next/` | T3 前端：页面、tRPC、组件 |
| `setup.sh` / `setup.bat` | 一键安装：env、MySQL、后端、前端 |
| `docker-compose.yml` | 本地编排 |

值得摘录的模式：
- 目标分解 prompt：生成 JSON 任务列表（在 services/ 或 agent 相关模块）
- 前端轮询/SSE 刷新任务状态
- `REWORKD_PLATFORM_` 前缀配置隔离，适合多环境

失败/边界路径备忘：
- Poetry lock 与 Dockerfile 不同步 → 构建失败
- MySQL 未就绪 → platform 启动失败（entrypoint.sh 需 wait）
- Langchain 版本漂移 → 工具 schema 不兼容

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 2 | Langchain 简单封装 |
| 权限/安全边界 | 1 | 弱；无沙箱、无审批 |
| 容错与会话恢复 | 1 | 无 checkpoint、无续跑 |
| 上下文工程 | 2 | 任务列表有限，无 compaction |
| 可扩展（技能/MCP） | 2 | 工具开关，无 MCP |
| 可观测与可评测 | 2 | 任务 UI；无 trace |
| 生产可用成熟度 | 1 | 已归档；演示/轻量 |

**综合**：1.6 / 5 — **UX 教科书**，生产基建弱。仅供 openmate 抄交互与上手门槛。

---

## 8. 关键链接

- README：https://github.com/reworkd/AgentGPT  
- 归档公告：2026-01-28 owner archived  
- Docs：https://docs.agentgpt.reworkd.ai/（历史）  
- 相关报告：`cards/agentgpt.md`、`reports/openclaw.md`、`reports/autogpt-l1.md`

---

## 9. 验证深度诚实声明

- **已核实**：仓库归档状态、顶层目录（cli/db/docs/next/platform/scripts）、platform 子树（db/schemas/services/tests/web + settings/constants/timer/logging/__main__）、README 技术栈与 env 前缀 `REWORKD_PLATFORM_`、setup 脚本存在、GPL-3.0。
- **未能逐文件打开**：具体 agent loop 实现文件、任务分解 prompt 原文、Langchain 工具绑定细节（raw.githubusercontent 与 API 在本环境 403/超时）。
- **推断标注**：Prisma schema 位置、早期 Celery worker、SSE/轮询细节基于 README/社区常识，非本次 tree 逐文件确认。
- 本报告路径均来自 GitHub HTML tree 与 README，**无捏造路径**。
