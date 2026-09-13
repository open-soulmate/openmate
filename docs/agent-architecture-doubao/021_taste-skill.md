# Rank 21 — taste-skill 源码级调研报告

## 1. 项目概述与定位

| 项 | 内容 |
|---|---|
| 项目名称 | taste-skill（主技能名 `design-taste-frontend`） |
| GitHub | https://github.com/Leonxlnx/taste-skill |
| Star 数 | 约 86,700（榜单口径） |
| 主要语言 | JavaScript/Shell（实质内容为 Markdown 技能文件 + bash 注册表） |
| License | MIT（仓库根目录 `LICENSE`） |

**一句话定位**：一套面向前端生成的"审美纠偏 / 反 slop（anti-slop）"Agent 技能包，用结构化 Markdown 规则约束编码 Agent 产出不再千篇一律的平庸界面。

**目标用户/场景**：使用 Codex、Cursor、Claude Code、Copilot、Windsurf 等编码 Agent 的前端工程师。当 Agent 被要求生成落地页（landing page）、作品集（portfolio）或做 redesign 时，加载该技能以获得有设计感、非模板化的前端代码。

**成熟度**：仓库含 `CHANGELOG.md`（8KB），说明经历过多版本迭代；通过 `npx skills add` 分发，跨 70+ 宿主 Agent 安装；维护活跃（榜单 Top 级热度）。它本身**不是一个可运行的 Agent 系统**，而是一套"方法论层"提示资产，生命周期依附于宿主 Agent。

---

## 2. 源码结构总览

通过 GitHub Contents API 读取仓库根目录，得到如下结构（**源码确认**）：

```
taste-skill/
├── .claude-plugin/      # Claude Code 插件清单（hook/skill 注册元数据）
├── .github/             # CI/Issue 模板
├── assets/              # 示例图/参考图资产
├── examples/            # 输入/输出示例
├── research/            # 设计准则的研究笔记（design token、参考站点分析）
├── scripts/             # 安装/校验脚本
├── skills/              # ★ 核心：13 个子技能目录，每个含一个 SKILL.md
├── skill.sh             # ★ bash 技能注册表（本地 source 用）
├── README.md            # 说明（16KB）
├── CHANGELOG.md         # 版本记录
└── LICENSE
```

**核心源码文件清单**：
- `skill.sh`（897 字节）——本地技能注册表（**源码确认**）
- `skills/taste-skill/SKILL.md`（21.5KB）——主技能定义（**源码确认**）
- `skills/taste-skill-v1/SKILL.md`、`skills/gpt-tasteskill/SKILL.md`、`skills/image-to-code-skill/SKILL.md`、`skills/imagegen-frontend-web/SKILL.md`、`skills/imagegen-frontend-mobile/SKILL.md`、`skills/brandkit/SKILL.md`、`skills/redesign-skill/SKILL.md`、`skills/soft-skill/SKILL.md`、`skills/output-skill/SKILL.md`、`skills/minimalist-skill/SKILL.md`、`skills/brutalist-skill/SKILL.md`、`skills/stitch-skill/SKILL.md`（路径来自 `skill.sh`，**源码确认**）

**入口/启动流程**：没有进程入口。分发入口是 `skill.sh`——它是一个 bash 关联数组，把技能名映射到 SKILL.md 路径；`source ./skill.sh <name>` 时打印对应 SKILL.md 的路径，由宿主 Agent 读取该文件内容注入上下文。

**代码规模**：无传统意义代码。核心资产为 13 份 SKILL.md（每份 5–25KB），加安装脚本，总文本量约数百 KB。

---

## 3. 系统架构分析

**编排模式：技能驱动（Skill-driven / Progressive Disclosure），非独立 Agent 循环。**（**源码确认**）

该项目**不含任何 Agent 主循环、工具调用协议或 LLM 运行时**。它的"架构"是：把资深前端设计师的工程纪律编码为一份带 YAML frontmatter 的 Markdown，宿主 Agent（Claude Code/Codex 等）在被触发时把这份 Markdown 读进上下文，作为行为约束。

`skill.sh` 证明了这一点（**源码确认**，逐字关键段）：

```bash
declare -A SKILLS=(
  [taste-skill]="skills/taste-skill/SKILL.md"
  [gpt-taste]="skills/gpt-tasteskill/SKILL.md"
  [image-to-code-skill]="skills/image-to-code-skill/SKILL.md"
  ...
)
echo "${SKILLS[$1]}"   # 只返回文件路径，真正"执行"发生在宿主 Agent
```

