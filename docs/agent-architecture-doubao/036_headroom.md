# Headroom 源码级调研报告（Rank 36）

> 调研对象：`headroomlabs-ai/headroom`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Headroom |
| GitHub | https://github.com/headroomlabs-ai/headroom |
| Star | 约 7.2w（清单快照 71,800） |
| 主要语言 | Python（也发 TypeScript SDK / npm） |
| 许可证 | Apache-2.0 |
| 一句话定位 | **位于 Agent 与 LLM 之间的"上下文压缩层"：拦截工具输出/日志/RAG chunk/文件/对话历史，本地可逆压缩后再发给模型，号称省 30–95% token** |

**目标用户/场景**：用 Claude Code/Codex/Cursor/cline 等编码 Agent、被长上下文烧 token 的开发者。四种接入：库、代理、agent wrap、MCP server。

**成熟度**：高且新。PyPI `headroom-ai` + npm 同名包，配 HF 模型 `kompress-v2-base`，提供 CLI（`compress/proxy/wrap/learn/doctor/perf/dashboard`），Trendshift 当日 #1。

---

## 2. 源码结构总览

经 README（raw HTTP 200）确认的架构（README "How it works" 图）：

```
Your agent/app (Claude Code/Cursor/LangChain/...)
        │ prompts·tool outputs·logs·RAG·files
        ▼
┌──────────────── Headroom (本地运行, 数据不出本机) ────────────────┐
│  CacheAligner → ContentRouter → CCR                              │
│                    ├─ SmartCrusher   (JSON)                      │
│                    ├─ CodeCompressor  (AST)                       │
│                    └─ Kompress-v2-base (text, HF)                │
│  Cross-agent memory · headroom learn · MCP                       │
└───────────────────────────────────────────────────────────────────┘
        │ 压缩后的 prompt + retrieval 工具
        ▼
LLM provider (Anthropic / OpenAI / Bedrock ...)
```

**核心组件**（README 文档确认）：
- **ContentRouter**：检测内容类型，选对应压缩器。
- **SmartCrusher / CodeCompressor / Kompress-v2-base**：分别压 JSON / 源码（按 AST）/ 散文（小模型）。
- **CacheAligner**：标记会破坏上游 KV-cache 前缀的易变内容，**绝不改写 prompt**（保护 cache 命中）。
- **CCR（Compressed Cache Retrieval）**：原文本地缓存，模型需要全文时可调 `headroom_retrieve` 取回。

**接入方式**：库 `from headroom import compress`；代理 `headroom proxy --port 8787`；wrap `headroom wrap claude|codex|cline|...`；MCP 工具 `headroom_compress / headroom_retrieve / headroom_stats`。

---

## 3. 系统架构分析

**编排模式：不持 Agent 循环，是"中间件/侧车"（sidecar）**。Headroom 不决定 Agent 下一步做什么；它在请求**出向 LLM 之前**插入压缩管线，响应**原样返回**。

**数据流**：
```
Agent 生成 messages → headroom.compress(messages, model=...)
  → ContentRouter 分类
  → 各压缩器压缩（原文哈希存 CCR）
  → CacheAligner 标注/保持前缀稳定
  → 压缩后 messages 发给 OpenAI/Anthropic SDK
  → 模型若要原文 → 调 headroom_retrieve(键)
  → 返回 result.tokens_saved / compression_ratio
```

关键设计：**可逆（reversible）**——压缩有损，但原文在本地缓存、按需取回，所以"答案不变、token 变少"。

---

## 4. 功能拆解

- **按内容类型分流压缩**：JSON 走 SmartCrusher（重复数组/日志可压 90%+）；代码走 AST 感知的 CodeCompressor；散文走 Kompress-v2 小模型。
- **代理零改造接入**：`headroom proxy --port 8787`，任意语言接入。
- **wrap 一键包装**：`headroom wrap claude` 起本地代理、装 Serena（语义代码导航）、改好配置；`unwrap` 还原。
- **跨 agent 共享记忆**：一个共享存储跨 Claude/Codex/Gemini/Grok，自动去重。
- **`headroom learn`**：挖掘失败会话，把纠正写进 `CLAUDE.local.md`（默认 gitignore）/`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`。
- **输出 token 也减**：不只压输入，也裁剪模型回写。
- **可观测**：`headroom doctor/perf/savings/dashboard`。

