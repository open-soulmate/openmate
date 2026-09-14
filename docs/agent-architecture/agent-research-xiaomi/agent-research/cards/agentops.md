# AgentOps

## 一句话定位
面向 LLM Agent 的可观测与会话回放平台：记录轨迹、评估与调试多步 Agent。

## 核心架构（4点）
1. **Session/Trace 模型**：把一轮 Agent 运行组织成可回放树
2. **轻量 SDK**：装饰器/初始化即可捕获 LLM 与工具调用
3. **回放 UI**：时间线查看每步输入输出与错误
4. **评估与测试**：对 Agent 行为做回归与指标

## 稳定性亮点
- 专为多步工具循环设计，而不是只盯单次 completion
- 失败步可定位到具体 tool call，便于修 runtime 而非瞎改 prompt
- 与 LangOps/Langfuse 类工具互补或并存

## 对 openmate 借鉴
1. **每轮必带 session/run/trace id**：短命进程也要保证 flush
2. **回放优先于日志墙**：调试稳定性用时间线，不用 grep 文本

## 链接
https://github.com/AgentOps-AI/agentops
