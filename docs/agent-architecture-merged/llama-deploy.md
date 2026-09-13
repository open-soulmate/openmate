# LlamaDeploy

## 概述

LlamaDeploy 是一个LlamaIndex工作流部署。

**仓库**: https://github.com/run-llama/llama_deploy

## 核心架构

1. **Workflow 服务化**：本地编排代码可部署为远程服务
2. **会话与任务管理**：长任务与多轮交互的运行容器
3. **与 LlamaIndex Workflows 对齐**：事件驱动步骤编排
4. **多服务组合**：可将多个 workflow 编成系统

## 关键技术

- 把「Jupyter 里能跑」推进到「可托管进程」
- 会话对象显式化，避免全局单例状态
- 生态与 LlamaParse/Agents 文档链路衔接

## 对openmate的启示

- **P0**: 评估其核心理念对openmate产品定位的启示
- **P1**: 研究其关键技术实现方案
- **P2**: 关注其用户体验设计和社区运营

## 参考来源

- MiMo卡片（llama-deploy.md）
