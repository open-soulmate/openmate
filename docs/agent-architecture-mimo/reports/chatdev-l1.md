# ChatDev 架构深度研究报告

> 仓库: https://github.com/OpenBMB/ChatDev  
> 版本快照: main（ChatDev 2.0 / DevAll）· Commits 205  
> 星数: ~34.3k · Fork ~4.3k  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供阶段化流水线、YAML 配置驱动多 Agent、产物传递借鉴  
> License: Apache-2.0（2.0）；1.0 时代 MIT 见历史分支

---

## 0. 元信息与现状

| 项 | 值 |
|---|---|
| 定位 | 从「虚拟软件公司」多 Agent 演化为零代码多 Agent 编排平台（ChatDev 2.0 / DevAll） |
| 分支 | `chatdev1.0` 保留经典虚拟公司范式；**主分支 2.0 YAML 工作流** |
| 语言 | Python 3.12+（uv）+ Node 18+（Vite + Vue 3） |
| 后端 | FastAPI（`server_main.py`）默认端口 **6400** |
| 前端 | Vue 3 Web Console 默认端口 **5173** |
| 包管理 | uv（`uv.lock`）+ npm（frontend） |
| 研究 | MacNet DAG 千级 Agent（`macnet` 分支）· Puppeteer RL 编排（NeurIPS 2025，`puppeteer` 分支） |
| 集成 | OpenClaw skill：`clawdhub install chatdev` |

> 对 openmate：ChatDev 1.0 是角色扮演软件公司的经典教材；2.0 的 **YAML 工作流 + 可视化画布** 说明「配置驱动多 Agent」比纯代码更易传播。openmate 应看 1.0 角色/阶段设计，抄 2.0 配置化思想。

---

## 1. 系统架构

### 1.1 顶层模块图

```
┌──────────────────────────────────────────────────────────┐
│  ChatDev 2.0（主分支）                                    │
│   YAML 工作流 · 可视化画布 · Python SDK · OpenClaw 集成   │
│   server/ + workflow/ + runtime/ + entity/ + frontend/    │
├──────────────────────────────────────────────────────────┤
│  ChatDev 1.0（chatdev1.0 分支）                           │
│   虚拟软件公司：CEO/CTO/程序员/测试/设计等角色            │
│   阶段流水线：设计 → 编码 → 测试 → 复盘                  │
│   角色间消息传递 · 文档协作 · Git 提交                    │
├──────────────────────────────────────────────────────────┤
│  研究层                                                   │
│   MacNet（DAG 拓扑千级 Agent）· Puppeteer RL 编排         │
└──────────────────────────────────────────────────────────┘
```

### 1.2 真实源码布局（经 GitHub tree 核实，main = 2.0）

```
ChatDev/
├── .agents/skills/                 # OpenClaw/agent skills
├── assets/
├── check/
├── docs/user_guide/
├── entity/                         # Agent/工作流实体定义
├── frontend/                       # Vite + Vue 3 Web Console
├── functions/                      # 自定义 Python 工具
├── mcp_example/
├── runtime/
│   ├── bootstrap/
│   ├── edge/
│   ├── node/
│   └── sdk.py                      # run_workflow() SDK 入口
├── schema_registry/
├── server/                         # FastAPI 后端
├── tests/
├── tools/
├── utils/
├── workflow/
│   ├── executor/                   # 节点执行器
│   ├── hooks/
│   ├── runtime/
│   ├── cycle_manager.py
│   ├── graph.py                    # 图结构
│   ├── graph_context.py
│   ├── graph_manager.py
│   ├── subgraph_loader.py          # 子工作流加载
│   └── topology_builder.py         # 拓扑构建
├── yaml_instance/                  # 可运行工作流配置
├── yaml_template/                  # 工作流模板
├── run.py
├── server_main.py                  # uvicorn 入口
├── Makefile                        # dev / sync / validate-yamls
├── compose.yml · Dockerfile
├── pyproject.toml · uv.lock
└── requirements.txt · package.json
```

### 1.3 进程/线程模型

- **2.0**：FastAPI 后端 + Vue 前端；工作流引擎调度节点；可服务化部署  
- **1.0**：单进程 Python，阶段顺序执行，角色间同步对话  
- MacNet：DAG 拓扑，可大规模并行（研究原型）

启动（Makefile 推荐）：
```
make dev
# 等价：后端 server_main.py --port 6400；前端 VITE_API_BASE_URL=http://localhost:6400
```

