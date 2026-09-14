# Hermes Agent 深度研究报告

> 面向 openmate（混合编码+个人 agent，稳定性重构）的对标分析
> 研究日期：2026-09-13 · 版本快照：v0.21.2（pyproject.toml）

---

## 1. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/NousResearch/hermes-agent |
| 文档站 | https://hermes-agent.nousresearch.com/docs/ |
| 组织 | Nous Research |
| 定位口号 | **The self-improving AI agent**（会自我改进的 AI Agent） |
| 产品标语 | "The agent that grows with you"（与用户共同成长的 agent） |
| 版本 | 0.21.2 |
| 语言 | Python（>=3.11,<3.14），CLI/TUI + Gateway + Desktop |
| License | MIT |
| 包管理 | uv + 精确 pin（`==X.Y.Z`），`exclude-newer = 14 days` 供应链策略 |
| 入口脚本 | `hermes` → `hermes_cli.main:main`；`hermes-agent` → `run_agent:main`；`hermes-acp` → `acp_adapter.entry:main` |
| 测试规模 | ~25,000 tests / ~1,250 files（`tests/`，CI hermetic `env -i`） |
| Skills Hub | https://agentskills.io（开放标准） |
| 社区 | Discord、Skills Hub、GitHub Issues |
| 相关迁移 | 自带 OpenClaw（`hermes claw migrate`）一键迁移（SOUL.md、记忆、技能、allowlist、平台配置、API keys） |

**定位一句话**：一个「自带学习闭环」的个人/远程 AI Agent 运行时——会从经验中生成技能、在使用中改进技能、定期自我提醒持久化知识、跨会话检索自己的历史对话，并跨会话加深对用户的建模。可跑在 $5 VPS、GPU 集群或 serverless 上，通过 Telegram/Discord/Slack 等入口远程驱动。

---

## 2. 架构

### 2.1 系统总览

```
┌──────────────────────────────────────────────────────────────┐
│  入口层 Entry Points                                           │
│  CLI(cli.py) · Gateway(gateway/run.py) · ACP(acp_adapter/)    │
│  Batch Runner · API Server · Python Library · Desktop         │
└──────────┬──────────────────┬──────────────────┬─────────────┘
           ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│  AIAgent (run_agent.py 门面)                                   │
│  ├ Prompt Builder (prompt_builder.py)  系统提示组装             │
│  ├ Provider Runtime (runtime_provider.py) 18+ 提供商解析        │
│  ├ Tool Dispatch (model_tools.py)  工具编排                     │
│  ├ ContextEngine ABC + ContextCompressor 默认有损压缩           │
│  ├ Anthropic Prompt Caching (prompt_caching.py)                │
│  └ 3 API modes: chat_completions / codex_responses /           │
│                 anthropic_messages                             │
└──────────┬───────────────────────────────┬────────────────────┘
           ▼                               ▼
┌────────────────────┐          ┌──────────────────────────────┐
│ Session Storage    │          │ Tool Backends                │
│ SQLite + FTS5      │          │ Terminal ×7 (local/docker/   │
│ hermes_state.py    │          │  ssh/singularity/modal/      │
│ gateway/session.py │          │  daytona/vercel_sandbox)     │
│                    │          │ Browser ×5 · Web ×4 · MCP    │
└────────────────────┘          └──────────────────────────────┘
```

### 2.2 目录结构（关键源）

