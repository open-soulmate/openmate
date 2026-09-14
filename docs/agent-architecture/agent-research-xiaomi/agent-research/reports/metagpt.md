# FoundationAgents/MetaGPT 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/FoundationAgents/MetaGPT |
| 语言 | Python 3.9–3.11 |
| License | MIT |
| 定位一句话 | **Code = SOP(Team)**：把软件公司 SOP 物化为 LLM 角色流水线，一行需求产出完整仓库 |
| 商业 | MGX（MetaGPT X）自然语言编程产品；DeepWisdom |
| 论文 | ICLR 2024《Meta Programming for A Multi-Agent Collaborative Framework》；AFlow（ICLR 2025 oral） |
| 文档 | docs.deepwisdom.ai |

> 对 openmate：MetaGPT 是「**结构化 SOP 编排**」路线的代表——用 `_watch`/`cause_by` 消息路由把角色绑到固定流水线，比自由对话式多 Agent 更可控；断点恢复（team.json 序列化）是其生产可用性的关键设计。

---

## 1. 系统架构

### 1.1 核心抽象

```
┌─────────────────────────────────────────────────────┐
│ Team（投资预算 + 轮次上限 n_round）                    │
│  hire([Role...]) / invest() / run_project() / run()  │
├─────────────────────────────────────────────────────┤
│ Environment（消息总线 + 共享工作区）                    │
│  publish_message / history / is_idle                 │
├─────────────────────────────────────────────────────┤
│ Role（状态机角色）                                     │
│  set_actions / _watch / _observe / _think / _act     │
│  RoleContext: memory, state, todo, watch             │
├─────────────────────────────────────────────────────┤
│ Action（原子能力，含 PROMPT_TEMPLATE）                 │
│  run(...) → 解析输出 → 返回结构化结果                   │
├─────────────────────────────────────────────────────┤
│ Message（cause_by + sent_from + send_to + content）  │
└─────────────────────────────────────────────────────┘
```

### 1.2 SOP 流水线（软件公司）

| 角色 | 职责 | 上游 watch |
|---|---|---|
| ProductManager | 用户故事、竞品、需求 | UserRequirement |
| Architect | 系统设计、API、数据结构 | PRD/设计文档 |
| ProjectManager | 任务拆分 | 架构文档 |
| Engineer | 写代码 | 任务/设计 |
| QA / Reviewer | 测试与评审 | 代码/测试 |

**核心哲学**：`Code = SOP(Team)`。SOP 不是 prompt 里的软约束，而是通过 `_watch([ActionType])` 订阅上游消息类型硬性绑定。

### 1.3 关键入口

```python
# 库模式
from metagpt.software_company import generate_repo
repo = generate_repo("Create a 2048 game")

# CLI
metagpt "Create a 2048 game" --recover_path ./workspace/storage/team

# Data Interpreter（单 Agent 代码智能体）
from metagpt.roles.di.data_interpreter import DataInterpreter
di = DataInterpreter()
await di.run("Run data analysis on sklearn Iris dataset")
```

---

## 2. 核心机制深潜

### 2.1 Role 生命周期（状态机）

```
run()
  → _observe()     # 从 Environment 拉消息，按 _watch 过滤
  → react()
      → _think()   # 选择 Action 设为 rc.todo；by_order / react 模式
      → _act()     # 执行 Action，产出 Message
  → publish_message()  # 写回 Environment
```

| 概念 | 说明 |
|---|---|
| `rc.state` | 当前执行到第几个 Action（0-based）；断点恢复靠它定位 |
| `react_mode` | `by_order`（顺序执行 actions 列表）/ `react`（ReAct 循环）/ `plan_and_act` |
| `max_react_loop` | ReAct 模式最大循环次数 |
| `_watch` | 订阅上游 Action 类型；只处理匹配消息 |
| `cause_by` | 消息溯源字段，驱动路由 |

### 2.2 状态与 Memory

| 组件 | 内容 |
|---|---|
| `RoleContext.memory` | 角色私有记忆（Message 列表 + cause_by 索引） |
| `important_memory` | 根据 watch 过滤出的高相关记忆 |
| `Environment.history` | 全局对话历史字符串 |
| Serialization | 异常/结束时整体序列化到 `workspace/storage/team/team.json` |

### 2.3 工具体系

- **Action 即工具**：每个 Action 内部封装 prompt + 解析逻辑；不是 function-calling 风格的开放工具集
- **Tool 生态**：支持浏览器、搜索、代码执行等预置工具；Data Interpreter 有丰富的数据分析工具链
- **人类介入**：`is_human=True` 的 Role 可暂停等待人工输入

### 2.4 断点恢复（生产关键）

**触发条件**：
- LLM API 重试后仍失败
- Action 输出解析失败
- Ctrl-C 中断

**恢复机制**：
1. 异常时自动序列化整个 Team + Environment + Roles + Actions + Memory 到 `team.json`
2. 恢复时：`metagpt "..." --recover_path ./workspace/storage/team`
3. **Message 级恢复**：中断时删除角色 memory 中最新的那条未完成消息，恢复后 `_observe` 能重新看到它并继续执行
4. **Action 级恢复**：通过 `rc.state` 定位中断时的 Action 索引，从失败的 Action 直接重跑（不重跑已完成的 Action）

**恢复示例**：RoleB 有 [ActionOK, ActionRaise]，ActionOK 成功后 ActionRaise 抛异常 → 恢复后 `state=1`，直接从 ActionRaise 重试。

### 2.5 多 Agent 协调模式

| 模式 | 实现 |
|---|---|
| **线性流水线** | A watch UserRequirement → B watch A → C watch B |
| **扇入** | Tester 同时 `_watch([SimpleWriteCode, SimpleWriteReview])` |
| **回合制辩论** | Debate 案例：两个 Role 互 watch 对方 Action |
| **环境驱动** | 所有角色订阅同一 Environment，按 cause_by 自治响应 |
| **AFlow** | 自动搜索最优 Agent 工作流（ICLR 2025） |

### 2.6 生产模式与局限

**已产品化**：
- 一键 `generate_repo` 产出完整项目结构
- 断点续跑（序列化/反序列化）
- 投资预算 `investment` + 轮次 `n_round` 双重终止条件
- Data Interpreter 作为独立可嵌入组件

**局限**：
- SOP 硬编码，动态路由能力弱于 LangGraph/CrewAI Flows
- 恢复粒度是「消息 + Action 索引」，无细粒度 checkpoint/fork
- 生产部署需自行包装（无内置 API Server/RBAC）

---

## 3. 对 openmate 的借鉴

| 维度 | 借鉴点 |
|---|---|
| SOP 编排 | 用「消息类型订阅」而非 prompt 描述约束角色职责，可复现性更高 |
| 恢复设计 | 团队级 JSON 快照 + 删除未完成消息以重触发 observe，思路轻量可借鉴 |
| 终止条件 | investment（成本）+ n_round（轮次）双重预算，适合控制 Agent 循环成本 |
| Data Interpreter | 单 Agent 代码执行子系统可独立嵌入，与多 Agent 编排解耦 |
| 局限规避 | 不要学其硬编码流水线；openmate 若需动态协调应参考 Agno Team / ADK Workflow |

---

## 4. 版本与生态快照（截至 2026-09）

- 主线：v0.8+，`software_company.generate_repo` 为官方推荐入口
- MGX（mgx.dev）：ProductHunt #1，闭源商业化产品
- 学术线：AFlow（自动工作流搜索）、SPO、AOT
- 社区：Discord + GitHub Issues，文档中英日法齐全