已知失败路径（README 明示）：
- 默认端口 6400 被占用 → 前端连不上；改 `--port 6401` + `VITE_API_BASE_URL`
- `--reload` 默认只 watch 源码目录；agent 生成的 `WareHouse/` 不触发重启
- YAML 语法/schema 错误 → `make validate-yamls` 检出

### 1.4 与 LLM 的调用链路

```
2.0:
YAML 定义 Agent/工作流/任务（yaml_instance/）
  → workflow/topology_builder.py 建图
  → graph_manager.py 调度
  → executor/ 执行节点（runtime/node + edge）
  → run_workflow() 返回 final_message

1.0:
用户需求 → Phase 流水线
  → 设计师 Agent 出设计文档
  → 程序员 Agent 写代码
  → 测试 Agent 写用例并跑
  → 复盘 Agent 总结
  → 交付物（代码+文档 → WareHouse/）
```

---

## 2. 核心机制深潜

### 2.1 Agent Loop

**1.0**：**阶段化流水线**而非开放式 while
- 每阶段角色对话轮数有限（Phase 类配置）
- 角色有明确 system prompt（职位、职责、约束、输出格式）
- 停止：阶段完成、轮数上限、或人工中断

**2.0**：节点级执行
- `workflow/graph.py` + `topology_builder.py` 构建 DAG
- `subgraph_loader.py` 支持嵌套子工作流
- `cycle_manager.py` 管理循环边
- `runtime/sdk.py` 的 `run_workflow(yaml_file, task_prompt, attachments, variables)` 为编程入口

SDK 示例（README）：
```python
from runtime.sdk import run_workflow
result = run_workflow(
    yaml_file="yaml_instance/demo.yaml",
    task_prompt="Summarize the attached document in one sentence.",
    attachments=["/path/to/document.pdf"],
    variables={"API_KEY": "sk-xxxx"},
)
if result.final_message:
    print(result.final_message.text_content())
```

### 2.2 工具系统

| 机制 | 说明 |
|---|---|
| 1.0 内置 | 代码执行、文件读写、终端命令（**同进程风险高**） |
| 2.0 节点工具 | 节点配置工具；`functions/` 放自定义 Python |
| 角色绑定 | 程序员有代码工具，测试有用例工具 |
| MCP | `mcp_example/` 示例；可接外部 MCP |
| Docker 执行 | 1.0 社区贡献 Docker 安全执行 |

### 2.3 上下文管理

- **1.0：产物优于聊天** — 阶段间传递文档/代码产物，而非全量 chat history
- 复盘阶段总结经验，注入后续（弱记忆）
- 2.0：工作流上下文流可配置（`graph_context.py`）

### 2.4 状态与持久化

- 1.0：项目目录落盘（代码、文档、聊天记录 → `WareHouse/`）
- 2.0：工作流定义 YAML + 运行记录；`make sync` 上传 yaml_instance/ 到数据库
- 前端 Launch 标签可监控实时日志、中间产物、人工反馈

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

| 路径 | 行为 |
|---|---|
| 1.0 测试失败 | 可触发修复循环（有限轮） |
| 中断 | **无 durable checkpoint**；需重跑阶段 |
| 2.0 节点失败 | 策略可配置（版本相关） |
| 端口冲突 | 显式改端口（README） |

### 3.2 会话恢复

- 1.0：项目目录可重载继续（有限）
- 2.0：工作流实例状态依赖平台实现；画布可视化执行状态

### 3.3 隔离

- 1.0：代码执行同进程，**风险高**
- 2.0：可接外部执行环境（版本相关）
- Docker Compose：服务级隔离

### 3.4 可观测

- 1.0：聊天日志与产物目录
- 2.0：画布可视化 + Launch 实时日志 + 人工反馈

---

## 4. 自我进化

| 维度 | 现状 | OpenClaw 对照 |
|---|---|---|
| 记忆 | 1.0 复盘阶段总结；项目级文件 | 四层记忆 + Dreaming |
| 技能 | 角色 prompt 即技能；2.0 节点可复用；`.agents/skills/` | SKILL.md + Workshop |
| 评测 | 软件产出质量（测试通过率） | 无内建 |
| 反馈 | 复盘注入后续阶段 | Self-Learning immediate repair |

研究向：Puppeteer RL 编排（NeurIPS 2025）用可学习中心 orchestrator 动态激活/排序 Agent。

---

## 5. 对 openmate 的借鉴

### 直接可抄

