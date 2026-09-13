# Rank 45：calesthio/OpenMontage 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：OpenMontage（GitHub: https://github.com/calesthio/OpenMontage ）
- **Star 数**：约 58.0k（快照值）
- **主要语言**：Python（100+ 生产工具）+ Markdown/YAML（管线与技能）+ Node/Remotion/FFmpeg（渲染）
- **一句话定位**：agentic 视频生产系统——**没有自己的代码编排器**，AI 编码助手（Claude Code/Cursor/Codex 等）本身即调度器，按 YAML 管线 manifest + Markdown 导演技能文件调用 100+ Python 工具，把"想法→成片"走成一条结构化生产流水线。

**目标用户/场景**：用 AI 编码助手做 explainer/动画/口播/纪录片混剪/播客切片/字幕配音的内容团队；约 $5 成本出一条短片。

**成熟度**：高。README 自述 12 条生产管线、100+ 工具、60+ provider 集成、700+ 技能/知识文件、20+ JSON Schema、独立的 Backlot 实时故事板审批台。

## 2. 源码结构总览（源码确认，README"Architecture"节）

```
OpenMontage/
├── tools/                 # 100+ 注册生产工具（agent 的手）
│   ├── video/ audio/ graphics/ enhancement/ analysis/ avatar/ subtitle/
├── pipeline_defs/         # YAML 管线 manifest（阶段/工具/评审标准/成功门）
├── skills/                # Markdown 技能（agent 的知识）
│   ├── pipelines/         # 每条管线的阶段导演技能
│   ├── creative/ core/ meta/   # 技巧/核心工具/评审与 checkpoint 协议
├── schemas/               # 20+ JSON Schema（契约校验）
├── styles/                # 视觉风格 playbook (YAML)
├── remotion-composer/     # React/Remotion 合成引擎
├── lib/                   # config / checkpoints / pipeline loader
├── backlot/               # 实时故事板审批台（python -m backlot）
└── tests/                 # 契约测试 + QA + eval harness
```

**三层知识架构（源码确认）**：Layer1 `tools/+pipeline_defs/`（"有什么"——可执行能力+编排）、Layer2 `skills/`（"怎么用"——OpenMontage 约定与质量线）、Layer3 `.agents/skills/`（"原理"——外部技术知识包）。每个工具声明依赖哪些 Layer3 技能。

## 3. 系统架构分析

**编排模式（源码确认）**：**Workflow-DAG 工作流 + 技能驱动**，且是"宿主即编排器"。README 明确："There is no code orchestrator. Your AI coding assistant IS the orchestrator." 流程为：

```
Agent 读 pipeline manifest (YAML) → 读 stage director skill (Markdown)
→ 调 Python 工具（7 维打分选 provider）→ 预合成校验门 → 渲染（Remotion/FFmpeg）
```

**12 条管线共享七段主干（源码确认）**：`research → proposal → script → scene_plan → assets → edit → compose`。每条管线（Animated Explainer/Cinematic/Documentary Montage/Talking Head/Podcast Repurpose 等）在该主干上定制。

**关键机制**：
- **工具注册表 + 7 维打分选择**：`tools/tool_registry.py`，`registry.discover()`、`registry.support_envelope()`、`registry.provider_menu()`——agent 先查能力信封再选 provider。
- **渲染运行时锁定（源码确认）**：`render_runtime` 在 proposal 阶段选定并贯穿 `edit_decisions`；"Silent swaps between runtimes are a governance violation"——运行时静默切换是治理违规。
- **Web 研究是一等阶段**：写脚本前先跑 15-25+ 次 web 搜索（YouTube/Reddit/HN/news/学术），产出带引用的研究简报，防止幻觉。

```mermaid
flowchart LR
 Y[主题/参考视频] --> R[research 联网取证]
 R --> P[proposal 选型+成本+锁渲染runtime]
 P --> S[script 剧本]
 S --> SP[scene_plan 分镜]
 SP --> A[assets 逐场景生成+审批门]
 A --> E[edit]
 E --> C[compose 预合成校验门→渲染]
 C --> O[final.mp4]
```

## 4. 功能拆解

- **参考驱动创作**：贴一个喜欢的视频，agent 分析其 transcript/节奏/分镜/风格，产出"保留什么/改什么/成本多少/样片"的差异化方案。
- **真实素材纪录片**：从 Archive.org/NASA/Wikimedia/Pexels 建 CLIP 可检索语料，免付费视频模型即可剪出真素材混剪。
- **Backlot 实时故事板**：本地看板随管线点亮阶段、剧本页、场景卡；**资产生成在逐场景 contact sheet 处暂停**，你批准视觉后再渲染——"storyboard 是真正的审批门"。
- **分析工具链**：WhisperX 转录、scene detect、frame sampler、CLIP/BLIP-2 video understand（`understand_video.py` 20k）。
- **Avatar/口型**：SadTalker/MuseTalk/Wav2Lip/Kling。
- **平台输出 profile**：自动按 16:9/9:16/1:1/21:9 与分辨率渲染。

## 5. 技术亮点与优势

