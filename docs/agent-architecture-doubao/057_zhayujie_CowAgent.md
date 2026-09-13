# CowAgent 源码级调研报告（Rank 57）

> 调研对象：`zhayujie/CowAgent`
> 报告日期：2026-09-13　｜　数据基线：GitHub `master` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | CowAgent（前身为 chatgpt-on-wechat / CoW） |
| GitHub | https://github.com/zhayujie/CowAgent |
| Star | 约 4.69w（清单快照 46,939） |
| 主要语言 | Python |
| 许可证 | MIT |
| 一句话定位 | **从 chatgpt-on-wechat 演进而来的"超级 AI 助手 / Agent Harness"：主动规划任务、控制电脑与外部服务、跑 Skills、建个人知识库与长期记忆、组多 agent 团队，并通过自进化随你一起成长** |

**目标用户/场景**：想在个人电脑/服务器上 7×24 跑一个跨 Web 与各 IM 平台的个人 agent 的用户。一行安装、Web 控制台（默认 `localhost:9899`）、桌面客户端（自带后端）、Docker。

**成熟度**：很高、活跃。README 显示已成体系：Skill Hub（skills.cowagent.ai）、桌面客户端、多语言文档（docs.cowagent.ai）、多平台。它自称"a reference implementation of Agent Harness engineering"。

---

## 2. 源码结构总览

经 raw 探测 + `config.py`（50,871 字节）import 确认：保留 `common/` 公共层（`common.log`、`common.i18n`），核心为 Channel → Agent Core → Models 的解耦分层。

```
CowAgent/
├── config.py          # 【核心】全局配置默认值 + 配置合并/env 注入
├── common/            # log、i18n 等公共
├── bot/  /  bridge/   # Channel（Web/微信/飞书/钉钉/企微/QQ/Telegram/Slack）与 Agent 核心
├── <workspace>/       # ~/cow：skills/ memory/ subagents/*.md（agent_workspace）
└── app/ 桌面/web      # Web 控制台与桌面壳
```

**核心源码文件（HTTP 200）**：`config.py`（全文 grep）、`README.md`（19,959 字节）。
**注**：因 GitHub API 限流 + 网络抖动，`bridge/agent`、`bridge/memory` 等具体实现文件未能逐一下载，核心循环实现据 README 与 config.py 配置项推断，已在第 10 章标注。

**入口/启动**：一行安装脚本起服务；`cow start/stop/restart` 管服务；Web 控制台配模型/渠道/装技能。消息流：Channel 进 → Agent Core 规划推理（基于记忆/知识/工具/技能）→ Model 生成 → 原路回 Channel。

---

## 3. 系统架构分析

### 编排模式：ReAct（规划 + 工具循环）+ 多 agent 团队——源码/文档确认

README（:50）："Decomposes complex tasks and executes them step by step, **looping over tools until the goal is reached**"——典型 ReAct：模型决定下一步工具、执行、观察、再规划，直到目标达成。

**关键配置（config.py 源码确认）**：
- `agent_max_context_turns: 30`（:297）——Agent 模式上下文记忆轮数上限。
- `subagent`（:309-327）：spawn 子 agent 的预算 `timeout_seconds: 300`（10–3600）；delegated run 预算 `timeout_seconds: 600`；子 agent 类型定义放在 `<workspace>/subagents/*.md`，可扩展。
- `conversation_max_tokens: 1000`（:94）——对话上下文记忆字符上限。

### 核心组件
- **Agent Core**：在记忆/知识/工具/技能上做规划推理。
- **三层记忆**（README:52）：context（上下文）→ daily（日记）→ core（核心），hybrid 关键词+向量检索。
- **Self-Evolution / Deep Dream**（见 §8）。
- **多 agent 团队**：每个 agent 有自己的角色/模型/技能/知识，在共享会话里协作（README:117-119）。

---

## 4. 功能拆解

- **工具系统**：内置文件 I/O、终端、浏览器、调度器、记忆检索、web search 等 10+，原生 MCP（stdio/sse，config.py:341）。
- **MCP 工具按需检索**（源码确认，config.py:342-348）：连接的 MCP 工具很多时，`mcp_tool_retrieval_enabled` 默认关，`mcp_tool_retrieval_threshold: 20`（工具数超 20 才触发）、`mcp_tool_retrieval_top_k: 10`（每轮最多注入 10 个相关工具）——典型**渐进式披露控 token**。
- **Skills**：从 Skill Hub / GitHub / ClawHub 一键装，或自然语言对话创建；skill 配置 `config["skills"][name][key]` 拍平成 `SKILL_<NAME>_<KEY>` 环境变量（:807-811），子进程式 skill 脚本直接读自己的配置。
- **多渠道**：Web/微信/飞书/钉钉/企微/QQ/公众号/Telegram/Slack。
- **多模型路由**：Chat/vision/image-gen/ASR-TTS/embedding 可分别路由到不同厂商（README:129）。
- **知识库**：自动整理成 Markdown wiki + 知识图谱（README:53）。

---

## 5. 技术亮点与优势

1. **三层记忆 + Deep Dream 蒸馏**：context→daily→core 分层，夜间把记忆蒸馏进 MEMORY.md，是个人 agent 记忆工程的完整范本。
2. **Self-Evolution 自动复盘**：会话闲置后自动复盘对话、改进技能、跟进未完成任务。
3. **MCP 工具按需检索**：工具多时只注入 top-k 相关工具，控上下文膨胀。
4. **子 agent 委派带独立预算**：spawn/delegated 各有 timeout 预算，类型可外挂 `.md`。
5. **生态成熟**：Skill Hub、Web 控制台、桌面端、多渠道、一行安装。

