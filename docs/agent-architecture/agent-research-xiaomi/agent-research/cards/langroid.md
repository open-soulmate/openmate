# Langroid

## 一句话定位
CMU/UW-Madison 研究者的直觉轻量多 Agent 框架：Agent+Task 消息传递范式，不依赖 Langchain。

## 核心架构（4点）
1. **Agent 即消息转换器**：封装 LLM 状态 + 可选向量库 + 工具，默认 3 种 responder（LLM/Agent/User）
2. **Task 包装 Agent**：管理迭代循环，层级递归任务委派
3. **ToolMessage**：Pydantic 定义工具，与 OpenAI Function Calling 同接口，任何 LLM 可用
4. **MCP 适配器**：将 MCP 服务器工具转为 Langroid ToolMessage

## 稳定性亮点
- 消息 lineage 追踪：可回溯消息来源
- 无限循环检测（cycle-length ≤ 10）
- Redis 缓存 LLM 响应，max_cost/max_tokens 预算控制

## 对 openmate 借鉴
1. **Task 递归委派**：子任务就是额外的 responder，round-robin 轮询，架构极简
2. **Pydantic 工具定义**：不用手写 JSON Schema，LLM 输出格式错误时 Pydantic 错误信息自动回传修正

## 链接
https://github.com/Langroid/langroid