1. **阶段化流水线**：设计→编码→测试→复盘，每阶段角色专职、上下文收窄
2. **角色 + 工具绑定**：程序员有代码工具，测试有用例工具，比万能 Agent 可控
3. **产物优于聊天**：阶段间传文档/代码，而非全量 history
4. **YAML 即工作流**：配置驱动多 Agent，便于传播与版本化
5. **复盘阶段**：任务结束总结教训，可注入下次
6. **validate-yamls**：schema 校验门禁，防坏配置上线

### 应避免的坑

- 1.0 代码执行无沙箱，不可直接用于生产
- 角色扮演过重时对话成本高、易跑偏
- 2.0 平台成熟度需自测；端口/热重载边界要写进运维文档
- 双分支（1.0/2.0）增加认知负担

### 重构优先级

- **P0**：编码任务阶段化（规划/实现/测试/复盘）
- **P0**：产物文件传递而非全量 history
- **P1**：角色-工具绑定权限
- **P1**：工作流 YAML schema 校验
- **P2**：YAML 声明式完整编排 + 可视化画布

---

## 6. 源码阅读笔记

| 路径（2.0 main） | 作用 |
|---|---|
| `workflow/topology_builder.py` | 从 YAML 建图 |
| `workflow/graph.py` / `graph_manager.py` | 图结构与调度 |
| `workflow/subgraph_loader.py` | 子工作流 |
| `workflow/cycle_manager.py` | 循环管理 |
| `workflow/executor/` | 节点执行 |
| `runtime/sdk.py` | `run_workflow()` |
| `runtime/node/` · `runtime/edge/` | 节点/边运行时 |
| `entity/` | Agent/工作流实体 |
| `functions/` | 自定义工具 |
| `yaml_instance/` | 可运行工作流（demo_*.yaml、GameDev_v1.yaml 等） |
| `yaml_template/` | 模板 |
| `server/` | FastAPI |
| `frontend/` | Vue 3 画布 |
| `Makefile` | dev / sync / validate-yamls |
| 1.0（`chatdev1.0` 分支）`chatdev/roles/` · `chatdev/phases/` | 角色与阶段 |

值得摘录：
- Phase 类：每阶段指定参与者角色与聊天轮数上限（1.0）
- Role system prompt：职位 + 职责 + 约束 + 输出格式
- `make validate-yamls`：语法 + schema 双检

失败/边界路径备忘：
- 端口 6400 占用 → 前后端都改
- YAML `${VAR}` 未注入 → 节点 LLM 调用失败
- blender 类工作流依赖外部 Blender + blender-mcp
- teach_video 工作流需 `uv add manim`

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 3 | 阶段/节点清晰；工具策略简 |
| 权限/安全边界 | 2 | 角色绑定有；1.0 无沙箱 |
| 容错与会话恢复 | 2 | 测试修复循环；无 checkpoint |
| 上下文工程 | 3 | 阶段传产物好 |
| 可扩展（技能/MCP） | 3 | 节点复用 + MCP 示例 |
| 可观测与可评测 | 3 | 画布 + 日志 + 产物 |
| 生产可用成熟度 | 2 | 研究/演示向 → 2.0 平台化中 |

**综合**：2.6 / 5 — **阶段化与配置驱动有教学价值**，生产需重构。

---

## 8. 关键链接

- README：https://github.com/OpenBMB/ChatDev  
- 1.0 分支：`chatdev1.0`  
- MacNet：`macnet` · arXiv:2406.07155  
- Puppeteer：`puppeteer` · arXiv:2505.19591 · NeurIPS 2025  
- 相关报告：`cards/chatdev.md`、`reports/metagpt.md`、`reports/openclaw.md`

---

## 9. 验证深度诚实声明

- **已核实**：main 顶层目录（entity/frontend/functions/runtime/schema_registry/server/workflow/yaml_instance/yaml_template 等）、workflow 子文件（executor/hooks/runtime/cycle_manager/graph/graph_context/graph_manager/subgraph_loader/topology_builder）、runtime 子目录（bootstrap/edge/node/sdk.py）、server_main.py/run.py/Makefile/compose.yml、端口 6400/5173、uv + Vue 3、OpenClaw skill 说明、1.0 在 chatdev1.0 分支。
- **未能逐文件打开**：Phase/Role 类具体实现、YAML schema 字段全集、节点失败策略默认值。
- **推断标注**：1.0 的 `chatdev/roles/`、`chatdev/phases/` 路径来自既有 L1 报告与社区共识，本次未打开 1.0 分支 tree。
- 本报告 2.0 路径均来自 GitHub HTML tree 与 README，**无捏造路径**。
