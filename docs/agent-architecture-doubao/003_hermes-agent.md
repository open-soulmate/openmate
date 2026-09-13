# 003 · NousResearch/hermes-agent 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：Hermes Agent（Nous Research 出品）
- **GitHub 地址**：https://github.com/NousResearch/hermes-agent
- **Star 数**：约 244,994（批次数据）；MIT 协议；官方站 hermes-agent.nousresearch.com
- **主要语言**：Python（Python 3.11，uv 管理；含 Node/ffmpeg/便携 Git Bash 依赖）
- **一句话定位**：**自改进（self-improving）的常驻个人 AI agent**，内置"学习闭环"——从经验创建技能、在使用中改进技能、主动沉淀记忆、检索过往会话、跨会话构建用户画像。
- **目标用户/场景**：想在 $5 VPS / GPU 集群 / serverless 上跑一个 7×24、从 Telegram/Discord 等多触面对话的个人 agent；也面向做轨迹(trajectory)训练数据的研究者。
- **成熟度**：高。~3000+ pytest 测试；20 个消息平台适配器；7 种终端后端；提供官方文档站、桌面应用、ACP（VS Code/Zed/JetBrains）集成；活跃维护。

> 定性：这是 Top10 中**唯一真正可独立运行的常驻 agent 运行时**，有完整主循环、SQLite 持久化、工具注册表、后台自改进 review。本报告第 6/7/8 章为真实代码机制（经官方架构文档，文档直接给出文件/类名）。

## 2. 源码结构总览

据官方 Architecture 页（直接列出项目结构，文件路径为源码事实）：

```
hermes-agent/
├── run_agent.py        # AIAgent —— 核心会话主循环（大文件）
├── cli.py              # HermesCLI —— 交互式 TUI（大文件）
├── model_tools.py      # 工具发现、schema 收集、dispatch
├── toolsets.py         # 工具分组与平台预设
├── hermes_state.py     # SQLite 会话/状态库 + FTS5 全文检索
├── batch_runner.py     # 批量轨迹生成
├── agent/              # 主循环内部
│   ├── prompt_builder.py      # 系统提示组装（SOUL/MEMORY/USER/skills/AGENTS.md）
│   ├── context_engine.py     # ContextEngine 抽象基类（可插拔）
│   ├── context_compressor.py  # 默认引擎——有损中间摘要
│   ├── prompt_caching.py     # Anthropic 前缀缓存断点
│   ├── auxiliary_client.py   # 侧任务用辅助 LLM（视觉/摘要/后台review）
│   ├── memory_manager.py / memory_provider.py
│   └── trajectory.py
├── hermes_cli/         # main.py / commands.py / config.py / auth.py / runtime_provider.py / setup.py / plugins.py
├── tools/              # 每个工具一个文件
│   ├── registry.py   # 中央注册表（被所有工具 import）
│   ├── approval.py   # 危险命令检测
│   ├── delegate_tool.py      # 子代理委派
│   ├── mcp_tool.py           # MCP 客户端
│   ├── process_registry.py  # 后台进程管理
│   └── environments/        # 终端后端 local/docker/ssh/modal/daytona/singularity
├── gateway/            # 消息网关（run.py GatewayRunner / session.py / delivery.py / pairing.py / hooks.py / mirror.py / status.py）
│   └── platforms/      # 20 个适配器（telegram/discord/slack/whatsapp/signal/feishu/wecom/...）
├── acp_adapter/  cron/(jobs.py, scheduler.py)  plugins/memory/  plugins/context_engine/
└── skills/  optional-skills/  tests/
```

**核心源码文件**：`run_agent.py`(AIAgent)、`agent/prompt_builder.py`、`agent/context_compressor.py`、`agent/prompt_caching.py`、`agent/memory_manager.py`、`hermes_state.py`、`tools/registry.py`、`tools/approval.py`、`tools/delegate_tool.py`、`gateway/run.py`、`cron/scheduler.py`。

