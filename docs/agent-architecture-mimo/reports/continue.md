# Continue 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub README（continuedev/continue）、docs.continue.dev（config.yaml / agent / rules / plan mode / hub blocks）、core/package.json

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | Continue |
| 仓库 | https://github.com/continuedev/continue |
| 定位 | 开源 IDE/CLI 编码 agent：VS Code + JetBrains + CLI（`cn`）；强调 **config.yaml 可组合 Agent** |
| 语言/运行时 | TypeScript monorepo（Node ≥20.20.1）；core 可复用于 web/VS Code/Node |
| 许可 | Apache 2.0 |
| 状态（调研时） | **主仓已 no longer actively maintained，read-only**；最终 **2.0.0** 清理版：去匿名遥测、拆认证、修 bug |
| 官网文档 | https://docs.continue.dev（仍可读，描述 Hub/Blocks 模型） |
| 核心包 | `@continuedev/core` 1.1.0 + `config-yaml` / `openai-adapters` / `llm-info` / `terminal-security` 等 |
| 模型 | OpenAI / Anthropic / Azure / Ollama / 自托管 / 任意兼容端点；roles 拆分 chat/autocomplete/embed/rerank/edit/apply/summarize |

### 0.1 一句话架构

**把 Agent 定义成 YAML「模型 + 规则 + 工具（MCP）+ 上下文 + 提示」的可组合 Block；IDE/CLI 只是壳，core 负责 LLM 适配、上下文注入、工具策略与 Plan/Agent 三模式执行。**

---

## 1 系统架构

### 1.1 分层

```
┌─────────────────────────────────────────────────────────┐
│ Hosts: VS Code / JetBrains / CLI (cn) / 潜在 web        │
└───────────────────────────┬─────────────────────────────┘
┌───────────────────────────▼─────────────────────────────┐
│ @continuedev/core                                        │
│  ├ config.yaml 解析与 merge（本地 + Hub blocks + secrets）│
│  ├ Model Roles / Providers / Adapters                    │
│  ├ Modes: Chat / Plan / Agent                            │
│  ├ Rules / Prompts / Context Providers / Docs 索引       │
│  ├ MCP tools + tool policies（ask/allow/deny）           │
│  ├ Autocomplete（独立模型与缓存策略）                     │
│  └ Development data sinks（可选 JSONL / HTTP）            │
└───────────────────────────┬─────────────────────────────┘
                            │
                   LLM APIs / MCP subprocess / IDE FS
```

### 1.2 Agent 配置模型（Hub + Local）

Continue 把「一个 Agent」建模为：

```yaml
name: My Config
version: 1.0.0
schema: v1
models:      # 多 provider、多 role
rules:       # 行为护栏，注入 system
prompts:     # 斜杠命令
context:     # 上下文 provider
docs:        # 可爬取文档站
mcpServers:  # 工具面
data:        # 遥测/开发数据目的地
```

**组合方式：**
- **Local**：`~/.continue/config.yaml`、workspace `.continue/rules|models|mcpServers`
- **Shared Blocks（Hub）**：`uses: owner/item-name`，GitHub Actions 风格
- **secrets/inputs**：`${{ secrets.X }}` 从 workspace/global `.env` 解析；`inputs` 做块与用户密钥名解耦
- **override**：`uses` 后 `override.roles` 等局部覆盖
- YAML anchors 防重复

> 注意：`hub.continue.dev` 在本次调研环境 DNS 失败；Hub 机制以文档描述为准。

### 1.3 继承与演进

| 旧 | 新 |
|---|---|
| `config.json` | `config.yaml`（deprecated 迁移指南） |
| `.continuerc.json` workspace | 目录化 blocks（`.continue/*`） |
| `config.ts` modifyConfig | 尽量用 YAML；高级仍可 TS |
| Context Providers `@Codebase` / `@Docs` | 文档化为 deprecated，转向 rules/prompts/MCP/docs 索引 |
| 匿名遥测 | 2.0.0 移除；改为可选 data destinations |

---

## 2 核心机制