**核心组件划分**：
1. **注册层**：`skill.sh`（本地）+ `.claude-plugin/`（Claude Code marketplace）——负责"技能名 → 文件路径"解析。
2. **知识层**：13 个 `SKILL.md`——纯声明式设计规则。
3. **资产层**：`assets/`、`examples/`、`research/`——参考图、样例、设计依据。

**数据流**（输入到输出）：
```
用户在宿主 Agent 中说"做一个落地页"
  → 宿主识别/用户加载 taste-skill
  → 宿主 Read skills/taste-skill/SKILL.md（把 21KB 规则读入上下文）
  → SKILL.md 第0节要求先做 "Design Read"（一句话推断页面类型/受众/风格）
  → 第1节设定三个旋钮 → 第2节选设计系统 → 第3/4节按默认架构与纠偏规则生成代码
  → 宿主调用自己的文件写入工具产出前端代码
```

**关键结构**（主 SKILL.md，**源码确认**）：
- YAML frontmatter：`name: design-taste-frontend`、`description: Anti-slop frontend skill...`
- `## 0. BRIEF INFERENCE`——"读空气"：先推断 page kind / vibe words / reference signals / audience / brand assets / quiet constraints
- `## 1. THE THREE DIALS`——三个全局旋钮：`DESIGN_VARIANCE: 8`、`MOTION_INTENSITY: 6`、`VISUAL_DENSITY: 4`，并用两张表（信号→旋钮、用例→预设）做映射
- `## 2. BRIEF → DESIGN SYSTEM MAP`——"何时用官方设计系统"对照表（Fluent/Material/Carbon/Polaris/Primer/GOV.UK/USWDS/shadcn/Tailwind）
- `## 3. DEFAULT ARCHITECTURE`——React/RSC/Tailwind v4/Motion/next/font 默认栈与状态管理红线
- `## 4. DESIGN ENGINEERING DIRECTIVES`——字体（禁用 Inter/Fraunces/Instrument_Serif 作为默认）、颜色（"LILA RULE" 禁 AI 紫渐变）、间距、斜体降部留白等纠偏规则

---

## 4. 功能拆解

- **Brief 推断（Read the Room）**：要求 Agent 先输出一行 `Reading this as: <page kind> for <audience>, with a <vibe>...`，再动手。模糊时只问**一个**澄清问题。
- **三旋钮参数化**：把"设计气质"抽象为 3 个 1–10 的连续变量（变化度/动效强度/视觉密度），全局唯一变量名，后续所有规则交叉引用同一变量，避免别名漂移。
- **真实设计系统路由表**：按 brief 关键词映射到官方包，并设"诚实规则"——不许手写复刻官方系统的 CSS。
- **Anti-Default 黑名单**：明确禁止 AI 默认审美（AI 紫渐变、居中 hero + 暗色网格、三张等宽 feature 卡、万能 glassmorphism、Inter+slate-900、Fraunces/Instrument_Serif）。
- **栈红线**：`min-h-[100dvh]` 替代 `h-screen`；CSS Grid 替代 flex 百分比数学；`useMotionValue` 替代 `useState` 追踪连续值；图标库优先 Phosphor 而非 Lucide。
- **技能族**：13 个子技能按场景细分（minimalist / brutalist / image-to-code / brandkit / redesign / imagegen-web/mobile 等），体现 progressive disclosure——主技能只放索引，按需加载子技能。

---

## 5. 技术亮点与优势

1. **"旋钮"把审美从主观感受变成可调参数**：三旋钮 + 信号映射表，让 Agent 不必在每次生成时重新"品味"，而是查表。源码中 `DESIGN_VARIANCE/MOTION_INTENSITY/VISUAL_DENSITY` 是全局唯一变量名，强制一致引用。
2. **Anti-default 清单直击 LLM 痛点**：不教"什么好看"，而是枚举"LLM 最常产出的丑默认值"并逐条禁止——这是对生成模型分布偏差的工程化对抗。
3. **Progressive disclosure 分层**：主 SKILL.md 只保留路由与三旋钮，13 个细分变体按需加载，控制上下文预算。
4. **与宿主解耦**：纯 Markdown + bash，无运行时依赖，可跨 Claude Code/Codex/Cursor/Copilot/Windsurf 移植。

差异化：相比一次性 prompt，它是**可版本化、可组合、可迭代**的"设计纪律即代码"。

---

## 6. 稳定性机制【重点】

