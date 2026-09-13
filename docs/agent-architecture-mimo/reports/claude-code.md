# Claude Code 架构研究报告

> 对象：openmate（hybrid coding + personal agent，稳定性重构）
> 日期：2026-09-13
> 来源：Anthropic 官方工程博客、Claude Code 官方文档、GitHub 产品仓库、公开工具/权限设计分析

---

## 1. 总览：Claude Code 是什么

Claude Code 是 Anthropic 推出的 **agentic coding 环境**，不只是聊天机器人。核心定义：

> "Claude Code 是一个 agentic assistant，在终端中运行。它擅长编码，也能完成一切命令行可以做的事：写文档、跑构建、搜文件、调研主题。"

官方将 Claude Code 定位为 **agentic harness**（智能体外壳）：它提供工具、上下文管理与执行环境，把语言模型变成可行动的 coding agent。模型负责推理与决策，harness 负责工具与执行边界。

对 openmate 的启示：稳定性重构的关键不是“模型调用循环”本身，而是 harness 层——工具设计、权限、会话状态、隔离与可验证性。

---

## 2. 核心架构：Agentic Loop

### 2.1 三阶段循环

```
User Prompt
    ↓
[Gather Context] → [Take Action] → [Verify Results]
    ↑___________________________________________↓
              （循环，直到任务完成，用户可随时打断）
```

三阶段相互融合，全程通过工具驱动：

| 阶段 | 作用 | 典型工具 |
|------|------|----------|
| Gather Context | 搜集上下文 | Read / Grep / Glob / WebFetch / MCP |
| Take Action | 执行变更 | Edit / Write / Bash / LSP |
| Verify Results | 验证结果 | Bash（测试/构建）/ 截图对比 / Stop hook / subagent 审查 |

官方明确：**Agent 通常就是“基于环境反馈在循环中使用工具的 LLM”**。实现往往是简单的，难点在工具集与文档设计。

### 2.2 两大支柱

- **Models**：推理、规划、决策（Opus 复杂架构 / Sonnet 日常编码 / Haiku 低成本探索）
- **Tools**：行动能力。无工具则只能输出文本；有工具才能读代码、改文件、跑命令、连外部服务

### 2.3 Building Effective Agents 模式谱系

Anthropic 在《Building Effective Agents》（2024-12）中给出经典分类：

**区分 Workflows 与 Agents：**
- Workflows：LLM 与工具由预定义代码路径编排
- Agents：LLM 动态决定自己的流程与工具使用

**五种可组合 workflow 模式：**

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| Prompt Chaining | 任务分解为序列步骤，中间可加 gate | 可清晰分解的固定子任务 |
| Routing | 输入分类后路由到专用后续任务 | 不同输入类型需不同处理 |
| Parallelization | 并行子任务（Sectioning）或多视角（Voting） | 可并行或需多视角验证 |
| Orchestrator-Workers | 中央 LLM 动态拆任务、委派、综合 | 子任务不可预测（如多文件改动） |
| Evaluator-Optimizer | 一个 LLM 生成、另一个评估反馈循环 | 有清晰评估标准且迭代有增量价值 |

**Agent 何时使用：** 开放式问题、步骤数不可预测、无法硬编码固定路径、在受信任环境中需要自治。

**三原则（写给实现者）：**
1. 保持 **simplicity**（简单）
2. 保持 **transparency**（显式展示规划步骤）
3. 认真打磨 **agent-computer interface (ACI)**（工具文档与测试）

**工具格式（ACI）建议：**
- 给模型足够 token 去“思考”再写
- 格式贴近自然文本（避免 JSON 内嵌代码、精确 diff 头）
- 消除格式开销（如要求精确行数）
- Poka-yoke：把参数设计成难犯错（如强制绝对路径）

SWE-bench agent 实践：**花在优化工具上的时间比优化总 prompt 还多**。相对路径在 agent 移出根目录后会出错，改为强制绝对路径后模型使用无误。

---

## 3. 工具设计（Tool-first）

### 3.1 五大类内置工具

| 类别 | 能力 |
|------|------|
| File operations | Read、Edit、Write、NotebookEdit、文件重命名重组 |
| Search | Glob（文件名模式）、Grep（内容 regex）、Explore subagent |
| Execution | Bash、PowerShell、Monitor（后台命令/日志流）、git |
| Web | WebSearch（官方搜索后端）、WebFetch（抓取并小模型提取） |
| Code intelligence | LSP（跳转定义/引用/类型错误）、代码智能插件 |

### 3.2 关键工具行为（稳定性相关）

