# openmate 对标调研方法论

## 背景
- openmate：编码 Agent + 个人助手混合体
- 现状：已能跑，测试暴露问题，准备重构
- 目标：逐项目深读源码/架构文档，提炼稳定性、高可用、自我进化与可借鉴设计

## 产出分层
| 层级 | 范围 | 产出 |
|---|---|---|
| L1 深读报告 | Coding/个人 Harness + 关键框架/基础设施（约 25–30 个） | `reports/<slug>.md` 完整架构报告 |
| L2 结构化调研卡 | 其余项目 | `cards/<slug>.md` 一页卡 |
| L3 汇总 | 全部 | `synthesis/openmate-rewrite-blueprint.md` |

## L1 报告模板
```markdown
# <项目名> 架构调研报告
## 0. 元信息
仓库 / 星数 / 语言 / License / 定位一句话
## 1. 系统架构
- 顶层模块图（文字/mermaid）
- 进程/线程模型、事件循环
- 与 LLM 的调用链路
## 2. 核心机制深潜
- Agent Loop（规划/工具调用/停止条件）
- 工具系统（注册、schema、权限、并行）
- 上下文管理（压缩、文件、记忆）
- 状态与持久化
## 3. 稳定性 / 高可用
- 错误恢复、重试、超时
- 崩溃后如何续跑 / 会话恢复
- 隔离（沙箱、权限、子进程）
- 可观测（日志/trace/metrics）
## 4. 自我进化
- 记忆写入与召回
- 技能/插件扩展
- 评测与反馈闭环
## 5. 对 openmate 的借鉴
- 直接可抄（设计/代码路径）
- 应避免的坑
- 重构优先级建议（P0/P1/P2）
## 6. 源码阅读笔记
- 关键文件路径:行号
- 值得摘录的策略（系统提示、工具 policy）
```

## 评分维度（1–5）
1. 工具调用策略清晰度
2. 权限/安全边界
3. 容错与会话恢复
4. 上下文工程
5. 可扩展（技能/MCP）
6. 可观测与可评测
7. 生产可用成熟度

## 调研顺序（为 openmate 重构服务）
### Wave A — Coding/个人 Harness（稳定性优先）
1. openclaw/openclaw
2. anomalyco/opencode
3. anthropics/claude-code
4. NousResearch/hermes-agent
5. OpenHands/OpenHands
6. cline/cline
7. Aider-AI/aider
8. OpenInterpreter/open-interpreter
9. RooCodeInc/Roo-Code
10. continuedev/continue
11. block/goose
12. google-gemini/gemini-cli
13. openai/codex
14. deepseek-ai/deepseek-harness
15. earendil-works/pi

### Wave B — 多智能体 / Workflow
MetaGPT, AutoGen/AG2, CrewAI, LangGraph, OpenAI Agents SDK, MS Agent Framework, Google ADK, smolagents, DeerFlow, Agno, Dify, Langflow, Flowise, n8n

### Wave C — 基础设施
Mem0, Composio, e2b, Daytona, Firecrawl, MCP SDKs, Langfuse, AgentOps, browser-use, UI-TARS, gpt-researcher, STORM

### Wave D — 其余全量调研卡
覆盖名单剩余项目，确保 98 条无遗漏。

## 源码阅读方法
1. 先 README / docs/architecture / AGENTS.md
2. 再 entrypoint → agent loop → tools → state
3. 用 GitHub raw / blob 网页抓关键文件；必要时 git clone 浅克隆
4. 报告中必须出现具体路径与关键逻辑摘要，禁止空泛形容词

## openmate 当前痛点映射（重构关注点）
- 能跑但测试有各种问题 → 重点：错误处理、状态一致性、工具失败恢复
- 混合形态（编码+个人）→ 重点：Harness 与通用工具共存、权限分级
- 要自我进化 → 重点：记忆、技能、评测闭环
