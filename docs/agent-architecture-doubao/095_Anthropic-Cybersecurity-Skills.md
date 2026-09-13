# Rank 95：mukul975/Anthropic-Cybersecurity-Skills 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：Anthropic-Cybersecurity-Skills（GitHub: https://github.com/mukul975/Anthropic-Cybersecurity-Skills ）
- **Star 数**：约 32.7k（快照值）
- **主要语言**：Markdown（技能库）+ 少量 Python 校验/脚本
- **一句话定位**：一套结构化的**网络安全技能库**，把安全分析师操作手册打包成 800+ 个遵循 agentskills.io / SKILL.md 标准的技能目录，供支持该标准的 Agent（Claude Code、Codex、Cursor、Gemini CLI、LangChain/CrewAI/AutoGen）零配置加载。
- **目标用户/场景**：安全运营（SOC）、红蓝队、合规审计；需要把领域 SOP 注入 Agent 上下文的团队。
- **项目成熟度**：内容型仓库，覆盖 29 个安全领域、817 个技能（架构说明），映射 MITRE ATT&CK / NIST CSF 2.0 / MITRE ATLAS / D3FEND / NIST AI RMF 等框架；自带 `tools/validate-skill.py` 校验工具。
- **分类**：资源集合 / 非 Agent 项目。它**不是运行时**，而是被 Agent 消费的知识包。

## 2. 源码结构总览

```
Anthropic-Cybersecurity-Skills/
├── README.md          # 22.9KB，总说明
├── SECURITY.md
├── mappings/          # ★ 框架映射（MITRE ATT&CK/NIST CSF...）
├── tools/
│   ├── README.md
│   └── validate-skill.py   # ★ 校验 SKILL.md 合规性
└── skills/            # ★ 817 个技能目录
    └── <skill-name>/
        ├── SKILL.md       # ★ YAML frontmatter + Markdown 正文（核心）
        ├── LICENSE
        ├── references/    # 可选：参考文档（如 api-reference.md）
        ├── scripts/       # 可选：agent.py 等可执行脚本
        └── assets/        # 可选：template.md 等模板
```

**核心文件（本次实际读取）**：`skills/building-threat-hunt-hypothesis-framework/SKILL.md`（全文）；从扁平清单确认 `tools/validate-skill.py`、`mappings/` 与各技能子结构。

## 3. 系统架构分析

**编排模式：不适用**。这是静态知识资源包，没有 Agent 循环、不调用 LLM、不做工具调用决策。它的"架构"是**目录约定**：每个技能是一个文件夹，`SKILL.md` 是入口。

**SKILL.md 标准格式（源码确认，读取样例全文）**：
- **YAML frontmatter 元数据**：
  - `name`、`description`（自然语言描述用途 + "Use when..."触发条件）、`domain: cybersecurity`、`subdomain: threat-hunting`、`tags[]`、`version`、`author`、`license`；
  - **框架映射字段**：`nist_csf: [DE.CM-01, ...]`、`mitre_attack: [T1071, T1059.001, ...]`——把技能挂到权威安全框架节点上，支持按框架检索/索引。
- **Markdown 正文**：固定小节——`## When to Use`（触发条件）、`## Prerequisites`（前置条件）、`## Workflow`（编号步骤）、`## Key Concepts`（概念表）、`## Tools & Systems`（工具表）、`## Common Scenarios`、`## Output Format`（输出模板）。

**关键设计**：`description` 字段是 Agent 的**路由依据**——Agent 靠它判断"何时该加载这个技能"；正文则是被加载后注入上下文的操作手册。

## 4. 功能拆解

- **817 个技能 × 29 领域**：威胁狩猎、事件响应、红蓝队、云安全、K8s/terraform 审计、取证、漏洞管理、合规（SOC2）、供应链等。
- **六大框架映射**：MITRE ATT&CK、NIST CSF 2.0、MITRE ATLAS、D3FEND、NIST AI RMF、MITRE F3（架构说明），`mappings/` 维护技能↔框架节点关系。
- **可携带资源**：部分技能带 `references/`（api-reference）、`scripts/agent.py`、`assets/template.md`，技能自包含。
- **合规校验**：`tools/validate-skill.py` 校验 SKILL.md 结构合规。

