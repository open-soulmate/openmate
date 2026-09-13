# Siyuan Note Siyuan

## 概述

| GitHub | https://github.com/siyuan-note/siyuan |，主要使用 TypeScript（https://github.com/siyuan-note/siyuan）

## 核心架构

- ├── app/        # Electron/TS 前端（UI、编辑器）
- └── kernel/    # Go 后端（API、文档/块数据库、AI、MCP server）
- **核心源码文件（HTTP 200）**：
- - `kernel/go.mod`（12,293 字节，grep 确认依赖）：

## 关键技术

- 1. **本地优先 + 块级引用**：数据不出本机，块级双向链接是其差异化。
- 2. **内置 MCP Server**：用官方 `go-sdk` v1.7.0 把成熟知识库直接变成 agent 可调用的工具——"知识即 MCP 工具"。
- 3. **OpenAI 兼容多模型**：`go-openai` 可接 OpenAI 及兼容端点。
- 4. **百万字大文档**：编辑器与存储对超长大文档做了工程优化。
- 5. **成熟工程化**：CD、Docker、多平台、插件生态齐全。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】把已有产品能力做成 MCP Server**：openmate 若已有 Web 数据/操作，学 SiYuan——把"读/写/检索"封装成 MCP 工具，即可让外部 agent（Claude/Cursor）直接用 openmate 的数据，零额外编排。
- - **【P0】本地优先 + 文件即事实源**：多端（Web/桌面/手机）共享一份本地文件格式，端侧离线可读写，再同步。SiYuan 的目录组织（data/assets/...）值得参考。

## 参考来源

- 豆包