```
hermes-agent/
├── run_agent.py              # AIAgent 门面（~1.5k LOC）；循环在 agent/*
├── cli.py                    # HermesCLI 门面（~4.6k LOC + mixins）
├── model_tools.py            # 工具发现/分发（薄层 over tools/registry）
├── toolsets.py               # 工具集分组与平台预设
├── hermes_state.py           # SessionDB 门面 + hermes_state_*.py（21 兄弟模块）
├── batch_runner.py           # 轨迹批量生成（训练数据）
│
├── agent/                    # Agent 内部（从巨型文件拆出）
│   ├── conversation_loop.py      # run_conversation() 主循环
│   ├── turn_*.py                 # 每轮阶段：prep/api_call/api_error/overflow/recovery
│   ├── tool_executor.py          # 工具分发 + agent 级工具拦截
│   ├── prompt_builder.py         # 系统提示组装（identity/skills/context/memory）
│   ├── context_engine.py         # ContextEngine ABC（可插拔）
│   ├── context_compressor.py     # 默认有损摘要引擎
│   ├── prompt_caching.py         # Anthropic cache_control 断点
│   ├── memory_manager.py         # 记忆管理编排
│   ├── memory_provider.py        # MemoryProvider ABC
│   ├── auxiliary_client.py       # 辅助 LLM（视觉/摘要/review）
│   └── session_persistence.py    # 会话/轨迹持久化
│
├── tools/                    # 工具实现（自注册）
│   ├── registry.py               # 中央注册表
│   ├── approval.py               # 危险命令检测 + 硬性 blocklist
│   ├── terminal_tool.py          # 终端编排
│   ├── file_operations.py        # read/write/patch/search
│   ├── web_tools.py              # web_search / web_extract
│   ├── delegate_tool.py          # 子 agent 并行委派
│   ├── code_execution_tool.py    # 沙箱 Python + RPC 工具访问
│   ├── session_search_tool.py    # FTS5 历史会话检索
│   ├── skill_tools.py            # 技能搜索/加载/管理
│   ├── cronjob_tools.py          # 定时任务
│   ├── mcp_tool.py               # MCP 客户端
│   └── environments/             # 7 终端后端
│
├── gateway/                  # 消息网关（25+ 平台适配器）
│   ├── run.py (~5.5k LOC) + run_*.py 阶段拆分
│   ├── session.py / delivery.py / pairing.py / hooks.py
│   └── platforms/ + plugins/platforms/（telegram/discord/slack/whatsapp/...）
│
├── hermes_cli/               # CLI 子命令、config、auth、setup、plugins、skin
├── cron/                     # 调度器（jobs.py / scheduler.py）
├── plugins/memory/           # 记忆提供商插件（内置集合已关闭新增）
├── plugins/context_engine/   # 上下文引擎插件
├── skills/                   # 内置技能（安装时拷贝到 ~/.hermes/skills/）
├── optional-skills/          # 官方可选技能
├── acp_adapter/              # VS Code / Zed / JetBrains 集成
└── website/                  # Docusaurus 文档站
```

### 2.3 用户态目录 `~/.hermes/`

| 路径 | 用途 |
|---|---|
| `config.yaml` | 全量配置（模型、终端、toolsets、压缩、审批…） |
| `.env` | API keys 与 secrets（chmod 600） |
| `auth.json` | OAuth 凭据（Nous Portal） |
| `skills/` | 全部激活技能（bundled + hub + agent-created） |
| `memories/` | MEMORY.md + USER.md |
| `state.db` | SQLite 会话库（canonical） |
| `sessions/` | gateway 路由索引、JSONL transcript、/save 导出 |
| `cron/` | 定时任务数据 |
| `plugins/` | 用户插件 |

**设计原则**（文档明示）：
- **Prompt stability**：系统提示会话中途不变，不破坏缓存前缀（除非显式 `/model`）
- **Observable execution**：每次工具调用对用户可见
- **Interruptible**：API 调用与工具执行可被用户输入/信号取消
- **Platform-agnostic core**：一个 AIAgent 服务 CLI/gateway/ACP/batch/API
- **Loose coupling**：可选子系统走 registry + `check_fn`，非硬依赖
- **Profile isolation**：每个 profile 独立 HERMES_HOME，可并行跑多 agent

---

## 3. 核心机制

### 3.1 Agent 循环（Turn Lifecycle）

```
run_conversation()
  1. 生成 task_id
  2. 追加 user 消息
  3. 构建/复用系统提示（prompt_builder）
  4. 预检压缩（>50% context）
  5. 构建 API messages（按 api_mode 转换）
  6. 注入 ephemeral 层（预算警告、上下文压力）
  7. 应用 Anthropic 缓存断点
  8. 可中断 API 调用（后台线程 + interrupt event）
  9. 解析响应：
     - tool_calls → 执行 → 追加结果 → 回到 5
     - 文本 → 持久化 → 按需 flush memory → 返回
```

关键细节：
- **消息交替规则严格**：User↔Assistant 交替；仅 tool 角色可连续（并行工具结果）
- **可中断 API**：`_interruptible_api_call()` 在后台线程跑 HTTP，主线程监听 interrupt/timeout；中断后丢弃半截响应，不注入历史
- **迭代预算**：`IterationBudget`，默认 500 次（config `agent.max_turns`）；子 agent 独立预算，`delegation.max_iterations` 默认 50
- **Fallback**：主模型 429/5xx/401/403 → 查 `fallback_providers` → 依次切换；401/403 先尝试凭据刷新；辅助任务（视觉/压缩/抽取）各自独立 fallback 链
- **工具并发**：多 tool_calls → 段规划（只读/不重叠文件目标/MCP 可并行）+ 顺序屏障 → ThreadPoolExecutor（最多 8 workers）；结果按原始顺序回填
- **Agent 级工具拦截**（不经 registry）：`todo` / `memory` / `session_search` / `delegate_task`

### 3.2 工具系统

- **自注册**：`tools/*.py` 顶层调用 `registry.register()`；`discover_builtin_tools()` 用 AST 扫描发现，无手工 import 列表
- **Toolset 分组**：~70+ 工具 / ~28 toolsets；平台预设（`hermes-cli`、`hermes-telegram`…）；组合 toolset（research/development/analysis…）
- **可用性门控**：`check_fn`（API key、服务、二进制）；异常=不可用；按次缓存
- **错误双层包裹**：registry.dispatch + handle_function_call，保证模型永远收到合法 JSON 字符串
- **7 终端后端**：local / docker / ssh / singularity / modal / daytona / vercel_sandbox
  - Daytona/Modal 提供 serverless 持久化（空闲休眠、按需唤醒）
