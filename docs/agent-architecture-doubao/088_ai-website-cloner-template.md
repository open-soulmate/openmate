# Rank 88：JCodesMore/ai-website-cloner-template 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：ai-website-cloner-template（GitHub: https://github.com/JCodesMore/ai-website-cloner-template ）
- **Star 数**：约 34.3k（快照值）
- **主要语言**：JavaScript/TypeScript（Next.js 16 + shadcn/ui + Tailwind v4 项目模板）
- **一句话定位**：一个 GitHub 模板仓库，本身不含 Agent 运行时，而是给外部编码 Agent（推荐 Claude Code Opus）提供"克隆任意网站为干净 Next.js 应用"的工作流技能。
- **目标用户/场景**：用编码 Agent 把 WordPress/Webflow 老站、丢失源码的线上站重建成现代 Next.js 代码；或学习生产站的布局/动效实现。
- **项目成熟度**：中。MIT，模板式分发，支持 13+ 编码平台（Claude Code/Codex/Cursor/Gemini/Cline/Roo/Continue 等）。

> **定性说明**：这是**工作流/技能模板**，不是可运行的 Agent 系统。它的全部"智能"由宿主编码 Agent 执行，仓库只提供指令源（AGENTS.md）、技能定义（SKILL.md）和同步脚本。第 6/7/8 章重点分析其**多阶段流水线与并行派发的工程范式**。

## 2. 源码结构总览

```
ai-website-cloner-template/
├── AGENTS.md              # ★ 跨 Agent 统一指令源（single source of truth）
├── CLAUDE.md / GEMINI.md  # 各自 import AGENTS.md
├── .claude/skills/clone-website/SKILL.md   # /clone-website 技能定义（源）
├── scripts/
│   ├── sync-agent-rules.sh  # 把 AGENTS.md 同步到各平台指令文件
│   └── sync-skills.mjs      # 把 SKILL.md 同步到各平台 skill
├── src/ (Next.js 应用骨架)  # app/ components/ ui/ hooks/
├── docs/research/          # 提取产物与组件规格
│   ├── components/         # ★ 每个组件的详细 spec（computed CSS 值）
│   └── design-references/   # 截图
└── public/ (images/videos/seo)
```

**核心"源码"**：`AGENTS.md`（指令源）、`.claude/skills/clone-website/SKILL.md`（技能源）、两个 sync 脚本。真正"克隆逻辑"是 SKILL.md 里用自然语言描述的多阶段流水线。

**入口/启动**：用户 `Use this template` 复制仓库 → `npm install` → `claude --chrome` → `/clone-website <url>`。

## 3. 系统架构分析

**编排模式：技能驱动的多阶段流水线（源码确认，README 的 mermaid）**。
```
Reconnaissance → Foundation → Component Specs → Parallel Build → Assembly & QA
```

**五阶段职责（README 确认）**：
1. **Reconnaissance**：截图、提取 design token、交互扫描（滚动/点击/hover/响应式）。
2. **Foundation**：改字体/颜色/globals，下载全部资源。
3. **Component Specs**：为每个组件写详细 spec 文件（`docs/research/components/`），含精确 `getComputedStyle()` 值、状态、行为、内容。
4. **Parallel Build**：在 **git worktree** 里派发 builder agent，每个 section/component 一个。
5. **Assembly & QA**：合并 worktree、接页面、与原站做视觉 diff。

**关键设计——"先规格后构建，全量内联"**：每个 builder agent 收到**完整组件 spec**（精确 computed CSS、交互模型、多态内容、响应式断点、资源路径），"No guessing"。这把"模糊复刻"变成"按规格施工"。

```mermaid
flowchart LR
 U[/clone-website url] --> R[侦察: 截图/token/交互扫描]
 R --> F[基础: 字体颜色资源]
 F --> S[组件规格 docs/research/components]
 S --> PW[Parallel Build: git worktree 每组件一个 builder]
 PW --> A[Assembly + 视觉diff QA]
```

## 4. 功能拆解

- **跨 Agent 统一指令（源码确认）**：`AGENTS.md` 是唯一指令源，`scripts/sync-agent-rules.sh` 生成 CLAUDE.md/GEMINI.md 等各平台指令文件。
- **技能跨平台同步（源码确认）**：`.claude/skills/clone-website/SKILL.md` 是源，`scripts/sync-skills.mjs` 生成 .cline/.roo/.kiro 等平台副本。
- **并行隔离构建（README 确认）**：builder agent 在 git worktree 里并行干活，互不干扰，最后合并。
- **视觉 QA（README 确认）**：与原站截图做 visual diff。
- **目标栈**：Next.js 16 App Router + React 19 + TS strict + shadcn/ui + Tailwind v4（oklch tokens）+ Lucide（克隆时替换为提取的 SVG）。

