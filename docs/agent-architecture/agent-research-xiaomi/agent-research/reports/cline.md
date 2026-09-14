# Cline 架构研究报告

> 研究日期：2026-09-13 | 仓库：https://github.com/cline/cline  
> 官网文档：https://docs.cline.bot | SDK：https://docs.cline.bot/cline-sdk/overview  
> 研究目的：为 openmate 稳定性重构借鉴 Plan/Act、MCP、checkpoints、人工审批、diff 编辑

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 项目名 | Cline（原 Claude Dev） |
| 定位 | 开源 IDE/终端/桌面自主编码 agent；同源 SDK 可嵌入 |
| 主语言 | TypeScript / Bun；VS Code Extension + CLI + Desktop(Tauri) + JetBrains + SDK |
| 许可 | Apache 2.0 |
| 分发 | VS Marketplace `saoudrizwan.claude-dev`；npm `cline`；桌面 macOS/Win；`@cline/sdk` |
| 模型 | Anthropic / OpenAI / Google / OpenRouter(200+) / Bedrock / Azure / GCP / Groq / Ollama / 任意 OpenAI 兼容 |
| 产品矩阵 | SDK（核心引擎）→ CLI / VS Code / Desktop / JetBrains 共用；Hub 进程做会话中台 |
| 近期演进 | 4.0 起把 VS Code 迁到 SDK session 层；4.1 修 Hub 内存、checkpoint、MCP 启动、abort 级联取消等稳定性问题 |

### Cline SDK 包结构

```
@cline/sdk        → 再导出 core
@cline/core       → Node 运行时：session、内置工具、持久化、hub、automation、telemetry、plugin
@cline/agents     → 浏览器兼容 AgentRuntime / Agent loop（无状态）
@cline/llms       → provider gateway + model catalog
@cline/shared     → 类型、schema、tool helper、hooks、extension contract
```

依赖方向严格向下：`core → agents/llms/shared`，`agents → llms/shared`。

---

## 2. 架构

### 2.1 总体

```
┌─────────────────────────────────────────────────────┐
│  Hosts: VS Code / JetBrains / CLI / Desktop / CI    │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  @cline/core  (Hub / Session / Tools / Storage)     │
│   - session manifest + message artifacts            │
│   - tool approvals / auto-approve matrix            │
│   - checkpoints (workspace snapshot)                │
│   - MCP hub / plugins / skills / rules              │
│   - teams / subagents / cron automations            │
│   - connect Slack/Telegram/Discord/Linear           │
└───────────┬───────────────────────┬─────────────────┘
            │                       │
   @cline/agents            @cline/llms
   AgentRuntime             DefaultGateway
   run/continue/abort       provider handlers
   subscribe/snapshot       model catalogs
            │                       │
            └───────────┬───────────┘
                        │
                 @cline/shared
                 createTool / HookEngine / types
```

### 2.2 关键设计点

1. **Plan / Act 双模式**（产品级心智模型）
   - **Plan**：只读探索、提问、出方案；**硬拦截**文件编辑类 shell（重定向、就地编辑器、变异 git 子命令、包安装）
   - **Act**：执行计划；文件编辑与终端命令默认需审批，可开 auto-approve
   - 4.1.4 起：**禁止模型自行 Plan→Act 切换**，切换权交给人（稳定性：防 agent 中途越权）
2. **Human-in-the-loop 审批**
   - 每次文件 diff / 命令执行 / MCP 调用可批
   - auto-approve 矩阵按工具粒度；命令 auto-approve 默认关闭
   - 4.1.8 移除装饰性 “Yolo Mode”，以 auto-approve 菜单为唯一真源
3. **Checkpoints**
   - 任意 tool 使用时自动 workspace snapshot
   - 可只恢复 task 状态 / 只恢复文件 / 两者
   - 恢复时若 checkpoint 之后有 commit → **拒绝恢复**（防止静默丢 commit）
   - diff 含 untracked 文件；git 半程初始化也能接上
4. **Diff 编辑**
   - 大文件用 search & replace 块，防止整文件覆盖误删
   - block anchor matching（≥3 行时用首尾行锚点）
   - 强调 auto-format 干扰：system prompt 要求以更新后文件内容为 SEARCH 参考
   - VS Code/JetBrains 内原生 diff 视图，可手改后接受或整块 Revert
5. **MCP**
   - 内置 McpHub；可从 marketplace 装；可让 Cline **现场生成**自定义 MCP server
   - stdio 初始化 30s 预算；远程 SSE/HTTP 10s 预算；`list_changed` 刷新
   - 企业可 `allowedMCPServers` 禁 marketplace
   - MCP 路由从随机 uid 改为按 server name（重启/列表变更仍稳定）