- **MCP**：外部服务器工具动态发现；子进程环境变量白名单过滤
- **子 agent**：`delegate_task` 顶层委派默认 background（结果以消息回流）；ORCHESTRATOR 子 agent（depth>0）同步
- **execute_code**：沙箱 Python，可通过 RPC 调用工具，把多步流水线折叠为「零上下文成本」的一轮

### 3.3 会话与持久化

- **SQLite + WAL**（`~/.hermes/state.db`）
  - 表：`sessions` / `messages` / `session_model_usage` / `messages_fts`（FTS5）/ `messages_fts_trigram`（CJK）/ `messages_fts_cjk` / `gateway_routing` / `compression_locks` / `async_delegations` / `delivery_obligations`
  - schema version 当前 23+；声明式列添加 + 版本门控数据迁移
- **写竞争**：短 timeout 1s + 应用层重试（20–150ms jitter，最多 15 次）+ `BEGIN IMMEDIATE` + 每 50 次写做 WAL checkpoint
- **会话谱系**：`parent_session_id` 链；压缩可 in-place（默认）或轮换新 id
- **session_search**：FTS5 + 锚定窗口滚动；三种调用形态（discovery/scroll/browse）；无 LLM 汇总、无截断
- **Ephemeral injection**：系统提示与 prefill 在 API 调用时注入，**永不入库/入日志**
- **api_content sidecar**：实际发送给 API 的字节保真副本，保证 prompt-cache 稳定回放

### 3.4 上下文压缩（双层 + 可插拔）

| 层 | 阈值 | 位置 | 角色 |
|---|---|---|---|
| Gateway Session Hygiene | 85%（固定） | `gateway/run_turn.py` | 安全网，防止隔夜膨胀撑爆 API |
| Agent ContextCompressor | 50%（默认，可配） | `agent/context_compressor.py` | 主压缩，拥有真实 token 计数 |

- **ContextEngine ABC**：`context.engine: compressor | lcm(插件) | ...`；插件永不自动激活
- **四阶段算法**：
  1. Prune old tool results（>200 字符 → stub，零 LLM）
  2. 划边界（protect_first_n=3；尾部按 token 预算 + protect_last_n=20；tool_call/result 组不拆）
  3. 结构化摘要（Goal/Constraints/Progress/Done/In Progress/Blocked/Key Decisions/Relevant Files/Next Steps/Critical Context）；预算 = content×20%，下限 2K、上限 min(ctx×5%, 12K)
  4. 重组 + 孤儿 tool 对清理
- **lean 尾部模式**（默认）：尾部仅 2.5%×ctx（10K–25K clamp）；连续性由「详细会话日志摘要 + 机械提取锚点索引（PR号/SHA/路径/错误串）+ 全部真实 user 消息逐字 + session_search 恢复指针」承载。500K 实测：保留 ~49K vs legacy ~162K，配 recall 更高
- **in-place 压缩**（默认 true）：同一 session id 重写活跃列表，旧轮次 `active=0, compacted=1` 软归档；消除 session 轮换 bug 簇
- **失败冷却**：摘要失败 → 会话级阶梯冷却 60s→300s→900s；provider-proven overflow 可无视冷却一次
- **usage anchor**：provider 真实 token + 追加消息粗估 delta，指纹匹配，跨 gateway 重启存活
- **Prompt caching（Anthropic）**：`system_and_3` 策略（系统提示 + 滚动 3 消息断点）；默认 5m TTL 可选 1h；模型身份是缓存键一部分

### 3.5 记忆与用户建模

**内置双文件（有界、策展式）**：

| 文件 | 用途 | 字符上限 | ~token |
|---|---|---|---|
| MEMORY.md | agent 个人笔记：环境事实、约定、经验教训 | 2,200 | ~800 |
| USER.md | 用户画像：偏好、沟通风格、期望 | 1,375 | ~500 |

- 会话开始时以**冻结快照**注入系统提示（保护前缀缓存）；会话中写盘立即生效，但要下一会话才进 prompt
- `memory` 工具动作：`add` / `replace` / `remove`（子串匹配）；无 `read`（自动注入）
- **满载不自动丢弃**：超限返回错误 + 当前条目，要求 agent 同轮 consolidate 后重试
- 安全扫描：注入/外泄模式、隐形 Unicode → 拒绝
- 写审批：`memory.write_approval: true` 时前台内联批准、网关/后台 review 进 `/memory pending` 暂存
- **session_search vs memory**：memory ~1.3k token 固定成本；session_search 无限容量、~20ms FTS5、按需

