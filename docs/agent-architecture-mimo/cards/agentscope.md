# AgentScope

## 一句话定位
生产就绪的 Agent 框架：为越来越强的模型能力设计，利用推理与工具能力而非用严格 prompt 约束。

## 核心架构（5点）
1. **ReAct Agent**：推理-行动循环，结构化输出，实时中断/恢复，批量工具执行
2. **Toolkit**：Python 工具 + MCP 服务器 + Skills 统一管理，内置编码工具
3. **Context 中间件**：自动压缩、工具结果卸载、系统提示/RAG/记忆注入
4. **Permission & HITL**：细粒度工具权限、确认、bypass 模式
5. **Agent Service**：FastAPI 多租户多会话后端 + 预构建 Web UI

## 稳定性亮点
- 事件总线统一流式输出（推理/工具调用/多模态）
- 多种 Workspace/Sandbox：Docker/K8s/E2B/Daytona 等
- A2A 协议 + Pipeline 编排 + 实时语音 Agent

## 对 openmate 借鉴
1. **Middleware 可组合钩子**：回复/推理/执行/模型调用/权限/压缩均可插中间件
2. **Background Task Offloading**：长任务移后台，完成后唤醒 Agent 继续对话

## 链接
https://github.com/modelscope/agentscope
