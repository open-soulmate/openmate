# goose 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub README（aaif-goose/goose，历史 block/goose）、goose-docs.ai 架构/Recipes/Extensions/Custom Distros、CUSTOM_DISTROS.md

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | goose |
| 仓库 | https://github.com/aaif-goose/goose（原 block/goose → Block/Square） |
| 治理 | **Agentic AI Foundation (AAIF) @ Linux Foundation**（2026-04 迁入） |
| 定位 | 本机通用 AI agent：Desktop + CLI + API；不止 code，也覆盖研究/写作/自动化/数据分析 |
| 语言/运行时 | **Rust** 核心（crates）+ Electron Desktop（TS）+ Python 等扩展生态 |
| 许可 | Apache 2.0 |
| 分发 | macOS/Linux/Windows Desktop；`download_cli.sh` / Homebrew / deb/rpm/flatpak |
| Provider | 15+（Anthropic/OpenAI/Google/Ollama/OpenRouter/Azure/Bedrock…）+ **ACP 订阅代理**（Claude/ChatGPT 等） |
| 扩展 | **70+ MCP extensions**；GDK 可自建 |
| 客户端 | Desktop、CLI、`goose serve`（ACP HTTP/WS）、`goose acp`（stdio，可被 Zed/JetBrains 当 agent） |

### 0.1 一句话架构

**Interface（Desktop/CLI）→ Agent 循环 → Extensions（MCP tools）**；Provider 抽象多模型；**Recipes** 把 instructions/extensions/parameters/activities 打成可分享的可执行工作流；**Custom Distro** 支持白牌。

---

## 1 系统架构

### 1.1 三组件模型（官方）

```
┌──────────────────────────────────────────────────────┐
│ Interface: Desktop App / CLI / 自定义 UI（经 ACP）     │
└──────────────────────────┬───────────────────────────┘
                           │ 启动/多实例
┌──────────────────────────▼───────────────────────────┐
│ Agent（核心交互循环 + context revision + 错误回注）    │
└──────────────────────────┬───────────────────────────┘
                           │ MCP
┌──────────────────────────▼───────────────────────────┐
│ Extensions：builtin developer/memory/… + 外部 MCP     │
│ Tool = name + description + params + async impl       │
└──────────────────────────────────────────────────────┘
```

- Interface 可同时开 **多个 Agent** 并行任务
- Extensions 同时挂多个；tool calling 由模型发起、goose 执行并回灌

### 1.2 源码/模块地图（Custom Distros + docs）

| 路径 | 内容 |
|---|---|
| `crates/goose` | 核心 agent、providers、config、recipe、ACP server |
| `crates/goose-mcp` | 内建 MCP 扩展 |
| `crates/goose-cli` | CLI、`acp`、manpage 生成 |
| `crates/goose/src/providers/*` | Provider trait + declarative JSON providers |
| `crates/goose/src/recipe/*` | Recipe schema / template / validate / sub_recipes |
| `crates/goose/src/agents/subagent_*.rs` | Subagent / Summon delegate |
| `crates/goose/src/acp/server.rs` | ACP server |
| `crates/goose/src/prompts/system.md` | 系统提示（可品牌化） |
| `ui/desktop` | Electron 客户端、built-in/bundled extensions JSON |

### 1.3 进程与协议

| 入口 | 作用 |
|---|---|
| `goose session` / Desktop | 交互会话 |
| `goose run --recipe` | 非交互/可调度执行 |
| `goose serve` | ACP over HTTP/WebSocket（默认 :3284，`X-Secret-Key` / `?token=`） |
| `goose acp` | ACP over stdio，供 IDE 嵌入 |
| `goose configure` | provider/extension/recipe repo/settings |

**ACP 双向能力：** session/new|load|prompt|cancel、permission request、toolCall 流、动态挂 MCP。

### 1.4 配置

- `~/.config/goose/config.yaml` + secrets（keyring 或 `secrets.yaml`）
- 配置优先级：环境变量 → config.yaml → defaults
- Desktop 与 CLI **共享** provider/extension 配置
- `GOOSE_RECIPE_GITHUB_REPO`：从 GitHub 拉 recipes
- Telemetry：PostHog 可选，`GOOSE_DISABLE_TELEMETRY=1`

---

## 2 核心机制

### 2.1 Interactive Loop（官方 6 步）

1. Human request  
2. Provider chat（带 tools 清单）  
3. goose 执行 model 的 tool call（JSON）  
4. 结果回模型；可多轮工具  
5. **Context Revision**：删旧/无关内容，控 token  
6. 最终回复用户，进入下一轮  