## 5. 技术亮点与优势

1. **"单一指令源 + 同步脚本"的多 Agent 兼容术**：写一次 AGENTS.md，脚本生成所有平台副本——解决 13+ 编码平台指令重复维护的痛点。
2. **先规格后施工**：把"复刻网站"拆成可验证的 spec（精确 computed style），builder 不再靠猜，质量可控。
3. **git worktree 并行**：多 builder agent 在隔离 worktree 并行，最后合并——把"并行开发"工程化。
4. **视觉 diff 闭环**：构建后与原站做对比，形成质量回路。

## 6. 稳定性机制【重点】

- **规格先行降不确定性（README 确认）**：把"视觉复刻"这种高歧义任务，先转成精确 spec（computed CSS 值/状态/断点），再让 builder 照做——用"规格"替代"即兴"，从源头减少返工。
- **git worktree 隔离（README 确认）**：每个并行 builder 在独立 worktree，一个 builder 改坏不影响其他，最后统一合并——并行但不互相污染。
- **视觉 diff 验收（README 确认）**：Assembly & QA 阶段与原站对比，偏差可见。
- **质量门命令（README 确认）**：`npm run check` = lint + typecheck + build，每次产出可机器校验。
- **不足**：无 Agent 级重试/超时/熔断（这些由宿主 Agent 负责）；模板本身无运行时。

## 7. 高可用机制【重点】

- **并行度工程化（README 确认）**：Parallel Build 阶段按组件切分 worktree 并行，是一种"任务级并行"——但并发数/失败重试由宿主 Agent 决定，模板不做调度。
- **降级到自然语言触发**：README 说"若客户端用自然语言激活技能，说 `Clone <url> using the clone-website workflow` 即可"——对不支持 slash command 的平台提供兜底入口。
- **非服务端项目**：无集群/横向扩展；它的"高可用"体现在"跨 13+ 编码平台都能跑"的兼容性。

## 8. 自我进化机制【重点】

**不适用**。它是静态技能模板，无运行时自学习/记忆/反思。

- **最接近"进化"的是 sync 脚本**：维护者更新 `AGENTS.md`/`SKILL.md` 源，跑脚本重生成各平台副本——这是**人工维护、脚本同步**，不是 Agent 自动进化。
- **对 openmate 的启发**：把工作流固化成"规格 + 脚本"，让 Agent 每次按同一套流程跑，本身就是"流程标准化"而非"自我进化"。

## 9. openmate 可借鉴点【重点】

- **P0｜"单一指令源 + 同步脚本"跨平台**：openmate 若要在不同编码 Agent（Claude Code/Cursor/...）下用同一套开发规范，写一份 `AGENTS.md` 作源，脚本生成各平台副本。预期：规范改一处、全平台生效。
- **P0｜"先规格后施工"治歧义任务**：openmate 让 Agent 做模糊任务（如"复刻页面/改 UI"）前，先产出结构化 spec（精确值/状态/边界），再让 builder 照 spec 执行。预期：减少返工、质量可验证。
- **P1｜git worktree 并行子任务**：openmate 多子 Agent 并行改不同文件时，用 worktree/分支隔离，最后合并。预期：并行不互相踩。
- **P1｜视觉/结果 diff 验收**：构建类任务产出后，与目标做 diff 验收。预期：自动发现偏差。
- **P2｜技能文件作"工作流即代码"**：把可复用工作流写成 SKILL.md（含 frontmatter 描述），让 Agent 按需加载。预期：流程沉淀可复用。

## 10. 源码验证标注

**源码直接阅读（raw.githubusercontent.com @master）**：
- `README.md` 全文：五阶段流水线 mermaid、Parallel Build 用 git worktree、AGENTS.md 单一指令源 + `sync-agent-rules.sh`、SKILL.md + `sync-skills.mjs`、13+ 支持平台表、目标技术栈、`npm run check`、"No guessing" 全量内联 spec。

**来自文档/推断**：
- `AGENTS.md` 与 `.claude/skills/clone-website/SKILL.md` 的具体内容未读取（main 分支 raw 404，master 仅读 README）；其工作流细节依据 README 描述。
- builder agent 的实际派发/合并实现由宿主编码 Agent 完成，不在本仓库。

**源码不可得/未深入**：`AGENTS.md`、`SKILL.md`、两个 sync 脚本的具体实现未逐行读；如需复刻其流水线提示词，建议读取这三个源文件。
