# SWE-agent（SWE-agent/SWE-agent, #72, 16k★）功能研究 — 源码级深读

> 源码：~/agent-research-src/swe-agent（sweagent/：agent/、environment/、tools/、run/、inspector/；5300+行核心）
> 定位：普林斯顿/NLP组的GitHub issue自动修复agent（SWE-bench始祖）；规模小但"行动选择/重试"设计独到

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **AskColleagues同行评议采样**：同一history用`model.query(history, n=n_samples)`采N个候选→每个解析出(thought, action)→拼"Your colleagues had the following ideas"讨论→最终模型读讨论后选一个action。**自一致性+同行讨论一步到位** | 无 | 无 | 完全没有 | ~60行。与deepseek Harness三角色/ag2互证——低成本提高单步决策质量；cortex/decision加n_sample模式 |
| 2 | **BinaryTrajectoryComparison锦标赛选优**：min4~max10个样本，裁判模型两两比较选最佳action（"资深工程师评审初级开发者"prompt），temperature可独立覆盖 | 无 | benchmark/evaluator是5维自评非对选 | 完全没有 | best-of-N的工业版；与SWE-agent Reviewer构成"采样→比较→重试"全家桶 |
| 3 | **ChooserRetryLoop/ScoreRetryLoop重试循环**：Reviewer给每次提交打分→重试至max_attempts→`get_best()`返回最优attempt；Preselector先筛后Chooser精选两段式；重试状态转发（get_forwarded_vars） | 无 | 无 | 完全没有 | 与OpenHands Critic评分阈值重试/deepagents RubricMiddleware互证——"完成=评审通过"第三、四方 |
| 4 | **History处理器管线**：可组合链——LastNObservations（只留最后N条观察）、TagToolCallObservations、**ClosedWindowHistoryProcessor（滑动窗口）**、CacheControlHistoryProcessor（**逐entry控制prompt cache标记**）、RemoveRegex、ImageParsing | 无 | sessions有compaction标志位无处理器链 | 部分有 | 与langchain middleware四钩子互证——history变换做成声明式pydantic配置链，OpenSoul cortex上下文组装的参照 |
| 5 | **工具Bundle（bash脚本即工具）**：一个目录=config.yaml（工具名→文档+调用模板）+bash脚本实现；**state_command**每次动作前注入环境状态（如当前打开文件）；hidden_tools可从bundle中隐藏子集 | 无 | mcp/server有MCP工具 | 部分有 | "工具=bash脚本+文档"的极简定义，降低工具开发门槛；state_command与claude-code环境注入互证 |
| 6 | **多Parser架构**：thought_action/faithful/function_calling等，按模型能力选解析器；FormatError触发重试 | 无 | 无（依赖模型原生tool_call） | 完全没有 | 弱模型/国产模型无function calling时的兼容层——OpenSoul接新provider的现实需求 |
| 7 | **ProblemStatement抽象**：text/file/github-issue/swe-bench多来源统一接口（fetch+get_instance_id） | 无 | 无 | 完全没有 | 小件；任务输入源抽象 |
| 8 | **environment/SWEEnv**：docker/ssh两种宿主+repo.py自动clone+**成本上限per-instance**+超时保护 | 无 | mirror/sandbox.py目录级假沙箱 | 完全没有 | 与e2b/daytona互证；真执行环境是OpenSoul最大硬缺口之一 |
| 9 | **agent/environment双向Hook**（abstract.py+status.py）：状态变更事件可观测 | 无 | 无 | 部分有 | trajectory事件流可对齐 |
| 10 | **inspector轨迹检查器**：trajectory落盘（.traj）+CLI/HTML逐步回放——**每步：思考+动作+观察+系统状态** | 无 | trajectory扁平事件表无回放UI | 部分有 | 与langfuse三件套/daytona录制回放互证——"不知道在干嘛"的离线解 |
| 11 | **config/ YAML全家桶**：bash_only/exotic/human等工具配置变体+benchmarks配置生成 | 无 | gene/templates有模板 | 部分有 | 配置即产品的组织方式 |
| 12 | **InstanceStats逐实例统计**（模型调用数/成本/tokens）+ run/批量运行器（按benchmark批量并行） | 无 | gland/token_meter总量无per任务归因 | 部分有 | 成本归因到任务粒度 |

## 源码亮点

- **n-sample查询复用同一history**：采样不改上下文，讨论作为user message追加——"多听意见再行动"最小实现
- **ReviewSubmission独立模型**：提交物（patch/答案）与轨迹分离建模，评审只看提交不看过程——防过程噪声干扰评审
- **history处理器全是纯函数**：`History -> History`协议，pydantic配置可序列化——上下文策略可进YAML随config分发

## 可复用设计

1. **AskColleagues采样讨论**（~60行）→ cortex关键决策点可选模式，成本可控（一次n_sample+一次调用）
2. **ChooserRetryLoop best-of-N重试** → 与RubricMiddleware/Critic合并为OpenSoul统一"评审-重试"中间件
3. **History处理器声明式链** → cortex上下文组装重构参照（LastN/滑窗/cache_control都是OpenSoul实际需要的）
4. **工具bundle（bash+config.yaml+state_command）** → gene/skill体系可吸收"state_command每次注入环境状态"
5. **多Parser兼容层** → 接弱模型provider时不必等对方支持function calling