**入口/启动流程**：`hermes`(CLI) 或 `hermes gateway`(网关)。依赖链：`tools/registry.py`(无依赖) ← `tools/*.py`(import 时自注册) ← `model_tools.py` ← `run_agent.py/cli.py/batch_runner.py`。**代码规模**：70+ 工具、28 工具集、20 平台、3000+ 测试。

## 3. 系统架构分析

- **编排模式**：**ReAct 式工具调用主循环**（`AIAgent.run_conversation()`：模型调用→`model_tools.handle_function_call()`→执行→回灌→循环）+ 子代理委派（`delegate_tool.py`）+ 后台自改进 review（非用户请求的第二通道）。
- **核心组件**：AIAgent（同步编排引擎，处理 provider 选择、提示构建、工具执行、**retries、fallback、callbacks、压缩、持久化**）；Provider 解析器（把 `(provider,model)→(api_mode,key,base_url)`，3 种 API 模式：chat_completions / codex_responses / anthropic_messages）；工具注册表；会话存储；网关。
- **数据流（CLI）**：`process_input()` → `run_conversation()` → `prompt_builder.build_system_prompt()` → `runtime_provider.resolve_runtime_provider()` → API 调用 → 有 tool_calls 则 `handle_function_call()` 循环 → 最终响应 → 存 SessionDB。**网关**：平台事件→适配器 `on_message()`→`MessageEvent`→`GatewayRunner._handle_message()`→鉴权→解析 session key→带历史建 AIAgent→跑→回投。**Cron**：scheduler tick→加载 jobs.json→建**无历史的新 AIAgent**→注入挂接技能→跑→投递→更新 next_run。
- **关键设计原则（文档原文）**：Prompt stability（会话中系统提示不变，除 `/model` 外不破坏缓存）；Observable execution；**Interruptible**（API 调用与工具执行可被用户中断）；Platform-agnostic core（一个 AIAgent 服务 CLI/gateway/ACP/batch/API）；Loose coupling（registry + check_fn 门控，非硬依赖）；**Profile isolation**（`hermes -p <name>` 各自 HOME/config/memory/session/PID，多 profile 并发）。

## 4. 功能拆解

- **工具系统**：`tools/registry.py` 中央注册表，每个工具文件在 import 时 `registry.register()` 自发现；注册表负责 schema 收集、dispatch、可用性检查、错误包装。
- **终端后端**：7 种（local/Docker/SSH/Singularity/Modal/Daytona/Vercel Sandbox），后两者 serverless 空闲休眠。
- **技能系统**：`~/.hermes/skills/`，兼容 agentskills.io，progressive disclosure 三级（`skills_list` ~3k token → `skill_view(name)` → `skill_view(path)`）。
- **记忆系统**：MEMORY.md + USER.md 两文件（见第 8 章）。
- **插件系统**：三来源（用户/项目/pip entry point），memory provider 与 context engine 各单例可选。
- **Cron**：一等 agent 任务（非 shell），存 JSON，可挂技能/脚本，投递到任意平台。
- **安全**：`tools/approval.py` 危险命令检测、DM pairing 授权、容器隔离；技能安装 quarantine + 内容哈希 + NVIDIA SkillEvaluator 建议性扫描。

## 5. 技术亮点与优势

1. **冻结快照记忆 + 前缀缓存**：会话启动时把记忆冻结注入系统提示，会话中不改动——既保证记忆生效，又不破坏 Anthropic/OpenAI 的前缀缓存，性能与一致性兼得。
2. **有界记忆 + 显式容量协议**：不靠自动压缩，写满就报错并回显 `current_entries`，逼模型当轮内自行合并/删减——把"记忆治理"变成模型可执行的显式动作。
3. **平台无关核心**：一个 `AIAgent` 类服务 5 种入口，差异只在入口层——这正是多端产品最该学的解耦。
4. **可插拔压缩引擎**：`ContextEngine` 抽象基类 + 默认 `context_compressor.py`（有损摘要），可通过插件替换。
5. **轨迹生成**：`batch_runner.py`/`trajectory.py` 产出 ShareGPT 格式训练数据，研究价值独特。

