# nanobot 源码级调研报告（Rank 54）

> 调研对象：`HKUDS/nanobot`（PyPI 包名 `nanobot-ai`）
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | nanobot |
| GitHub | https://github.com/HKUDS/nanobot |
| Star | 约 4.81w（清单快照 48,070） |
| 主要语言 | Python（≥3.11）+ 前端 WebUI（`webui/`） |
| 许可证 | MIT |
| 一句话定位 | **港大 HKUDS 出品的"超轻量、可读、自托管"个人 AI Agent 框架：一个小而清晰的 agent loop，把工具、长期记忆、MCP、模型路由、多 agent 委派、定时自动化和 OpenAI 兼容 API 全部内置在一个小内核里** |

**目标用户/场景**：想自托管一个"跑在 WebUI/终端/微信/Telegram/Discord/飞书/Slack/邮箱里的个人助手"的用户与开发者。README 明确它"runs in a WebUI, terminal, or chat apps"，并定位为"long-running local or server-side agent gateway"。

**成熟度**：高且活跃。有完整 CI（`ci.yml`）、ruff/pytest 测试体系、nanobot.wiki 多语言文档、PyPI `nanobot-ai` 持续发版、Discord/微信/飞书社区。自称"small, readable core"——刻意把内核做小做透明，与 LangChain 这类重型框架形成对比。

---

## 2. 源码结构总览

架构由官方 `docs/architecture.md`（已下载通读）精确映射到源文件，这是难得的高质量内部文档：

```
nanobot/
├── bus/                 # 消息事件与队列
│   ├── events.py        # InboundMessage/OutboundMessage
│   └── queue.py          # MessageBus
├── agent/
│   ├── loop.py           # 【轮次编排】AgentLoop：会话/工作区/上下文/hooks/对外消息
│   ├── runner.py         # 【模型循环】AgentRunner：provider/tool 迭代、流式、停止条件
│   ├── context.py        # ContextBuilder 构造上下文
│   ├── memory.py         # MemoryStore + Dream 长期记忆 consolidate
│   └── tools/            # tools/{base,schema,registry,shell,filesystem,web,mcp,cron,image_generation,self}.py
├── session/
│   ├── manager.py        # Session 存储、压缩摘要 checkpoint、运行时 checkpoint
│   └── summary.py        # 摘要 checkpoint
├── providers/            # 各 LLM provider（registry.py 元数据 + OpenAI 兼容为主）
├── channels/             # 各聊天渠道（base.py + <channel>/ 包，自动扫描发现）
├── cron/                 # 定时任务（workspace-scoped cron service）
├── security/             # workspace_access / workspace_policy / network(SSRF)
├── config/               # schema.py / loader.py / paths.py
└── templates/            # SOUL.md / USER.md 等身份模板
```

**核心源码文件（已下载，HTTP 200）**：
- `nanobot/agent/runner.py`（55,607 字节）
- `nanobot/agent/loop.py`（104,166 字节）
- `nanobot/agent/memory.py`（48,930 字节）
- `nanobot/session/manager.py`（79,804 字节）
- `docs/architecture.md`（全文通读）

**入口/启动**：`nanobot gateway` 启动——按配置起各 chat channel、WebSocket/WebUI channel、workspace-scoped cron、系统 job（Dream + heartbeat）、健康端点（默认 `127.0.0.1:18790/health`），WebUI 在 `8765`。消息流：Channel→MessageBus(Inbound)→AgentLoop→AgentRunner→Provider/Tools→回灌→MessageBus(Outbound)→Channel。

---

## 3. 系统架构分析

### 编排模式：ReAct（模型-工具迭代循环）——源码确认

官方文档把循环拆成两层（architecture.md「Agent Loop vs Agent Runner」）：

