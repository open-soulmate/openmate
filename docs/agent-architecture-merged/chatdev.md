# ChatDev

## 概述

ChatDev 是一个AI软件开发团队。

**仓库**: https://github.com/OpenBMB/ChatDev | **Stars**: 34,272 | **语言**: Python | **License**: Apache-2.0

## 核心架构

> **项目**: OpenBMB/ChatDev (GitHub ⭐ 34,272)
> **论文**: *ChatDev: Communicative Agents for Software Development* (ACL 2024)
> **最新版本**: ChatDev 2.0 "DevAll" (2026年1月发布)
> **许可**: Apache-2.0

`workflow/` 是整个系统的心脏，包含：

- **`GraphContext`** — 运行时图上下文，持有节点映射、边列表、拓扑层、子图、环检测状态和输出目录。
- **`GraphExecutor`** — 核心执行器，负责：
  1. 构建全局记忆（`_build_global_memories`）
  2. 构建 Thinking Manager（`_build_thinking_managers`）
  3. 构建 Agent 记忆管理器（`_build_agent_memories`）
  4. 构建节点执行器（`_build_node_executors`）
  5. 根据图拓扑选择执行策略

**三种执行策略**：

| 策略 | 适用场景 | 实现 |
|---|---|---|
| `DagExecutionStrategy` | 无环 DAG | `DAGExecutor` — 按拓扑层顺序执行 |
| `CycleExecutionStrategy` | 含环图 | `CycleExecutor` — 支持循环执行、终止条件 |
| `MajorityVoteStrategy` | 无边并行投票 | `ParallelExecutor` + 投票收集 |

ChatDev 2.0 的 Agent 节点是高度可配置的：

- **Prompt 模板** — 支持 `{{variable}}` 模板变量，由上游节点输出填充
- **Provider 抽象** — 支持 OpenAI、多种本地/远程 LLM 提供者
- **Memory 扩展** — Agent 可挂载全局记忆存储，支持 Simple、File、Mem0、Blackboard 等后端
- **Thinking 扩展** — 支持 Reflection Thinking 等推理增强模式
- **Skills 系统** — Agent 可配置技能（`AgentSkillsConfig`）
- **Retry 策略** — `AgentRetryConfig` 控制失败重试行为

与 v1.0 的"角色扮演"不同，v2.0 的 Agent 是工作流图中的一个节点，角色语义由 prompt 和配置隐式定义。

记忆系统支持多种后端实现：

- **SimpleMemory** — JSON 文件持久化，最简单的键值存储
- **FileMemory** — 基于文件的读写
- **Mem0Memory** — 集成 Mem0 记忆框架
- **BlackboardMemory** — 黑板模式，多 Agent 共享读写

Agent 通过 `MemoryManager` 挂载全局记忆，支持声明式引用：

```yaml
nodes:
  - id: researcher
    type: agent
    config:
      memories:
        - name: shared_knowledge
          mode: read_write
```

全局记忆在工作流开始时加载（`_build_global_memories`），执行结束后自动持久化（`_save_memories`）。

ChatDev 2.0 的可扩展性体现在多个层面：

1. **节点类型注册表** — 通过 `register_node_type()` 注册新节点类型，无需修改核心代码
2. **Schema Registry** — `schema_registry` 自动从注册信息生成配置 schema，供前端动态渲染
3. **工具插件** — MCP 协议支持即插即用的工具集成
4. **Provider 扩展** — `runtime/node/agent/providers/builtin_providers.py` 支持注册新 LLM 提供者
5. **思考模式扩展** — `ThinkingManagerFactory` 支持新的推理策略
6. **记忆后端扩展** — `MemoryFactory` 支持新的记忆存储实现

| 维度 | v1.0 (Legacy) | v2.0 (DevAll) |
|---|---|---|
| 范式 | 虚

## 关键技术

