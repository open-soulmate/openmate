# GPT Pilot

## 一句话定位
研究 LLM 能生成多少生产级代码的 AI 开发伴侣：多角色 Agent 流水线，开发者监督 5% 关键部分。

## 核心架构（4点）
1. **11 角色流水线**：Product Owner→Spec Writer→Architect→Tech Lead→Developer→Code Monkey→Reviewer→Troubleshooter→Debugger→Tech Writer
2. **逐步开发**：不是一次性生成全码库，而是像真实开发者一样一步步实现
3. **上下文过滤**：每轮 LLM 对话只注入当前任务相关代码，支持大规模项目
4. **SQLite/PostgreSQL**：项目与步骤状态持久化

## 稳定性亮点
- VS Code 扩展集成，可视化开发流程
- Reviewer 角色自动审查，错误回退给 Code Monkey
- ⚠️ 2025-08 至 2026-06 曾被植入供应链蠕虫（已移除），仓库不再活跃维护

## 对 openmate 借鉴
1. **多角色分工流水线**：比单一 Agent 更接近真实软件工程流程
2. **上下文按需注入**：不要把全码库塞进每轮对话，按任务过滤相关文件

## 链接
https://github.com/Pythagora-io/gpt-pilot