**不适用（无运行时）。** 该项目是纯提示资产，没有进程、网络调用或状态，故不存在异常捕获/重试/超时/崩溃恢复等运行时稳定性问题。

但它把"稳定性"前移到**提示工程层**，这一点值得说明（**源码确认**）：
- **输出一致性**：`COLOR CONSISTENCY LOCK`（选定 accent 后整页锁定）、`One system per project`、`One family per project`（图标/字体不许混用）——用规则消除 Agent 在长生成中的风格漂移。
- **输入校验**：`3.F Dependency Verification (mandatory)`——引入任何三方库前先查 `package.json`，缺则先输出安装命令，"Never assume a library exists"，对应 Agent 的边界输入校验。
- **歧义处理**：模糊 brief 只问**一个**问题，禁止多问，避免死循环。

这些是"面向生成稳定性"的设计，而非运行时容错。

---

## 7. 高可用机制【重点】

**不适用（无服务端）。** 项目无并发调度、无服务部署、无横向扩展。其"高可用"体现为**分发层韧性**：`skill.sh` 用 bash 关联数组做本地解析，`.claude-plugin/` 走 marketplace，多宿主适配意味着不绑定单一 harness，单个宿主故障不影响技能资产本身。

---

## 8. 自我进化机制【重点】

**部分适用**。该项目本身不会在运行时自学习，但它是"设计判断力"被显式沉淀、版本化进化的范本：
- **经验沉淀为规则**：`research/` 目录记录"为什么禁 Fraunces""为什么禁 AI 紫"的设计依据，把一次性审美判断变成可复用、可审阅的条目。
- **版本化进化**：`CHANGELOG.md` + `taste-skill-v1`/`taste-skill` 双版本并存，让规则集可回滚、可 A/B。
- **行为调整靠规则迭代而非权重更新**：每次发现新的"AI tell"就往黑名单加一条，是一种**确定性、可审计**的技能进化路径。

它不做 self-reflection、无向量记忆、无在线学习——这些能力都在宿主 Agent 侧。

---

## 9. openmate 可借鉴点【重点】

openmate 是 Python 开发、已有 Web 版、规划桌面/手机多端的 AI Agent 应用。该技能包对它的借鉴价值集中在"提示/技能工程"层面：

- **【P0】采用 SKILL.md + frontmatter 的渐进披露技能格式**。把 openmate 的领域知识（如用户偏好、写作风格、排障流程）拆成"主索引 + 按需子技能"的 Markdown，而非塞进一个巨型 system prompt。直接收益：上下文窗口可控、可版本化、可被桌面/手机/Web 三端共享同一份技能资产。
- **【P1】用"旋钮/参数表"把模糊指令变成显式变量**。openmate 做多端 UI 或文案生成时，可学三旋钮模式（如 `TONE`/`DETAIL_LEVEL`/`FORMALITY`），用信号→参数映射表替代每次重新 LLM 推断，降低多端输出不一致。
- **【P1】建立"Anti-default 黑名单"**。针对 openmate 最常犯的输出问题（固定模板、套话、AI 味），像本项目枚举 LLM 默认丑值一样，显式列禁令+反例，比"写得自然一点"这种软提示有效得多。
- **【P2】技能即代码、走 git 版本化与 CHANGELOG**。让 prompt/技能资产像代码一样 PR、review、回滚，而不是散落在配置里。

---

## 10. 源码验证标注

**来自源码直接阅读**：
- 仓库根目录结构（GitHub Contents API）：`.claude-plugin/`、`skills/`、`skill.sh`、`README.md`、`CHANGELOG.md` 等。
- `skill.sh` 全文（raw.githubusercontent.com）：13 个技能名→SKILL.md 路径的 bash 关联数组。
- `skills/taste-skill/SKILL.md` 前 ~4000 字符：YAML frontmatter、三旋钮（`DESIGN_VARIANCE/MOTION_INTENSITY/VISUAL_DENSITY`）、Brief 推断、设计系统路由表、栈红线、字体/颜色纠偏规则。

**来自文档/推断**：
- 13 个子技能的具体内部内容未逐一读取（仅由 `skill.sh` 路径清单确认存在）。
- "跨 70+ 宿主安装""npx skills add 分发"来自 README/榜单说明，未在本次逐字核对。
- 86.7k star 数为榜单口径。

**源码不可得部分**：`.claude-plugin/` 具体清单、`research/` 与 `examples/` 内容未读取；不影响架构判断。
