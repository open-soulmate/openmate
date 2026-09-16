# OpenAI Agents JS（#89, 5k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/openai-agents-js（23MB，源码级深读）

Python版openai-agents（#17）已研究，本篇聚焦JS独有件。monorepo：agents-core/agents-openai/agents-realtime/agents-extensions。

## 功能清单（JS独有/差异项）
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. Realtime语音Agent全家桶（realtimeAgent+realtimeSession+**三种transport：WebRTC/WebSocket/SIP**+responseCreateSequencer乱序重组+shims） | 无 | 无 | 完全没有 | 语音入口（电话SIP=政企呼叫中心集成）；OpenMate可先做WS版语音会话 |
| 2. Realtime专用guardrail（语音流上的护栏，clientMessages级） | 无 | 无 | 完全没有 | 流式输出侧护栏——与agent-zero输出侧审计门互证（第2方） |
| 3. memory/session+memorySession+**historyMutations**（会话历史的结构化变更操作） | 无 | hippo | 部分有 | 历史编辑原语（删/改/合并条目）——会话fork/undo的底层 |
| 4. Editor接口（editor.ts：结构化输出的编辑器抽象） | 无 | 无 | 完全没有 | 结构化结果的字段级编辑 |
| 5. AgentHooks/RunHooks双层生命周期钩子 | 无 | 无 | 完全没有 | 与claude-code 33 hook、DeerFlow middleware互证 |
| 6. handoffFilters/handoffPrompt扩展（切换目标agent时过滤历史/改写提示词，策略化filter链） | 无 | **agent_collaboration.py已有handoff_context**：关键词overlap粗过滤+removed_sections返回+兜底保留前1/3 | 部分有 | OpenSoul是关键词版，升级方向：按目标agent权限/工具集过滤（openai-agents的filter链模式）|
| 7. agentToolSourceRegistry（工具来源注册——工具从哪个源加载的可追溯） | 无 | 无 | 完全没有 | 工具供应链溯源 |
| 8. mcpToolCache（MCP工具schema缓存，免重复握手） | 无 | 无 | 完全没有 | MCP冷启动优化 |
| 9. 浏览器安全凭证设计（长期key禁入browser bundle，短时client credential流） | 无 | 无 | 参考 | OpenMate前端直连LLM时的凭证纪律 |
| 10. AGENTS.md强制技能工作流（$implementation-strategy/$code-change-verification等6个仓库技能，改动SDK行为前必须走） | 无 | 无 | **行业信号** | OpenAI自己的仓库用"强制skill+scope contract+独立review"管理agent改代码——skills范式被官方背书 |

## 源码亮点
- responseCreateSequencer：Realtime API响应事件可能乱序到达，按sequence number重组——语音流工程细节
- 贡献者指南的"安全敏感变更清单"（认证/工具审批/MCP执行/沙箱/持久化/日志/追踪全列）——agent改这些必须人工review，可抄进OpenSoul immune策略

## 可复用设计
1. handoffFilters → OpenSoul multi_agent.py升级：委派子agent时按权限过滤父历史
2. mcpToolCache → OpenSoul mcp/client工具schema缓存
3. Realtime WS transport → OpenMate语音输入最小实现路径
4. 强制skill工作流 → OpenMate/OpenSoul仓库治理参考
