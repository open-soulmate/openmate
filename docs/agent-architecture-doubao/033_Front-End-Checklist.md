# Front-End Checklist 源码级调研报告（Rank 33）

> 调研对象：`thedaviddias/Front-End-Checklist`
> 报告日期：2026-09-13　｜　数据基线：GitHub `master` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Front-End Checklist |
| GitHub | https://github.com/thedaviddias/Front-End-Checklist |
| Star | 约 7.4w（清单快照 74,126） |
| 主要语言 | MDX / Markdown（清单站 frontendchecklist.io） |
| 一句话定位 | **现代 Web 开发的上线前检查清单：HTML/CSS/JS/性能/无障碍/SEO/安全/隐私的成百上千条规则，同时面向人类开发者与 AI Agent** |

**目标用户/场景**：前端开发者上线前自查；现在还通过 **MCP** 让 AI Agent 直接做前端代码审查。

**成熟度**：长期维护的知名清单（frontendchecklist.io）。最新版本提供 MCP 服务（`search_rules`/`get_workflow`/`get_checklist_rules`）与 skills 接入，把静态清单升级成了"Agent 可查询的规则库"。

---

## 2. 源码结构总览

经 README（raw HTTP 200）确认，它本质是一组分类规则（每类后面标注条数）：

```
Checklist 分类（规则条数，README 文档确认）：
- HTML (25) · CSS (32) · JavaScript (26)
- Performance (43) · Accessibility (95) · SEO (94)
- 另含 Security / Privacy / i18n / Images / Testing 等
```

**入口**：在线站 frontendchecklist.io；或接 MCP 让 Agent 查询。优先级图例：`Critical`（站点破坏/合规/安全，先修）与 `High`（体验/无障碍/性能/可发现性重大影响）。

---

## 3. 系统架构分析

**编排模式：不适用（规则知识库 + MCP 工具封装）**。它不是 Agent，而是一个**结构化规则库**。其"架构"是：Markdown/MDX 规则 → 站点渲染 → MCP 工具暴露为可调用函数（`search_rules`、`get_workflow`、`get_checklist_rules`），供任何 MCP 兼容 Agent（Claude Code 等）在做前端审查时查询。

**数据流**：用户让 Agent "审计某站无障碍/性能/SEO" → Agent 调 `search_rules` 检索相关规则 → `get_checklist_rules` 拉取对应类目 → 逐条核对 → 给出整改清单。

---

## 4. 功能拆解

- **分类规则库**：覆盖 HTML/CSS/JS/性能/无障碍(95 条)/SEO(94 条) 等。
- **优先级标注**：Critical / High 两级，指导修复顺序。
- **MCP 工具**：`search_rules`（按主题检索规则）、`get_workflow`/`get_checklist_rules`（拉审计工作流或类目规则集）。
- **Skills**：可按单一关注点（如 `https` 安全）做专项审查。

---

## 5. 技术亮点与优势

1. **把领域知识变成 Agent 可调用工具**：原本是静态清单，MCP 化后成为"前端审查 Agent"的规则后端——这是"领域专家知识 → 可被 LLM 精确检索"的范式。
2. **规则带优先级**：Critical/High 让 Agent 能排序输出，而非一股脑罗列。
3. **覆盖面广、成熟**：十年积累的规则，可信度高。
4. **对 openmate 的启发**：把自己的领域规范/最佳实践也做成 MCP 规则库，让 Agent 审查有据可依。

---

## 6. 稳定性机制【重点】

**不适用（非运行时）**。它是规则内容与一个薄 MCP 封装，不含 Agent 主循环、重试、超时、崩溃恢复逻辑。规则本身是静态文本，无在线故障面。

---

## 7. 高可用机制【重点】

**不适用**。无服务化调度、无并发、无分布式。MCP 封装的可靠性取决于宿主 Agent 与 MCP 传输层，不在本仓库。

---

## 8. 自我进化机制【重点】

**不适用（运行时意义上）**。规则库由人类社区 PR 持续扩充（外部演进），不具备 Agent 运行时的反思/记忆/自学习回路。

---

## 9. openmate 可借鉴点【重点】

- **【P0】把"产品规范"做成 MCP 规则库**：openmate 若有自己的代码规范、交互规范、上线检查项，可仿照其 `search_rules/get_checklist_rules` 做成 MCP 工具，让编码 Agent 自检时有据可依，而非凭模型记忆瞎审。
- **【P1】规则带 Critical/High 优先级**：openmate 内置审查/诊断功能时，输出问题务必分级，避免"列出 50 个问题让用户无所适从"。
- **【P2】"先 search_rules 再 get_workflow"的两步检索**：先窄检索再拉工作流，能显著省 token、提准度；openmate 的 RAG 也可采用"检索→取集合"两段式。

---

## 10. 源码验证标注

- **文档确认**：分类与条数、Critical/High 优先级、MCP 工具名（search_rules/get_workflow/get_checklist_rules）、skills 用法（README 全文，raw HTTP 200）。
- **推断**：MCP server 的具体实现文件未读（README 仅描述用法）。
- **非 Agent 项目结论**：第 6/7/8 章标"不适用"。
