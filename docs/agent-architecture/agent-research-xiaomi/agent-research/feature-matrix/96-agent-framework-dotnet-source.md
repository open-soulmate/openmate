# agent-framework-dotnet (#96) —— 结论级销账：CSV条目失实，仓库不存在

> 2026-09-17核实：github.com/microsoft/agent-framework-dotnet **404不存在**（GitHub search API total_count=0）。
> 真相：.NET实现在 **microsoft/agent-framework 仓库的 `dotnet/` 目录内**（monorepo：dotnet/+python/+schemas/+declarative-agents/），与#80 microsoft/agent-framework是同一仓库。
> #80已做源码级深读（80-ms-agent-framework-source.md，20项，Python侧）。本条目按结论级销账，不重复研究。

## 与#80研究的关系
- MAF双语言框架：Python与C#/ .NET实现"consistent APIs"（README原文）——dotnet/目录是Python侧的API对齐镜像。
- #80已覆盖的核心能力（审批恢复契约spec 004/tool_with_arguments参数粒度审批/SecretString/feature-usage-bit遥测位/Workforce任务市场等）在dotnet侧同构存在。
- README提及dotnet独有关注点：middleware、orchestration patterns（sequential/concurrent/handoff/group collaboration+checkpointing/streaming/HITL/time-travel）均有.NET实现。

## 结论
- **CSV第96行应修正**：microsoft/agent-framework-dotnet → 并入#80 microsoft/agent-framework（dotnet/子目录）。
- 方法论教训（与#84 cursor-cli同类）：**CSV条目需先验证仓库存在性**——本CSV已有2条失实（84闭源/96不存在）。
- 对OpenMate/OpenSoul无新增功能差距（已被#80覆盖）。