6. **Rules / Skills / Plugins**
   - `.clinerules`（项目）+ 全局 rules（含 `~/Cline/Rules` 适配 WSL）
   - Skills 可按需加载；插件用 SDK 注册 `createTool` + lifecycle hooks
7. **多端同源**
   - CLI headless（`--json` 给 CI）、Desktop、IDE 共用 SDK session
   - Hub 常驻：断线 replay、升级后 session 保活
8. **终端**
   - 在用户真实终端跑命令；长驻进程（dev server）可 “Proceed While Running”
   - Windows PowerShell 处理、失败 fail-fast、结构化命令保真

---

## 3. Loop 与工具

### 3.1 Agent 循环（SDK `AgentRuntime`）

```
subscribe(event) 流式回调
  assistant-text-delta / tool-call / tool-result / approval-requested / ...

run(prompt)
  → 组装 context（workspace 元数据、rules、@file/@url/@problems mentions、MCP tools）
  → gateway 调模型（流式）
  → 解析 tool_calls
  → 对每个 tool：
       PreToolUse hooks（可 cancel / 改 context）
       approval 门（auto-approve 矩阵 + Plan 硬拦截）
       执行（内置 file/bash/search/browser 或 MCP/plugin）
       PostToolUse hooks
       产出 Observation / 工具结果截断预算
  → 若上下文将溢出：compact（摘要）并 retry 一次
  → 连续错误计数（consecutive mistake limit）
  → 结束或 continue
```

### 3.2 内置工具面

| 工具 | 说明 |
|---|---|
| read_file / write_to_file / apply_patch | 文件读写与补丁 |
| search_files / codebase search | regex / 结构搜索 |
| list_files_* / view_source_code_definitions | 工程结构与符号 |
| run_commands / execute_command | 终端；结构化 argv 优先 |
| browser（Computer Use / inspect_site） | 截图、console、点击输入 |
| MCP tools | 动态注册 |
| web_fetch / web_search | 可选 |
| teams / subagents | 协调者拆任务，状态跨会话持久 |

### 3.3 人类反馈点

- 每个危险 tool 的 approve/deny
- Edit 后可直接改 diff
- Cancel 按钮注入纠正信号
- 把模型拒绝消息改写为“人的决定”而非错误（4.1.17）

---

## 4. 稳定性 / HA 设计

从 CHANGELOG 可直接提炼出大量“生产事故驱动”的稳定性实践，对 openmate 极有价值：

| 机制 | 事故/场景 | 修复思路 |
|---|---|---|
| **Hub 内存膨胀** | 每次 status 更新向所有 client 广播整份 transcript | snapshot 只带状态增量 |
| **Hub 重启保活** | 升级/重启丢 session | client replay missed events；防 live+replay 双投 |
| **双安装互杀** | 两个版本扩展互相 shutdown Hub | build identity 全序比较，单向退休 |
| **Hook 失败不拖垮主进程** | hook spawn 失败导致任务崩溃 | 隔离 hook 进程错误 |
| **Checkpoint 安全恢复** | checkpoint 后已有 commit 被静默踢掉 | 拒绝恢复并提示 |
| **MCP 启动不阻塞** | 不可达远程 MCP 卡死 session 启动 | 10s/30s 超时预算 |
| **Abort 级联** | 取消主任务后 subagent/teammate 继续跑 | abort 传播 |
| **Context 耗尽恢复** | 裸 provider 错误 | compact + 单次 retry；不可恢复时解释原因 |
| **空响应重试** | 仅 Ollama 重试不够 | 全 provider 空响应重试 |
| **截断 JSON 不“假修”** | 静默 repair 出错误参数 | 直接 reject |
| **工具调用能力误判** | 空 capability list 被当成权威拒绝，剥光 tools | 显式列表才裁决 |
| **CRLF / 行尾** | apply_patch 破坏 CRLF | 保留原生行尾 |
| **长命令任务卡死** | shell 已结束但 UI 未 complete | 命令结束即 settle |
| **计划模式越权** | Plan 下改文件 | 硬拦截 + 禁止模型自切模式 |
| **连续错误上限** | 连续 mistake limit + telemetry | 防无限错误循环 |
| **任务上下文泄漏** | task-scoped overlay 泄到下一任务 | 切换时清 overlay |
| **凭据刷新** | 瞬时网络失败被登出 | 仅真正 rejected refresh 才登出 |
| **事件日志磁盘** | hub event log 撑爆磁盘 | 保留策略 |
| **Telemetry 混淆** | Langfuse 被 minify 搞挂；失败归错模型 | 检测与归因修正 |

**HA 评价**：Cline 的稳定性来自“IDE 真实用户高频误用”打磨，审批、checkpoint、compact、MCP 超时、abort 传播都极接地气。缺点是早期架构遗留多，靠 SDK 迁移逐步统一。

