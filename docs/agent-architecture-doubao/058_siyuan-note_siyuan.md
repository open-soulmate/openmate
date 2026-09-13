# SiYuan 源码级调研报告（Rank 58）

> 调研对象：`siyuan-note/siyuan`
> 报告日期：2026-09-13　｜　数据基线：GitHub `master` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | SiYuan（思源笔记） |
| GitHub | https://github.com/siyuan-note/siyuan |
| Star | 约 4.67w（清单快照 46,667） |
| 主要语言 | TypeScript（前端 Electron）+ Go（kernel 后端） |
| 许可证 | AGPLv3 |
| 一句话定位 | **隐私优先的个人知识管理系统（块级双向链接 + Markdown WYSIWYG），通过内置 MCP Server 把知识库暴露成工具，供外部 agent 读写，定位语 "From thought to insight, with agents"** |

**目标用户/场景**：个人知识工作者/研究者，要本地优先、块级引用、双向链接、百万字大文档编辑。其 agent 化方式是"做 agent 的知识后端"，而非自己跑自主 loop。

**成熟度**：很高、长期维护（CD 流水线、Docker、Unraid/TrueNAS 托管、多语言、插件生态 petal）。

> **性质判定**：主体是桌面/本地知识库应用，**不是 Agent 运行时**。它的 agent 角色=内置 MCP Server（被外部 LLM agent 当工具调用）+ 内置 AI 写作/问答。重点章节按此定位标注。

---

## 2. 源码结构总览

```
siyuan/
├── app/        # Electron/TS 前端（UI、编辑器）
└── kernel/    # Go 后端（API、文档/块数据库、AI、MCP server）
```

**核心源码文件（HTTP 200）**：
- `kernel/go.mod`（12,293 字节，grep 确认依赖）：
  - `github.com/modelcontextprotocol/go-sdk v1.7.0`（:57）——**官方 MCP Go SDK**；
  - `github.com/sashabaranov/go-openai v1.42.0`（:72）——经 OpenAI 兼容 API 调 LLM。
- `README.md`（27,384 字节）。

**入口/启动**：kernel 起本地 HTTP 服务（API），app（Electron/Web）连之。数据落本地 `<workspace>/data/`（assets/snippets/templates/plugins/...）。

**注**：`kernel/mcp/*.go` 具体工具实现文件未直接下载（路径探测 404，网络限流），MCP server 存在与依赖据 go.mod + README 确认，已在第 10 章标注。

---

## 3. 系统架构分析

### 编排模式：MCP Server（知识库即工具）+ 内置 AI 问答——源码/文档确认

架构是"本地知识库应用 + 把自身能力通过 MCP 暴露给外部 agent"。go.mod 同时引入官方 MCP SDK 与 go-openai，说明 kernel 既**作为 MCP server** 把"读/写/搜索笔记块"暴露成工具，又**作为 OpenAI client** 提供内置 AI 写作与问答（README:102 "AI writing and Q/A chat via OpenAI API"）。

数据流：外部 agent（Claude/Cursor 等）→ MCP 协议 → SiYuan kernel MCP server → 读写块数据库 → 返回结果；或用户在 app 内 → kernel → OpenAI 兼容 API → AI 回答/写作。

### 关键组件
- **块级数据库**：内容块、双向链接、自定义属性、SQL 查询嵌入、`siyuan://` 协议。
- **kernel（Go）**：文件/块存储 + API + MCP server + AI 适配。
- **前端（TS/Electron）**：块式 Markdown WYSIWYG 编辑器、百万字大文档。

---

## 4. 功能拆解

- **编辑器**：块式、Markdown WYSIWYG、大纲、块缩放、公式/图表/流程图/甘特图、网页剪藏、PDF 标注链接。
- **导出**：块引用/嵌入、标准 Markdown+资源、PDF/Word/HTML、复制到公众号/知乎/语雀。
- **数据库视图**：表格视图。
- **AI**：OpenAI 兼容 API 的写作与问答聊天。
- **MCP**：把知识库能力作为工具开放给外部 agent（go-sdk 确认）。
- **生态**：petal 插件 API、模板/代码片段、JS/CSS 片段。
- **多端/托管**：Electron 桌面、Docker、Unraid、TrueNAS。

---

## 5. 技术亮点与优势

1. **本地优先 + 块级引用**：数据不出本机，块级双向链接是其差异化。
2. **内置 MCP Server**：用官方 `go-sdk` v1.7.0 把成熟知识库直接变成 agent 可调用的工具——"知识即 MCP 工具"。
3. **OpenAI 兼容多模型**：`go-openai` 可接 OpenAI 及兼容端点。
4. **百万字大文档**：编辑器与存储对超长大文档做了工程优化。
5. **成熟工程化**：CD、Docker、多平台、插件生态齐全。

---

## 6. 稳定性机制【重点】

> 本地应用，"稳定性"体现在数据完整性与同步。

- **本地文件即事实源**：`<workspace>/data/` 目录结构清晰（assets/snippets/templates/plugins），数据以文件落盘，崩溃后可人工查看。
- **数据仓库密钥**：FAQ 有"数据仓库密钥丢失"条目，说明端到端加密与密钥管理。
- **第三方同步盘**：支持通过第三方同步盘同步数据（FAQ）。
- **未读部分（如实）**：块数据库事务、并发写、MCP server 的错误处理未读 Go 源码；具体 API 重试/超时未核到。

---

## 7. 高可用机制【重点】

- **本地 + Docker/Unraid/TrueNAS 托管**：既可桌面本地跑，也可服务器化托管。
- **数据可移植**：纯本地文件 + 支持第三方同步盘，不绑死单一服务。
- **局限（如实）**：单实例本地应用，无分布式高可用设计；MCP server 为嵌入式，未见多副本。

---

## 8. 自我进化机制【重点】

**不适用/弱**：知识库应用，无自主学习 loop。其"进化"=用户/外部 agent 通过 MCP 不断写入、双向链接、整理知识；内置 AI 问答是被动工具，不自动改进自身。无反思/技能沉淀机制（除模板/片段的人工复用）。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】把已有产品能力做成 MCP Server**：openmate 若已有 Web 数据/操作，学 SiYuan——把"读/写/检索"封装成 MCP 工具，即可让外部 agent（Claude/Cursor）直接用 openmate 的数据，零额外编排。
- **【P0】本地优先 + 文件即事实源**：多端（Web/桌面/手机）共享一份本地文件格式，端侧离线可读写，再同步。SiYuan 的目录组织（data/assets/...）值得参考。
- **【P1】块级/结构化数据模型**：把内容做成可引用、可查询的块（而非一大段文本），openmate 做知识/笔记类功能时受益。
- **【P2】OpenAI 兼容多端点**：用统一兼容层接多家模型，多端共享同一套模型配置。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后 grep）**：
- `kernel/go.mod`（`modelcontextprotocol/go-sdk v1.7.0`:57、`sashabaranov/go-openai v1.42.0`:72）
- `README.md`（27KB：定位、块级引用/双向链接、AI 写作问答、插件 petal、目录结构、许可证）

**文档/推断**：
- MCP server 暴露的具体工具清单、kernel API、块数据库事务未读 Go 源码（`kernel/mcp/*.go` 路径探测 404）。
- AI 写作的 prompt/检索实现未读。
- 星级/活跃度来自清单快照。
