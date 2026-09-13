# Superagi

## 概述

SuperAGI 采用经典的**分层微服务架构**，通过 Docker Compose 编排五个核心服务：，主要使用 Python（https://github.com/TransformerOptimus/SuperAGI）

## 核心架构

- SuperAGI 采用经典的**分层微服务架构**，通过 Docker Compose 编排五个核心服务：
- | 服务 | 技术 | 职责 |
- |------|------|------|
- | `backend` | FastAPI + Uvicorn | REST API 服务，处理前端请求、Agent 生命周期管理 |
- | `celery` | Celery + Redis | 异步任务队列，执行 Agent 运行时迭代 |
- ┌──────────────────────────────────────────────────────────┐
- │  GUI（gui/ + tgwui/）                                     │
- │   Agent 管理 · Action Console · 设置 · 指标              │

## 关键技术

- | 模式 | 应用位置 | 说明 |
- |------|----------|------|
- | 工厂模式 | `llm_model_factory.py`、`vector_factory.py` | 根据配置动态创建 LLM/向量存储实例 |
- | 策略模式 | `BaseLlm` 继承体系 | 不同 LLM Provider 可互换 |
- | 模板方法 | `BaseTool` → 具体工具 | 定义工具骨架，子类实现 `execute()` |
- - README：https://github.com/TransformerOptimus/SuperAGI
- - Docs：https://docs.superagi.com/（历史）
- - 相关报告：`cards/superagi.md`、`reports/openclaw.md`、`reports/autogpt-l1.md`

## 对openmate的启示

- 1. **工作流引擎值得借鉴**：两层工作流（宏观步骤 + 微观迭代）提供了比纯 ReAct 更精细的控制
- 2. **工具市场的设计**：GitHub 一键安装 + 自动注册的模式降低了扩展门槛
- 3. **APM 内置化**：Agent 可观测性不应是事后添加，而应内置于框架层
- 1. **Toolkits 市场模式**：工具与 Agent 解耦，社区贡献工具包即可扩展能力
- 2. **Action Console 权限门控**：高风险操作前插入人工确认，是生产级稳定性的关键

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