1. **工作流即 YAML + 可视化画布**：把多 Agent 编排从代码变成可拖拽/可版本化的数据，零代码门槛。
2. **学术范式沉淀成工程**：MacNet（DAG 拓扑，千级 Agent 不爆上下文）、IER/经验协同学习、puppeteer（RL 学中央调度器）——把研究成果落地成可跑平台。
3. **SDK + Web 双入口**：既能可视化拖拽，也能 `run_workflow()` 脚本化批量跑。
4. **Docker 一致环境**：`docker compose up --build` 一键起，服务崩了自动重启。

- **YAML 校验前置（源码确认）**：`make validate-yamls` 跑全部工作流 YAML 的语法/schema 校验——把编排错误在启动前挡住，而非运行时炸。
- **reload 排除生成目录（源码确认）**：`server_main.py --reload` 只监听 server 源码目录，**agent 生成的 `WareHouse/` 不触发重启**——避免 Agent 写文件导致服务反复重启（这是个很实际的稳定性细节）。
- **服务自愈（源码确认）**：Docker Compose "services will automatically restart if they crash"。
- **Human-in-the-loop 门（README 确认）**：Launch 阶段可介入反馈，关键节点有人审——把多 Agent 跑偏在人工处拦下。
- **上下文隔离（MacNet，研究确认）**：DAG 拓扑让千级 Agent 通过"语言交互"协作而不超上下文上限——用拓扑设计规避单 Agent 上下文爆炸。
- **不足**：具体节点级重试/超时未在 README 展开；错误传播策略需读 `workflow/` 源码。

- **前后端分离**：FastAPI(6400) + Vue(5173) 独立进程，前端崩不影响后端跑工作流。
- **配置与代码分离**：工作流在 `yaml_instance/`，可热更新（`make sync` 入库），改流程不重启服务逻辑。
- **Docker 水平/自愈**：compose 编排，崩了自动重启；文件变更容器内热加载（dev）。
- **SDK 可编程执行**：批量任务可脚本化调度，而非绑死 Web。
- **非集群化**：单机平台，未展示多节点分布式调度；高可用体现在"自愈 + 配置热更 + 前后端分离"。

这是 ChatDev 最有特色的部分——它的"进化"有清晰的学术脉络：

- **Experiential Co-Learning（经验协同学习，2023.12）**：instructor/assistant Agent 累积"shortcut-oriented experiences"，高效解决新任务、减少重复错误——**跨任务经验沉淀**。
- **IER（Iterative Experience Refinement，2024.05）**：对经验做**获取→利用→传播→消除**四步迭代，让解题路径越来越短——这是带"淘汰"的经验进化回路。
- **MacNet（2024.06）**：用 DAG 组织多 Agent 拓扑，支持千级 Agent 不超上下文——**拓扑级进化**（从链到 DAG）。
- **Puppeteer（2025.05，NeurIPS 2025）**：用**强化学习训练一个可学习的中央调度器**，动态激活/排序 Agent，构造高效上下文感知推理路径——**调度策略本身可学习**，这是真正意义上的自我进化。
- **结论**：在调研范围内，ChatDev 的自我进化研究最深——从"经验沉淀"到"RL 学调度器"都有实现分支（`puppeteer`/`macnet`/`ier` 分支）。

## 对openmate的启示

> 研究目的: 为 openmate 提供阶段化流水线、YAML 配置驱动多 Agent、产物传递借鉴

| 集成 | OpenClaw skill：`clawdhub install chatdev` |
> 对 openmate：ChatDev 1.0 是角色扮演软件公司的经典教材；2.0 的 **YAML 工作流 + 可视化画布** 说明「配置驱动多 Agent」比纯代码更易传播。openmate 应看 1.0 角色/阶段设计，抄 2.0 配置化思想。

│   YAML 工作流 · 可视化画布 · Python SDK · OpenClaw 集成   │

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（25-chatdev.md）
- 豆包（089_ChatDev.md）
- MiMo报告（chatdev-l1.md）
- MiMo卡片（chatdev.md）
