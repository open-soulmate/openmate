# Pi Agent Harness 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub earendil-works/pi（README + packages/coding-agent/README）、pi.dev/docs/latest

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | Pi（Pi Agent Harness / pi-coding-agent） |
| 仓库 | https://github.com/earendil-works/pi |
| 网站 | https://pi.dev |
| 定位 | **极简可扩展终端 coding harness**：核心小，工作流靠 Extensions/Skills/Packages 外置 |
| 作者/生态 | Mario Zechner（badlogic）系；MIT |
| 语言/运行时 | TypeScript monorepo；npm `@earendil-works/pi-coding-agent` |
| 版本分发 | npm + `curl pi.dev/install.sh`；独立二进制（release source + `build-binaries.sh`） |
| 内建工具 | `read` `bash` / `powershell` `edit` `write` `grep` `find` `ls`（默认四工具起步） |
| Provider | 30+ 目录：API key + **订阅**（Claude Pro/Max、ChatGPT Plus/Pro Codex、GitHub Copilot）+ llama.cpp router；含 Xiaomi MiMo / ZAI / OpenCode Zen 等 |
| 贡献策略 | 新 issue/PR 默认自动关闭，维护者日审（高门槛社区模型） |

### 0.1 一句话架构

**「Adapt pi, not the other way around」**：会话是 JSONL 树；能力靠 TypeScript Extension 热挂载；**刻意不做** MCP/Sub-agents/权限弹窗/Plan mode/TODO/后台 bash，全部可选由用户或包补齐。

---

## 1 系统架构

### 1.1 包分层

| 包 | 职责 |
|---|---|
| `@earendil-works/pi-ai` | 统一多 Provider LLM API（OpenAI/Anthropic/Google…） |
| `@earendil-works/pi-agent-core` | Agent runtime：tool calling + 状态管理 |
| `@earendil-works/pi-coding-agent` | 交互式 coding CLI + SDK |
| `@earendil-works/pi-tui` | 差分渲染终端 UI |
| `@earendil-works/chord` | 应用组合运行时：服务/复制状态/RPC/插件 |
| `@earendil-works/pi-telemetry` | 厂商中立遥测契约 |
| （另仓）`pi-chat` | Slack/聊天自动化与工作流 |

### 1.2 运行形态

```
┌─────────────────────────────────────────────┐
│  Interactive TUI（默认）                      │
│  -p/--print  |  --mode json  |  --mode rpc   │
│  SDK: createAgentSession / SessionManager    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  ModelRuntime + Agent Core                  │
│  tools: builtin + extension.registerTool    │
│  session: JSONL tree（id/parentId）          │
└─────────────────────────────────────────────┘
```

- **RPC**：stdin/stdout 严格 **LF 分隔 JSONL**（禁止 Node readline 这类会切 Unicode 分隔符的读法）  
- **SDK**：`createAgentSession({ sessionManager, modelRuntime })`；进阶 `createAgentSessionRuntime()`  
- **JSON 模式**：事件流机器可读  
- 管道 stdin 可并入 `-p` 初始 prompt  

### 1.3 配置与信任

| 路径 | 作用 |
|---|---|
| `~/.pi/agent/settings.json` | 全局 |
| `.pi/settings.json` | 项目覆盖 |
| `~/.pi/agent/AGENTS.md` + 父目录链 + cwd | 上下文文件（可用 `AGENTS.override.md` 替换目录默认） |
| `.pi/SYSTEM.md` / `~/.pi/agent/SYSTEM.md` | 替换系统提示；`APPEND_SYSTEM.md` 追加 |
| `~/.pi/agent/trust.json` | 项目信任决定 |

**Project Trust（安全关键）：**
- 交互启动：若目录含项目本地 settings/resources/skills 且无信任记录 → 询问  
- **信任前**仅加载 context files + 用户/全局扩展 + CLI `-e`（可处理 `project_trust` 事件）  
- 项目扩展/包/设置 **信任后** 才加载  
- 非交互：`defaultProjectTrust: ask|never|always`；CLI `--approve/-a` / `--no-approve/-na`  
- `/trust` 写入后需重启生效  

### 1.4 目录约定（资源发现）

```
~/.pi/agent/{extensions,skills,prompts,themes,sessions,npm,git}/
.pi/{extensions,skills,prompts,themes,npm,git}/
.agents/skills/  （标准 Agent Skills）
```

---

## 2 核心机制

### 2.1 极简默认 + 外置扩展（设计哲学）

官方 **No-list**（均有替代路径）：

| 不做 | 替代 |
|---|---|
| MCP | CLI 工具 + Skills；或 extension 实现 MCP |
| Sub-agents | tmux 多 pi；extension；第三方 package |
| 权限弹窗 | 容器化；extension 自建确认流 |
| Plan mode | 写计划文件；extension/package |
| 内建 TODO | TODO.md；extension |
| 后台 bash | tmux（完全可观测） |

这与 openmate「内建太多半成品能力」形成对照：**核心可审计面更小**。

