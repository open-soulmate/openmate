# openmate 对标调研 · 进度索引

更新：2026-09-13 **质量重做中（第二轮）**

## 总览
| 指标 | 数量 | 说明 |
|---|---:|---|
| 名单项目 | 98 | |
| 有报告文件 | 98 | 100% 覆盖 |
| **第一波深读达标**（openclaw 级） | ~20 | 含路径/常量/失败路径 |
| **浅报告重做中** | ~79 | 4 路并行源码级重写 |

## 深度标准（达标线）
- 真实源码路径（raw.githubusercontent 可验证）
- 具体常量（超时/重试/队列/schema 版本）
- 失败路径（崩溃/工具错/超时/并发写）
- openmate P0/P1/P2 可落地建议
- 体量参考：≥250 行 / ≥15KB（对标 openclaw.md）

## 第一波已达标（可直接用）
openclaw, opencode, claude-code, hermes-agent, openhands, cline, aider, openai-codex, gemini-cli, open-interpreter, roo-code, continue, goose, deepseek-harness, pi, langgraph, autogen, crewai, deer-flow, …

## 重做中（进行中，勿以浅版为准）
nanobot, cowagent, librechat, anything-llm, open-webui, mem0, openai-agents, google-adk, metagpt, smolagents, browser-use, gpt-researcher, composio, litellm, mcp, n8n, dify 及其余 *-l1

## 关键入口
- 覆盖：`reports/COVERAGE-MATRIX.md`（后续将加「深度」列）
- 蓝图：`synthesis/openmate-rewrite-blueprint.md`
