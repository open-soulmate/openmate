# Lagent

## 一句话定位
InternLM 轻量 Agent 框架：PyTorch 风格设计，Agent 即层、消息即传递，支持同步/异步双接口。

## 核心架构（4点）
1. **AgentMessage 统一通信**：所有组件用同一消息结构体通信
2. **Memory as State**：输入输出自动入记忆，`__call__` 而非 `forward` 处理
3. **ActionExecutor**：工具执行器，与 Agent 同构通信，Hook 转换消息
4. **双接口**：同步（调试）/异步（大规模推理），前缀 `Async`

## 稳定性亮点
- session_id 隔离：并发时独立记忆/LLM 请求/工具环境
- ToolParser 灵活解析工具调用输出
- 支持 vLLM/LMDeploy/GPTAPI 等多种后端

## 对 openmate 借鉴
1. **同步/异步双接口**：调试用同步，生产用异步，同一套 API
2. **session_id 隔离设计**：并发场景下每个会话独立 IPython 环境等资源

## 链接
https://github.com/InternLM/lagent
