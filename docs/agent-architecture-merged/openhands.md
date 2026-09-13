# Openhands

## 概述

| 名称 | OpenHands/OpenHands（现品牌 **Agent Canvas**） |，主要使用 Python（https://github.com/OpenHands/OpenHands）

## 核心架构

- OpenHands 已是**多仓库系统**：
- OpenHands/OpenHands            # 本仓库：Agent Canvas 前端/控制中心/本地编排（TS）
- └── @openhands/agent-canvas    # npm 包；--frontend-only / --backend-only 可拆分
- openhands-sdk/openhands/sdk/
- agent/agent.py                 # Agent.step / astep / _ActionBatch
- agent/critic_mixin.py
- agent/parallel_executor.py
- agent/stream_context.py

## 关键技术

- 1. **前后端/引擎彻底解耦**：UI（Canvas TS）、客户端（TS client）、引擎（Python SDK）、调度（automation）四个仓库各自演进，靠 OpenAPI 契约衔接。
- 2. **本地与远程同构**：同一 Agent 可在本地目录或临时容器跑，API 一致——开发体验与生产部署无缝。
- 3. **事件流 + WebSocket**：前端订阅事件即可实时渲染 Agent 活动。
- 4. **技能按仓库标记自动加载**：`uv.lock` 存在就自动装 uv 技能，把"项目生态知识"按需注入。
- 5. **服务器常驻**：跑在服务器上时，笔记本关机 Agent 继续干活，可被 Slack/GitHub 触发——真"always-on engineering team"。
- 1. **多仓微服务化**：Agent 行为单一事实源在 SDK；Agent Server 只暴露 REST/WS；Canvas 只做 UI 与后端选择；Automation 只做“何时跑”。职责边界清晰，利于 openmate 拆分“执行引擎 / 宿主 UI / 调度”。
- 2. **Workspace 可替换**：同一 Agent 代码可在 Local / Docker / Remote/K8s 间切换，靠 `LocalWorkspace → RemoteWorkspace → DockerWorkspace/RemoteAPIWorkspace` 继承扩展。这是 **sandbox 隔离的核心抽象**。
- 3. **Agent Server 是多租户进程内 API**：单 host/port 上跑多个 conversation；含 conversation / event / bash / git / file / vscode / desktop / skills / sub_agents / plugins / hooks / llm / mcp / settings / workspaces / profiles / agent_profiles / telemetry 等 router；启动时清理 stale tmux、并发起 VSCode 与 tool preload 服务。

## 对openmate的启示

- **P0｜前端/客户端/引擎/调度四分离 + OpenAPI 契约**
- - 借鉴什么：UI、TS 客户端、Python Agent 引擎、调度服务分开仓库，靠 OpenAPI 契约衔接。
- - 怎么用：openmate Web/桌面/手机共用一个"Agent Server"REST+WebSocket 契约，三端只是不同客户端；引擎升级不破坏端。
- **必须借鉴（高优先级）**
- 1. **Event Stream 作为唯一事实源**：Action/Observation/Message/Condensation 事件化；UI、重放、审计、断点全部挂在事件日志上。

## 参考来源

- 豆包
- MiMo报告