---

## 5. 技术亮点与优势

1. **分类压缩而非一刀切**：JSON/代码/散文用不同压缩器，重复 payload 压 90%，密集散文少压——按收益选策略。
2. **可逆压缩 + retrieve**：解决"压了就丢信息"的核心顾虑，模型需要细节能取回。
3. **CacheAligner 保护 KV-cache**：压缩时不破坏上游缓存前缀，避免"省了 input token 却丢了 prompt cache"的悖论。
4. **本地运行、数据不出机**：隐私友好。
5. **benchmark 透明**：README 给四个真实 MCP 场景的前后 token 表（55,957→24,340 等），且强调压缩 p50 < 1ms。

---

## 6. 稳定性机制【重点】

**部分适用（中间件视角）**：
- **不破坏语义**：`headroom doctor` 健康检查确认路由正确；proof 脚本用固定 seed 离线复现数字（`index_proof_table.py --seed 20260902`）。
- **可逆兜底**：压错了能 `headroom_retrieve` 取原文，不造成不可逆信息丢失。
- **不破坏 prompt cache**：CacheAligner 只标记易变内容、不改写 prompt，避免上游行为漂移。
- **低延迟**：压缩 p50 0.21ms（10K token JSON），1.4ms（100K），不进入 agent 关键路径故障面。
- **不适用项**：它不接管 Agent 重试/超时——这些仍在宿主。源码未逐行读 CCR 缓存与压缩器实现，标**文档/推断**。

---

## 7. 高可用机制【重点】

**部分适用**：
- **本地 sidecar、失败可旁路**：压缩层出问题时，本质可绕过（不经压缩直发），不阻塞 Agent（设计推断）。
- **跨 agent 共享存储 + 去重**：一个压缩/记忆服务供多 agent，避免重复压缩。
- **局限**：无服务端高可用/横向扩展讨论；它是本地库/代理。源码未读，标推断。

---

## 8. 自我进化机制【重点】

**这是它的差异化能力（文档级）**：
- **失败会话学习**：`headroom learn` 挖掘失败会话，自动把纠正写进 `CLAUDE.local.md` 等记忆文件——一种"从失败中沉淀经验到 prompt 层"的自反馈。
- **跨 agent 记忆 + 自动去重**：共享存储积累经验，跨工具复用。
- **压缩策略持续**：按内容类型/收益自动选压缩器，相当于"按数据自适应"。
- **局限（如实）**：learn 如何判定"失败"、如何写纠正，未读源码；标**推断**。

---

## 9. openmate 可借鉴点【重点】

- **【P0】在 LLM 网关前置"分类压缩中间件"**：openmate 多端长对话最缺的就是 token 成本。照 ContentRouter 思路：日志/JSON 强压、代码 AST 压、对话摘要压——预期可显著降本。
- **【P0】可逆压缩 + retrieve 工具**：不要简单 truncate（会丢信息）。照 CCR：压时存原文哈希，暴露一个"取原文"工具给模型，兼顾省钱与准确。这对 openmate 知识库/长会话价值极大。
- **【P1】CacheAligner 思路**：接 OpenAI/Anthropic 时注意别破坏 prompt cache 前缀；压缩要保护前缀稳定性，否则省小失大。
- **【P1】失败会话自动沉淀经验**：`headroom learn` 把失败写进记忆文件——openmate 可做"用户/模型踩过的坑自动写入项目级规则"。
- **【P2】四种接入方式**：库/代理/wrap/MCP，openmate 的压缩能力也应多形态接入，方便不同端复用。

---

## 10. 源码验证标注

- **文档确认**：架构图（CacheAligner→ContentRouter→CCR + 三压缩器）、四种接入方式、`headroom learn` 写 CLAUDE.local.md、MCP 三工具名、benchmark 数字、本地运行、CacheAligner 不改写 prompt（README 全文，raw HTTP 200）。
- **推断/未验证**：SmartCrusher/CodeCompressor/Kompress-v2 的具体实现、CCR 缓存结构、learn 的失败判定逻辑未读源码；benchmark 数字来自 README 自述。
- **不持循环结论**：据其"压缩层"定位明确。
