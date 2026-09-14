# AIHawk

## 一句话定位
开源 AI 浏览器 Agent：隐身 Firefox 上的网页自动化，反爬系统视其为真人，无验证码无封锁。

## 核心架构（3点）
1. **Stealth Firefox 引擎**：invisible_playwright + invisible_core（指纹/代理/地理定位）
2. **双入口**：MCP 服务器（接入 Claude Code/Codex/Gemini CLI）+ Web UI（OpenRouter）
3. **Profile 持久化**：登录态/Cookie 跨重启保留

## 稳定性亮点
- `--seed` 固定浏览器身份，可复现
- `.env` 配置优先级：flag > env > .env > 默认
- MIT 许可（2026-09 前为 AGPL-3.0）

## 对 openmate 借鉴
1. **MCP 作为 Agent 工具接口**：浏览器 Agent 通过 MCP 暴露，可被任意 MCP 客户端调用
2. **反检测工程**：指纹/代理/时区/语言一致性是浏览器 Agent 实用化的前提

## 链接
https://github.com/feder-cr/AIHawk
