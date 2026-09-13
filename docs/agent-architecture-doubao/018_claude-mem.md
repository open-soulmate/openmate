# 018 · thedotmack/claude-mem 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 18 / GitHub Top 100 AI Agent 第 18 位
> 证据：README.md 全文（jsDelivr @main）。注意：本项目已更名 **Grok Mem**，npm 包名仍为 `claude-mem`。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | thedotmack/claude-mem（现品牌 Grok Mem） |
| GitHub | https://github.com/thedotmack/claude-mem |
| Star | 约 93,769（初步清单） |
| 主语言 | TypeScript；Node ≥20，Bun 进程管理，uv 管向量检索 |
| 当前版本 | 13.24.23（README badge 实测，发版极频繁） |
| License | Apache-2.0；Built with Claude Agent SDK |

**一句话定位**：为编码 Agent（Claude Code 等）提供**跨会话持久记忆**的中间件插件——通过生命周期 hook 自动捕获工作过程，用 LLM 摘要压缩后存本地，下次开会话自动把相关上下文回注，解决"Agent 一重启就失忆"。

**目标用户**：长期使用编码 Agent、希望它记得"上次改了什么/决定了什么/下一步做什么"的开发者。

**成熟度**：v13、三十多个小版本、三分支发布流（main stable / core-dev / community-edge），工程化成熟。

---

## 2. 源码结构总览（源码确认，README「How It Works」）

```
claude-mem/
├── hooks/            # 6 个生命周期 hook 脚本（SessionStart/UserPromptSubmit/
│                     #   PostToolUse/Stop/SessionEnd + 1 pre-hook 依赖检查）
├── worker/           # ★ 本地 HTTP Worker（Bun 管理）：web viewer + 搜索端点
├── SQLite (bundled)  # sessions/observations/summaries，FTS5 全文检索
├── Chroma            # 向量库，语义+关键词混合检索
├── skills/           # mem-search 技能（自然语言检索）+ troubleshoot
├── plugin/modes/     # code / code--zh / code--ja 工作流与语言模式
├── ragtime/          # （Apache-2.0）RAG 相关子模块
└── ~/.claude-mem/settings.json   # 配置（模型/端口/数据目录/日志/注入）
```

**入口**：`npx claude-mem install` 注册 hook 并启动 worker；之后 hook 自动在会话各阶段触发。

---

## 3. 系统架构分析

**编排模式：事件钩子驱动的记忆中间件（非独立 Agent）。** 证据（源码确认，README）：
- 它**不自己跑主循环**，而是挂在宿主编码 Agent 的生命周期上：
  - `SessionStart` / `UserPromptSubmit`：把相关记忆回注上下文；
  - `PostToolUse`：捕获一次工具使用作为 observation；
  - `Stop` / `SessionEnd`：用 LLM 摘要压缩本会话、落库。
- **Worker Service**：本地 HTTP API（Bun 管理），提供搜索端点 + web viewer UI，启动时打印 worker URL。
- **存储双引擎**：SQLite（FTS5 关键词）+ Chroma（语义向量），混合检索。

**数据流**：
```
宿主 Agent 工作 → PostToolUse hook 捕获观察 → worker 用 LLM 摘要压缩
   → 写 SQLite(observations/summaries/sessions) + Chroma(向量)
新会话 SessionStart → 三层检索(search→timeline→get_observations) → 回注上下文
```

**关键设计——三层渐进披露检索**（源码确认）：
1. `search`：返回紧凑索引（ID + 摘要，~50–100 token/条）；
2. `timeline`：围绕命中项取时间线上下文；
3. `get_observations`：只对筛选后的 ID 取全文（~500–1000 token/条）。
→ 先过滤再取详情，宣称 **~10x token 节省**。

---

## 4. 功能拆解

- **自动持久记忆**：上下文跨会话存活，无需手动干预。
- **mem-search 技能 + 4 个 MCP 工具**：search / timeline / get_observations（+ citations 用 ID 引用历史观察）。
- **Web Viewer**：worker URL 实时看记忆流。
- **隐私控制**：`<private>` 标签标记的内容不入库存。
- **云端同步**：无独立 daemon，worker 在写入时同步到 cmem.ai。
- **多模式/多语言**：`CLAUDE_MEM_MODE` 选 code/code--zh/code--ja，控制工作流与生成观察所用语言。
- **Awareness push（试点）**：needle 级观察（decision/bugfix/security_alert/sensitive）按日期追加到 `memory/log/YYYY-MM.md`，供宿主自动重读。

---

## 5. 技术亮点与优势

1. **三层渐进披露检索**：用 token 成本阶梯（索引→时间线→全文）换取"记得住但不爆上下文"，是记忆系统 token 经济学的范本。
2. **hook 化自动捕获**：不靠用户手动记笔记，PostToolUse 即抓观察，LLM 摘要压缩后入库——自动化程度高。
3. **双引擎检索**：SQLite FTS5（关键词精确）+ Chroma（语义相似），互补。
4. **Observer 自治**：memory "runs off-plan"——在宿主计划之外自主运行，是真正的后台记忆进程。
5. **隐私即原语**：`<private>` 排除 + 本地 SQLite 默认 + 可选云端，合规友好。

---

## 6. 稳定性机制【重点】（源码确认）