## 6. 稳定性机制【重点】

- **主循环容错（源码级，经文档）**：架构页明确 AIAgent "Handles provider selection, prompt construction, tool execution, **retries, fallback, callbacks, compression, and persistence**"——即重试、provider 回退、压缩、持久化都内建在主循环。**具体重试次数/退避参数本次未读到 `run_agent.py` 源码，标注为文档级。**
- **可中断性**：API 调用与工具执行"can be cancelled mid-flight by user input or signals"；`process_registry.py` 管理后台进程。
- **会话持久化与一致性（源码级）**：`hermes_state.py`/`gateway/session.py` 用 SQLite + FTS5，"**atomic writes with contention handling**"、"lineage tracking (parent/child across compressions)"——压缩后会话有父子血缘，并发写入有竞争处理。
- **容量/边界**：记忆硬字符上限（2200/1375），超限返回结构化错误而非静默丢条目；重复条目自动拒绝。
- **危险操作门控**：`tools/approval.py` 危险命令检测；`pairing.py` DM 配对授权；`write_approval` 门控记忆写入。
- **崩溃恢复**：会话落 SQLite，`session_search` 可按 FTS5 找回数周前对话；压缩按 lineage 串联。
- **隔离**：profile 隔离、终端后端沙箱、技能安装 quarantine——且文档明确警告"别让两个 agent 进程共享同一 HERMES_HOME"（会互相叠加写出双方都没写的条目），这是对并发写记忆竞态的清醒认识。

## 7. 高可用机制【重点】

- **降级/回退**：provider 解析层处理 18+ provider、OAuth、**credential pools（凭证池）**、alias；3 种 API 模式适配不同后端；技能支持 fallback（`fallback_for_toolsets: [web]`——缺 FIRECRAWL_KEY 时 DuckDuckGo 技能自动补位）。
- **并发与调度**：`gateway/run.py` 长驻进程，20 平台适配器统一会话路由；`gateway/status.py` "Token locks, profile-scoped process tracking"；`cron/scheduler.py` 定时调度；子代理 `delegate_tool.py` 并行工作流，另支持"Python 脚本经 RPC 调工具"把多步流水线压成零上下文成本单轮。
- **资源/成本治理**：`auxiliary_client.py` 用便宜模型跑视觉/摘要/后台 review；`auxiliary.background_review` 可把 review 切到更便宜模型（benchmark 称 ~3-5× 降本）；`context_compressor.py` 控制上下文膨胀；记忆固定 ~1300 token 预算。
- **serverless 弹性**：Modal/Daytona 后端"环境空闲休眠、按需唤醒"，会话间近乎零成本——这是对"常驻 agent 太贵"的高可用/成本高可用答案。
- **可观测性**：`/usage`、`/insights [--days N]`、`hermes doctor` 诊断、`/journey` 学习时间线；工具调用经 callback 全程对用户可见。
- **横向扩展**：profile 多实例并发、平台适配器可加；非分布式集群，但单网关多平台多会话的架构清晰。

## 8. 自我进化机制【重点】（本项目最核心）

- **自改进闭环（源码级）**：README 与 memory 文档确认——每轮结束后跑**后台 self-improvement review**：用辅助 client **重放会话**，把"重复的纠正、耐久的工作流经验"压缩成记忆条目或程序化技能。这正是批次说明里"后台 review fork"的实证。
- **技能自动创建与改进**：复杂任务后自主创建技能；技能在使用中自改进（"💾 Skill 'foo' patched"）；`/learn` 命令把任意来源（SDK/文档/URL/本对话流程/整本书）蒸馏为遵循 house standard 的 `SKILL.md`，大来源自动拆成 `references/` 知识库技能。
- **记忆治理（源码级，细节最实）**：
  - MEMORY.md（环境/经验）+ USER.md（用户画像），有界 ~1300 token。
  - **写入同意机制**：`memory.write_approval: true` 时，前台写入内联确认、后台 review 写入**staged** 为待审，用户用 `/memory pending|approve|reject` 批准——直接回应"agent 把对你的错误假设存下来了"。
  - **安全扫描**：入库前扫描 prompt 注入/凭证外泄/SSH 后门/不可见 Unicode。
  - **遗忘/修剪**：`/journey` 时间线可 `delete`（技能归档可恢复、记忆块删除）、`edit`。
