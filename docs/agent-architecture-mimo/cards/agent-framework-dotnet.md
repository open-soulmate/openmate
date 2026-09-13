# Agent Framework (.NET)

## 一句话定位
微软 Agent Framework 的 .NET 实现：MAF 在 .NET 栈上的 Agent/编排运行时。

## 核心架构（4点）
1. **与 MAF 对齐**：Python/Java 同一产品线的 .NET 绑定
2. **Agent 抽象 + 工具**：延续 SK Kernel/Plugin 思路
3. **多 Agent 编排**：支持协作与流程式组合
4. **A2A / MCP 互操作**：跨运行时与工具协议

## 稳定性亮点
- 面向企业 .NET 进程内集成
- 官方 1.0 强调稳定 API 与长期支持（相对 SK 迁移期）
- 与 Azure 生态衔接自然

## 对 openmate 借鉴
1. **多语言 SDK 对齐同一概念模型**：若未来扩展，API 词表要先统一
2. **跨 runtime 用标准协议（MCP/A2A）而不是私有 RPC**

## 链接
https://github.com/microsoft/agent-framework-dotnet