### 2.1 三模式（Chat / Plan / Agent）

| 模式 | 工具面 | 用途 |
|---|---|---|
| **Chat** | 无工具 | 问答澄清 |
| **Plan** | **只读**：read/grep/glob、git diff/history、web fetch、只读 MCP | 探索、方案、风险 |
| **Agent** | 全工具（含写文件、终端） | 执行 |

Plan 明确 **禁止**：写/建文件、终端执行、装包、git commit/push、DB 写。
切换：模式选择器或 `Cmd/Ctrl+.`；模型需 `tool_use` capability，否则显示 Not Supported。

### 2.2 Rules（护栏）

- 本地：`.continue/rules/*.md`（可版本控制、组织级复用）
- YAML：`rules: [string | { uses: owner/rule | file://path }]`
- 注入 **Agent/Chat/Edit** 的 system message
- 定位：公司规范、安全实践、paved path；把通用模型变成“懂团队的成员”

### 2.3 Model Roles

不同能力可用不同模型：
- `chat` / `autocomplete` / `embed` / `rerank` / `edit` / `apply` / `summarize`
- Autocomplete 有独立超时、debounce、prefix/suffix 配比、cache、onlyMyCode、recently edited

### 2.4 MCP 工具与策略

- `mcpServers`: command/args/env/cwd、sse/streamable-http requestOptions、connectionTimeout
- Agent 默认 **ask 权限**；tool policy 可自动放行或排除
- 工具结果自动回灌为 context；多数错误也回传给模型自纠

### 2.5 Context

- 高亮代码、active file、`@Files`、`@Terminal`、`@Git Diff`、docs 爬取
- Context providers 配置化（file/code/diff/http/terminal…）
- 自定义 code RAG 指南仍保留（嵌入 + 检索管线可替换）

### 2.6 Development Data

`data:` 定义事件外送：HTTP POST 或 `file://` 目录 JSONL；`level: all | noCode`（noCode 剥离文件内容/提示词）。用于团队离线评估，而非强制云遥测。

---

## 3 稳定性 / HA

| 主题 | 做法 |
|---|---|
| 权限 | Agent 默认 ask；Plan 硬只读 |
| 配置热更新 | 保存 config 自动 refresh；schema 校验（name/version/schema 必填） |
| 秘钥 | 不进仓库；workspace `.env` > `~/.continue/.env`；inputs 解耦 |
| 模型能力 | `capabilities.tool_use / image_input` 可覆盖自动探测，避免 Agent 模式误开 |
| 请求 | requestOptions：timeout、proxy、自定义 CA、客户端证书、extraBody |
| 数据面 | 默认无匿名遥测；外送需显式 destination + apiKey |
| 生产风险 | **主仓 read-only / 不再积极维护**；可当参考实现，不宜作长期运行时依赖 |

未在文档中强调：checkpoint/git 快照、跨会话 durable agent loop、复杂子 agent 编排——这些不是 Continue 的主轴。

---

## 4 自我进化 / 可扩展

1. **Hub Blocks**：社区/组织共享 model、rules、prompts、MCP 组合
2. **Rules as Code**：项目级可 PR 的行为配置
3. **Prompt files**：斜杠命令模板（替代旧 slashCommands）
4. **config.ts**：程序化合并（逃生舱）
5. **Custom context providers / code RAG**
6. **MCP** 工具生态
7. Docs MCP Server：文档本身可被 agent 读

进化模型是 **配置组合 + 市场化 Block**，不是运行时插件 VM（对比 Roo Custom Tools / Pi Extensions）。

---

## 5 对 openmate 借鉴（P0/P1/P2）

### P0
1. **YAML Agent 单一真源**：models/rules/tools/context/prompts 同文件可组合，避免 UI 设置与代码双轨
2. **Plan 只读矩阵**显式表驱动（文件写/终端/git/装包/DB）
3. **secrets/inputs** 模板：块可分发、密钥不进块
4. **Model Roles**：coding 用强模型、autocomplete 用小模型、personal 摘要用另一路
5. **Tool policy 默认 ask** + 事件级 noCode 数据出口