**外部记忆提供商**（8 个内置，集合已关闭新增）：Honcho（dialectic 用户建模）、Mem0、Supermemory、Hindsight、Holographic、RetainDB、ByteRover、OpenViking。实现 `MemoryProvider` ABC（`sync_turn` / `prefetch` / `shutdown` / 可选 `post_setup`）；新提供商必须独立插件仓库。

### 3.6 技能系统（程序性记忆）

- **渐进披露**：
  - L0 `skills_list()` → 名称/描述/类别（~3k tokens）
  - L1 `skill_view(name)` → 全文
  - L2 `skill_view(name, path)` → 具体 reference 文件
- **SKILL.md 格式**：frontmatter（name/description≤60字符/version/platforms/required_environment_variables/metadata.hermes.*）+ 标准章节（When to Use / Prerequisites / How to Run / Quick Reference / Procedure / Pitfalls / Verification）
- **条件激活**：`fallback_for_toolsets/tools`、`requires_toolsets/tools`——例如 Firecrawl 可用时隐藏 DuckDuckGo fallback 技能
- **安全加载**：缺失 env var 不隐藏技能，首次加载时 CLI 安全提示收集；网关永不带内收集 secret
- **分层优先级**：project (`.hermes/skills/` / `.agents/skills/`) → local `~/.hermes/skills/` → external_dirs
- **项目技能需信任**：`hermes skills trust`；扫描 verdict=dangerous 则隔离
- **Skills Hub**：官方 optional / skills.sh / well-known / GitHub taps（openai/anthropics/huggingface/NVIDIA…）/ clawhub / lobehub / browse.sh / 直接 URL；全部过安全扫描；trust levels：builtin/official/trusted/community
- **skill_manage**：agent 自建/改/删技能（create/patch/edit/delete/write_file/remove_file）；`patch` 优先（省 token）；advisory linter（incident-log-shape / references-sprawl）
- **技能 bundle**：YAML 别名，一条 slash 命令加载多技能

### 3.7 权限与安全（8 层纵深）

1. **用户授权**：平台 allowlist → DM pairing（8 位码、1h TTL、限速、锁定）→ 全局 allowlist → 默认 deny
2. **危险命令审批**：
   - 模式：`smart`（辅助 LLM 风险评估）/ `manual` / `off`
   - 场景策略：`cron_mode` / `single_query_mode` / `unattended_mode` 默认 **deny**
   - 审批选项：once / session / always / deny（默认 deny，超时 fail-closed）
   - YOLO：`--yolo` / `/yolo` / env；绕过全部审批，**但绕不过硬性 blocklist**
3. **Hardline Blocklist（不可覆盖底线）**：`rm -rf /`、fork bomb、`mkfs` 活盘、`dd of=/dev/sd*`、根级 pipe-to-sh 等
4. **用户自定义 deny**（`approvals.deny` glob）：先于 YOLO；可做「yolo 但永不 git push --force」
5. **文件写安全**：硬拒绝凭据路径（`~/.ssh/`、`auth.json`、`.env`…）；`HERMES_WRITE_SAFE_ROOT` 可选沙箱；注意：只覆盖 write_file/patch，terminal 仍可绕过（文档明示 defense-in-depth 非硬边界）
6. **容器隔离**：Docker `--cap-drop ALL` + 最小 cap-add + `no-new-privileges` + pids-limit + tmpfs 限额；容器后端跳过危险命令检查（容器即边界）
7. **MCP 凭据过滤**：子进程仅 PATH/HOME/USER/LANG 等安全变量；错误消息 redact PAT/sk-/Bearer
8. **上下文文件注入扫描**：AGENTS.md/.cursorrules/SOUL.md 查「忽略先前指令」「隐藏 HTML 注释」「读 .env」「curl 外泄」「零宽字符」
9. **SSRF 防护**：RFC1918/loopback/link-local/CGNAT/云 metadata 全拦；DNS 失败 fail-closed；重定向逐跳复验
10. **Tirith 预执行扫描**：同形 URL 欺骗、pipe-to-interpreter、终端注入；fail-open 可配
11. **供应链**：精确 pin + exclude-newer 14 天 + advisory 扫描器（`hermes doctor`）+ 依赖变更人工审查 CI
12. **网站封锁**：`security.website_blocklist` 域名策略，跨 web_search/extract/browser 强制

### 3.8 网关与多入口

- 单进程 gateway 服务 25+ 平台：Telegram/Discord/Slack/WhatsApp/Signal/Email/Matrix/Mattermost/DingTalk/Feishu/WeCom/Teams/IRC/LINE/Home Assistant…
- 语音备忘转写、跨平台会话连续性
- `/stop`、`/new`、`/status`、`/sethome`、`/platforms` 等统一 slash 命令
- Cron：自然语言定时任务，可挂技能，投递到任意平台
- Trajectory：ShareGPT 格式轨迹导出，用于训练下一代 tool-calling 模型

