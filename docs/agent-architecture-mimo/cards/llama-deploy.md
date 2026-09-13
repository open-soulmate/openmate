# LlamaDeploy

## 一句话定位
run-llama 的 Agent/Workflow 部署层：把 LlamaIndex Workflows 服务化并管理会话。

## 核心架构（4点）
1. **Workflow 服务化**：本地编排代码可部署为远程服务
2. **会话与任务管理**：长任务与多轮交互的运行容器
3. **与 LlamaIndex Workflows 对齐**：事件驱动步骤编排
4. **多服务组合**：可将多个 workflow 编成系统

## 稳定性亮点
- 把「Jupyter 里能跑」推进到「可托管进程」
- 会话对象显式化，避免全局单例状态
- 生态与 LlamaParse/Agents 文档链路衔接

## 对 openmate 借鉴
1. **编排与部署分层**：核心 loop 可 headless 部署，UI 只是客户端
2. **会话是一等资源**：有生命周期、可恢复、可观测

## 链接
https://github.com/run-llama/llama_deploy
