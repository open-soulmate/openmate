# Opencode

## 概述

| 仓库 | https://github.com/anomalyco/opencode（历史：sst/opencode） |，主要使用 TypeScript（https://github.com/anomalyco/opencode）

## 核心架构

- **Headless HTTP Server（OpenAPI 3.1 + SSE 事件总线）作为唯一运行时内核，TUI/Desktop/Web/IDE 均为客户端**；Session 历史持久化在本地 SQLite，Agent Loop 通过 SessionRunner 驱动；工具经 Permission 门控后由 ToolRegistry 物化执行；LLM 通过 AI SDK + Models.dev 目录抽象 75+ provider。
- - 三态：`allow` / `ask` / `deny`
- - 默认 **宽松**：多数 allow；`doom_loop`、`external_directory` 默认 ask；`read` 默认 allow 但 **`.env` / `.env.*` deny**（`.env.example` allow）
- - 对象语法细粒度：`{ "*": "ask", "git *": "allow", "rm *": "deny" }`；**last matching rule wins**

## 关键技术

- 优先级从低到高（**merge 而非 replace**）：
- 1. Remote config（`.well-known/opencode`，组织默认）
- 2. Global `~/.config/opencode/opencode.json`
- 3. `OPENCODE_CONFIG` 自定义路径
- 4. 项目 `opencode.json`（向上找到最近 git root）

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- MiMo报告