- **AgentLoop（轮次/渠道面）**：收 inbound message → 确定 session/workspace 范围 → 建上下文 → 挂 hooks/progress/channel metadata → 发 outbound message。出问题查 `agent/loop.py`。
- **AgentRunner（模型面）**：把消息发给选定 provider → 处理流式 delta/reasoning block → 执行 tool call → 把 tool result 回灌给模型 → 出最终答案或触达运行时上限才停。出问题查 `agent/runner.py`。

**主循环（runner.py 源码确认）**：
```python
for iteration in range(spec.max_iterations):     # runner.py:435
    await hook.before_iteration(context)
    ... 调 provider ...
    ... 若 finish_reason 要求工具调用则执行工具、回灌 ...
    await hook.after_iteration(context)
```
即标准 ReAct：模型出 message → 有 tool_call 就执行 → 回灌 → 再问，直到模型不再要求工具或达到 `max_iterations`。配置项：`max_iterations: int`（:95）、`max_iterations_message`（:101）、`provider_retry_mode: str = "standard"`（:105）、`finalize_on_max_iterations: bool = True`（:112）。

### 关键设计
- **MCP 生命周期与循环解耦**（architecture.md）：MCP 是应用级基础设施，composition root 创建 `MCPProvider`、把它的 `ToolRegistry` 共享给 `AgentLoop`、启动前 `await connect()`、关闭时保证 `aclose()`；循环本身不管理 MCP 生命周期。
- **工具发现**：从 `nanobot/agent/tools/` 与插件 entry point 自动发现（base/schema/registry）。
- **渠道自描述包**：扫描 `nanobot/channels/` 下自包含包即得 channel，加渠道=加一个包。

---

## 4. 功能拆解

- **工具系统**：shell（沙箱）、filesystem、web search/fetch、MCP、cron、image_generation、subagent 派生、`self.py` 运行时自省。
- **多渠道接入**：WebUI/WebSocket、CLI、Telegram、Discord、Slack、飞书、企业微信、QQ、邮箱、Mattermost、Teams。
- **长期记忆 Dream**：`nanobot/agent/memory.py`，由 runtime 定时调度。
- **会话与压缩**：`session/manager.py` 存 `<config>/sessions/<workspace>/*.jsonl`，摘要 checkpoint。
- **模型路由与 fallback**：provider 选择走显式 provider/registry 关键字/API key 前缀/本地 fallback/gateway fallback（architecture.md）。
- **OpenAI 兼容 API + Python SDK**：对外暴露 SSE 流式 API。
- **安全边界**：`security/workspace_access.py`、`workspace_policy.py`、`network.py`（SSRF 检查）、shell 沙箱、channel 访问控制。文档明确"agent 历史文件只对工具只读、显式授权，不把整个 workspace 当允许根"。

---

## 5. 技术亮点与优势

1. **loop 与 runner 干净分层**：渠道轮次（loop）与模型迭代（runner）分离，便于分别调试与替换——这与 cline 的"循环核心/能力宿主"分层异曲同工。
2. **极小可读内核**：刻意不依赖重型编排 DSL，ReAct loop 一目了然，是研究/二次开发的好范本。
3. **Dream 长期记忆 + git 提交**：把记忆变更落成 git commit，commit message 基于真实 working-tree delta，可回溯。
4. **运行中工具调用崩溃可恢复**：`runtime_checkpoint` 记录 `assistant_message/pending_tool_calls/completed_tool_results`，重启可续跑（详见 §6）。
5. **文件即状态、零重基础设施**：session JSONL、MEMORY.md、SOUL.md/USER.md、cron/jobs.json，全是本地文本文件，自托管/可人工查看，契合隐私优先。

---

## 6. 稳定性机制【重点】