---

## 4. 稳定性 / HA（High-Availability）实践

Hermes 在「个人 agent 长跑稳定性」上是目前公开代码库中工程密度最高的一档。可直接借鉴的 HA 机制：

| 机制 | 做法 | 对 openmate 的启示 |
|---|---|---|
| **可中断 API** | 后台线程 + interrupt event；半截响应丢弃 | 必备，否则用户无法纠正方向 |
| **Stale timeout** | 非流式 90s 默认，按 token 量缩放（>50K→150s，>100K→240s）；run-budget 半量 cap；本地端点可 inf | 防「连接挂着但无事件」的静默挂死 |
| **请求 timeout** | per-model > provider > env > 1800s | 分层配置，避免一刀切 |
| **Fallback 链** | 主模型失败 → fallback_providers 顺序；辅助任务独立链 | 视觉/压缩/摘要不能和主对话同生共死 |
| **凭据池轮换** | 429 且池有可用 → 轮换；单凭据池则不重试同配额 | 多账号场景的关键 |
| **压缩失败冷却** | 60→300→900s 阶梯；provider overflow 例外 | 防止坏摘要后端每轮重试烧钱 |
| **写竞争处理** | 1s timeout + jitter 重试 + IMMEDIATE + 定期 WAL checkpoint | 多进程共享 state.db 必需 |
| **会话谱系 + in-place 压缩** | 旧轮软归档可检索；避免轮换丢状态 | 消除一整类状态丢失 bug |
| **Windows 专项** | 禁 `os.kill(pid,0)`（会变成 CTRL_C 广播）；psutil 优先；pythonw 守护；concurrent-log-handler 跨进程轮转；utf-8-sig 读配置 | 若 openmate 支持 Windows，这是血泪清单 |
| **ASYNC lint 棘轮** | ruff 规则 ASYNC210/220/221/251 阻止 async 中阻塞调用（曾导致 17 分钟 getaddrinfo 挂死网关） | 网关类进程必须有 |
| **精确依赖 pin** | 全部 `==X.Y.Z` + exclude-newer；应对 Mini Shai-Hulud 蠕虫 | 供应链稳定性 |
| **Gateway lifecycle guard** | 禁止在受管进程内 stop/restart 自己的 gateway（防 supervisor 死循环） | 自守护陷阱 |
| **Checkpoints & Rollback** | 文件系统快照 + 回滚（用户文档专章） | 编码 agent 必备 |
| **交付义务账本** | `delivery_obligations` 懒建 outbox；gateway 异常路径输入所有权标记 | 消息平台 exactly-once 近似 |
| **进程结果回执** | `process_registry_results` 原子脱敏回执，先落盘再释放事件 | 后台任务结果不丢 |
| **Profile 隔离** | 每 profile 独立 HOME/DB/gateway PID，可并行 | 多 agent 共存 |
| **测试基建** | hermetic `env -i`、按文件子进程隔离、platform 标记、约 25k 测试 | 重构安全网 |

**哲学总结**：Hermes 把「agent 跑飞/挂死/丢状态」当作第一类工程问题——用超时、冷却、软归档、所有权标记、fail-closed 默认、硬性 blocklist 把故障面收窄。

---

## 5. 自我进化（Learning Loop）

这是 Hermes 的核心差异化，README 明言「the only agent with a built-in learning loop」。

### 5.1 闭环全景

```
任务完成 / 用户纠正 / 重复工作流
        │
        ▼
┌───────────────────┐    周期性 nudge     ┌──────────────────────┐
│ 前台 turn          │ ─────────────────► │ Background Review     │
│ 可写 memory/skill  │                    │ Fork（独立 prompt 缓存）│
└───────────────────┘                    │ · 重放对话/digest      │
        │                                │ · 提炼 memory 条目     │
        │                                │ · 生成/patch 技能      │
        ▼                                └──────────┬───────────┘
   下一会话：冻结快照注入 + 技能按需加载              │
        │                                           ▼
        │                                write_approval 门控可选
        │                                （memory.pending / skills.pending）
        ▼
┌───────────────────┐    每 7 天 + 空闲 2h  ┌──────────────────────┐
│ 使用中技能改进      │ ◄────────────────── │ Curator 后台维护       │
│ skill_manage patch │                    │ · 活跃→stale→归档      │
└───────────────────┘                    │ · LLM 合并伞形技能     │
        │                                │ · 备份/回滚/审计账本    │
        ▼                                └──────────────────────┘
   session_search：跨会话精确回忆
   /journey：学习时间线可视化 + 剪枝
```

### 5.2 五个子系统