### 2.2 Session = JSONL 树

- 每条 entry：`id` + `parentId` → **单文件内分支**  
- 路径：`~/.pi/agent/sessions/` 按 cwd 组织  
- `/tree`：跳到任意历史点继续；过滤 no-tools / user-only / labeled；标签书签  
- `/fork` `/clone` `--fork`：新文件复制活性路径  
- `/compact [prompt]`：手工压缩；默认自动：溢出恢复重试 + 接近上限主动  
- **压缩有损**；完整历史仍在 JSONL，可 `/tree` 回看  
- 扩展可替换 compaction 行为  

### 2.3 Message Queue（并发交互）

| 键 | 语义 |
|---|---|
| Enter | **steering**：当前 assistant 工具调用结束后投递 |
| Alt+Enter | **follow-up**：全部工作结束后投递 |
| Escape | 中止并恢复队列到编辑器 |
| Alt+Up | 取回队列消息 |

`steeringMode` / `followUpMode`: `one-at-a-time`（默认）| `all`。

### 2.4 供应链硬化（同类罕见）

- 直接依赖 **精确 pin**；`.npmrc` `save-exact` + `min-release-age=2`  
- `package-lock.json` 为真源；pre-commit 阻止误提交 lockfile（需 `PI_ALLOW_LOCKFILE_CHANGE=1`）  
- 发布 CLI 带 **npm-shrinkwrap.json** 钉传递依赖  
- `npm ci --ignore-scripts`；`pi update --self` 等忽略生命周期脚本  
- 定时 workflow：`npm audit --omit=dev` + signatures  
- lifecycle-script 依赖需显式 allowlist  
- `npm run check`：pin、TS 兼容、shrinkwrap  

### 2.5 Extension API（进化主通道）

```ts
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", /* ... */ });
  pi.registerCommand("stats", { /* ... */ });
  pi.on("tool_call", async (event, ctx) => { /* ... */ });
}
```

可为 async factory（启动前等待，便于先拉模型列表再 `registerProvider`）。

能力清单（文档原文归纳）：自定义/替换工具、子 agent 与 plan、自定义压缩、**权限门与路径保护**、自定义编辑器/UI、状态栏、git checkpoint、SSH/沙箱、MCP、伪装 Claude Code、甚至 Doom。

### 2.6 Pi Packages

- npm 或 git 安装：`pi install npm:@foo/pi-tools` / `git:github.com/user/repo@v1`  
- `package.json` 的 `pi` 字段声明 extensions/skills/prompts/themes  
- 无 manifest 则按约定目录发现  
- **安全警告**：包与 skills **全系统权限**，安装前必须审计源码  

### 2.7 Skills / Prompt Templates / Themes

