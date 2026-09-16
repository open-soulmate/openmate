# OpenAI Agents SDK 功能研究

研究时间：2026-09-16 02:50
源码：github.com/openai/openai-agents-python（29451 stars，MIT）

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 多agent工作流 | ❌ | ❌ | 大 | 轻量级多agent框架 |
| Realtime语音agent | ❌ | 部分（voice） | 大 | gpt-realtime-2.1 |
| Guardrails | ❌ | 部分（immune） | 大 | 输入输出安全检查 |
| 人机协作 | ❌ | 部分 | 中 | HITL机制 |
| Sessions | ❌ | 部分 | 中 | 自动对话历史管理 |
| Tracing | ❌ | 部分 | 中 | 追踪+调试+优化 |
| 100+ LLM支持 | ✅ | ✅ | 小 | provider无关 |

## 可复用设计

1. **Guardrails模式**：输入输出双向安全检查，可配置规则
2. **Sessions自动管理**：跨agent run的对话历史自动维护
3. **Tracing内置**：无需外部工具即可追踪agent执行
