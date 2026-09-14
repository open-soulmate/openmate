# AgentBench：LLM-as-Agent 多维度评测基准架构深度分析

> **项目地址**: [THUDM/AgentBench](https://github.com/THUDM/AgentBench)
> **论文**: [arXiv:2308.03688](https://arxiv.org/abs/2308.03688) (ICLR 2024)
> **团队**: 清华大学 THUDM (唐杰团队)

---

## 1. 项目定位与核心理念

AgentBench 是**首个系统性评测 LLM 作为自主 Agent 能力的多维度基准**。不同于传统的 NLP benchmark（如 MMLU、HumanEval 等单轮问答或代码生成），AgentBench 专注于评估 LLM 在**交互式环境**中的多轮推理、决策和执行能力。

其核心理念是：LLM 的真正价值不仅在于"回答问题"，更在于"自主完成任务"。因此，AgentBench 构建了 8 个截然不同的环境，涵盖操作系统操控、数据库查询、知识图谱推理、卡牌策略博弈、网页浏览等场景，从多个维度全面检验 LLM 的 Agent 能力。

## 2. 三维解耦架构设计

AgentBench 采用**三层解耦架构**，将整个评测系统分为三个独立组件，通过 HTTP 协议通信，支持分布式部署：

### 2.1 Task Server（任务服务器）

- **Task Controller**：全局唯一的控制器，负责管理所有 Task Worker 的注册、任务分配和请求转发。提供两个核心 API：
  - `POST /api/start_sample`：启动新测试用例，返回 `session_id` 和初始 Prompt
  - `POST /api/interact`：在 Agent 和 Task 环境之间转发交互消息
- **Task Worker**：每个 Worker 承载一个具体的任务环境。支持同类型多 Worker 并发启动，绕过 Python GIL 限制。也允许单个 Task 指定最大并发数（适用于非 CPU 密集型任务）

### 2.2 Agent Server（Agent 服务器）

提供统一的 Agent 推理接口。对于开源模型，通过 FastChat 部署；对于 API 模型（如 GPT 系列），直接在 Agent Client 中实现对应接口。这种设计使得 Agent 层可以灵活替换，不影响任务层。

### 2.3 Client（客户端）

客户端由三个核心组件构成：

- **Assigner（分配器）**：核心调度逻辑，采用**最大流算法**进行实时任务分配。构建一个从 Agent 到 Task 的二部图，s→Agent 的边容量代表 Agent 并发数，Task→t 的边容量代表 Task 并发数，Agent→Task 的边容量代表待测用例数。每当 Agent 或 Task 空闲时，运行最大流算法生成分配方案。
- **Agent Client**：封装 Agent Server 的调用接口，暴露统一的 `AgentClient.inference(history)` 方法
- **Task Client**：与 Task Controller 交互，核心方法为 `TaskClient.run_sample(index, agent)`，负责在 Agent 和 Task 之间转发输出

这种解耦设计使得各组件可以**独立开发、测试和部署**，甚至分布在不同机器上，极大地提升了系统的可扩展性和维护性。

## 3. 八大评测环境体系

AgentBench v0.2 包含 8 个环境，分为 5 个原创和 3 个复用：

| 环境 | 类型 | 评估指标 | 资源需求 | 核心能力 |
|------|------|----------|----------|----------|
| OS（操作系统） | 原创 | 成功率 | < 500M | Shell 命令生成、文件操作 |
| DB（数据库） | 原创 | 成功率 | < 500M | SQL 查询、多表操作 |
| KG（知识图谱） | 原创 | F1 分数 | < 500M | SPARQL 查询、不完全信息推理 |
| DCG（数字卡牌） | 原创 | 胜率 | < 500M | 策略规划、游戏理解 |
| LTP（横向思维谜题） | 原创 | 游戏进度 | < 500M | 非常规推理、提问策略 |
| HH（家务任务） | ALFWorld | 成功率 | < 500M | 具身交互、常识推理 |
| WS（网购） | WebShop | 成功率 | ~15G | 搜索决策、商品匹配 |
| WB（网页浏览） | Mind2Web | 成功率 | ~1G | 网页操作、多步推理 |

每个环境都要求 LLM 进行**多轮交互**，Dev 集约需 4000 次 LLM 调用，Test 集约需 13000 次，这远超单轮评测的复杂度。

## 4. 任务抽象与扩展机制

AgentBench 通过 `Task` 基类定义了统一的任务接口：

```python
class Task:
    def get_indices(self) -> List[SampleIndex]: ...
    async def start_sample(self, index, session) -> TaskSampleExecutionResult: ...
    def calculate_overall(self, results) -> Dict[str, Any]: ...
    def release(self): ...
```

扩展新任务只需继承 `Task` 并实现这四个方法。`Session` 对象提供 `inject()` 和 `action()` 两个方法，分别用于注入历史记录和等待 Agent 响应。`SampleStatus` 枚举（COMPLETED、AGENT_CONTEXT_LIMIT、TASK_ERROR 等）支持精细化的失败原因统计。

## 5. YAML 配置系统

AgentBench 的配置系统基于 YAML 并做了三个语法扩展：

- **`import`**：支持从其他文件导入配置，递归合并
- **`default`**：定义默认值，低优先级合并
- **`overwrite`**：覆盖已有值，高优先级

配置目录结构清晰：`configs/assignments/`（任务分配）、`configs/agents/`（Agent 定义）、`configs/tasks/`（任务定义）、`configs/start_task.yaml`（启动配置）。这种分层配置使得切换模型、调整并发、增减任务变得非常简单。

## 6. 容器化部署与资源管理

AgentBench 深度依赖 Docker 进行环境隔离：

- **OS 任务**：使用三个自定义 Docker 镜像（default、packages、ubuntu）
- **DB 任务**：使用官方 MySQL 镜像
- **KG 任务**：依赖 Freebase Virtuoso 服务
- **其他任务**：使用预构建的 `longinyu/agentbench-*` 镜像

FC（Function Calling）版本进一步升级为 **Docker Compose 一键部署**，通过 `extra/docker-compose.yml` 统一编排所有服务，包括 AgentRL Controller、各任务 Worker、Freebase 服务器和 Redis 服务。

## 7. Function Calling 版本演进（AgentBench FC）

2025 年 10 月发布的 FC 版本是重大升级：

- **交互方式**：从纯文本 prompt 改为 **Function Calling 风格**，更贴近现代 Agent 框架（如 OpenAI Function Calling）
- **集成 AgentRL**：与 THUDM 的 AgentRL 框架集成，支持端到端多任务多轮 RL 训练
- **全容器化**：所有任务均支持 Docker Compose 部署，降低了环境配置门槛
- **保留核心任务**：AF、DB、KG、OS、WS 五个核心任务，移除了 DCG、LTP、WB

这一演进方向反映了 Agent 评测从"纯评测"向"评测+训练"一体化的趋势。

## 8. 评测指标体系

AgentBench 采用多样化的评估指标：

- **成功率（SR）**：OS、DB、HH、WS、WB 任务使用，衡量任务完成率
- **F1 分数**：KG 任务使用，考虑答案的精确率和召回率
- **胜率**：DCG 任务使用，衡量策略博弈能力
- **游戏进度**：LTP 任务使用，衡量猜出关键情节的比例

每种指标都对应特定任务的性质，而非简单统一为准确率，这体现了评测设计的专业性。

## 9. 关键发现与启示

AgentBench 论文揭示了几个重要发现：

1. **商业模型领先但差距显著**：GPT-4 等顶级商业模型表现突出，但与开源 70B 以下模型存在显著差距
2. **失败原因分析**：长期推理能力不足、决策质量低、指令遵循能力差是主要障碍
3. **代码训练的双面性**：与传统假设不同，代码训练数据对不同 Agent 任务的影响是**矛盾的**——在某些任务上有帮助，在另一些任务上反而有害
4. **指令遵循和多轮对齐是关键**：提升指令遵循能力和使用高质量多轮对齐数据可以改善 Agent 性能

## 10. 生态扩展与影响力

AgentBench 已形成完整的评测生态：

- **VisualAgentBench**：2024 年推出的视觉 Agent 评测，覆盖具身（OmniGibson、Minecraft）、GUI（Mobile、WebArena）、视觉设计（CSS）5 个环境
- **AgentRL 集成**：与 RL 训练框架打通，支持"评测→训练→再评测"闭环
- **Leaderboard**：公开的在线排行榜，持续收录各模型表现
- **社区贡献**：通过 Google Group 和 Slack 接受社区评测结果贡献

AgentBench 作为 ICLR 2024 论文，已被广泛引用，成为 LLM Agent 评测领域的重要基准。其三维解耦架构和可扩展的任务抽象为后续 Agent 评测框架提供了设计范式。

---

*本文基于 AgentBench GitHub 仓库（THUDM/AgentBench）、arXiv 论文（2308.03688）及官方文档整理分析。*