- **Smart Install 依赖检查**：用一个 pre-hook 脚本（明确"不是生命周期 hook"）缓存依赖检查，避免每次 hook 都做昂贵探测——把启动开销从关键路径移走。
- **进程管理**：Bun 自动安装/管理 worker；Node/Bun/uv/SQLite 缺什么装什么，降低部署失败。
- **配置自愈**：`~/.claude-mem/settings.json` 首次运行自动建默认值；CI/非交互 shell 自动跳过登录。
- **降级策略**：免费试用结束后，"memory 自动回退到你的 Anthropic plan"；登录可跳过（`--provider` / `CLAUDE_MEM_ONLINE_OPTIN=false`）——记忆服务不阻塞主 Agent。
- **模式开关**：Awareness push 可用 `CLAUDE_MEM_GROK_BOT_AWARENESS_ENABLED=false` 关闭，出问题可切回。

**未在本轮源码读到**：hook 内部的重试/超时/事务实现（见第 10 节）。

---

## 7. 高可用机制【重点】（源码确认）

- **本地优先**：SQLite + worker 都是本地进程，不依赖云；云端同步是"写入时异步同步"，挂了不影响本地记忆。
- **无独立 daemon 的同步**：worker 在写时同步，减少常驻进程故障面。
- **可观测**：Web Viewer 实时记忆流 + log level 可配 + troubleshoot 技能自动诊断常见问题。
- **进程隔离**：记忆作为独立 worker 进程，与宿主 Agent 解耦——worker 崩了，宿主主循环不受影响（仅记忆缺失）。

---

## 8. 自我进化机制【重点】（这是本项目核心，源码确认）

- **自动记忆沉淀**：PostToolUse 观察 → LLM 摘要 → observations/summaries，是自运行的经验提取。
- **记忆回注闭环**：SessionStart/UserPromptSubmit 按三层检索把相关历史注入，Agent"记得自己做过什么/决定了什么/下一步"。
- **needle 级分类**：观察分 decision/bugfix/security_alert/sensitive 等类型，便于检索时按类型过滤——是结构化的经验索引。
- **渐进披露即记忆管理**：先索引后详情，是对"记忆该想起来多少"的主动调控。
- **非自动学习权重**：无在线模型更新；"进化"= 记忆随时间累积 + 可检索回注。

---

## 9. openmate 可借鉴点【重点】

**P0｜三层渐进披露记忆检索（索引→时间线→详情）**
- 借鉴什么：先返回紧凑索引（ID+摘要，~百元 token），再按时间线补上下文，最后只对选中 ID 取全文。
- 怎么用：openmate 的长期记忆检索接口直接照此三段设计，避免一上来把几十条全文塞进上下文。
- 预期收益：长任务/多端历史查询的 token 成本下降约 10x。

**P0｜hook/生命周期自动捕获 + LLM 摘要压缩**
- 借鉴什么：在工具调用后自动抓取观察、用 LLM 压成摘要再入库，而非原样存储。
- 怎么用：openmate 在每次工具/动作后异步生成一条结构化 observation（类型/摘要/关键 ID），落本地库。
- 预期收益：跨会话记忆自动累积，用户无感。

**P1｜本地 SQLite(FTS5) + 向量库双引擎**
- 借鉴什么：关键词精确 + 语义相似互补；本地优先、云同步异步。
- 怎么用：openmate 桌面/手机端本地存 SQLite，必要时异步同步；不依赖云才有记忆。
- 预期收益：离线可用、隐私可控、多端同步。

**P1｜隐私原语 `<private>` 排除 + 类型化观察**
- 借鉴什么：显式标记不入库内容；观察分类型（decision/bugfix/security）便于过滤。
- 怎么用：openmate 把敏感上下文用标签排除，记忆按类型索引，检索时可按类型收窄。
- 预期收益：合规 + 检索精准。

**P2｜独立 worker 进程 + Web Viewer**
- 借鉴什么：记忆服务与主 Agent 解耦成独立 HTTP 进程，配实时查看 UI。
- 怎么用：openmate 把记忆做成后台服务，桌面/手机端都连它，便于排查"Agent 为什么记得这个"。
- 预期收益：可调试、多端共用同一记忆。

---

## 10. 源码验证标注

**源码直接阅读**（jsDelivr @main README）：
- 版本/许可/运行时（13.24.23 / Apache-2.0 / Node≥20 / Bun / uv / built with Claude Agent SDK）。
- 5 个生命周期 hook + 1 个 pre-hook；worker service（Bun 管理、HTTP API、web viewer）；SQLite(FTS5) + Chroma；mem-search 技能；4 个 MCP 工具。
- 三层检索 workflow（search ~50-100 tok → timeline → get_observations ~500-1000 tok，~10x 节省）与示例。
- `<private>` 排除、云端写入即同步、settings.json、CLAUDE_MEM_MODE（code/code--zh/code--ja）、awareness push（decision/bugfix/security_alert/sensitive）与开关、降级回退 Anthropic plan。

**文档/推断**：
- 具体 hook 脚本内容、SQLite schema、Chroma 集成、worker 端点实现来自 README 链接到 docs.claude-mem.ai 的描述，**未读取源码文件**。
- "HTTP worker 端口 37777""摘要压缩调用 Claude Agent SDK""自动生成 CLAUDE.md 时间线"来自初步架构笔记，README 未逐一证实端口号。

**源码不可得**：本轮 GitHub API 限流，未读取 `hooks/`、`worker/`、`skills/mem-search/SKILL.md` 的实际源码；文件树 API（@13.24.23）两次返回 `link fetch error`。内部重试/事务/错误处理细节未验证。