- **用户建模**：对接 Honcho 做 dialectic user modeling；FTS5 会话检索 + LLM 摘要做跨会话召回。
- **评估回路**：未发现内置自动化 eval/benchmark（研究侧有轨迹导出），故"评估回路"偏弱，主要靠用户在 `/journey` 人工修剪。

## 9. openmate 可借鉴点【重点】

openmate 背景：Python、已有 Web 版、规划桌面/手机多端。

- **P0｜冻结快照记忆 + 有界容量 + 写满报错协议**：openmate 做长期记忆时，应在会话启动把记忆冻结进系统提示（不中途改，保前缀缓存），并用硬 token 预算；写满返回结构化错误+当前条目列表，让模型当轮内合并而非自动 truncate。预期收益：记忆不膨胀、缓存不被破坏。
- **P0｜写记忆的"同意/暂存"门控**：尤其手机端，自动写入的用户偏好必须能 staged 待审（`/memory pending/approve`），否则错误假设会跨会话污染。预期收益：信任可控，错误记忆可撤回。
- **P0｜"一个 agent 一个 HOME/profile"的并发写警告**：openmate 多端并发时，记忆/会话必须按 profile 隔离，禁止两端进程共享同一记忆库互相叠加。预期收益：避免多端竞态写出幽灵条目。
- **P1｜平台无关核心 + 入口适配层**：openmate Web 版→桌面/手机多端，应把 agent 主循环做成与端无关的单一内核，各端只做输入输出适配（对标其 AIAgent 服务 CLI/gateway/ACP/batch）。预期收益：多端行为一致、复用最大化。
- **P1｜后台 review 跑在便宜模型上**：自改进/review 这类非交互任务切到小模型（~3-5× 降本），主对话留强模型。预期收益：常驻成本可控。
- **P1｜工具/技能按可用性条件显示（fallback 技能）**：缺某 API key 时自动用免费替代方案补位，提升健壮性。
- **P2｜FTS5 会话检索补全短记忆**：短记忆只放关键事实，全量会话进 SQLite FTS5 按需检索（~20ms、零 LLM 成本），是"关键事实常驻 + 历史按需回溯"的经典分工。

## 10. 源码验证标注

**源码级文档直接确认（官方架构/功能文档，明确给出文件与类名）**：
- 目录结构与依赖链（`run_agent.py`/`agent/*`/`tools/registry.py`/`gateway/*`/`cron/*`）、数据流、设计原则（Architecture 页）
- 记忆机制：MEMORY/USER 字符上限、冻结快照、memory 工具 add/replace/remove、写满报错、重复/注入扫描、FTS5、write_approval、后台 review、`auxiliary.background_review`、`/journey`（Memory 文档）
- 技能机制：`~/.hermes/skills/`、progressive disclosure、`/learn`、skill_manage、fallback/requires 条件激活、quarantine/lock.json/NVIDIA SkillEvaluator（Skills 文档）
- README（master）：学习闭环、多触面、7 终端后端、cron、子代理委派

**推断/未逐行读源码**：
- `run_agent.py` 的具体重试次数、退避策略、fallback 顺序未读 `.py` 原文，仅据"retries, fallback"字样；标注为文档级。
- `gateway/status.py` 的 token lock 实现、`delegate_tool.py` 子代理调度细节、`hermes_state.py` 的 SQLite schema DDL 未逐行读。
- Star 数为批次数据。

**源码不可得说明**：GitHub API 在调研期未认证限流（tree/contents 返回 fetch error），raw `main/README.md` 命中安全策略；实际通过 raw `master/README.md` 与官方文档站获取架构事实。未直接读取任何 `.py` 文件正文，文件路径/类名/机制均来自官方架构文档自述——已尽量对照其"文件依赖链"交叉验证其一致性。