---

## 5. 自我进化

| 维度 | 机制 |
|---|---|
| **Rules** | `.clinerules` 项目约定 + 全局 rules；自动加载 |
| **Skills** | 按需加载的专项指令；slash command 可触发 |
| **Plugins（SDK）** | 注册自定义 tool + hooks，用于审计、策略、领域能力 |
| **动态 MCP** | “帮我加个能查 npm 文档的工具” → 现场 scaffold MCP server |
| **Marketplace** | Skills / MCP / Plugins 统一 Customize 市场 |
| **Teams** | coordinator 拆子任务给 specialist；team 状态跨会话 |
| **Automations / Cron** | 定时 PR 摘要、依赖检查、健康报告 |
| **连接器** | Slack/Telegram/Discord/Linear 映射为 session，带 ACL |
| **模型目录活更新** | 读 live catalog，新模型无需扩展开更新 |
| **学习信号** | consecutive mistake telemetry、provider 失败归因；暂无像 Aider 的代码自举指标 |

---

## 6. 对 openmate 借鉴

**必须借鉴（高优先级）**

1. **Plan/Act 二态 + 硬拦截**：Plan 模式不能只靠 prompt，要对 mutating shell/文件写做工具层拒绝；模式切换权归人。
2. **审批矩阵**：工具级 auto-approve；命令默认不自动批；把装饰性开关（Yolo）删掉。
3. **Checkpoint 安全语义**：snapshot 可恢复文件与 task；**有后续 commit 则拒绝文件恢复**。openmate 做稳定性重构必须有等价“时间机器”。
4. **MCP 生命周期预算**：stdio 30s / remote 10s，防一个坏 server 拖死整会话。
5. **Abort 传播**：取消主任务必须取消子代理与排队 turn。
6. **上下文 compact + 单次 retry**：显式恢复路径，而不是裸抛。
7. **结果截断预算**：工具输出、bash、file-read 设上限，保护 provider prefix cache。
8. **diff-first 编辑**：search/replace + anchor，避免 whole-file 误删；提供 Revert Block。
9. **Hub/session 耐重启**：断线 replay + 防重复投递。

**可选借鉴**

- @file/@url/@problems 上下文注入（体验好）
- 连接器把 IM 线程映射为 session（适合团队 openmate）
- 活模型目录

---

## 7. 关键源码路径

```
cline/
  README.md
  CONTRIBUTING.md
  CHANGELOG.md                     # 稳定性事故百科
  LICENSE

  sdk/                             # @cline/sdk / core / agents / llms / shared
    src/                           # AgentRuntime、session、tools、hooks
    CHANGELOG.md

  apps/
    cli/                           # 终端 UI + headless
      README.md
    vscode/                        # VS Code 扩展（迁入 apps/vscode）
      src/test/e2e/                # Playwright E2E
    examples/desktop-app/          # Tauri + Bun sidecar + Next.js

  docs/                            # docs 站点内容

  （历史结构，迁移中）src/
    core/                          # 旧 Cline 核心循环
    integrations/                  # MCP / 终端 / 浏览器
    shared/                        # 工具与协议
```

文档锚点：
- https://docs.cline.bot/cline-sdk/overview
- https://docs.cline.bot/sdk/architecture/overview

---

## 8. 评分（面向 openmate 稳定性重构价值，10 分制）

| 维度 | 分 | 说明 |
|---|---|---|
| 人机协同（审批/Plan-Act） | **9.5** | 业界标杆；硬拦截 + 矩阵审批 |
| Checkpoint / 可回滚 | **9.0** | 快照粒度与安全恢复语义成熟 |
| MCP 生态与生命周期 | **8.5** | 市场 + 动态生成 + 超时预算 |
| 稳定性事故响应密度 | **9.0** | CHANGELOG 显示大量真实故障修复 |
| 架构一致性 | **7.0** | SDK 迁移中，legacy/next 双包、Hub 复杂 |
| 长任务/多 agent | **8.0** | teams + cron + 连接器 |
| 自我进化（rules/skills/plugins） | **8.0** | 完整但偏 IDE 场景 |
| 对 openmate 可移植性 | **8.5** | 审批、checkpoint、abort、compact 可直接产品化 |
| **综合** | **8.5** | “人控稳定性”的最佳参考实现 |

---

## 9. 一句话结论

Cline 教会 openmate 的不是“更猛的自主性”，而是**可控的自主性**：Plan/Act 硬边界、工具级审批、checkpoint 安全恢复、MCP 超时、abort 传播、上下文 compact。把这些稳定性阀门做对，agent 才敢在真实工程里跑长任务。
