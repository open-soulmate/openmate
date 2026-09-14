# nanobot

## 一句话定位
超轻量自托管个人 AI Agent 框架：小核心 + WebUI/终端/IM + 长期记忆 + MCP + 模型路由。

## 核心架构（4点）
1. **小核心 Agent Loop**：消息进来→LLM 决定是否用工具→记忆/技能按需注入为上下文
2. **多通道**：WebUI、终端 TUI、Telegram/Discord/Slack/WeChat/Email/Mattermost
3. **Gateway 模式**：`nanobot gateway --background` 作为长驻服务，客户端退出后仍运行
4. **Apps/Skills/Automations**：MCP 服务器、可复用指令、定时自动化任务

## 稳定性亮点
- WebUI 内置于 wheel 包，无独立前端构建
- 上下文压缩进度可视化（WebUI/终端/IM 均可见）
- 会话提及：Agent 可读取/消息其他已保存会话

## 对 openmate 借鉴
1. **Gateway 长驻 + 多客户端**：核心是服务进程，WebUI/终端/IM 都是客户端
2. **小核心哲学**：避免重编排层，工具/记忆/技能按需作为上下文注入

## 链接
https://github.com/HKUDS/nanobot
