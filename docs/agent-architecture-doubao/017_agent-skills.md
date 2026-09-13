# 017 · addyosmani/agent-skills 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 17 / GitHub Top 100 AI Agent 第 17 位
> 证据：`docs/skill-anatomy.md` 全文 + v0.6.9 文件树（jsDelivr CDN）。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | addyosmani/agent-skills |
| GitHub | https://github.com/addyosmani/agent-skills |
| Star | 约 93,798（初步清单） |
| 主语言 | JavaScript/Markdown（无运行时） |
| 当前版本 | 0.6.9（jsDelivr 实测，持续发版） |
| 作者 | Addy Osmani |

**一句话定位**：把资深工程师的工程纪律编码成一组**可移植的 Markdown 技能（SKILL.md）**，按 spec→build→test→review→ship 阶段组织，经 `npx skills add` 装进 Claude Code/Codex/Cursor/Gemini CLI/Copilot/OpenCode/Windsurf 等 70+ 宿主 Agent。

**目标用户**：希望编码 Agent 稳定遵守"先 spec、TDD、验证、质量门"的团队。

> ⚠️ 性质判定（源码确认）：与 ponytail 同类——**不是自包含 Agent 运行时**，纯技能/命令制品，依赖宿主 Agent 的工具能力。第 6/7 章按"运行时不适用"处理，分析其制品层的稳定性设计。

---

## 2. 源码结构总览（源码确认，v0.6.9 文件树）

```
agent-skills/
├── skills/<name>/SKILL.md      # ★ 每个技能一个目录，SKILL.md 唯一必需
│   ├── scripts/*.sh            #   可选：可执行辅助（#!/bin/bash, set -e）
│   └── references/*.md         #   可选：按需加载的参考材料
├── commands/                  # 斜杠命令：spec/build/test/review/ship/plan/
│                              #   constraints/code-simplify/webperf（.toml + .md 双格式）
├── agents/                    # 角色 agent：code-reviewer / security-auditor /
│                              #   test-engineer / web-performance-auditor
├── references/                # ★ 跨技能共享清单（testing/security/perf/a11y/DoD）
├── docs/                       # skill-anatomy / adoption-guide / 各宿主 setup / comparison
├── evals/fixtures/            # ★ 每个技能的评测场景（TDD、spec-driven、security-hardening...）
├── .claude-plugin/ .codex-plugin/ .gemini/commands/ .agents/plugins  # 多宿主适配
└── .github/workflows/test-plugin-install.yml  # CI 校验插件可安装
```

**入口**：宿主 Agent 启动时只把各技能的 `name + description` 注入系统提示；触发时才加载完整 `SKILL.md`（progressive disclosure）。

---

## 3. 系统架构分析

**编排模式：技能驱动（Skill-driven）+ 阶段化工作流。** 证据（源码确认，skill-anatomy.md）：
- **SKILL.md 契约**：frontmatter 必含 `name`（与目录同名、连字符）+ `description`（第三人称"做什么"+ "Use when X"触发条件，≤1024 字符）。强调 description **只写做什么/何时用，不写流程步骤**——否则 Agent 会照摘要走而不读全文。
- **标准章节**：Overview → When to Use（含 NOT for）→ Core Process（编号步骤，具体到 `npm test`）→ Common Rationalizations → Red Flags → Verification（可验证退出清单）。
- **阶段覆盖**：commands 即 spec/planning/build/test/review/ship/code-simplify/webperf，对应软件交付全生命周期；agents/ 是四个专职审查角色。

**核心设计——Common Rationalizations（反合理化表）**：这是本包最 distinctive 的设计（源码确认）。表格 `| Rationalization | Reality |`，把 Agent 偷懒时常用的借口（"这个简单到不用写 spec""测试以后补"）与逐条反驳并列，**防止 Agent 自圆其说地跳过关键步骤**。

---

## 4. 功能拆解

