# Open Webui

## 概述

Open WebUI 是一个自托管的 AI 平台，定位为"AI 之家"（A Home for AI），支持 Ollama 和 OpenAI 兼容 API，提供功能丰富、用户友好的界面，可完全离线运行。以下从 10 个维度深入分析其架构设计。，GitHub Stars: 151,825+，主要使用 Python（https://github.com/open-webui/open-webui）

## 核心架构

- Open WebUI 采用经典的**前后端分离**架构，但打包为单个 Docker 容器部署：
- - **前端**：SvelteKit 5 + TypeScript + Tailwind CSS 4，构建后以静态文件嵌入 Python 后端
- - **后端**：FastAPI (Python 3.11+)，提供 REST API + WebSocket + Socket.IO
- - **部署**：单容器（Docker/K8s），前端静态文件由 FastAPI 的 `StaticFiles` 中间件直接服务
- 这种"编译时分离、运行时合一"的设计降低了部署复杂度——用户只需 `docker run` 一条命令即可启动完整服务，同时保持了开发时前后端独立迭代的灵活性。
- 1. **插件体系**：Filters/Actions/Pipes/Tools/Skills + MCP/MCPO/OpenAPI 工具服务器
- 2. **Models & Agents**：包装任意基座模型为专用 Agent，支持动态变量与权限控制
- 3. **Channels 协作**：实时共享空间，团队与 AI 在同一时间线协作

## 关键技术

- | 函数 | 行号 |
- | `build_chat_response_context` | 3138 |
- | `non_streaming_chat_response_handler` | 4033 |
- | `streaming_chat_response_handler` | 4217 |

## 对openmate的启示

- 1. **Channels 共享时间线**：比单人对话更适合团队协作场景
- 2. **插件四层（Filter/Action/Pipe/Tool）**：细粒度扩展点设计值得参考

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