1. **manifest + 导演技能双层声明式编排**：YAML 管"做哪些阶段/用什么工具/过什么门"，Markdown 技能管"怎么做"；新增管线=写一个 YAML + 一组 stage skill，零代码编排器。
2. **7 维打分的 provider 选择层**：60+ provider 被统一打分排序，本地/云端混排，"用你手头有的"。
3. **渲染运行时治理**：proposal 锁定运行时，禁止静默切换，避免后期风格漂移。
4. **人在回路审批门**：script 门、逐场景 contact sheet 门，creative gate 挂起等用户答复。
5. **取证式研究阶段**：写任何脚本前先联网取证并引用，压制幻觉。

## 6. 稳定性机制【重点】

- **契约校验（源码确认）**：`schemas/` 20+ JSON Schema 做阶段产出契约校验；`tests/` 含契约测试 + QA 集成测试。
- **阶段门 + 成功标准（源码确认）**：YAML manifest 定义 review criteria / success gates；每阶段"self-review, checkpoints state, ask for human approval"。
- **预合成校验门（源码确认）**：compose 前有 "delivery promise, slideshow risk, renderer governance" 校验——在花钱渲染前拦截"交付承诺不兑现/幻灯片风险/渲染器违规"。
- **状态检查点（源码确认）**：`lib/` 含 checkpoints；Backlot 从项目文件派生状态，支持 `REPLAY RUN` 按时间戳回放整条生产。
- **治理约束**：运行时锁定、禁止静默切换，把"中途换方案"这类隐蔽错误显式化。

> 注：本项目无独立运行时，崩溃恢复/并发调度由宿主编码 Agent 承担；仓库层面提供 checkpoint 与契约校验作为稳定性抓手。

## 7. 高可用机制【重点】

- **降级/多 provider**：每个能力都有本地开源替代（FFmpeg/Piper/Remotion/HyperFrames）+ 云端 API，provider 缺失时自动走免费路径（README"Two free-ish paths"）。
- **可观测性（源码确认）**：Backlot 实时看板——"every provider decision and dollar spent is on the wall"，阶段点亮、成本可视化、可回放。
- **工具能力信封（源码确认）**：`registry.support_envelope()` 运行时先查"你当前到底有哪些 provider"，按真实能力规划，而不是假设某个 API 可用。
- **无状态/分布式**：不适用——工具在宿主进程内本地执行。

## 8. 自我进化机制【重点】

- **自评审循环（源码确认）**：每阶段 agent 读完导演技能后"use the tools, self-reviews, checkpoints state"——内置自评。
- **元技能（源码确认）**：`skills/meta/` 含 Reviewer 与 checkpoint 协议，专门做复核。
- **取证反幻觉**：research 阶段强制联网 + 引用，是对"凭记忆编脚本"的自我纠偏。
- **eval harness（源码确认）**：`tests/` 含 eval harness，支持对生产结果做基准评估。
- **无在线学习**：进化靠"技能文件+导演技能+eval"的版本沉淀。

## 9. openmate 可借鉴点【重点】

- **P0｜manifest 声明式阶段 + 导演技能双层**：openmate 复杂任务流应把"阶段定义(YAML)、工具、成功门"与"每阶段怎么做(Markdown skill)"分离。预期：流程可配置、可审计、易增删阶段。
- **P0｜渲染/方案选型一经锁定即治理**：openmate 在规划阶段选定后端/方案后，把"中途静默换方案"列为违规并记录。预期：避免长流程中途风格/成本漂移。
- **P1｜阶段产出用 JSON Schema 契约校验 + 预执行校验门**：openmate 每阶段产出先过 schema，进入重成本步骤前过"交付承诺/资源"校验。预期：把错误前移、避免浪费。
- **P1｜人在回路审批门挂起**：高成本步骤（如生成大图/视频）前暂停，给 contact sheet 让人批。openmate 桌面端天然适合这种 UI 门。
- **P1｜provider 能力信封先查后用**：openmate 启动任务前先探测"当前可用模型/工具"，按真实能力规划而非假设。
- **P2｜从项目文件派生实时看板**：openmate 把每步落盘产物作为唯一事实源，前端据此渲染进度。预期：进度可回放、可追溯。

## 10. 源码验证标注

**源码直接阅读（jsDelivr @main）**：
- `README.md`（snippet 全文）：agent-first 架构、七段主干、12 管线表、tools/skills/schemas 目录、三层知识架构、provider 打分、运行时治理、Backlot 审批门、能力信封命令。
- 目录树：`data.jsdelivr.com/...@main`（确认 `.claude/skills/` 下 visual-style/video-understand/video_toolkit 等技能与 understand_video.py 20k）。

**来自文档/推断**：`tools/tool_registry.py` 的 7 维打分具体公式、`pipeline_defs/` 单个 YAML 内容、`lib/checkpoints` 实现、Backlot 内部均未逐行读，仅据 README 与命令示例推断职责。

**源码不可得**：`pipeline_defs/` 具体 manifest、`skills/pipelines/*` 导演技能正文、`understand_video.py` 实现未读取；结论已标注。
