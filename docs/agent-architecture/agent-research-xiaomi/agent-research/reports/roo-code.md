# Roo Code 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub README / package.json / src/package.json / CHANGELOG（v3.53.0）、docs.roocodeinc.github.io

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | Roo Code（历史名 Roo Cline / Claude Dev 分叉线） |
| 仓库 | https://github.com/RooCodeInc/Roo-Code |
| 定位 | VS Code 内 AI 开发团队（modes + 编排 + CLI），从 Cline 分叉后演进 |
| 版本（调研时） | 插件 `3.53.0`；另有独立 CLI（`roo` headless / TUI） |
| 语言/运行时 | TypeScript + pnpm workspaces + turbo monorepo；Node 20.19.2 |
| 许可 | Apache 2.0 |
| 分发 | VS Marketplace `RooVeterinaryInc.roo-cline`；OpenVSX；CLI 二进制 |
| 产品状态 | 官方 README 宣布 **Extension 于 5/15 关停**；社区 Zoo-Code 接手；CHANGELOG 3.53.0 称社区团队继续维护插件，原团队全力 Roomote |
| 模型 | Anthropic / OpenAI(+Codex 订阅) / Bedrock / Vertex / Gemini / xAI / DeepSeek / Z.ai / Ollama / LM Studio / LiteLLM / OpenRouter / OpenAI-compatible / Poe / Baseten / Fireworks 等 |
| 累计安装 | ~3M（官方公告） |

### 0.1 一句话架构

**以 VS Code Extension 为宿主的 Cline 系 Agent：Task 为中心的消息/工具循环 + 多模式（Code/Architect/Ask/Debug/Custom）+ Checkpoints（git 工作区快照）+ MCP + Orchestrator 子任务；后期抽出 `@roo-code/core`/`types`/`ipc` 支撑 CLI/headless。**

---

## 1 系统架构

### 1.1 分层总览

```
┌────────────────────────────────────────────────────────────┐
│  VS Code Extension (src/)                                  │
│  Sidebar Webview / Tab / Terminal 上下文菜单 / Code Actions │
└───────────────────────────┬────────────────────────────────┘
                            │ IPC (node-ipc / webview postMessage)
┌───────────────────────────▼────────────────────────────────┐
│  Task Runtime（src/core）                                   │
│  ├ MessageManager / Cline（历史即任务）                      │
│  ├ Modes + .roomodes 自定义模式                             │
│  ├ Tool 协议：native function calling（默认）+ legacy XML   │
│  ├ Checkpoints（workspace snapshot + 导航）                 │
│  ├ Context condensation / Smart Code Folding                │
│  ├ Skills（Agent Skills 规范）+ Custom Tools（npm + .env）  │
│  ├ McpHub + Code Index（embedding）                         │
│  └ Orchestrator / new_task 子任务树                         │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│  Provider 层（Vercel AI SDK + 各家 SDK）                     │
│  Anthropic / OpenAI Native / Bedrock / Vertex / Gemini ...  │
└────────────────────────────────────────────────────────────┘

旁路包：
  @roo-code/types   — 共享类型与 settings 元数据版本
  @roo-code/core    — 平台无关核心（为 CLI 抽离）
  @roo-code/ipc     — 扩展 / CLI / 预留 bridge 通信
```

### 1.2 Monorepo 关键包

| 路径 | 职责 |
|---|---|
| `src/`（extension） | VS Code 插件本体：webview UI、Task、providers、tools |
| `packages/core` | 平台无关逻辑，exports `./cli`、`./browser` |
| `packages/types` | 类型 + 配置 schema + npm 发布 `@roo-code/types` |
| `packages/ipc` | IPC 协议 |
| `packages/cli` | headless CLI + TUI（stdin NDJSON、session resume） |
| `docs/` | VitePress 文档站 |

### 1.3 形态矩阵

- **IDE**：主战场；Sidebar / Editor Tab / Terminal 集成
- **CLI**：`roo` 支持 run、stdin stream、session history、upgrade；默认 auto-approve，可 `--require-approval`
- **Cloud / Router**：Roo Code Router（原 Cloud Provider）、Cloud Team、Linear 集成（部分仅付费）
- **Roomote**：团队转型方向（远端/托管 agent），与开源插件并存叙事

---

## 2 核心机制

### 2.1 Modes（产品心智模型）