### 2.2 Context Revision（Token 管理）

- 用更快更小的模型做摘要  
- **包含一切 vs 语义检索** 的取舍（偏向包含 + 删除）  
- 算法删除过时内容  
- 大文件 find/replace 而非整文件重写；ripgrep 跳过系统文件；压缩冗长命令输出  

### 2.3 错误处理（性能驱动设计）

两类错误：
- **Traditional**：网络/模型不可用 → `anyhow::Error` 抛给调用方  
- **Agent Errors**：未知工具名、参数错、工具执行失败 → **作为 tool response 回给 LLM**，错误文案当“提示词”让模型自愈  

`ToolUse` / `ToolResult` 均包在 `Result<T, AgentError>`；provider 负责翻译成各家 API 合法消息。

### 2.4 Extensions（MCP 一等公民）

```rust
pub trait Extension: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn instructions(&self) -> &str;
    fn tools(&self) -> &[Tool];
    async fn status(&self) -> AnyhowResult<HashMap<String, Value>>;
    async fn call_tool(&self, tool_name: &str, parameters: HashMap<String, Value>) -> ToolResult<Value>;
}
```

- 内建：developer（文件/命令）、memory、scrape、automation 等  
- 外部：任意 MCP server（stdio）  
- 扩展可写 `instructions` 追加行为说明  
- Allowlist / 逐扩展开关  

### 2.5 Recipes（可分享工作流包）

YAML 字段：
- 必填：`title` `description` `instructions`（或 prompt）
- 可选：`prompt`、`extensions`、`activities`、`parameters`、`settings`（provider/model/temperature）、`response.json_schema`、`sub_recipes`、`retry`

高级：
- **Parameters**：`{{ var }}` + type/requirement/default  
- **Retry**：`max_retries` + shell success checks + `on_failure` cleanup，失败重置状态重跑  
- **Structured output**：强制 `final_output` JSON schema，校验失败回注错误  
- **Subrecipes + Subagents**：Summon `delegate`；支持 `async: true` 并行、`load(source)` 收集、按 subagent 限 extensions/model/max_turns  
- **Schedule**：cron（5/6/7 位）调度 recipe；前台/后台  
- **Share**：deeplink、文件、GitHub repo；**每次运行独立私有 session**，不含 memory/API keys  

### 2.6 Custom Distributions（白牌）

- 预配置 provider（本地 Ollama）或企业 key（keyring/MDM）  
- 捆绑内部 MCP（`built-in-extensions.json` / bundled catalog）  
- 改品牌：icons、forge.config、system prompt、产品名/更新源  
- 新 UI：对接 `goose serve` ACP，不 fork 核心  
- Declarative Provider：`~/.config/goose/custom_providers/*.json`（engine: openai|anthropic|ollama）  
- 受众配方：legal/design 等专用 recipe  

### 2.7 多模型与 ACP Provider

- 除 API key 外，可用 **既有 Claude/ChatGPT/Gemini 订阅**（ACP provider）  
- Tetrate Agent Router、OpenRouter 登录式配置  
- Multi-model config / Roaming Agents（文档导航）  

---

## 3 稳定性 / HA

| 主题 | 做法 |
|---|---|
| 错误自愈 | Agent error 回注模型，预期多次可恢复失败 |
| 限流 | 文档化 rate limit 处理与重试策略 |
| 沙箱/安全 | Extension allowlist；recipe 首次 Trust and Execute；secrets 不进 recipe |
| 分布式执行 | `GOOSE_VERSION` 钉版本便于 CI |
| 权限 | ACP requestPermission；工具权限可配（GUI/CLI settings） |
| 诊断 | 日志系统、diagnostics 指南、known issues |
| 治理 | LF/AAIF 托管，降低单一公司关停风险（对比 Roo） |
| 缺口 | 未见与 Cline 同级的 git checkpoint 产品化；上下文策略偏“删旧”而非结构化 durable 会话树 |

---

## 4 自我进化 / 可扩展

1. **MCP 扩展市场**（70+）+ 自定义 MCP  
2. **Recipes / Subrecipes / Subagents** — 工作作即代码，可分享、可调度  
3. **Custom Distro** — 组织白牌与内部工具捆绑  
4. **Declarative Providers** — 零代码接内网模型  
5. **GDK** — 扩展开发生命周期  
6. **ACP** — 被 IDE 反嵌，或委托其它 ACP agent  
7. **Recipe Cookbook** — 社区配方库（提交已关闭，归档可浏览）  
8. Memory 扩展 — 向 personal agent 延伸  