- **迭代硬上限 + 优雅收尾**：`for iteration in range(spec.max_iterations)`（runner.py:435）杜绝死循环；且 `finalize_on_max_iterations=True`（:112）表示触顶时**不是报错中断，而是调用 `_request_finalization_retry()`（:613）请模型把已有进展总结成最终答案**——把"跑满轮次"优雅降级为"给出阶段结论"。**源码确认**。
- **错误三态分类**（runner.py:319-331）：`asyncio.CancelledError` → `context.stop_reason="cancelled"`（再 raise）；其他 `Exception` → `stop_reason="error"`（再 raise）；正常完成 → `"completed"`。调用方能区分"用户主动停 / 真出错 / 完成"。**源码确认**。
- **空响应自动重试**：模型返回空 content 时打 `"Empty response on turn ...; retrying"`（:595），配合 `provider_retry_mode="standard"`。**源码确认**。
- **finish_reason 边界**：按 `finish_reason` 决定是否忽略残留 tool_call（:581 "Ignoring tool calls under finish_reason=..."），避免截断回合里误执行半截工具。**源码确认**。
- **运行中工具调用崩溃恢复**（session/manager.py）：`runtime_checkpoint` 存 `.checkpoint.json`（版本号 `_RUNTIME_CHECKPOINT_VERSION=1`，:58），字段含 `assistant_message`、`pending_tool_calls`、`completed_tool_results`（:182-189）。即崩溃重启后能知道"上一轮模型说了什么、哪些工具调用已完成、哪些还挂着"，从而续跑而非从头再来。**源码确认**。
- **记忆写入并发安全**（memory.py）：`_append_lock = threading.Lock()`（:85），注释明确"cursor 分配与 append 必须原子——并发写否则读到同一 cursor 产生重复"（:304-305）。`.cursor` / `.dream_cursor` 双游标做幂位点。**源码确认**。
- **损坏容错**：`_corruption_logged` 限速记录非法 cursor 告警（:81），不崩；session checkpoint 错误归类 `_RUNTIME_CHECKPOINT_DATA_ERRORS=(OSError, ...)`（:52）。
- **摘要 checkpoint 续接**：`commit_summary_checkpoint` + `SUMMARY_CONTINUATION_TEXT`（session/manager.py:323-334）把长会话压缩为摘要后无缝续聊。

---

## 7. 高可用机制【重点】

- **消息总线 + 异步队列解耦**：Channel 与 AgentLoop 经 `MessageBus`(events.py/queue.py) 传递 Inbound/Outbound 事件，渠道掉线不影响 runner，runner 完成再发 outbound。
- **心跳 + 系统 job**：gateway 跑 heartbeat 与 Dream 系统 job（architecture.md），进程保活。
- **本地文件状态、可随时重启**：session JSONL + checkpoint + MEMORY.md 全落盘，进程 kill 后重启能续会话、续工具调用——单机高可用靠"状态全持久化"而非复杂分布式。
- **provider fallback / 模型路由**：provider 选择链含"本地 fallback"与"gateway fallback"（architecture.md:67-73），主 provider 挂了可切备。**文档确认**。
- **健康端点**：`127.0.0.1:18790/health` 供编排/监控探活。
- **cron 工作区隔离**：定时任务按 workspace 隔离，`cron/jobs.json` 持久化。
- **局限（如实）**：单进程自托管为主，未见内建多副本/分布式协调；横向扩展靠独立部署多实例，未读源码确认其并发上限。

---

## 8. 自我进化机制【重点】

nanobot 在"符号式自我进化（记忆沉淀）"上做得相当完整，是本批样本里该章最有料的之一。

- **Dream 长期记忆 consolidate**（memory.py，源码确认）：
  - `MemoryStore`（:56）是"memory 文件的纯文件 I/O"：`MEMORY.md`（长期事实）、`history.jsonl`（consolidation 源历史）、`SOUL.md`/`USER.md`（身份）。
  - `.dream_cursor`（:80）记录 Dream 已处理到 history 的哪个游标——**增量 consolidate**，重启不从头扫全量。
  - Dream 由 runtime 定时调度，把 history.jsonl 里新对话提炼进 MEMORY.md。
  - `_DEFAULT_MAX_HISTORY = 1000`（:59）设历史上限，防无限膨胀。
  - Dream 提交走 git：`_DREAM_CONTENT_PATHS`（:63 = SOUL.md/USER.md/MEMORY.md）的真实 working-tree delta 作为 commit message 的依据——记忆变更可追溯、可 diff、可回滚。