| 模式 | 能力边界 |
|---|---|
| **Code** | 日常编码、文件编辑、终端 |
| **Architect** | 系统设计 / 规格 / 迁移；计划落盘 `/plans`（gitignore）；禁止时间估算类提示 |
| **Ask** | 问答、解释、文档；不改文件 |
| **Debug** | 追因、加日志、隔离根因 |
| **Custom Modes** | `.roomodes` JSON schema 定义：名称、提示、可用工具、文件限制 |

要点：
- 每模式有独立 system prompt + tool allow/deny
- **API Config Lock** 可在 workspace 内锁定 provider 配置，避免模式切换改模型
- 技能/斜杠命令可声明 `mode` 字段，触发时自动切换模式

### 2.2 Task 与消息历史

- **Task = 会话**：历史、token、checkpoint、API config 随 task 持久化
- MessageManager 统一协调 API 消息与 UI 渲染
- **Context Condensation v2 + Smart Code Folding**：
  - 接近上限时摘要压缩
  - 保留近期文件轻量地图（函数签名/类声明/类型），~50k 字符预算
  - 孤儿 `tool_results` 转文本，避免压缩后 provider 400
- Condensation 摘要在 task resume 时保留

### 2.3 Checkpoints（稳定性核心）

- 写文件 / `new_task` 等副作用工具触发 **workspace snapshot**
- 支持 chat 内 **previous checkpoint 导航**
- 恢复策略通常可拆：仅消息状态 / 仅文件 / 两者
- 与 Cline 同源思想：用 git 脏区做可回滚实验场

### 2.4 工具与协议