---

## 5 对 openmate 借鉴（P0/P1/P2）

### P0
1. **Agent Errors as Prompts**：工具/协议错误结构化回注，而不是 UI toast 后中断  
2. **Context Revision** 明确策略：小模型摘要 + 预算删除 + 大输出截断（与 openmate 混合场景直接相关）  
3. **Recipe 级 retry + shell success check + on_failure**：个人自动化（备份、日报）需要“直到成功”语义  
4. **Secrets/Trust 边界**：recipe 不携带密钥与全局 memory；首次执行信任提示  
5. **多入口同一配置**（CLI/Desktop/API 共享 config.yaml）

### P1
1. **Recipe JSON Schema 结构化输出**（供 openmate 日程/健康/邮件自动化解析）  
2. **Subagent + extension scoping + 并行 delegate/load**  
3. **Schedule（cron）** 原生调度 recipe  
4. **Declarative provider** 接内部 LLM  
5. **ACP** 作为嵌入协议（IDE ↔ personal agent）

### P2
1. Custom distro 白牌（品牌/预置扩展）  
2. Recipe deeplink 分享  
3. Memory MCP 与长期个人档案  

---

## 6 源码路径（调研锚点）

| 路径 | 内容 |
|---|---|
| `README.md` | 定位、AAIF、安装、15+ provider |
| `CUSTOM_DISTROS.md` | 架构图、recipe/subagent/ACP/provider 白牌全案 |
| `GOVERNANCE.md` | 治理 |
| docs `/docs/goose-architecture/` | Interface/Agent/Extensions + loop + context revision |
| docs `/docs/goose-architecture/extensions-design` | Extension trait |
| docs `/docs/goose-architecture/error-handling` | anyhow vs agent error |
| docs `/docs/guides/recipes/session-recipes` | Recipe 创建/参数/重试/结构化输出/调度 |
| `crates/goose/src/recipe/mod.rs` 等 | 代码锚点（文档引用） |

### 依赖/技术指纹

- Rust crates + tokio  
- MCP（官方协议）  
- Electron（desktop）  
- keyring / secrets.yaml  
- PostHog（可选遥测）  

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **4.5** | Interface/Agent/Extension 三分清晰；MCP 一等；ACP/CustDistro 扩展面大 |
| **Agent Loop 表达力** | **4** | 标准 tool loop + context revision + subagents/recipes；无复杂 durable state machine |
| **工具与权限模型** | **3.5** | MCP + allowlist + ACP permission；产品级路径/命令策略弱于 Cline/Roo |
| **上下文工程** | **4** | Revision/小模型摘要/输出截断成熟；检索 vs 全量取舍明确 |
| **稳定性 / 可恢复性** | **4** | 错误回注是亮点；AAIF 治理；checkpoint 产品化不足 |
| **多 Provider / 模型订阅** | **4.5** | API + 订阅 ACP + declarative provider + router |
| **产品完成度 / 生态** | **4.5** | 跨平台 Desktop/CLI/API、70+ 扩展、recipes、调度、白牌；Rust 性能好 |

**综合（未加权平均）：≈ 4.1 / 5**

### 对 openmate 的简要结论

goose 是 **「通用本机 agent + 工作流产品化」** 参考：比纯 coding agent 更接近 openmate 的 personal 侧。建议 **P0 抄错误回注、context revision、recipe retry/信任边界**；**P1 抄 schedule + structured output + subagent scoping**；运行时实现语言可继续 TS，但 **Recipe 数据模型与 MCP 扩展面** 应直接对标 goose，避免自创封闭工作流格式。

---

## 附录：Recipe 片段（对照）

```yaml
version: 1.0.0
title: Morning Brief
description: Summarize calendar and tasks
instructions: |
  Gather pending todos and produce a brief prioritized plan.
parameters:
  - key: timezone
    input_type: string
    requirement: optional
    default: "Asia/Shanghai"
extensions:
  - type: builtin
    name: developer
settings:
  goose_provider: anthropic
  goose_model: claude-sonnet-4-20250514
retry:
  max_retries: 2
  checks:
    - type: shell
      command: "test -s ~/briefs/latest.md"
response:
  json_schema:
    type: object
    properties:
      top3: { type: array, items: { type: string } }
    required: [top3]
```

---

*报告结束。*