### P1
1. **Hub 风格 blocks**（openmate 可自建 org registry，不必公网）
2. **Rules 目录 + 版本控制**（personal agent 用“生活规则”，coding 用“工程规范”）
3. **capabilities 显式声明**，减少“模型假装支持工具”
4. Autocomplete 独立管线与缓存（若做 IDE 插件）

### P2
1. Docs 站点索引
2. Development data 到内部评估湖
3. YAML anchors / override 语法细节

---

## 6 源码路径（调研锚点）

| 路径 | 内容 |
|---|---|
| `README.md` | 停维护声明、2.0.0 终版说明、多端入口 |
| `core/package.json` | `@continuedev/core` 依赖树（openai、anthropic、bedrock、ollama、MCP、onnx embed、sqlite、vectordb…） |
| `extensions/vscode` / `extensions/intellij` / `extensions/cli` | 宿主 |
| `packages/config-yaml`、`openai-adapters`、`llm-info` | 配置与协议 |
| docs.continue.dev `/reference` | config.yaml 权威 schema |
| docs `/ide-extensions/agent/plan-mode` | Plan 工具矩阵 |
| docs `/guides/configuring-models-rules-tools` | Local vs Hub blocks、secrets/inputs |

### 依赖指纹（选摘）

- `@continuedev/config-yaml`、`openai`、`@anthropic-ai/sdk`、`@aws-sdk/client-bedrock-runtime`
- `@modelcontextprotocol/sdk` ^1.25
- `ollama`、`@xenova/transformers` + `onnxruntime-*`（本地嵌入）
- `sqlite`/`sqlite3`、`vectordb`、`tree-sitter-wasms`

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **4.5** | “Agent 即 YAML 组合”极清晰；core 与宿主分离；Hub blocks 市场模型成熟 |
| **Agent Loop 表达力** | **3** | 有 Agent/Plan，但 loop 深度、durable 会话、子 agent 不是强项 |
| **工具与权限模型** | **4** | Plan 只读矩阵完整；MCP + tool policy；缺细粒度路径/命令图灵完备策略 |
| **上下文工程** | **4** | rules/prompts/context providers/docs/roles 齐全；检索/RAG 可换但需自建 |
| **稳定性 / 可恢复性** | **2.5** | 配置与权限稳，但无 checkpoint、无强恢复；**主仓停止维护**拉低运行时可信度 |
| **多 Provider / 模型适配** | **4.5** | 角色化多模型 + 自托管 + capabilities 覆盖，长期是标杆配置面 |
| **产品完成度 / 生态** | **3** | 双 IDE + CLI + 文档/Hub 概念完整；2.0 清理后进入“遗产代码”阶段 |

**综合（未加权平均）：≈ 3.6 / 5**

### 对 openmate 的简要结论

Continue 最大价值不是执行引擎，而是 **「可组合 Agent 配置」产品语言**：rules、roles、blocks、secrets、Plan 只读。openmate 稳定性重构应 **P0 采用 YAML Agent 单一真源 + 角色模型 + 默认 ask**，把 Hub 当 **私有 block registry** 设计；运行时循环与恢复能力应从 Claude Code/OpenCode/Cline 系补强，不要从 Continue 抄 loop。

---

## 附录：最小 Agent 配置示例

```yaml
name: openmate-personal
version: 1.0.0
schema: v1
models:
  - uses: anthropic/claude-sonnet-4-6
    with:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    override:
      roles: [chat, edit]
  - name: small
    provider: ollama
    model: qwen2.5-coder:7b
    roles: [autocomplete]
rules:
  - uses: openmate/no-shell-in-plan
  - Prefer short answers in Chinese when user writes Chinese
prompts:
  - uses: openmate/weekly-review
context:
  - provider: file
  - provider: diff
mcpServers:
  - name: memory
    command: uvx
    args: ["mcp-server-memory"]
data:
  - name: local
    destination: file://~/.openmate/evals
    schema: 0.2.0
    level: noCode
```

---

*报告结束。*
