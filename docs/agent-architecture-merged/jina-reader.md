# Jina Reader

## 概述

Jina Reader 是一个网页内容提取工具。

**仓库**: https://github.com/jina-ai/reader | **语言**: TypeScript | **License**: Apache-2.0

## 核心架构

> **项目**: [jina-ai/reader](https://github.com/jina-ai/reader)
> **定位**: API-first SaaS，将任意 URL 转换为 LLM 友好的 Markdown/图像输入
> **协议**: Apache-2.0
> **语言**: TypeScript (Node.js 22+)
> **分析日期**: 2026-09-13

Reader 最核心的架构特点是 **多引擎智能切换**。它支持三种抓取引擎，由 `x-engine` 请求头控制：

Jina Reader 是 **Agent 工具链** 中最实用的组件之一：

1. **统一数据入口**: 无论目标是网页、PDF、Office 文档还是图片，一个 `r.jina.ai` 前缀即可获取 LLM 友好的 Markdown
2. **搜索增强**: `s.jina.ai` 让 Agent 获得实时互联网搜索能力，且自动抓取结果页面全文
3. **Token 优化**: `x-max-tokens` 和 `x-token-budget` 帮助 Agent 精确控制上下文窗口使用
4. **语义分块**: `x-markdown-chunking` 支持按标题或结构化块分割，天然适配 RAG 分块需求
5. **引用格式**: `x-retain-links: gpt-oss` 生成标准引用格式，适合 Deep Research 场景

- **Header 驟动配置**: 保持 URL 路径简洁，配置通过 Header 传递，是一种优雅的 REST API 设计
- **智能引擎切换**: Auto 模式在性能和准确性之间自动权衡，是"让机器做决策"的典范
- **渐进式等待策略**: 六级等待控制从"最快返回"到"最完整返回"，让调用方按需选择延迟/完整性权衡
- **开源与 SaaS 分离**: 存储层解耦后，开源版本保持轻量无状态，SaaS 版本可独立演进

## 关键技术

Jina Reader 是 Jina AI 的核心产品之一，提供两个端点：

- **`r.jina.ai`（Read）**: 将任意 URL 转换为 LLM 友好的 Markdown 输入。只需在 URL 前加 `https://r.jina.ai/` 前缀即可。
- **`s.jina.ai`（Search）**: 接受搜索查询，搜索互联网后自动抓取 Top 5 结果页面并转换为 Markdown。

其核心价值主张是 **"Context Engineering"**——为 LLM 提供高质量的输入上下文。不同于简单的搜索引擎 API 只返回标题+摘要，Reader 会实际访问并解析每个结果页面的完整内容。它支持 Web 页面、PDF、MS Office 文档（Word/Excel/PowerPoint）和图像的抓取与转换。

**演进时间线**：
- 2024-04: 首次发布，`r.jina.ai` 上线
- 2024-05: `s.jina.ai` 搜索功能上线，同月加入 PDF 支持
- 2025-03: 从 Firebase (Firestore + Cloud Functions) 迁移到 Cloud Run + MongoDB Atlas
- 2025-12: 存储层解耦，支持二进制文件直接上传（PDF/Office 文档通过 POST body 的 `file` 字段）
- 2026-04: 开源分支与 SaaS 代码重新同步，移除 MongoDB 存储层，改为无状态/桶缓存模式

Reader 不仅仅是网页抓取器，它是一个通用的文档转换引擎：

| 文档类型 | 处理方式 | 输出格式 |
|---------|---------|---------|
| Web 页面 (HTML/XHTML) | Headless Chrome / curl-impersonate | Markdown, HTML, Text, Screenshot |
| PDF | PDF.js 解析渲染 | Markdown（文本提取）, Image（逐页渲染） |
| Word/Excel/PPT | LibreOffice → PDF/HTML → 标准管线 | Markdown, Image |
| 图片 | VLM (gemini-2.5-flash-lite) 图像描述 | 文本描述（非 OCR，是 Captioning） |
| 原始 HTML | 直接送入 HTML→Markdown 管线 | Markdown |

这种统一的多格式处理管线使得 Reader 成为 LLM 数据预处理的 **"瑞士军刀"**。

Reader 采用 **请求头（Header）驱动** 的配置模式，而非传统的 Query 参数或 Body 参数。这是一种精心设计的 API 风格：

- `x-preset`: 预打包的选项组合（reader / index / research / agent / spider），覆盖常见使用场景

这种 Header 驱动的设计保持了 URL 路径的简洁性，同时提供了极其丰富的配置能力。

- 交互式代码片段构建器（Interactive Code Snippet Builder）
- 完整的 API 文档（`https://r.jina.ai/docs`）
- JSON 输出模式（`Accept: application/json`）

Jina Reader 是 **Agent 工具链** 中最实用的组件之一：

1. **统一数据入口**: 无论目标是网页、PDF、Office 文档还是图片，一个 `r.jina.ai` 前缀即可获取 LLM 友好的 Markdown
2. **搜索增强**: `s.jina.ai` 让 Agent 获得实时互联网搜索能力，且自动抓取结果页面全文
3. **Token 优化**: `x-max-tokens` 和 `x-token-budget` 帮助 Agent 精确控制上下文窗口使用
4. **语义分块**: `x-markdown-chunking` 支持按标题或结构化块分割，天然适配 RAG 分块需求
5. **引用格式**: `x-retain-links: gpt-oss` 生成标准引用格式，适合 Deep Research 场景

## 对openmate的启示

> 仓库: https://github.com/jina-ai/reader  
> 抓取通道: cdn.jsdelivr.net/gh/jina-ai/reader@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 URL→LLM 输入 / Search / header 控制面 / 预设 借鉴

---

| 需求 | Reader 机制 | 可复用度 |
|------|------------|----------|
| URL→LLM 输入 | r.jina.ai 前缀 | **高** |
| 搜索+正文 | s.jina.ai top5 自动抓 | **高** |
| Header 控制面 | 20+ x-* headers | **高** |
| 预设包 | reader/index/research/agent/spider | **高** |
| Token 截断 vs 拒绝 | max-tokens vs token-budget | **高** |
| 等待策略 | respond-timing 6 级 | **高** |
| 引擎选择 | browser/curl/auto | **高** |
| Markdown 分块 | heading/structured s1-s5 | **高** |
| gpt-oss 引用格式 | x-retain-links: gpt-oss | 高 |
| S3 缓存 | GCP_STORAGE_* | 高 |
| 双端口 | h2c 8080 + h1 8081 | 中 |
| 反爬阶梯 | key→no-cache→browser→proxy→BYO | **高** |

---

| 预设 | retain-links | retain-images | timing | chunking |
|------|--------------|---------------|--------|----------|
| reader | all | all | visible-content | false |
| index | text | alt | resource-idle | h3 |
| research | gpt-oss | alt | resource-idle | structured s2 |
| agent | text | none | mutation-idle | false |
| spider | all | none | network-idle | false |

规则: preset 只影响未显式设置的选项。

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（84-jina-reader.md）
- MiMo报告（jina-reader-l1.md）
- MiMo卡片（jina-reader.md）