## 5. 技术亮点与优势

1. **SKILL.md 开放标准**：与 Claude Code / Gemini CLI / Codex 等通用的技能目录格式对齐，Agent 生态一旦支持该标准即可零配置消费，不绑定特定框架。
2. **元数据驱动的可检索性**：frontmatter 的 `tags` + `domain/subdomain` + `mitre_attack`/`nist_csf` 让技能库可被按框架、按场景索引与路由。
3. **正文模板化工位**：When to Use / Prerequisites / Workflow / Output Format 让每个技能都是"可执行的 SOP"，而非零散笔记。
4. **领域纵深**：单一垂直领域做到 800+ 技能，并映射权威框架，是"领域知识包"的规模化样板。

## 6. 稳定性机制【重点】

**不适用**。本项目是静态 Markdown 资源，无运行时、无异常处理、无重试/超时/崩溃恢复概念。
- 其"稳定性"体现在内容工程：`tools/validate-skill.py` 对 SKILL.md 做结构校验、`SECURITY.md` 给出使用边界、每个技能带 `LICENSE`——保证技能包本身格式一致、可审计。
- Agent 加载它时的稳定性由宿主 Agent（Claude Code 等）负责，与本库无关。

## 7. 高可用机制【重点】

**不适用**。无服务端、无并发、无分布式。作为静态 Git 仓库，可用性等同于 GitHub/CDN 静态分发；被 Agent 加载时是"读文件注入上下文"，不涉及容错/扩缩容。

## 8. 自我进化机制【重点】

**不适用（无运行时自进化）**。技能库本身不会自动学习：
- 技能是人工编写/审核的静态内容；`version: '1.0'` 是人工版本号，不是自动迭代；
- 它不记录使用反馈、不自动改写技能、不评估效果。
- **反向价值**：它示范了一种"领域知识如何结构化沉淀给 Agent"的范式——这对 Agent 的"技能进化"章节（如何把经验写成可复用 SKILL.md）是直接参考素材。

## 9. openmate 可借鉴点【重点】

- **P0｜采用 SKILL.md 单文件技能格式作为 openmate 技能标准**：openmate 的技能/提示词包直接仿此——frontmatter 放 `name`/`description`/`tags`/`trigger`，正文放 When to Use / Workflow / Output Format。Agent 靠 description 路由、靠正文获得 SOP。预期：技能可跨 Claude Code/Gemini CLI 复用、可被自己的技能检索器索引。
- **P0｜description 即路由**：把"何时使用该技能"写进 description（含 "Use when..."），让 Agent 自动判断加载时机，而非用户显式调用。预期：技能库大了仍可用。
- **P1｜技能自包含 + references/scripts/assets**：openmate 的技能除了正文，可携带参考文档、脚本、模板，做到加载即完整。预期：复杂任务不靠临时查网。
- **P1｜技能校验器**：写一个 `validate_skill.py` 检查 frontmatter 必填、正文小节齐全，保证团队/社区贡献的技能格式一致。预期：技能库不腐化。
- **P2｜领域框架映射**：openmate 若做垂直领域（如你的业务），可把技能挂到领域分类标签上做索引。预期：可按业务维度检索技能。

## 10. 源码验证标注

**源码直接阅读**：
- `skills/building-threat-hunt-hypothesis-framework/SKILL.md` 全文：确认 YAML frontmatter（name/description/domain/subdomain/tags/version/nist_csf/mitre_attack）与正文小节（When to Use/Prerequisites/Workflow/Key Concepts/Tools & Systems/Common Scenarios/Output Format）。
- 扁平文件清单确认 `skills/<name>/{SKILL.md,references/,scripts/agent.py,assets/,LICENSE}` 目录约定、`mappings/`、`tools/validate-skill.py`。

**来自文档/推断**：
- "817 个技能 / 29 领域 / 六大框架映射"的具体数字与框架清单，依据 README 与已查证架构说明，未逐一统计。
- `validate-skill.py` 的具体校验规则未读。

**源码不可得/未深入**：mappings/ 内框架映射表细节、validate-skill.py 实现；本仓库为静态内容，无运行时源码可深入。
