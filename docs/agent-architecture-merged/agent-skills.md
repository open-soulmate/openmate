# Agent Skills

## 概述

Agent Skills 是一个Agent技能管理系统。

**仓库**: https://github.com/addyosmani/agent-skills | **语言**: JavaScript

## 核心架构

**编排模式：技能驱动（Skill-driven）+ 阶段化工作流。** 证据（源码确认，skill-anatomy.md）：
- **SKILL.md 契约**：frontmatter 必含 `name`（与目录同名、连字符）+ `description`（第三人称"做什么"+ "Use when X"触发条件，≤1024 字符）。强调 description **只写做什么/何时用，不写流程步骤**——否则 Agent 会照摘要走而不读全文。
- **标准章节**：Overview → When to Use（含 NOT for）→ Core Process（编号步骤，具体到 `npm test`）→ Common Rationalizations → Red Flags → Verification（可验证退出清单）。
- **阶段覆盖**：commands 即 spec/planning/build/test/review/ship/code-simplify/webperf，对应软件交付全生命周期；agents/ 是四个专职审查角色。

**核心设计——Common Rationalizations（反合理化表）**：这是本包最 distinctive 的设计（源码确认）。表格 `| Rationalization | Reality |`，把 Agent 偷懒时常用的借口（"这个简单到不用写 spec""测试以后补"）与逐条反驳并列，**防止 Agent 自圆其说地跳过关键步骤**。

---

## 关键技术

1. **渐进披露（progressive disclosure）**：启动只加载 name+description；相关时才加载 SKILL.md（建议  **作为运行时：不适用**（纯 Markdown 制品）。以下为制品层的稳定性设计（源码确认）。

- **fail-fast 脚本约定**：scripts 强制 `set -e`，任一步非零即停——把稳定性下沉到宿主执行的脚本里。
- **可验证退出标准**：Verification 清单要求"每条都有证据"，本质是把"做完了没"从感觉变成可检查项，减少半成品交付。
- **Red Flags 自监控**：每个技能列出"违反本技能的可观察信号"，供 code review 与 Agent 自查。
- **CI 校验**：`.github/workflows/test-plugin-install.yml` 在发布前验证插件真的能被宿主安装——制品层的回归测试。
- **配置校验**：`required vs recommended` 明确 SKILL.md 契约（frontmatter 必含 name+description），格式错误及早暴露。

> **作为运行时：不适用**（无服务端、无调度）。

- **零运行时依赖**：纯文件，不存在宕机/单点故障。
- **多宿主冗余**：同一份工作流投影到 70+ 宿主格式，单一宿主规范变化不影响其他。
- **可观测**：docs/comparison.md、adoption-guide.md 提供横向对比；evals 提供行为基线。

> **作为运行时：不适用**（静态技能包，不随使用自改）。

- **反合理化 = 内置 self-critique**：Rationalizations 表是预先写好的自我批判，但需 Agent 触发。
- **evals 闭环**：`evals/fixtures/` 让技能作者能 A/B 不同 SKILL.md 文案对 Agent 行为的影响——这是"技能进化"的评测回路（人驱动，非自动）。
- **跨技能引用**：技能间用 `Follow the \`test-driven-development\` skill` 互相引用而非复制，随单个技能更新而全局生效，近似"经验库的单点更新"。

---

## 对openmate的启示

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 豆包（017_agent-skills.md）