- Skills 对齐 [agentskills.io](https://agentskills.io)：`/skill:name` 或自动加载  
- Prompt templates：Markdown + `{{focus}}`，斜杠展开  
- Themes 热重载  

### 2.8 Provider / 模型目录

- 内建 tool-capable 模型表；配置的 provider catalog 自动刷新；`pi update --models`  
- `~/.pi/agent/models.json` 自定义条目（仍须 OpenAI/Anthropic/Google API 形）  
- 自定义 OAuth/异形 API → extension  
- Thinking level：`off…max`；`/model` Ctrl+S 存启动默认；Ctrl+P 循环 scoped models  
- `PI_CACHE_RETENTION=long` 延长 prompt cache（Anthropic 1h / OpenAI 24h）  

### 2.9 会话环境变量（bash 工具内）

`PI_SESSION_ID` `PI_SESSION_FILE` `PI_PROVIDER` `PI_MODEL` `PI_REASONING_LEVEL` —— 每条命令启动时解析；另有 `AI_AGENT=pi` 供子进程归属识别。

### 2.10 容器化边界（权限替代方案）

官方不提供内建 FS/进程/网络/凭证权限系统，三模式：
1. **Gondolin extension**：pi + 凭证在宿主，内建工具与 `!` 命令进 Linux micro-VM  
2. **Plain Docker**：整个 pi 进容器  
3. **OpenShell**：策略沙箱内跑 pi  

---

## 3 稳定性 / HA

| 主题 | 做法 |
|---|---|
| 会话耐久 | JSONL 全量 + 自动保存；`--no-session` 临时模式显式 |
| 压缩可回溯 | 损失只影响活动上下文，树导航保留历史 |
| 中断恢复 | Escape 取消；compaction 与 tree 导航互斥，避免并发写树 |
| 非交互 | print/json/rpc 明确；trust 默认拒绝项目资源 |
| 网络 | `--offline` / `PI_OFFLINE=1` 关掉版本检查与安装遥测 |
| 更新检查 | `PI_SKIP_VERSION_CHECK=1` |
| 供应链 | pin + shrinkwrap + ignore-scripts + audit signatures（本批最强之一） |
| 缺口 | **无内建 checkpoint/审批**；生产默认继承用户权限；依赖外部容器 |

---

## 4 自我进化 / 可扩展

1. **Extension 热挂载**（工具/命令/事件/UI/权限/压缩/provider）  
2. **Pi Packages** 社区分发（npm/git + 版本 pin）  
3. **Skills / Templates / Themes** 标准化  
4. **`/reload`** 运行时重载 keybindings/extensions/skills/prompts/themes/context  
5. **Session 分享**：`/share` gist；**`pi-share-hf` 公开 OSS 会话数据集**（反哺模型/评测）  
6. **Chord / telemetry 契约** 向更大组合运行时延伸  
7. RFC 流程（rfc.earendil.com）做长期演进  

进化模型：**用户用 agent 写自己的 harness 能力**，而不是产品预置所有模式。

---

## 5 对 openmate 借鉴（P0/P1/P2）

### P0
1. **JSONL 会话树（id/parentId）** — 比扁平 transcript 更适合 openmate 多线程生活/coding  
2. **Project Trust 分阶段加载** — 项目代码执行前不加载项目插件  
3. **Message queue steering/follow-up** — 长任务中纠偏不打断  
4. **供应链 pin/shrinkwrap/ignore-scripts** — 重构依赖治理直接可抄  
5. **明确 No-list** — openmate 应删除半成品 Plan/TODO/后台任务，改为可选包  

### P1
1. Extension API：registerTool/Command/on(event) + async factory  
2. Skills 对齐 agentskills.io + 包管理（npm/git pin）  
3. 自动+手动 compaction，历史不丢  
4. RPC/JSON 模式作 headless 标准（与 ACP/OpenAPI 并列评估）  
5. 容器化三模式文档化，替代复杂内建权限（coding 侧可双轨：内建审批 + 外置沙箱）

### P2
1. `/share` + 公开会话数据集（评测资产）  
2. llama.cpp router 本地模型管理  
3. Theme 热重载与 TUI 差分渲染（体验层）  
4. Chord 式服务组合（仅当 openmate 要多进程产品时）  

---

## 6 源码路径（调研锚点）

| 路径 | 内容 |
|---|---|
| `README.md` | 包表、权限/容器、供应链、哲学 |
| `packages/coding-agent/README.md` | CLI 全量：会话/压缩/扩展/包/SDK/RPC/环境变量 |
| `packages/ai` `agent` `tui` `chord` `telemetry` | 分层实现 |
| `packages/coding-agent/docs/containerization.md` | Gondolin/Docker/OpenShell |
| `docs/session-format.md` `rpc.md` `sdk.md` `extensions.md` `skills.md` `packages.md` | 协议与扩展 |
| `examples/extensions/` `examples/sdk/` | 样例 |
| `CONTRIBUTING.md` `AGENTS.md` | 贡献与代理规则 |

### 依赖/技术指纹

- 精确 pin 的直接依赖 + shrinkwrap  
- 自研 `pi-tui` 差分渲染  
- `pi-ai` 多协议  
- 不强绑 MCP SDK  

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **4.5** | 包边界干净；扩展/包模型极强；刻意极简带来清晰度 |
| **Agent Loop 表达力** | **3.5** | 默认 loop 够用；复杂编排需自建，不提供内建 subagent/plan |
| **工具与权限模型** | **3** | Project Trust + 容器三模式；**无内建权限弹窗**，企业默认偏弱 |
| **上下文工程** | **4.5** | JSONL 树、compact、queue steering、AGENTS 链、token/cache UI |
| **稳定性 / 可恢复性** | **4** | 会话树与供应链优秀；副作用回滚靠扩展/容器 |
| **多 Provider / 模型适配** | **5** | 订阅+API+本地目录极广，含 MiMo；自定义模型文件 |
| **产品完成度 / 生态** | **3.5** | CLI/SDK/RPC 完整、包生态早期；无 Desktop/IDE 官方壳 |

**综合（未加权平均）：≈ 4.0 / 5**

### 对 openmate 的简要结论

Pi 证明了 **「小核心 + 可编程扩展 + 坚韧会话模型」** 比大而全 agent 更可控。openmate 稳定性重构应 **P0 抄 JSONL 树、分阶段 Trust、依赖 pin、消息队列**；**P1 用 Extension/Package 替代内建膨胀功能**；coding 侧审批/沙箱要么容器化要么自建 extension，**不要假装默认权限模型已安全**。与 DeepSeek Harness 相比：Pi 更轻、更偏单进程 CLI；Harness 更重、更偏插件树与日志不变量——openmate 可 **core 对齐 Harness，UX/会话对齐 Pi**。

---

## 附录：内置工具与默认行为对照

| 项 | Pi 默认 |
|---|---|
| 工具 | read/write/edit/bash（+powershell on Win、grep/find/ls） |
| 权限 | 继承启动用户 |
| Plan | 无 |
| MCP | 无 |
| 子 agent | 无 |
| 会话存储 | `~/.pi/agent/sessions/**/*.jsonl` 树 |
| 压缩 | 自动开，可关/可扩展 |

---

*报告结束。*