1. **Memory（陈述性）**：MEMORY.md + USER.md 有界策展；agent 主动保存偏好/环境/纠错/约定/完成工作；满载强制 consolidate
2. **Skills（程序性）**：复杂任务后 `skill_manage` 沉淀流程；使用中 patch pitfall；agentskills.io 标准
3. **Background Review**：turn 后 fork；默认主模型（热缓存重放）或廉价 aux 模型（digest 重放，成本 ~1/3–1/5）；本地 GPU 时 defer 到空闲；`extra_tools` 白名单可扩
4. **Curator（技能库管家）**：
   - 触发：interval 7 天 + idle 2 小时（非 cron，由 CLI 启动/网关 housekeeping/serve 计时器检查）
   - 确定性转移：14 天未用→stale，30 天→归档（可恢复）；pin/cron 引用豁免
   - LLM 合并（默认关）：survey → keep/patch/合并伞形/归档；50–100 次 API
   - 安全：运行前 tar.gz 快照；append-only 审计账本（actor/action/before-after sha256 blobs）；单条/整次回滚；**永不自动删除**，最坏归档
   - 范围：仅 `created_by: agent` 的后台 review 产物；手写/前台创建技能默认不碰（可 `adopt` 移交）
5. **Session Search + Journey**：FTS5 找历史；`/journey` 时间线 + 删除/编辑节点

### 5.3 安全阀（进化不失控）

- `memory.write_approval` / `skills.write_approval`：全部写入暂存待批
- `display.memory_notifications`：off/on/verbose 可见性
- Background review 工具白名单（默认 memory + 技能管理 + 只读文件）；`extra_tools` 窄口扩展
- 技能内容安全扫描 + Skills Guard + 可选 NVIDIA SkillEvaluator Tier1 咨询扫描
- Pin 保护：curator 与 `skill_manage delete` 双拒
- 小模型误判风险被文档显式承认，故提供审批门

---

## 6. openmate 借鉴清单

> openmate 定位：混合编码 + 个人 agent，当前阶段目标是**稳定性重构**。

### P0（稳定性重构必做，直接可抄）

1. **可中断 API 调用 + Stale Timeout + 分层 Request Timeout**
   - 参考：`run_agent.py` `_interruptible_api_call` / `_compute_non_stream_stale_timeout` / `get_provider_request_timeout`
   - 做法：HTTP 放后台线程；主线程 wait(response | interrupt | timeout)；非流式按估算 token 缩放 stale；run-budget 半量 cap；本地端点放宽

2. **Fallback 模型链 + 辅助任务独立路由**
   - 参考：`fallback_providers`、`auxiliary.*`（compression/vision/background_review/curator 各自 slot）
   - 做法：主对话失败切换；摘要/视觉用廉价模型，互不拖累

3. **双层上下文压缩 + 保护尾部 + 软归档**
   - 参考：`agent/context_compressor.py`、`gateway/run_turn.py` hygiene
   - 做法：主压缩 50%（真实 token），安全网 85%（粗估）；protect_first_n + protect_last_n + tool 对不拆；旧消息 `active=0` 软删可检索
   - openmate 优先实现 **in-place 压缩**（同 session id），避免轮换丢状态

4. **SQLite WAL 会话库 + FTS5 + 写竞争处理**
   - 参考：`hermes_state*.py`
   - 做法：短 timeout + jitter 重试 + BEGIN IMMEDIATE + 定期 checkpoint；trigram 索引支持 CJK（openmate 中文场景必须）

5. **危险命令审批三层（smart/manual/off）+ Hardline Blocklist + 场景默认 deny**
   - 参考：`tools/approval.py`
   - 做法：编码 agent 无审批=定时炸弹；cron/unattended 必须 deny；blocklist 永不绕过（即使 yolo）

6. **精确依赖 pin + exclude-newer**
   - 参考：`pyproject.toml` 注释（2026-05 Shai-Hulud 事件）
   - 做法：`==X.Y.Z`；更新走审阅 bump + lock 重生成

7. **文件写保护（凭据路径硬拒 + 可选 WRITE_SAFE_ROOT）**
   - 参考：Security 文档 File Write Safety
   - 做法：`~/.ssh`、`.env`、token 文件永不许 write/patch；安全根之外硬拒

### P1（进化能力，openmate 差异化）

8. **有界双文件记忆（MEMORY + USER）+ 冻结快照 + 满载 consolidate**
   - 刻意小（~1.3k token），防 prompt 膨胀；会话边界靠 `/new` 让学习闭环触发

9. **技能=程序性记忆（SKILL.md 标准 + 渐进披露 + 条件激活）**
   - 与记忆分工：事实进 memory，流程进 skill
   - 兼容 agentskills.io，避免私有格式

10. **Background Review Fork（廉价模型 + digest 重放 + 写审批门）**
    - turn 结束后异步提炼；默认可关（`enabled: false`）防 token 失控
    - P1 先做「可选 + 人审」，再考虑全自动

11. **session_search（FTS5 跨会话回忆）**
    - 与 memory 互补：固定成本 vs 按需精确；中文需 trigram