- **身份文件**：`SOUL.md`（agent 人格）、`USER.md`（用户画像）随上下文注入，相当于可手写/可 LLM 维护的长期设定。
- **上下文压缩（遗忘旧细节）**：summary checkpoint + `SUMMARY_CONTINUATION_TEXT`，把长会话压成摘要续跑。
- **多 agent 委派 / subagent**：内置 subagent 工具，task 可派给有独立上下文的子 agent。
- **未发现**：无在线权重学习、无自动 A/B 评测；"进化"= 记忆文件 + Dream 提炼 + git 版本化，是典型的文件式经验沉淀。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】loop（渠道轮次）与 runner（模型迭代）两层分离**：照抄 nanobot 的分层——openmate 多端（Web/桌面/手机）只需各端实现 channel，共享同一个 AgentRunner 模型循环。这是"一套内核多端复用"最干净的切分点。
- **【P0】跑满轮次不报错、先请模型收尾（finalize_on_max_iterations）**：直接借鉴。移动端不能因为 agent 跑满步数就给用户一个错误——应该把已有进展总结成"阶段结论"返回，`_request_finalization_retry` 的思路值得抄。
- **【P0】崩溃恢复 checkpoint 记录 pending_tool_calls**：手机杀后台/切网极常见。照抄"把 assistant_message + 已完成/未完成工具调用落 checkpoint.json，重启续跑"，而不是从头再来。这是移动端体验的关键。
- **【P1】错误三态分类（completed/cancelled/error）**：区分用户主动停与真出错，openmate 移动端做"退出即取消、出错可重试"时直接套用。
- **【P1】记忆文件 + 增量游标 + git 提交**：长期记忆用本地 markdown/jsonl，用 `.cursor` 做增量处理游标、用 git 提交做可回溯版本——比数据库式记忆更轻、更透明，且移动端离线友好。`threading.Lock` 保护 cursor 分配的细节也值得抄。
- **【P2】渠道=自描述包 + 自动扫描发现**：新增接入渠道只丢一个包进目录即可，对 openmate 后续接多 IM 平台很省事。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读/grep）**：
- `nanobot/agent/runner.py`（55KB：`max_iterations`:95、`for iteration in range`:435、`provider_retry_mode`:105、`finalize_on_max_iterations`:112、CancelledError/Exception 三态:319-331、空响应重试:595、`_request_finalization_retry`:613、finish_reason 处理:581）
- `nanobot/agent/memory.py`（48KB：`MemoryStore`:56、`_DEFAULT_MAX_HISTORY=1000`:59、`_DREAM_CONTENT_PATHS`:63、`.dream_cursor`:80、`_append_lock`:85、原子 append:304-319、MEMORY.md/history.jsonl/SOUL.md/USER.md）
- `nanobot/session/manager.py`（79KB：`runtime_checkpoint` 字段 assistant_message/pending_tool_calls/completed_tool_results:182-189、版本号:58、`commit_summary_checkpoint`:323、`SUMMARY_CONTINUATION_TEXT`）
- `docs/architecture.md`（全文：Channel/MessageBus/AgentLoop/AgentRunner/Provider/Tools 数据流、loop vs runner 分工、MCP 生命周期、渠道发现、cron、安全边界、文件路径默认值）

**文档/推断**：
- `loop.py`（104KB）未逐行读，仅据 architecture.md 职责与 runner.py 对照描述其轮次编排。
- provider fallback 的具体重试/退避算法、shell 沙箱实现、各 channel 内部未读源码，据 architecture.md 与配置文档确认。
- Dream 的 LLM 提炼 prompt 与触发阈值（除 .dream_cursor/max_history 外）未逐行读。
- 星级/活跃度来自清单快照。