- **技能即工作流**：skill-anatomy 明确"Process over knowledge / Steps not facts"——技能是流程而非参考文档。
- **可执行脚本替代内联代码**：scripts 目录放 `.sh`，约定 `#!/bin/bash`、`set -e` fail-fast、stderr 写状态、stdout 写 JSON、临时文件 cleanup trap。理由（源码确认）："执行脚本不占上下文，只有输出占；内联代码块每次加载都付费"。
- **跨技能共享 references/**：把 testing/security/perf/a11y/Definition-of-Done 清单放仓库根，而非复制进每个技能，避免漂移（并诚实记录 per-skill 安装时的可移植性缺口 #361）。
- **评测 fixtures**：`evals/fixtures/` 为每个技能准备场景（如 TDD 的 BUG.md、security-hardening 的 webhook.js+test、incremental-implementation-pressure），可用来验证技能是否生效。
- **多宿主投影**：同一套命令投影为 `.toml`（gemini）/`.md`（claude）/各宿主插件目录。

---

## 5. 技术亮点与优势

1. **渐进披露（progressive disclosure）**：启动只加载 name+description；相关时才加载 SKILL.md（建议 <500 行）；更细材料放 supporting files，工作流走到才读。文件引用只链一层，避免链式加载。
2. **反合理化表**：把"Agent 会怎么偷懒"显式列出并配反驳，是对抗模型短视的工程化手法。
3. **验证即退出标准（Verification）**：每个 checkbox 必须可凭证据勾（测试输出/build 结果/截图），"Evidence over assumption"。
4. **token 经济学**：scripts 优于内联代码、保持 SKILL.md 精简、共享 references 防复制漂移。
5. **自带 evals**：技能包自己带 fixtures，可回归验证技能改动是否让 Agent 行为退化。

---

## 6. 稳定性机制【重点】

> **作为运行时：不适用**（纯 Markdown 制品）。以下为制品层的稳定性设计（源码确认）。

- **fail-fast 脚本约定**：scripts 强制 `set -e`，任一步非零即停——把稳定性下沉到宿主执行的脚本里。
- **可验证退出标准**：Verification 清单要求"每条都有证据"，本质是把"做完了没"从感觉变成可检查项，减少半成品交付。
- **Red Flags 自监控**：每个技能列出"违反本技能的可观察信号"，供 code review 与 Agent 自查。
- **CI 校验**：`.github/workflows/test-plugin-install.yml` 在发布前验证插件真的能被宿主安装——制品层的回归测试。
- **配置校验**：`required vs recommended` 明确 SKILL.md 契约（frontmatter 必含 name+description），格式错误及早暴露。

---

## 7. 高可用机制【重点】

> **作为运行时：不适用**（无服务端、无调度）。

- **零运行时依赖**：纯文件，不存在宕机/单点故障。
- **多宿主冗余**：同一份工作流投影到 70+ 宿主格式，单一宿主规范变化不影响其他。
- **可观测**：docs/comparison.md、adoption-guide.md 提供横向对比；evals 提供行为基线。

---

## 8. 自我进化机制【重点】

> **作为运行时：不适用**（静态技能包，不随使用自改）。

- **反合理化 = 内置 self-critique**：Rationalizations 表是预先写好的自我批判，但需 Agent 触发。
- **evals 闭环**：`evals/fixtures/` 让技能作者能 A/B 不同 SKILL.md 文案对 Agent 行为的影响——这是"技能进化"的评测回路（人驱动，非自动）。
- **跨技能引用**：技能间用 `Follow the \`test-driven-development\` skill` 互相引用而非复制，随单个技能更新而全局生效，近似"经验库的单点更新"。

---

## 9. openmate 可借鉴点【重点】

**P0｜SKILL.md 契约 + 渐进披露**
- 借鉴什么：只把技能 name+description（含"Use when"触发条件，≤1024 字符）常驻系统提示，正文按需加载；SKILL.md <500 行。
- 怎么用：openmate 把自家能力拆成"技能卡片"，系统提示里只放卡片索引，用到哪张才展开全文。
- 预期收益：长任务系统提示不膨胀，token 可控。

**P0｜Common Rationalizations 反合理化表**
- 借鉴什么：把 Agent 偷懒常用借口与反驳写成表格。
- 怎么用：openmate 的关键流程（如"必须先做校验""必须留测试"）旁边放一张"常见借口 vs 为什么不行"表，对抗模型走捷径。
- 预期收益：减少 Agent 偷工减料。

**P1｜验证退出标准必须可凭证据**
- 借鉴什么：每个 checkbox 对应一个可复现证据（命令输出/截图）。
- 怎么用：openmate 完成任务前跑一个 checklist，每项要求机器可验证的证据，而非"我觉得做完了"。
- 预期收益：交付质量一致。

**P1｜scripts 替代内联代码 + set -e**
- 借鉴什么：把重复操作写成脚本（fail-fast），上下文里只看输出。
- 怎么用：openmate 多端共用的工程操作（构建/检查）写成脚本，Agent 调脚本而非每次内联重写。
- 预期收益：省上下文、行为一致。

**P2｜跨技能共享 references 防漂移 + 自带 evals**
- 借鉴什么：共享清单放单一来源；每个技能配评测 fixtures。
- 怎么用：openmate 维护一份共享 DoD/安全清单；为关键技能配回归用例，改文案后跑一遍看行为是否退化。
- 预期收益：长期维护不腐化。

---

## 10. 源码验证标注

**源码直接阅读**（jsDelivr CDN v0.6.9）：
- 文件树：commands/、agents/、references/、docs/、evals/fixtures/、多宿主插件目录、CI workflow。
- `docs/skill-anatomy.md` 全文：SKILL.md frontmatter 契约、标准章节、Common Rationalizations/Red Flags/Verification、progressive disclosure、<500 行、scripts 约定（set -e/stdout JSON）、shared references、跨技能引用、Required vs Recommended。

**文档/推断**：
- "约 24 个技能""L1/L2/L3 渐进披露""70+ 宿主"来自初步架构笔记与 commands/agents 目录计数；具体技能正文（spec-driven-development、TDD 等）未逐个读取。
- Star 数未由 GitHub API 复核（本轮限流）。

**源码不可得**：各技能 SKILL.md 正文、`references/` 共享清单、evals 具体判分逻辑未逐字读取；未读取 GitHub API 元数据。
