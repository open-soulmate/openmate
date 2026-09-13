# GPT Pilot

## 概述

GPT Pilot 是一个AI软件开发助手。

**仓库**: https://github.com/Pythagora-io/gpt-pilot | **语言**: Python

## 核心架构

> **项目地址**: https://github.com/Pythagora-io/gpt-pilot  
> **Stars**: 33.8K | **Forks**: 3,469  
> **定位**: "The first real AI developer" — 由 Pythagora 开发的 AI 驱动软件开发框架，核心理念是 AI 可以编写 95% 的代码，但剩余 5% 仍需要开发者介入直至实现完全 AGI。  
> **⚠️ 安全警告**: 该仓库已于 2025-2026 年间被注入供应链恶意代码（藏于 `core/telemetry/` 中的凭据窃取蠕虫），目前不再积极维护。

GPT Pilot 采用**多 Agent 流水线架构**，核心由一个 `Orchestrator`（编排器）驱动多个专职 Agent 协同完成从需求描述到可运行应用的全栈代码生成。

**目录结构**:
[详见源码]

架构的核心设计哲学是**状态驱动的 Agent 流水线**：每个 Agent 运行后产生一个 `AgentResponse`，Orchestrator 根据响应类型决定下一步调用哪个 Agent，形成一个持续循环直到项目完成或用户退出。

`Orchestrator.run()` 实现了核心的**事件循环**：

```python
while True:
    agent = self.create_agent(response)  # 根据状态和上一个响应决定下一个 Agent
    if isinstance(agent, list):
        responses = await asyncio.gather(*[a.run() for a in agent])  # 并行执行
        response = self.handle_parallel_responses(agent[0], responses)
    else:
        response = await agent.run()  # 串行执行

    if response.type == ResponseType.EXIT:
...

`create_agent()` 方法是一个**路由函数**，根据当前项目状态（当前任务状态、迭代状态、步骤类型等）决定下一个应该执行的 Agent：

- 无规格说明 → `SpecWriter`
- 有规格但无 Epic → `TechLead`  
- 有 Task 且步骤类型为 `save_file` → `CodeMonkey`（支持并行多个）
- 有 Task 且步骤类型为 `command` → `Executor`
- 需要人工输入 → `HumanInput`
- 任务完成需要测试 → `Troubleshooter`
- 陷入循环 → `ProblemSolver`

| 维度 | 设计选择 |
|------|----------|
| **架构模式** | 多 Agent 流水线 + 状态机 |
| **状态管理** | 双态（current/next）乐观锁 + SQLite 持久化 |
| **Agent 通信** | 标准化 AgentResponse 枚举 |
| **LLM 集成** | Agent 级模型配置 + Pydantic Schema 约束 |
| **人机协作** | 迭代反馈循环 + 循环检测 + 替代方案生成 |
| **代码生成** | 模板化 prompt + diff 审查 + 多后端回退 |
| **UI 层** | 抽象接口 + 多前端支持 |
| **项目管理** | Epic → Task → Step 三级分解 |
| **错误处理** | 专用 ErrorHandler Agent + 最大重试限制 |
| **可观测性** | 全量 LLM 请求日志 + 遥测 + 项目统计 |

GPT Pilot 的架构对 Agent 开发的启示：**将复杂的代码生成任务拆解为多个专职 Agent 的协作，通过状态机管理流程，结合人机迭代反馈实现质量保障**。这种模式比单一 Agent 端到端生成更可靠，也更贴近真实软件开发的协作方式。

## 关键技术

**README 顶部 CAUTION（源码实读）**:

> **Malicious code was found and removed.** A supply-chain worm (credential stealer) was hidden in `core/telemetry/` from **August 2025** until **11 June 2026**.

| 项 | 事实 |
|----|------|
| 恶意 commit | `065ee8eb`，2025-08-24，伪装 "Revert 'Implemented weekend discount'" |
| 公开报告 | 2026-06-08 外部安全研究员 |
| 移除 | 2026-06-11 |
| Loader | `core/telemetry/_hooks.py`（程序启动自动执行） |
| Payload | `core/telemetry/_runtime.bin`（Shai-Hulud 类蠕虫） |
| 行为 | 下载 Bun runtime → 混淆 payload → 窃取 AWS/GitHub/npm/SSH 凭证 → 横向传播 |
| IoC | `_runtime.bin`、`_hooks.py`、`.loader.lock`、意外 bun 二进制、`rt-*` 临时目录 |
| 维护状态 | **本仓不再活跃维护**（恶意 commit 长期未被发现的原因） |

**对 openmate 的直接教训**:
1. 供应链监控必须覆盖 telemetry/ 隐藏目录
2. 不活跃仓库不可作为依赖
3. 伪装成 revert 的 commit 需审查
4. 启动即执行的 hook 目录是攻击面

**本报告其余部分基于清理后的 main 分支 README。**

- LLM Provider: `openai` | `anthropic` | `groq`
- Azure / OpenRouter 经 openai 设置
- API key（null 则读环境变量）
- 数据库: sqlite 默认；PostgreSQL 需 `asyncpg` + `psycopg2`
- `fs.ignore_paths`: 忽略编译产物等

PostgreSQL URL:
```
postgresql+asyncpg://:@/
```

```
供应链蠕虫（历史）
  core/telemetry/_hooks.py 启动执行
  → 下载 Bun → _runtime.bin 窃密
  → IoC: _runtime.bin, _hooks.py, .loader.lock, bun, rt-*