---

## 6. 稳定性机制【重点】

- **请求/重试超时**（config.py 源码确认）：`request_timeout: 180`（:103，注释：OpenAI 默认 600，难题需更久）、`timeout: 120`（:104，"chatgpt retry timeout; will auto-retry within this window"）——在 120s 窗口内自动重试。**源码确认**。
- **子 agent 预算隔离**：spawn `timeout_seconds: 300`、delegated `timeout_seconds: 600`（:313/327），子任务卡死不拖垮主循环，且范围有上下限约束（10–3600 / 0.01–600）。**源码确认**。
- **上下文轮数硬上限**：`agent_max_context_turns: 30`（:297）防上下文无限增长。**源码确认**。
- **记忆重置命令**：`clear_memory_commands: ["#清除记忆"]`（:231），用户可一键清会话。**源码确认**。
- **配置合并与迁移**：旧单数键 `tool/skill` 自动深合并迁移到复数 `tools/skills`（:538-543、`_merge_legacy_namespace`），配置升级不丢；skill 配置失败时"保留内存配置、下次启动再写"（:535）。**源码确认**。
- **未读部分（如实）**：ReAct 循环内部的异常分类、工具执行错误传播未读 `bridge/` 实现，据配置项与 README 推断。

---

## 7. 高可用机制【重点】

- **多渠道解耦**：Channel 与 Agent Core 分层，某 IM 掉线不影响核心。
- **子 agent 独立预算**：委派任务有独立 timeout，故障面隔离到子任务。
- **常驻服务 + 桌面自带后端**：`cow start` 后台常驻，桌面客户端自带后端开箱即用。
- **MCP 连接 stdio/sse**：本地进程/远程 URL 两种传输，远程工具故障可隔离。
- **局限（如实）**：单机自托管为主，未见多副本/分布式调度源码证据；横向扩展未读确认。

---

## 8. 自我进化机制【重点】

这是 CowAgent 的主打章，且有 config.py 源码硬证据：

- **Self-Evolution 自动复盘**（config.py:334-337，源码确认）：
  - `self_evolution_enabled: True`（:335）
  - `self_evolution_idle_minutes: 10`（:336）——会话闲置 10 分钟后触发复盘；
  - `self_evolution_min_turns: 6`（:337）——至少 6 个用户轮次（或上下文压力）才触发，避免过早复盘。
  - 行为（README:54）：自动复盘对话以改进技能、跟进未完成任务、固化记忆与知识。
- **Deep Dream 记忆蒸馏**（config.py:338-339，源码确认）：`deep_dream_enabled: True`，夜间把记忆蒸馏进 `MEMORY.md` + dream diary；`/memory dream` 手动触发不受开关影响。
- **三层记忆 + hybrid 检索**：context/daily/core + 关键词+向量混合检索。
- **知识库自整理**：自动 curate 成 Markdown wiki + 进化的知识图谱（README:53）。
- **Skills 自然语言创建**：用户可对话创建新技能，沉淀复用。
- **未发现**：无在线权重学习；进化=符号式（复盘对话→改技能/固化记忆），且触发有"闲置时长 + 最少轮次"双门槛，是相当克制的工程化设计。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】三层记忆 + 双门槛自进化**：照搬 CowAgent 的"context→daily→core"分层记忆，以及自进化触发的双门槛（闲置 N 分钟 **且** 至少 M 轮）。openmate 移动端别在每次对话后都跑重的复盘——设阈值，省 token 省电。
- **【P0】MCP/工具按需检索（阈值 + top-k）**：照抄 `工具数 > threshold(20) 才启用按需检索，每轮只注入 top_k(10) 相关工具`。openmate 工具一多，这是控上下文的关键。
- **【P1】子 agent 委派独立预算**：spawn/delegated 各设 timeout 预算且有合法范围，子任务卡死不拖垮主流程。openmate 手机端更要预算隔离。
- **【P1】Deep Dream 式离线蒸馏**：夜间/空闲把对话蒸馏进长期记忆文件，openmate 可在手机充电/空闲时后台整理记忆。
- **【P1】skill 配置拍平成环境变量**：`<workspace>/skills/<name>/<key> → SKILL_<NAME>_<KEY>`，让子进程式 skill 脚本读自己的配置而不污染全局。openmate 做插件/工具脚本时可复用此约定。
- **【P2】配置向后兼容迁移**：旧配置键自动深合并迁移到新键，升级不丢用户配置。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读/grep）**：
- `config.py`（50,871 字节：`conversation_max_tokens`:94、`request_timeout`:180/`timeout`:120:103-104、`clear_memory_commands`:231、`agent_workspace`:278、`agent_max_context_turns=30`:297、subagent spawn/delegated timeout:309-327、knowledge:333、self_evolution 三件套:335-337、deep_dream:339、mcp_tool_retrieval threshold/top_k:341-348、skill 配置拍平 env:807-811、`_merge_legacy_namespace`:770）
- `README.md`（19,959 字节：定位、ReAct 工具循环、三层记忆、Deep Dream、Self-Evolution、多 agent 团队、Skills/MCP/渠道/模型、Web 控制台）

**文档/推断**：
- ReAct 主循环、三层记忆、Deep Dream 蒸馏、知识图谱的具体实现文件（`bridge/` 下）未逐行下载（网络限流 + 路径重定位），其行为据 README 与 config.py 配置项/注释推断。
- 子 agent 团队协作协议、MCP 连接管理内部未读源码。
- 星级/活跃度来自清单快照。