**Bash**
- Manual 模式下大部分命令需权限；内置一组只读命令可免提示
- 权限规则支持 `Bash(git commit *)` 等模式
- 可走 Bash sandbox（OS 级隔离）

**Edit / Write**
- Edit：针对文件做定向编辑
- Write：整文件覆盖，不追加
- 新模型可在“读取无需权限 + Read 工具可用”条件下覆盖未读文件；旧模型强制 read-before-edit
- 部分 Read（PARTIAL view）与 Jupyter 文件始终要求先读

**WebFetch**
- 设计上有损：抓取 → Markdown 化 → 小模型按 prompt 提取，通常给模型的是提取结果而非原始页
- 缓存 15 分钟；跨 host 重定向不自动跟随
- 域名安全检查 + 权限提示（可 allowlist）

**WebSearch**
- 最多 8 次后端搜索/次调用；不抓页面，需再 WebFetch
- 会话级上限 200 次（含 subagent）

**AskUserQuestion**
- 多选题收集需求/澄清歧义
- 在 auto mode 分类器中属“需用户交互”的工具，不被自动批准

**Task tools（TaskCreate / TaskGet / TaskUpdate / TaskList / TodoWrite）**
- 在部分模型上默认提供（写 checklist）；新模型可能不提供（减少上下文占用）
- 可用环境变量或 `--allowedTools` 强制开启

**Monitor**
- 后台运行命令，把每行输出反馈给 Claude，可对日志/文件变化做出反应
- 也可开 WebSocket 把消息当事件

**其他编排工具**
- Agent：spawn subagent
- EnterPlanMode / ExitPlanMode：进入/退出规划模式
- EnterWorktree / ExitWorktree：git worktree 隔离
- SendMessage / ListAgents：跨会话、agent team 消息
- Cron* / ScheduleWakeup / RemoteTrigger：会话内定时与远程例程
- PushNotification / SendUserFile：通知与文件投递

### 3.3 工具优先（Tool-first）设计原则总结

1. **无工具无行动**：agent 的 agency 完全由工具集定义
2. **工具即接口（ACI）**：描述、参数名、示例、边界与其它工具的差异要像给初级工程师写 docstring
3. **格式贴近模型先验**：自然 markdown > 嵌套 JSON；绝对路径 > 相对路径
4. **难犯错优先**：参数设计 poka-yoke
5. **持续测试模型如何使用工具**：在 workbench 中大量样例迭代

---

## 4. 权限模式（Permission Modes）

### 4.1 模式矩阵

| 模式 | 免询问可执行 | 最适合 |
|------|-------------|--------|
| `default`（Manual） | 仅读取 | 敏感工作、逐条审查 |
| `acceptEdits` | 读 + 文件编辑 + 常见文件系统命令（mkdir/touch/mv/cp/sed/rm/rmdir） | 边看边迭代 |
| `plan` | 读 + （auto 可用时）分类器批准的命令 | 先探索再改 |
| `auto` | 几乎全部，但有后台安全检查 | 长任务、减少提示疲劳 |
| `dontAsk` | 读 + 预批准工具；会触发询问的一律拒绝 | 锁定式 CI/脚本 |
| `bypassPermissions` | 全部 | 仅隔离容器/VM |

Pro/Max/Team 计划下，交互终端与 VS Code 会话的 **默认起始模式是 auto**。

### 4.2 Auto Mode：分类器审批（关键创新）

Auto mode 引入**独立分类器模型**，在动作执行前审查，替代人工批准：

**默认拦截类别（部分）：**
- `curl | bash` 等下载执行
- 敏感数据外发
- 生产部署与迁移
- 云存储批量删除
- IAM/仓库权限提升
- 共享基础设施修改
- 会话前已存在文件的不可逆销毁
- force push
- 把含 secret 的变更 commit/push 出去
- `git reset --hard`、`git checkout -- .`、`git clean -fd` 等丢弃未提交更改
- `git commit --amend`（HEAD 非本会话创建，或已 push）
- `terraform/pulumi/cdk/terragrunt destroy`
- 写 secret manager、改 DNS/TLS
- 合并无人类批准的 PR、自批自 PR
- 关闭/开关生产 feature flag
- DaemonSet / admission webhook 等全节点 K8s 资源
- 反向隧道把本地服务暴露公网
- 把 live credential 打进 transcript
- 绕过内部包仓库直连公网仓库
- 带 `--insecure` 等解除安全护栏的 flag
- 启动无人审批、无沙箱的自治 agent 循环
- 删除会话 transcript（`~/.claude/projects/` 下 jsonl）
- 篡改 Claude Code 自身 tmux 界面（视为改自身权限）
- 删除/注释/强制通过安全相关测试断言
- 把 API base URL / proxy / webhook / registry 指向与任务无关的第三方
- 读取云实例元数据端点凭据、扫同级容器/POD