12. **Tool 自注册 registry + check_fn 门控 + 错误双层包裹**
    - 新工具零中心列表维护；模型永远收合法 JSON

13. **子 agent 委派（隔离上下文 + 独立预算 + 后台结果回流）**
    - 编码场景适合并行「改测试 / 查文档 / 实现」

### P2（增强项，规模化后）

14. Curator 式技能库治理（stale/archive/合并/审计账本/回滚）
15. 7 终端后端抽象（至少 local + docker；serverless 留接口）
16. 多入口 Gateway（Telegram 等）+ DM pairing
17. Anthropic prompt caching system_and_3
18. Trajectory 导出（ShareGPT）——为自有模型训练铺路
19. Profile 隔离（多 agent 并行共存）
20. Checkpoints & Rollback（文件级快照）
21. `/journey` 学习可视化
22. ACP（IDE 集成：VS Code / Zed / JetBrains）
23. Tirith 类预执行内容扫描
24. Skills Hub 生态接入
25. 供应链 advisory 启动扫描 + `doctor` 诊断

**openmate 不必抄的**（复杂度税）：25+ 平台适配器、Desktop 客户端、语音 wake word、Nous Portal 商业集成、batch RL 轨迹训练流水线（P2 之后再议）。

---

## 7. 源码路径索引

| 子系统 | 关键路径 |
|---|---|
| Agent 门面 | `run_agent.py`（AIAgent 类 + Mixin 拼装） |
| 主循环 | `agent/conversation_loop.py` |
| Turn 阶段 | `agent/turn_*.py`（iteration_prep / api_call / api_error / overflow / truncation / recovery） |
| 初始化 | `agent/agent_init.py` |
| 工具执行 | `agent/tool_executor.py`、`agent/tool_dispatch_helpers.py` |
| 系统提示 | `agent/prompt_builder.py`、`agent/system_prompt.py` |
| 压缩 | `agent/context_engine.py`、`agent/context_compressor.py`、`agent/compression_facade.py` |
| 缓存 | `agent/prompt_caching.py` |
| 记忆 | `agent/memory_manager.py`、`agent/memory_provider.py` |
| 轨迹 | `agent/trajectory.py` |
| 工具注册 | `tools/registry.py`（discover_builtin_tools） |
| 工具编排 | `model_tools.py` |
| 工具集 | `toolsets.py` |
| 审批 | `tools/approval.py`（DANGEROUS_PATTERNS、UNRECOVERABLE_BLOCKLIST） |
| 终端 | `tools/terminal_tool.py`、`tools/environments/{base,local,docker,ssh,singularity,modal,daytona}.py` |
| 委派 | `tools/delegate_tool.py` |
| 代码执行 | `tools/code_execution_tool.py` |
| 会话检索 | `tools/session_search_tool.py` |
| 技能工具 | `tools/skill_tools.py`、`tools/skills_guard.py`、`tools/skill_provenance.py` |
| MCP | `tools/mcp_tool.py`（+ mcp_tool_*.py） |
| 会话库 | `hermes_state.py` + `hermes_state_*.py`（schema/fts/search/compression/gateway…） |
| CLI | `cli.py`、`hermes_cli/main.py`、`hermes_cli/cli_*_mixin.py` |
| 配置 | `hermes_cli/config.py`（DEFAULT_CONFIG / 迁移） |
| 网关 | `gateway/run.py`（+ run_*.py）、`gateway/session.py`、`gateway/pairing.py`、`gateway/platforms/` |
| 平台插件 | `plugins/platforms/`（telegram/discord/slack/whatsapp/matrix/…） |
| 记忆插件 | `plugins/memory/`（honcho/mem0/supermemory/hindsight/…） |
| 上下文引擎插件 | `plugins/context_engine/` |
| Cron | `cron/jobs.py`、`cron/scheduler.py` |
| ACP | `acp_adapter/` |
| 打包策略 | `pyproject.toml`（精确 pin、extras、lazy_deps 策略注释） |
| 懒安装 | `tools/lazy_deps.py` |
| 诊断 | `hermes_cli/doctor.py`、`hermes_cli/security_advisories.py` |
| 内置技能 | `skills/`、`optional-skills/` |
| 测试 | `tests/`（~25k）、`scripts/run_tests.sh`、`scripts/check-windows-footguns.py` |
| 文档站源 | `website/docs/developer-guide/*.md`、`website/docs/user-guide/*.md` |
| 安装 | `scripts/install.sh`、`scripts/install.ps1` |
| 贡献指南 | `CONTRIBUTING.md`、`AGENTS.md` |

**官方推荐阅读顺序**（架构文档）：
Architecture → Agent Loop Internals → Prompt Assembly → Provider Runtime → Tools Runtime → Session Storage → Gateway Internals → Context Compression & Caching → ACP Internals

---

## 8. 七维评分（面向 openmate 对标，10 分制）