--step 回退
  → 删除该 step 之后所有进度

--delete
...

1. **telemetry/ 类目录启动即执行 = 攻击面**，需 code review + 不自动 import
2. **不活跃仓库不可作生产依赖**
3. **伪装 revert 的 commit 需人工审**
4. **供应链扫描要覆盖隐藏 loader + 二进制 payload**
5. **凭证轮换流程必须有**（事件响应）

- https://github.com/Pythagora-io/gpt-pilot
- https://www.pythagora.ai/
- 相关: `reports/gpt-engineer-l1.md`、`reports/smol-developer-l1.md`、`reports/devika-l1.md`

从 gpt-pilot 事故提炼:

| 控制 | 要求 |
|------|------|
| 启动即执行目录 | telemetry/hooks 类必须人工审 |
| 二进制 payload | 仓内禁止；构建期拉取需 checksum |
| 伪装 revert | commit message 与 diff 必须一致 |
| 不活跃依赖 | >6 个月无维护需告警 |
| CI | 秘密扫描 + 恶意模式（bun 下载、混淆 bin） |
| 发布 | SBOM + 签名 |
| 事件响应 | 凭证轮换 runbook |

**绝不** `import` 未审的 `telemetry`/`hooks`/`_runtime` 模块。

---

## 对openmate的启示

> 仓库: https://github.com/Pythagora-io/gpt-pilot  
> 抓取通道: cdn.jsdelivr.net/gh/Pythagora-io/gpt-pilot@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多角色开发流水线 / 上下文过滤 / 安全供应链教训 借鉴

---

| 需求 | GPT Pilot 机制 | 可复用度 |
|------|---------------|----------|
| 多角色流水线 | 11 角色链 | **高** |
| Reviewer 闭环 | 打回 Code Monkey | **高** |
| 计划/实现分离 | Developer vs Code Monkey | **高** |
| 上下文过滤 | 只放当前 task 相关代码 | **高** |
| Step 级回退 | --project --step | 高 |
| 任务粒度调优 | 太宽/太窄都差 | **高** |
| Product Owner no-op | 流程隐喻 | 低 |
| 供应链安全教训 | telemetry 蠕虫 | **P0 警示** |
| VS Code 集成 | extension | 中 |
| 多 provider | openai/anthropic/groq | 高 |

---

| # | GPT Pilot 角色 | openmate 对应 | 优先级 |
|---|----------------|---------------|--------|
| 1 | Product Owner | （可选）需求确认 | P2 |
| 2 | Specification Writer | 需求澄清 Agent | P1 |
| 3 | Architect | 技术选型 + 依赖检查 | **P0** |
| 4 | Tech Lead | 任务拆分 | **P0** |
| 5 | Developer | 步骤人类可读描述 | **P0** |
| 6 | Code Monkey | 实现（与 Developer 分离） | **P0** |
| 7 | Reviewer | 审查并可打回 | **P0** |
| 8 | Troubleshooter | 收集用户反馈 | P1 |
| 9 | Debugger | 失败救援 | **P0** |
| 10 | Technical Writer | 文档 | P2 |
| 11 | （人类） | HITL 审批 | **P0** |

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（95-gpt-pilot.md）
- MiMo报告（gpt-pilot-l1.md）
- MiMo卡片（gpt-pilot.md）