**分类器还审查：**
- SendMessage 跨 agent 消息
- `rm`/`rmdir` 对 critical path（`rm -rf /`、`rm -rf ~`）

**信任边界：** 会话启动时的工作目录与已配置 remote；会话中途新增/改指向的 remote 不受信任。

### 4.3 权限规则层

模式是基线，规则叠加：

```
permissions:
  allow:  [Bash(npm test), Read, Edit]
  ask:    [Bash(git push *), Bash(rm *)]
  deny:   [Read(./.env), Edit(./.github/**)]
```

- **deny 在所有模式（含 bypassPermissions）都生效**
- allow 在 bypassPermissions 无效
- 作用域优先级：managed（组织）> project > user
- 设置文件位置：managed settings → project `.claude/settings.json` / `settings.local.json` → `~/.claude/settings.json`
- protected paths：除非 bypassPermissions，写保护路径不自动批准
- critical paths：`rm`/`rmdir` 对关键路径的删除，任何 allow 或 PreToolUse hook "allow" 都不能免审

### 4.4 不会被任何模式自动批准的动作

- 显式 ask 规则匹配的工具
- 组织设为 `ask` 的 connector 工具
- 需要用户交互的工具（AskUserQuestion、MCP `requiresUserInteraction`）
- critical path 的 `rm`/`rmdir`
- 跨会话消息安全护栏
- `blockReadsOutsideWorkingDirectories` 时读工作目录外

### 4.5 Plan Mode

- 只读探索 + 产出计划，不改源码
- `Ctrl+G` 可在编辑器中直接改计划
- 批准选项：Yes + auto / Yes + 手动逐条 / No 继续规划
- 批准后退出 plan，切换到对应权限模式
- 可用 Stop hook 做确定性 gate（连续 8 次 block 后覆盖 hook 并结束）

对 openmate：权限应是**分层策略系统**（模式基线 + allow/ask/deny 规则 + 沙箱边界 + 组织策略），不是单点 boolean。

---

## 5. 子代理（Subagents）

### 5.1 设计动机

上下文是最稀缺资源。Subagent 在**独立上下文窗口**中工作，只把摘要带回主会话：

- 保留主上下文（探索/研究结果不污染）
- 限制工具访问（安全与专注）
- 复用配置（用户级 subagent）
- 专业化行为（领域 system prompt）
- 控制成本（路由到 Haiku 等便宜模型）

### 5.2 内置 subagent

| 名称 | 模型 | 工具 | 用途 |
|------|------|------|------|
| Explore | 继承主对话（API 上封顶 Opus） | 只读 | 搜索/分析代码库；thoroughness: quick/medium/very thorough |
| Plan | 继承主对话 | 只读 | plan mode 下的研究 |
| General-purpose | 主对话模型或指定模型 | 几乎全部 | 复杂多步、探索+修改 |
| claude / statusline-setup / claude-code-guide | 视情况 | 视情况 | 辅助 |

Explore/Plan 跳过 CLAUDE.md 与父会话 git status，保持研究便宜快速。

### 5.3 自定义 subagent