| 维度 | 分 | 评语 |
|---|---|---|
| **架构清晰度** | **8.5** | 从巨型单文件演进为门面+模块拆分（run_agent/cli/gateway 均为 facade）；依赖链 `registry → tools/* → model_tools → AIAgent` 极清晰；文档站与代码同步度高。扣分：历史 PLUGIN-COMPAT 懒转发层与巨型门面仍是过渡态。 |
| **稳定性 / HA** | **9.5** | 可中断调用、stale timeout、fallback 链、压缩冷却、WAL 写竞争、软归档、Windows 专项、ASYNC 棘轮、fail-closed 审批——公开项目中最完整的个人 agent HA 套件。这是 openmate 最该整段移植的维度。 |
| **安全 / 权限** | **9.0** | 8 层纵深 + 不可覆盖 blocklist + 场景默认 deny + SSRF/MCP 凭据过滤/注入扫描 + 供应链 pin。明文承认 write-file 守卫非硬边界（诚实）。扣分：YOLO 与多层旁路的认知负担大。 |
| **自我进化** | **9.0** | memory + skills + background review + curator + session_search + journey 构成真闭环；写审批/审计账本/快照回滚使进化可治理。扣分：全自动进化对小模型仍危险，文档已承认。 |
| **上下文管理** | **9.0** | 双层压缩、lean 尾部、usage anchor、in-place、可插拔 ContextEngine、prompt caching、结构化摘要模板、失败冷却——远超「简单截断」。 |
| **可扩展性 / 生态** | **8.5** | 自注册工具、toolset、MCP、插件钩子（pre/post_tool_call 等）、Skills Hub 多源、Memory Provider ABC、外部技能目录、项目技能信任模型。扣分：插件边界历史上变过（内存提供商关闭内置新增）。 |
| **工程纪律 / 文档** | **9.5** | 精确 pin 政策有事故复盘注释；CONTRIBUTING 含 Windows footgun 清单与供应链规则；测试 ~25k 且 hermetic；docs 站分层完整（user/developer/reference）；issue 号进代码注释可追溯。 |
| **综合（加权偏 openmate 稳定性）** | **9.1** | 作为「个人+编码混合 agent 运行时」的参考实现，Hermes 在稳定性和自我进化两条主线上几乎没有短板。openmate 应 **P0 整包吸收 HA/审批/压缩/会话库**，**P1 适配学习闭环**，**P2 再考虑多平台与生态**。 |

---

## 附录 A：关键配置片段速查

```yaml
# ~/.hermes/config.yaml（节选）
approvals:
  mode: smart              # smart | manual | off
  timeout: 300
  cron_mode: deny
  single_query_mode: deny
  unattended_mode: deny
  deny: ["git push --force*", "*curl*|*sh*"]

compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
  tail_mode: lean          # lean | legacy
  protect_last_n: 20
  in_place: true

memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200
  user_char_limit: 1375
  write_approval: false    # true = 全部写入待审

skills:
  write_approval: false
  external_dirs: ["~/.agents/skills"]

curator:
  enabled: true
  interval_hours: 168
  min_idle_hours: 2
  stale_after_days: 14
  archive_after_days: 30
  consolidate: false
  prune_builtins: true

terminal:
  backend: docker          # 生产建议容器边界
  docker_image: "nikolaik/python-nodejs:python3.11-nodejs20"
  container_cpu: 1
  container_memory: 5120

security:
  website_blocklist:
    enabled: true
    domains: ["*.internal.company.com"]
  tirith_enabled: true
  allow_private_urls: false
```

## 附录 B：与 openmate 稳定性重构的映射建议

| openmate 痛点（假设） | Hermes 对应机制 | 优先级 |
|---|---|---|
| Agent 卡死在一次 API 调用 | 可中断调用 + stale timeout | P0 |
| 长会话撑爆上下文 | 双层压缩 + lean 尾部 + 软归档 | P0 |
| 危险命令误执行 | 审批 + blocklist + 场景 deny | P0 |
| 多进程抢会话库 | WAL + 重试 + IMMEDIATE | P0 |
| 每次重构依赖漂移炸裂 | 精确 pin + exclude-newer | P0 |
| 用户偏好反复问 | USER.md 有界记忆 + 冻结快照 | P1 |
| 相同流程反复手写 | skill_manage + 渐进披露技能 | P1 |
| 上次怎么解决的忘了 | session_search FTS5 | P1 |
| 技能/记忆膨胀失控 | Curator + 写审批 + 审计回滚 | P2 |
| 想远程用 agent | Gateway + pairing | P2 |

---

*报告基于 README、CONTRIBUTING、pyproject.toml、run_agent.py 源码、官方文档站 Architecture / Agent Loop / Session Storage / Tools Runtime / Context Compression / Security / Memory / Skills / Curator 页面整理。GitHub API 受限，目录枚举以文档与源码交叉验证为准。*