- **Native tool calling 默认**（新 task）；legacy XML 协议已大规模清理
- 工具族：`read_file`（含图片、并发上限）、`write_to_file`、`search_replace`/`edit`、terminal、MCP、new_task
- **Custom Tools**：可引用 npm 包与 `.env`
- **Skills**：对齐 [Agent Skills](https://agentskills.io)；可暴露为斜杠命令；曾短暂有内建 skills 后移除（回归“用户装包”模型）
- **disabledTools** 全局禁用原生工具
- MCP：Hub 初始化需 await（修 race）；工具名 sanitize / hyphen 模糊匹配

### 2.5 子任务编排

- Orchestrator + `new_task` 委派
- 历史中嵌套子任务递归树展示
- 修复过多起：父任务状态丢失、并行 tool 隔离、delegation resume 的 tool_result ID 校验、父任务成本聚合

### 2.6 配置与规则

- `.roo/rules`、`AGENTS.md`（可递归子目录）
- `.roomodes`、`.roo/commands`、`.rooignore`
- Settings Version + `minPluginVersion` 门控（Roo provider 动态配置）
- ContextProxy：设置真源；UI 必须用 cachedState 缓冲再 Save（见 AGENTS.md）

---

## 3 稳定性 / HA

| 主题 | 做法 |
|---|---|
| 副作用可逆 | Checkpoints + 文件变更面板（per-conversation diff） |
| 流式协议 | Native parser 容错、duplicate tool_use/tool_result 去重、empty assistant grace retry、`tool_use` ID 64 字符截断 |
| Gemini/Bedrock 特殊性 | thought signature 注入、`additionalProperties:false` 归一、并行 tool_calls 可关 |
| 任务恢复 | CLI/扩展 task resume；协议锁定（resume 用创建时 protocol）；condense 摘要保留 |
| 委派并发 | new_task isolation、taskHistory 串行写、并行 tool calling 可再开 |
| 终端 | 命令 timeout + allowlist；清理 buffer 防灰屏；`ROO_ACTIVE` 环境变量护栏 |
| MCP | 初始化 await；config 大文件 json-stream-stringify |
| 诊断 | 错误详情 modal、debug proxy、PostHog 连续 mistake 遥测 |
| 组织风险 | **官方关停叙事 + 社区 fork（Zoo-Code）** — 生产依赖需评估维护连续性 |

---

## 4 自我进化 / 可扩展

1. **Custom Modes + `.roomodes`**：团队把工作流固化为模式包
2. **Agent Skills**：可复用提示/工具/资源包，对齐开放规范
3. **Custom Tools + npm**：用代码扩展工具面，无需改内核
4. **MCP 生态**：与 Claude Desktop/Cline 兼容服务器复用
5. **Slash Commands / prompts**：`.roo/commands`，可 symlink
6. **Code Index**：embedding 检索（可 per-workspace 开关）
7. **Cloud Router / Team settings**：组织级默认与可见性
8. **Eval 体系**：web-evals、CLI evals skill、运行日志与删除

局限：无内建长期记忆/个人助理层；进化路径偏“编码工作流”，非通用 agent 生活流。

---

## 5 对 openmate 借鉴（P0/P1/P2）

### P0（稳定性重构必做）
1. **Checkpoints 语义**：副作用工具自动快照 + 三态恢复（消息/文件/两者）+ 拒绝静默覆盖未快照改动
2. **Mode 权限矩阵**：Plan/Architect 硬拦截写操作；切换权归用户
3. **Native tool 协议唯一真源**，删除双协议长期并存
4. **消息压缩后 tool 配对完整性**（孤儿 tool_result 策略）+ resume 摘要保留
5. **委派隔离与 history 串行化**

### P1（产品差异化）
1. Custom Modes 配置 schema（openmate 可做 personal/coding 双 profile）
2. Agent Skills 包 + 斜杠命令自动切模式
3. Context condensation + “文件地图”保留策略（比裸摘要更可恢复）
4. 命令 allow/deny list + timeout allowlist（Windows/PowerShell 特判）

### P2（可选）
1. Code Index / embedding 检索
2. Cloud Router、组织 settings 版本门控
3. Web evals、错误遥测分组

---

## 6 源码路径（调研锚点）

| 路径 | 内容 |
|---|---|
| `README.md` | 产品定位 + 停服声明 |
| `src/package.json` | extension contributes、命令、keybinding、超时/索引配置 |
| `packages/core/package.json` | 平台无关 core 抽离 |
| `packages/types` / `packages/ipc` / `packages/cli` | 类型、IPC、CLI |
| `CHANGELOG.md` | modes/checkpoints/skills/CLI/condensation/协议演进全史 |
| `AGENTS.md` | SettingsView cachedState 约束 |

### 依赖指纹（选摘）

- `ai` 6.x + 多家 `@ai-sdk/*`
- `@modelcontextprotocol/sdk` 1.12
- `openai`、`@anthropic-ai/sdk`、`@aws-sdk/client-bedrock-runtime`、`@google/genai`
- `diff` / `diff-match-patch`、`simple-git`、`execa`、`web-tree-sitter`、`fzf`

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **3.5** | monorepo 有 core 抽离，但主体仍深绑 VS Code webview；扩展以 MCP/Custom Tool/Skill 为主，非干净内核 API |
| **Agent Loop 表达力** | **4** | Task 循环成熟、Orchestrator 子任务、条件压缩；缺显式 durable work/state machine |
| **工具与权限模型** | **4** | 模式级 tool 过滤 + auto-approve + 命令名单；整体仍偏“IDE 用户默认信任” |
| **上下文工程** | **4.5** | Condensation v2 + Smart Folding + skills/rules + code index；是 Cline 系里较强的一支 |
| **稳定性 / 可恢复性** | **4** | Checkpoints + 大量 provider 边界修复 + resume；扣分：历史 race 多、关停后维护不确定 |
| **多 Provider / 模型适配** | **4.5** | 几乎覆盖主流与订阅型；Bedrock/Gemini 特判多 |
| **产品完成度 / 生态** | **3.5** | 3M 安装与 modes 口碑强；**产品关停/交接**、CLI 后期补齐、文档站与主仓状态分裂 |

**综合（未加权平均）：≈ 4.0 / 5**

### 对 openmate 的简要结论

Roo Code 是 **“Cline 路线 + 更强模式/压缩/检查点”** 的 IDE agent 完整样本。openmate 应 **P0 抄 Checkpoints 与模式权限**，**P1 抄 Condensation/Smart Folding 与 Custom Modes schema**；同时把它当**组织风险案例**（商业转向 → 社区 fork）纳入供应链与维护连续性评估，而不是无条件押注其架构。

---

## 附录：`.roomodes` 概念示意

```json
{
  "customModes": [
    {
      "slug": "review",
      "name": "Code Review",
      "roleDefinition": "You review diffs for correctness and risk.",
      "groups": ["read", ["command", { "git diff": true }]],
      "source": "project"
    }
  ]
}
```

---

*报告结束。*