Markdown + YAML frontmatter：

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
tools: Read, Grep, Glob, Bash
model: opus
permissionMode: plan
isolation: worktree
maxTurns: 20
---
You are a senior security engineer. Review code for: ...
```

**作用域优先级：**
1. Managed settings（组织）
2. `--agents` CLI flag（当前会话）
3. `.claude/agents/`（项目）
4. `~/.claude/agents/`（用户全局）
5. Plugin 的 `agents/`

**关键 frontmatter 字段：**
`name`、`description`、`tools`、`disallowedTools`、`model`、`permissionMode`、`maxTurns`、`skills`、`mcpServers`、`hooks`、`memory`、`background`、`effort`、`isolation: worktree`、`color`、`initialPrompt`

**描述预算是 15,000 tokens**（所有自定义 subagent description 合计）。细节放 system prompt，description 要短且可路由。

### 5.4 Fork（对话分叉）

- fork 是**继承完整对话历史**的 subagent（与普通 subagent 的全新上下文不同）
- 共享 prompt cache，更便宜
- 适合需要大量背景的侧任务，或从同一起点并行试多种方案
- `/subtask` 手动触发；fork mode 默认在交互会话开启
- fork 不能再 spawn 更深 fork

### 5.5 隔离

- `isolation: worktree`：在临时 git worktree 中运行
- 阻止命令把 git 重定向到主 checkout
- 验证不了命令文本是否留在 worktree 内则拒绝

### 5.6 验证模式（Best Practices）

官方推荐的验证闭环：

1. **单 prompt 内**：要求跑 check 并迭代
2. **跨会话**：`/goal` 条件 + 独立 evaluator
3. **确定性 gate**：Stop hook 跑脚本，不过不许停（8 次 block 上限）
4. **第二意见**：verification subagent 或 adversarial review（fresh context 只看 diff 与标准）

Writer/Reviewer 模式：会话 A 实现，会话 B 新上下文审 diff，避免“自己写自己审”的偏差。

对 openmate：subagent 是**上下文隔离 + 工具降权 + 成本路由**的三合一机制，稳定性重构应一等公民支持。

---

## 6. 上下文压缩（Compaction）

### 6.1 问题

上下文窗口装对话历史、文件内容、命令输出、CLAUDE.md、auto memory、skills、系统指令。填满后性能退化，早期指令被“遗忘”。

### 6.2 自动压缩策略

接近上限时 Claude Code 自动管理：

1. **先清旧工具输出**
2. **再摘要对话**（保留请求与关键代码片段；早期详细指令可能丢失）

若单文件/工具输出过大导致压缩后立即再次填满，**多次尝试后停止自动压缩**并报 thrashing 错误，而不是死循环。

### 6.3 可控压缩

| 机制 | 用途 |
|------|------|
| `/clear` | 任务间完全重置 |
| `/compact <instructions>` | 带焦点压缩，如 `/compact focus on the API changes` |
| CLAUDE.md "Compact Instructions" | 自定义压缩时保留什么（如“始终保留修改文件完整列表与测试命令”） |
| `/rewind` + Summarize from here / up to here | 只压缩从某点之后 / 之前的对话 |
| `/btw` | 旁路问题，答案不进对话历史 |
| `/context` | 查看上下文占用 |

### 6.4 减负设计

- **Skills 按需加载**：会话开始只见 description，正文用到才载入
- **Subagent 隔离**：探索文件不进主上下文
- **MCP 工具定义延迟加载**：默认 defer，通过 tool search 按需载入；只有工具名与 server instructions 占上下文
- **持久规则放 CLAUDE.md**，不依赖会话历史

### 6.5 SessionStart hook + compact

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{
        "type": "command",
        "command": "echo 'Reminder: use Bun not npm. Current sprint: auth refactor.'"
      }]
    }]
  }
}
```

压缩后重新注入关键上下文。

对 openmate：压缩不是“大文件 trim”，而是**分层上下文治理**——持久层（CLAUDE.md/memory）+ 按需层（skills/MCP）+ 隔离层（subagent）+ 压缩层（compact）+ 旁路层（/btw）。

---

## 7. Hooks（确定性生命周期钩子）

### 7.1 与 CLAUDE.md 的本质区别

> CLAUDE.md 是 advisory（建议性），hooks 是 **deterministic（确定性）**——保证动作一定发生。

用于：强制项目规则、自动化重复任务、集成现有工具。

### 7.2 生命周期事件（完整谱系）

| 事件 | 触发点 |
|------|--------|
| SessionStart / Setup | 会话开始/恢复；`--init` 准备 |
| UserPromptSubmit / UserPromptExpansion | 用户提交 prompt 前 |
| PreToolUse | 工具调用执行前（**可 block**） |
| PermissionRequest / PermissionDenied | 需要权限决策 / auto mode 拒绝 |
| PostToolUse / PostToolUseFailure / PostToolBatch | 工具成功后 / 失败后 / 并行批次解析后 |
| Notification / MessageDisplay | 通知 / 消息显示 |
| SubagentStart / SubagentStop | 子代理开始/结束 |
| TaskCreated / TaskCompleted | 任务创建/完成 |
| Stop / StopFailure | 响应结束 / API 错误导致结束 |
| InstructionsLoaded | CLAUDE.md 或 rules 加载 |
| ConfigChange / CwdChanged / DirectoryAdded / FileChanged | 配置/目录/文件变化 |
| WorktreeCreate / WorktreeRemove | worktree 创建/移除 |
| PreCompact / PostCompact | 压缩前后 |
| TeammateIdle | agent team 队友空闲 |
| SessionEnd | 会话结束 |

### 7.3 Hook 类型

| 类型 | 行为 | 超时 |
|------|------|------|
| `command` | 跑 shell 脚本，stdin 收 JSON | 默认 10 分钟（部分事件更短） |
| `prompt` | 单次 LLM 调用，返回 ok/reason JSON | 30 秒 |
| `agent` | spawn subagent 验证（可读文件、跑命令） | 60 秒，最多 50 tool turns |
| `http` | POST 到端点 | 同 command |
| `mcp_tool` | MCP 工具钩子 | 同 command |

