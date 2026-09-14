# LibreChat

## 一句话定位
自托管统一 AI 聊天平台：聚合主流 provider + Agents/MCP + 企业级多用户认证。

## 核心架构（4点）
1. **多 Provider 统一**：Anthropic/AWS Bedrock/OpenAI/Azure/Google/Vertex + 任意 OpenAI 兼容端点
2. **LibreChat Agents**：无代码自定义助手 + Marketplace + MCP + Skills + Subagents
3. **Code Interpreter API**：沙箱执行 Python/Node/Go/C++/Java/PHP/Rust/Fortran
4. **Resumable Streams**：断线自动重连续传，多标签/多设备同步

## 稳定性亮点
- Redis 水平扩展 + OpenTelemetry/Langfuse 可观测
- Admin Panel 热更新角色/组权限，无需重新部署
- 手动 Context Compaction：上下文未满时主动摘要压缩

## 对 openmate 借鉴
1. **Skills 捆绑包（SKILL.md）**：可复用指令包，支持手动/自动/常开三种激活模式
2. **Resumable Streams**：长任务断线恢复是生产级聊天的硬需求

## 链接
https://github.com/danny-avila/LibreChat
