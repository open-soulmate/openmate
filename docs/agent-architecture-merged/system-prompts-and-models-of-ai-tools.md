# System Prompts And Models Of Ai Tools

## 概述

- **项目名称**：System Prompts and Models of AI Tools（作者 x1xhlol）（https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools）

## 核心架构

- > 说明：未枚举 tree（GitHub API 限流 + README 安全策略拦截）。结构为基于项目性质的推断。
- - 主体：按工具/厂商组织的 Markdown 文件，每份记录某产品的 system prompt 全文与所用模型、参数。
- - 无代码模块、无构建流程、无可执行入口。
- - 代码规模：纯文本，数十~上百份提示词文档。
- - **编排模式**：**不适用**。无 ReAct / Plan-Execute / Multi-Agent / Workflow 编排——它只是别人 agent 的"配置快照"。

## 关键技术

- 1. **一手对比语料**：把多家头部 agent 的系统提示词放一起，是研究"产品级 prompt 设计"的稀缺材料。
- 2. **覆盖广**：编码工具、对话工具均收录。
- 3. **学习价值高**：可从中提炼通用的 system prompt 结构（角色/能力/约束/安全/格式）。

## 对openmate的启示

- - **P1｜system prompt 结构模板**：从这些一手案例中提炼通用骨架（角色定位 → 能力清单 → 工具使用规范 → 安全/禁忌 → 输出格式 → 示例），作为 openmate 系统提示的撰写模板。预期收益：站在头部产品的 prompt 设计肩膀上。
- - **P2｜横向对比做 prompt 选型**：openmate 设计自身 agent 行为约束时，可对照各家"如何禁止危险操作、如何要求先澄清再动手"的写法，择优整合。
- - **注意**：内容多为他厂泄露/逆向文本，**直接照抄有版权/合规风险**，仅作设计思路参考，不照搬原文。

## 参考来源

- 豆包
