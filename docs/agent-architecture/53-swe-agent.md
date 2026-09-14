# SWE-agent 架构深度分析

> **仓库**: [princeton-nlp/SWE-agent](https://github.com/SWE-agent/SWE-agent) (现迁移至 SWE-agent org)
> **论文**: *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering* (NeurIPS 2024)
> **团队**: Princeton University & Stanford University
> **成就**: SWE-bench 开源项目 SOTA，已发布 1.0 版本

---

## 一、系统总览与设计哲学

SWE-agent 是一个让大语言模型（LLM）自主修复 GitHub Issue 的自动化软件工程代理。其核心设计哲学是 **"最大化代理自由度"（Maximal Agency）**——尽可能少地约束 LLM 的行为，通过精心设计的 Agent-Computer Interface（ACI）让模型自由探索代码仓库、执行命令、生成补丁。

整体架构遵循经典的 **Agent-Environment Loop** 模式：Agent 接收问题描述，在隔离环境中执行动作，观察环境反馈，循环直至问题解决。系统由 YAML 配置文件统一驱动，支持 GPT-4o、Claude Sonnet 等多种模型后端。

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Problem     │────▶│   Agent      │────▶│  SWEEnv         │
│  Statement   │     │  (LLM Loop)  │◀────│  (Docker/Modal) │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  Tool System │
                    │  (Commands)  │
                    └─────────────┘
```

---

## 二、Agent 核心架构（agents.py）

Agent 层是 SWE-agent 的大脑，采用 **多态 Agent 设计**，通过 Pydantic 配置区分三种 Agent 类型：

| Agent 类型 | 配置类 | 用途 |
|-----------|--------|------|
| `DefaultAgent` | `DefaultAgentConfig` | 标准单次 Agent，核心循环 |
| `RetryAgent` | `RetryAgentConfig` | 多次尝试 + 评审机制 |
| `ShellAgent` | `ShellAgentConfig` | Shell 交互模式 |

**DefaultAgent** 是核心实现，其 `step()` 方法包含完整的 Forward → Parse → Execute 循环：

1. **构建 History**：通过 `HistoryProcessor` 链处理历史消息（裁剪、压缩、缓存控制）
2. **模型查询**：调用 `model.query(history)` 获取 LLM 输出
3. **动作解析**：通过 `ToolHandler.parse_actions()` 将文本输出解析为 thought + action
4. **动作执行**：调用 `handle_action()` 在环境中执行命令
5. **结果反馈**：将执行结果添加到 trajectory

**RetryAgent** 在此基础上引入了 **多次尝试 + 评审** 机制：Agent 执行完毕后，由 Reviewer 模型对结果评分，若不满意则重置环境重新尝试。支持 `ScoreRetryLoop`（评分循环）和 `ChooserRetryLoop`（选择器循环）两种策略。每次尝试的配置可以不同（轮询 `agent_configs` 列表），实现策略多样性。

错误处理采用 **分层异常机制**：`FormatError`、`_BlockedActionError`、`BashIncorrectSyntaxError` 等触发重新查询（最多 `max_requeries=3` 次），`CostLimitExceededError`、`ContextWindowExceededError` 则触发自动提交或退出。

---

## 三、模型抽象层（models.py）

模型层通过 **AbstractModel 抽象基类** 统一接口，支持多种后端：

- **LiteLLMModel**：核心实现，通过 `litellm` 库统一调用 OpenAI、Anthropic、Google 等 API。支持重试（指数退避，最多 20 次）、多 API Key 轮询（按线程分配以利用 prompt caching）、fallback 模型。
- **HumanModel / HumanThoughtModel**：人机交互模式，用于调试和演示。
- **ReplayModel**：轨迹回放模式，用于复现历史执行。
- **InstantEmptySubmitTestModel**：测试用，立即提交空补丁。

**成本控制** 是模型层的关键特性：
- `per_instance_cost_limit`：单任务成本上限（默认 $3）
- `total_cost_limit`：总成本上限
- `per_instance_call_limit`：单任务 API 调用次数上限
- 通过 `GlobalStats` + `InstanceStats` 双层统计实现精确成本追踪

API Key 管理支持 `:::` 分隔的多 Key 配置，按线程名哈希分配，确保同一任务始终使用同一 Key（利用 Anthropic 的 prompt caching）。

---

## 四、环境层架构（swe_env.py）

SWEEnv 是代理执行动作的沙箱环境，基于 **SWE-ReX** 运行时抽象层：

```python
class SWEEnv:
    deployment: AbstractDeployment  # Docker / Modal / Local
    repo: Repo | RepoConfig        # 仓库配置
```

**生命周期**：`start()` → `_init_deployment()` → `reset()` → Agent Loop → `close()`

- **部署抽象**：通过 `swerex.deployment` 支持 Docker 容器（默认 `python:3.11`）、Modal 无服务器、本地执行等多种后端
- **仓库管理**：支持 GitHub 远程仓库克隆、本地路径拷贝、预存在仓库三种模式
- **命令执行**：`communicate()` 方法封装了命令发送、超时控制（默认 25s）、错误检查（warn/ignore/raise 三级）
- **环境重置**：`hard_reset()` 完全重启部署；`reset()` 仅重置仓库状态（git restore + git checkout base_commit）

环境 Hook 机制允许在关键节点注入自定义逻辑（`on_start_deployment`、`on_copy_repo_started`、`on_environment_startup` 等）。

---

## 五、工具系统与命令解析（tools/）

工具系统是 SWE-agent 的 ACI 核心，分为三层：

### 5.1 命令定义（Command）
每个命令是一个结构化对象，包含 `name`、`arguments`（带类型和必填标记）、`invoke_format`（shell 模板）、`end_name`（多行命令终止符）。内置 `BASH_COMMAND` 作为默认 shell 命令。

### 5.2 解析器（Parser）
解析器将 LLM 文本输出转换为 (thought, action) 元组，支持 11 种格式：

| 解析器 | 适用场景 |
|--------|---------|
| `ThoughtActionParser` | 最经典，`讨论 + 代码块` 格式 |
| `FunctionCallingParser` | 原生 function calling 模型 |
| `XMLFunctionCallingParser` | XML 标签格式的函数调用 |
| `JsonParser` | JSON 格式的结构化输出 |
| `BashCodeBlockParser` | 执行 ```bash 代码块 |
| `EditFormat` | 编辑窗口内容格式 |

解析失败时抛出 `FormatError`，触发 Agent 的重新查询机制。

### 5.3 工具过滤（ToolFilter）
通过黑名单机制过滤危险命令（如 `vim`、`nano` 等交互式命令），防止 Agent 陷入交互式程序。

### 5.4 Bundle 机制
工具通过 Bundle 加载，支持外部工具包扩展，实现命令的模块化管理。

---

## 六、问题陈述与输入（problem_statement.py）

SWE-agent 支持多种问题输入格式：

- **TextProblemStatement**：纯文本描述
- **FileProblemStatement**：从文件读取问题描述
- **GithubIssue**：直接从 GitHub Issue URL 自动获取标题、描述、评论
- **SWEBenchMultimodalProblemStatement**：支持图文混合输入（图片 base64 编码）
- **EmptyProblemStatement**：空问题（用于自由探索）

每种类型都实现统一的 `ProblemStatement` 接口，提供 `id`、`get_problem_statement()` 方法。GithubIssue 通过 GitHub API 自动解析 issue 内容，支持 GITHUB_TOKEN 认证。

---

## 七、历史管理与上下文工程（history_processors.py）

历史处理器是 SWE-agent 处理长上下文的关键机制，采用 **Pipeline 模式** 链式处理：

- **LastNObservations**：只保留最近 N 条观察结果（经典论文方案，N=5），旧观察替换为 `"Old environment output: (n lines omitted)"`
- **CacheControl**：在指定位置添加 Anthropic 缓存标记，利用 prompt caching 降低延迟和成本
- **RemoveRegex**：正则表达式匹配移除特定内容（如行号前缀）
- **WindowedObservation**：窗口化处理，避免重复文件内容膨胀上下文
- **ImageParser**：将 markdown 图片语法转换为多模态 API 格式

这种设计使得 Agent 在长时间交互中能有效控制上下文窗口大小，避免超出模型限制。

---

## 八、动作采样与多代理协作（action_sampler.py）

SWE-agent 1.0 引入了创新的 **动作采样** 机制，实现类似"多代理讨论"的效果：

- **AskColleagues**：让多个 Agent（或同一 Agent 多次采样）独立思考，然后将所有同事的思路汇总给主 Agent 做最终决策。流程：采样 N 个 completions → 拼接为 "colleague discussion" → 主 Agent 综合决策。
- **BestOfN**：采样 N 个候选动作，通过比较模型选择最优方案。支持去重过滤。

这种设计避免了传统 Multi-Agent 系统的复杂通信开销，通过 **单 Agent 多采样 + 选择器** 实现了类似效果，同时保持了架构简洁性。

---

## 九、评审与重试机制（reviewer.py）

Reviewer 是 SWE-agent 1.0 的重要新增组件，实现 **自我评审** 能力：

- **Reviewer**：对 Agent 提交的 patch 进行评分（float 或 bool），使用独立的 LLM 实例，配有专用的 system_template 和 instance_template。
- **Preselector**：在多个提交中预筛选，减少评审开销。
- **Chooser**：在多个候选中选择最佳方案。
- **TrajectoryFormatter**：将 Agent 轨迹格式化为评审输入，支持过滤特定动作和输出。

与 `RetryAgent` 配合，形成 **执行 → 评审 → 重试** 的闭环：Agent 完成一轮后，Reviewer 评分，若分数不达标则重置环境、切换策略重新尝试（受 `cost_limit` 约束）。

---

## 十、运行编排与配置驱动（run/）

### 10.1 RunSingle：单任务执行器
`RunSingle` 是顶层编排器，负责组装 Environment、Agent、ProblemStatement 并驱动执行：

```python
RunSingle.from_config(config).run()
# 1. 加载环境变量
# 2. 创建 SWEEnv（Docker/Modal）
# 3. 创建 Agent（Default/Retry/Shell）
# 4. agent.run(env, problem_statement, output_dir)
# 5. 保存预测结果
```

### 10.2 配置驱动架构
整个系统由 YAML 配置文件驱动，通过 Pydantic 模型验证：

```yaml
agent:
  model:
    name: "gpt-4o"
    per_instance_cost_limit: 3.0
  tools:
    parse_function:
      type: "thought_action"
    filter:
      blocklist: ["vim", "nano"]
  history_processors:
    - type: last_n_observations
      n: 5
env:
  deployment:
    type: docker
    image: "python:3.11"
  repo:
    github_url: "https://github.com/owner/repo"
problem_statement:
  github_url: "https://github.com/owner/repo/issues/1"
```

### 10.3 Hook 系统
贯穿全流程的 Hook 机制支持在各阶段注入自定义逻辑：
- **RunHook**：`on_start`、`on_instance_start`、`on_instance_completed`、`on_end`
- **AgentHook**：`on_model_query`、`on_actions_generated`
- **EnvHook**：`on_start_deployment`、`on_copy_repo_started`

内置 Hook 包括 `SaveApplyPatchHook`（本地应用补丁）和 `OpenPRHook`（自动创建 Pull Request）。

---

## 架构总结与启示

| 维度 | 设计选择 | 评价 |
|------|---------|------|
| **代理模式** | 单 Agent + 多采样/评审 | 简洁高效，避免 Multi-Agent 通信开销 |
| **环境隔离** | Docker/Modal 沙箱 | 安全可靠，支持多后端切换 |
| **工具接口** | 可配置命令 + 多解析器 | 灵活适配不同模型输出格式 |
| **上下文管理** | Pipeline 式历史处理器 | 有效控制 token 消耗 |
| **成本控制** | 多层成本限制 + 统计追踪 | 防止意外高额 API 调用 |
| **错误恢复** | 分层异常 + 自动重查询 | 提高单次交互成功率 |
| **配置驱动** | Pydantic + YAML | 类型安全，支持 CLI 覆盖 |
| **可扩展性** | Hook + Bundle + 多态 Agent | 易于添加新功能和工具 |

SWE-agent 的核心创新在于 **ACI（Agent-Computer Interface）** 的设计理念——不是让 Agent 直接操作文件系统，而是通过精心设计的命令接口（如结构化的 edit、search、view 命令）降低 LLM 的操作难度。这一思想对后续的 Coding Agent 系统（如 OpenHands、Devin 等）产生了深远影响。

值得注意的是，团队已发布 **mini-SWE-agent**，用仅 100 行 Python 代码实现了相当的性能（SWE-bench verified 65%），证明了核心架构的精简性——真正的复杂性在于环境封装和工具接口设计，而非 Agent 循环本身。