### 7.4 决策控制

- **PreToolUse exit 2 或 `permissionDecision: "deny"`**：block，甚至在 bypassPermissions 下也生效 → **用户改权限模式绕不开 hook 策略**
- **PreToolUse "allow"**：不能越过 deny 规则，不能消除 MCP requiresUserInteraction 提示 → **hook 只能收紧不能放松**
- **Stop hook block**：让 Claude 继续工作；连续 8 次强制结束（可调 `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`）
- **PermissionRequest hook**：可 `behavior: allow` 代答，或 `setMode` 切模式

### 7.5 典型用例

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
      }]
    }],
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "agent",
        "prompt": "Verify that all unit tests pass. $ARGUMENTS",
        "timeout": 120
      }]
    }]
  }
}
```

对 openmate：hooks 是**策略与安全的硬边界**。凡是“必须发生/必须禁止”的，不应依赖 prompt 指令，应落到 hook。

---

## 8. MCP（Model Context Protocol）

### 8.1 定位

开源标准，让 Claude Code 连接外部工具/数据源/数据库/API。替代“手工把数据粘进对话”。

### 8.2 传输与安装

| 传输 | 说明 |
|------|------|
| HTTP（推荐） | 远程；`--transport http`；OAuth 支持 |
| SSE | 已弃用；HTTP 失败可自动降级 |
| stdio | 本地进程；`--` 分隔 Claude 参数与 server 命令 |
| WebSocket | 持久双向；适合事件推送；无 OAuth CLI |

**作用域：**
- `local`（默认）：仅当前项目、仅自己 → `~/.claude.json`
- `project`：团队共享 → 仓库根 `.mcp.json`（需批准）
- `user`：跨项目、仅自己 → `~/.claude.json`
- managed：组织强制

`.mcp.json` 支持 `${VAR}` 与 `${VAR:-default}` 展开（command/args/env/url/headers）。

### 8.3 信任与安全

- 项目 `.mcp.json` 在交互会话需用户批准
- **未信任 workspace 不能用自己的 committed approvals**（防止恶意仓库自我授权）
- 服务器可能带来 **prompt injection 风险**
- 可 `disabledMcpjsonServers` 硬禁
- 组织可 `managedMcpServers` 强制提供

### 8.4 上下文与性能

- **Tool search（默认开启）**：MCP 工具定义延迟加载，按需 ToolSearch；避免数百工具定义撑爆上下文
- 输出超 10,000 tokens 警告，默认 cap 25,000
- 长工具调用（>2 分钟）自动后台化
- 远程 server 断连指数退避重连（最多 5 次）
- discovery cache：缓存工具列表，首次调用才连接
- `list_changed` 动态刷新工具列表

### 8.5 Channels（反向推送）

MCP server 可声明 `claude/channel`，向会话推送消息（CI 结果、监控告警、Telegram/Discord），让 Claude 被动反应。启动需 `--channels` opt-in。

对 openmate：MCP 是**扩展工具面的开放协议**；个人 agent 场景下 Channels + tool search + 信任边界三者缺一不可。

---

## 9. 沙箱（Sandbox）

### 9.1 两层隔离

| 层 | 作用 | 实现 |
|----|------|------|
| Filesystem isolation | 控制可读写路径 | macOS Seatbelt；Linux/WSL2 bubblewrap |
| Network isolation | 控制可访问域名 | socat + 代理 |

可独立开关（如只隔离网络、关掉文件系统隔离）。**有效沙箱需要两层同时开**：无网络隔离可外泄；无文件系统隔离可后门系统资源。

### 9.2 模式

- **auto-allow**：能沙箱化的命令自动批准；不能的回落到常规权限流
- **regular permissions**：即使沙箱化也走权限流

与权限模式正交，但 **plan mode 下 auto-allow 不扩大批准范围**。

### 9.3 转义阀（Escape Hatch）

命令在沙箱内失败时，Claude 可用 `dangerouslyDisableSandbox` 重试。该重试走常规权限流（Manual 提示 / auto 分类器）。可用 `allowUnsandboxedCommands: false` 关掉（strict sandbox mode）。

### 9.4 凭据保护

```json
{
  "sandbox": {
    "enabled": true,
    "credentials": {
      "files": [
        { "path": "~/.aws/credentials", "mode": "deny" },
        { "path": "~/.ssh", "mode": "deny" }
      ],
      "envVars": [
        { "name": "GITHUB_TOKEN", "mode": "mask", "injectHosts": ["api.github.com"] },
        { "name": "NPM_TOKEN", "mode": "deny" }
      ]
    }
  }
}
```

- **deny**：沙箱内读不到 / 环境变量 unset
- **mask**：命令看到 sentinel 值，代理在出站请求到 injectHosts 时替换真实值（命令与日志永不持有真凭据）

### 9.5 局限（诚实边界）

- 不 inspect 默认 TLS（domain fronting 可能绕过宽域名 allowlist）
- Unix socket 可能成为提权路径（如 docker.sock）
- 不隔离内置文件工具（Read/Edit/Write 走权限系统）
- Computer use 跑在真实桌面
- 不支持原生 Windows（需 WSL2）
- 不是完整安全边界

对 openmate：个人 agent 更需要沙箱 + 凭据 mask + 关闭 escape hatch 的组合，否则“稳定性”只是表象。

---

## 10. 会话恢复与检查点（Session Recovery / Checkpointing）

### 10.1 会话模型

- 每条消息、工具调用与结果写入 `~/.claude/projects/` 下的 **plaintext JSONL**
- 会话与目录绑定；独立、默认不共享历史
- `claude --continue` / `--resume`：续接同一 session ID
- `--fork-session` / `/branch`：复制历史到新 ID
- `/rename` 命名会话，像 git branch 一样管理工作流
- 跨 worktree 可并行会话

### 10.2 Checkpoints

- **每个启动 turn 的 prompt 创建一个 checkpoint**
- 会话保留最近 **100 个** checkpoint 的文件快照
- 与对话一起持久化，resume 后仍可 `/rewind`
- 约 30 天 retention sweep

### 10.3 Rewind 动作

| 动作 | 效果 |
|------|------|
| Restore code and conversation | 代码与对话都回退 |
| Restore conversation | 只回对话，代码保留 |
| Restore code | 只回代码，对话保留 |
| Summarize from here | 从该点向前压缩 |
| Summarize up to here | 压缩该点之前，保留后续 |

### 10.4 限制（稳定性重构必须知道）

- **Bash 改动不追踪**（rm/mv/cp 无法 rewind）
- **Subagent 编辑通常不进 checkpoint**（用 git 回退）
- 外部进程/其他并发会话的改动不追踪
- mid-turn 排队消息不创建 checkpoint
- **符号链接与硬链接不恢复**
- **不能替代 git**

对 openmate：会话恢复 = JSONL transcript + 文件快照 checkpoint + 明确的覆盖边界（bash/subagent 外部）。误用“checkpoint 万能”会导致稳定性幻觉。

---

## 11. CLAUDE.md / AGENTS.md 与项目记忆

### 11.1 CLAUDE.md

每次对话开始读取的特殊文件，存 Bash 命令、代码风格、工作流规则等**无法从代码推断的持久上下文**。

**该写：**
- Claude 猜不到的 Bash 命令
- 与默认不同的代码风格
- 测试指令与首选 runner
- 仓库礼仪（分支命名、PR 约定）
- 项目特定架构决策
- 开发环境怪癖（必需环境变量）
- 常见 gotchas

**不该写：**
- 读代码就能知道的
- 标准语言惯例
- 详细 API 文档（链过去）
- 频繁变化的信息
- 长教程
- 逐文件代码库描述
- 自明实践（“写干净代码”）

**健康度检查：** 对每一行问——“删掉这行会让 Claude 犯错吗？”不会就删。**过长的 CLAUDE.md 会让 Claude 忽略真实指令。** `/doctor` 可建议裁剪。像代码一样 review、prune、test。

支持 `@path/to/import` 导入其他文件；可放用户级、项目级、组织级多处。

### 11.2 Auto Memory

Claude 自动保存的学习成果（用户偏好等）。MEMORY.md 前 200 行或 25KB 在会话开始加载。

### 11.3 Skills vs CLAUDE.md

- CLAUDE.md：每次都加载的**事实/规则**
- Skills：按需加载的**领域知识与工作流**
- 当 CLAUDE.md 某段变成“流程”而不是“事实”时，迁移到 skill

### 11.4 Skills 机制

```markdown
---
name: api-conventions
description: REST API design conventions for our services
---
# API Conventions
- Use kebab-case for URL paths
- Always include pagination
```

- 遵循 **Agent Skills 开放标准**（agentskills.io）
- description 供模型决定何时自动调用；截断到 1,536 字符
- `disable-model-invocation: true`：只允许用户 `/name` 手动调
- `allowed-tools`：本轮免询问工具
- `context: fork`：在 forked subagent 中运行
- **动态上下文注入**：`` !`git diff HEAD` `` 在模型看到前先跑命令内联结果
- 位置：managed > personal > project > nested > plugin > claude.ai sync

### 11.5 Plugins

打包 skills + hooks + subagents + MCP servers 的分发单元。通过 marketplace 安装。

对 openmate：记忆分层（持久规则 / 自动学习 / 按需技能 / 插件分发）是个人 agent 长期可用性的关键。

---

## 12. 并行与规模化

### 12.1 并行手段

| 机制 | 说明 |
|------|------|
| Git worktrees | 隔离 checkout，编辑不碰撞 |
| Cross-session messaging | 会话间传发现 |
| Agent view / background agents | `claude agents` 后台多会话 |
| Agent teams | 实验性：共享任务、消息、team lead |
| `/batch` | 5–30 个 subagent 各在 worktree 开 PR |
| `claude -p` 循环 | 脚本 fan-out，`--allowedTools` 限权 |
| Desktop / Web | 多会话可视化 / 云端会话 |

### 12.2 非交互模式

```bash
claude -p "fix all lint errors" --permission-mode auto
claude -p "..." --output-format json
claude -p "..." --output-format stream-json --verbose
```

默认 `default`（Manual）权限模式；`--no-session-persistence` 可不落盘会话。

### 12.3 执行环境

| 环境 | 代码跑在哪 |
|------|-----------|
| Local | 本机（默认） |
| Cloud | Anthropic 托管 VM 或自托管环境 |
| Remote Control | 本机执行，浏览器控制 |

对 openmate：并行的前提是**权限可收窄到单命令模式**（`--allowedTools`）与**状态可隔离**（worktree）。没有这两点，fan-out 是稳定性灾难。

---

## 13. 公开逆向/架构分析要点

> 说明：Claude Code 是闭源产品仓库（GitHub 仅 README、插件与 issue）。系统 prompt 与内部实现未开源。以下为公开文档与社区分析归纳。

### 13.1 系统 prompt 与工具设计观察

1. **工具描述即 prompt 工程**：官方承认 SWE-bench 优化中工具时间 > 总 prompt 时间
2. **工具命名精确、可权限匹配**：`Bash(git commit *)`、`Edit`、`Read` 等字符串同时用于 permission rules、subagent tools、hook matchers——**单一命名空间三处复用**
3. **系统 reminder 分层**：上下文中注入 instructions、CLAUDE.md、auto memory、skills 描述、MCP server instructions，多层叠加但各自可裁剪
4. **模型代际差异显式处理**：Task tools 按模型提供；read-before-edit 新旧模型行为不同——说明 harness 对模型能力有 **capability matrix**
5. **分类器作为第二模型**：auto mode 不是规则引擎，是另一模型的实时安全判断——双模型架构

### 13.2 设计模式提炼（对 openmate 可直接映射）

| Claude Code 模式 | openmate 映射 |
|------------------|---------------|
| Agentic harness 与模型分离 | 稳定性在 harness，不在换模型 |
| Tool-first + ACI 投入 | 工具 schema/文档/边界与 prompt 同等重要 |
| 权限分层：mode + rules + sandbox + org policy | 不要单一 allow-all/deny-all |
| 分类器自动审批 | 高频低风险动作免打扰，高风险走审查 |
| Subagent 隔离上下文与工具 | 长研究/探索不进主对话 |
| Compaction + 按需加载（skills/MCP） | 上下文治理比“更长窗口”更关键 |
| Hooks 硬保证 | 安全与格式化不靠嘱咐 |
| JSONL 会话 + checkpoint | 可恢复会话 + 明确恢复边界 |
| CLAUDE.md 精简纪律 | 记忆文件要 prune，过长即失效 |
| 强制可验证（tests/goal/Stop hook） | 无验证信号则不自治收尾 |
| Plan mode 先探后改 | 多文件变更必须 plan gate |

### 13.3 官方 Best Practices 失败模式（直接可用作 openmate 检查清单）

| 失败模式 | 修复 |
|----------|------|
| Kitchen sink session（无关任务混进同一会话） | `/clear` 分任务 |
| 反复纠正仍错 | 两次后 `/clear`，用学到的重写初始 prompt |
| CLAUDE.md 过长 | 无情裁剪；能从代码推断的删除或改 hook |
| Trust-then-verify gap | 永远提供验证；不能验证就不交付 |
| Infinite exploration | 限定研究范围或用 subagent |

---

## 14. 对 openmate 稳定性重构的建议清单

### P0（架构级）

1. **分离 harness 与 model**：工具执行、权限、状态、隔离独立于具体 LLM
2. **工具契约**：每个工具有 description、schema、权限级别、错误语义、示例；命名与 permission/hook/subagent 共用
3. **权限三层**：模式基线（manual/accept/plan/auto）+ allow/ask/deny 规则 + 沙箱（文件系统+网络）
4. **会话持久化**：JSONL transcript + 文件快照 checkpoint + resume/fork/rewind；文档化 bash/subagent/外部改动不恢复
5. **上下文治理**：自动压缩 + 可控 compact + 按需 skills/MCP + subagent 隔离 + `/clear` 纪律

### P1（可靠性）

6. **Hooks 硬策略**：PreToolUse block、Stop 验证 gate、PostToolUse 格式化、SessionStart+compact 重注入
7. **可验证收尾**：测试/构建/截图/goal 条件；adversarial review subagent
8. **Plan mode**：多文件/不确定任务先 plan 再改
9. **CLAUDE.md 纪律**：只写不可推断事实；定期 prune；流程迁 skills

### P2（规模化与安全）

10. **Subagent 一等公民**：Explore/Plan/General + 自定义；工具集收窄；worktree 隔离
11. **MCP + tool search**：延迟加载工具定义；项目 `.mcp.json` 需批准；防 prompt injection
12. **沙箱 + 凭据 mask**：两层隔离同时开；deny/mask credentials；评估是否关闭 escape hatch
13. **并行**：worktree + 收窄 allowedTools + Writer/Reviewer 分会话
14. **失败可恢复**：明确 checkpoint 边界；外部副作用靠 git/事务而非 rewind

### 反模式（避免）

- 把稳定性寄托在“更强模型”
- 靠 prompt 要求安全动作而不做 hook/沙箱
- CLAUDE.md/系统 prompt 无限膨胀
- 无验证信号就宣称任务完成
- 主上下文塞满探索日志
- 单一 boolean 权限（无分层）
- 假设 checkpoint 能回滚一切

---

## 15. 信息来源

| 来源 | URL | 拿到的内容 |
|------|-----|-----------|
| Building Effective Agents | https://www.anthropic.com/engineering/building-effective-agents | Workflow/Agent 分类、5 种模式、ACI、工具 poka-yoke |
| Claude Code Best Practices | https://www.anthropic.com/engineering/claude-code-best-practices | 验证、plan、CLAUDE.md、权限、hooks、skills、subagent、compaction、并行、失败模式 |
| How Claude Code Works | https://code.claude.com/docs/en/how-claude-code-works | Agentic loop、工具类别、会话、上下文、权限、checkpoint |
| Permission Modes | https://code.claude.com/docs/en/permission-modes | 模式矩阵、auto mode 分类器、plan mode、protected/critical paths |
| Sub-agents | https://code.claude.com/docs/en/sub-agents | 内置/自定义 subagent、fork、隔离、frontmatter |
| Hooks Guide | https://code.claude.com/docs/en/hooks-guide | 生命周期事件、command/prompt/agent/http hooks、决策控制 |
| Tools Reference | https://code.claude.com/docs/en/tools-reference | 完整工具表与行为细节 |
| MCP | https://code.claude.com/docs/en/mcp | 传输、作用域、tool search、channels、信任模型 |
| Sandboxing | https://code.claude.com/docs/en/sandboxing | 文件系统/网络隔离、凭据 deny/mask、局限 |
| Checkpointing | https://code.claude.com/docs/en/checkpointing | 快照、rewind/summarize、限制 |
| Skills | https://code.claude.com/docs/en/skills | SKILL.md、动态注入、与 CLAUDE.md 分工 |
| GitHub README | https://github.com/anthropics/claude-code | 产品定位、安装（闭源产品仓库） |
| A postmortem of three recent issues | https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues | 基础设施稳定性案例（上下文路由、输出损坏、XLA:TPU），与 agent harness 间接相关 |

**未成功获取：** GitHub 主页（Transport error）、platform.claude.com 部分路径（地区限制）、docs.anthropic.com 旧域名、Simon Willison 逆向文（404）。Agent SDK 细节仅从交叉引用得知（`settingSources`、`allowedTools`、`canUseTool`、`setMcpServers` 等），完整 SDK 文档未能直接抓取。

---

## 16. 一句话总结

Claude Code 的稳定性不来自“更聪明的循环”，而来自：**tool-first 的 ACI 工程、分层权限与沙箱、确定性 hooks、子代理上下文隔离、主动上下文压缩、JSONL 会话+检查点，以及“必须可验证才允许收尾”的工程纪律**。openmate 做稳定性重构，应优先建 harness 与策略层，而不是先换模型或加循环。
