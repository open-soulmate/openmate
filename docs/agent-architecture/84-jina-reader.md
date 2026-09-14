# 84 — Jina Reader (jina-ai/reader) 架构深度分析

> **项目**: [jina-ai/reader](https://github.com/jina-ai/reader)
> **定位**: API-first SaaS，将任意 URL 转换为 LLM 友好的 Markdown/图像输入
> **协议**: Apache-2.0
> **语言**: TypeScript (Node.js 22+)
> **分析日期**: 2026-09-13

---

## 1. 核心定位与产品形态

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

---

## 2. 多引擎抓取架构（URL → HTML）

Reader 最核心的架构特点是 **多引擎智能切换**。它支持三种抓取引擎，由 `x-engine` 请求头控制：

### 2.1 Browser 引擎
- 基于 **Puppeteer** 驱动的最新 Headless Chrome
- 能执行 JavaScript，适用于现代 SPA（单页应用）
- 支持精细的等待策略：`x-wait-for-selector`（等待特定 CSS 选择器出现）、`x-timeout`（最大 180 秒）
- 适用于需要 JS 渲染才能获取完整内容的网站

### 2.2 CURL 引擎
- 使用 **curl-impersonate** 轻量级抓取，不执行 JavaScript
- 内置模拟 Cookie 层，处理基本的 Cookie 重定向
- 速度更快、资源消耗更低
- 适用于静态页面或服务端渲染的页面

### 2.3 Auto 引擎（默认）
- Reader 根据内容特征和请求需求，**智能选择** Browser 和 CURL 的组合使用
- 优先尝试轻量 CURL 路径，必要时回退到 Browser 引擎
- 这种策略在性能和准确性之间取得了最佳平衡

---

## 3. 多格式解析管线（HTML → Markdown）

抓取到原始 HTML 后，Reader 通过多个 **格式化配置文件（Profile）** 将其转换为 Markdown：

### 3.1 @mozilla/readability
- 自动清理 HTML，提取正文内容
- 去除导航栏、广告、侧边栏等干扰元素
- 产生干净、可读的 Markdown 输出
- 是默认的 HTML 清理引擎

### 3.2 Turndown
- 基于 [Turndown](https://github.com/mixmark-io/turndown) 的 HTML → Markdown 转换器
- 通过 `x-md-*` 系列请求头精细控制输出样式（标题风格、列表标记、链接格式等）
- 配置项定义在 `src/dto/turndown-tweakable-options.ts`

### 3.3 ReaderLM v2
- Jina 自研的小型语言模型，专门训练用于 HTML → Markdown 转换
- 实验性引擎，适用于需要更高语义保真度的场景

### 3.4 ReaderLM v3 / JinaOCR / VLM（规划中）
- 使用视觉语言模型直接从网页截图生成 Markdown
- 代表了从"解析 DOM"到"理解视觉"的范式转换

---

## 4. 多格式文档处理能力

Reader 不仅仅是网页抓取器，它是一个通用的文档转换引擎：

| 文档类型 | 处理方式 | 输出格式 |
|---------|---------|---------|
| Web 页面 (HTML/XHTML) | Headless Chrome / curl-impersonate | Markdown, HTML, Text, Screenshot |
| PDF | PDF.js 解析渲染 | Markdown（文本提取）, Image（逐页渲染） |
| Word/Excel/PPT | LibreOffice → PDF/HTML → 标准管线 | Markdown, Image |
| 图片 | VLM (gemini-2.5-flash-lite) 图像描述 | 文本描述（非 OCR，是 Captioning） |
| 原始 HTML | 直接送入 HTML→Markdown 管线 | Markdown |

这种统一的多格式处理管线使得 Reader 成为 LLM 数据预处理的 **"瑞士军刀"**。

---

## 5. 请求头驱动的配置体系

Reader 采用 **请求头（Header）驱动** 的配置模式，而非传统的 Query 参数或 Body 参数。这是一种精心设计的 API 风格：

### 输出控制
- `x-respond-with`: 选择输出格式（markdown / html / text / screenshot / pageshot / frontmatter）
- `x-retain-images`: 控制图片保留策略（all / none / alt）
- `x-retain-links`: 控制链接保留策略（all / none / text / gpt-oss）
- `x-retain-media`: 控制视频/音频保留策略（link / none / text / image / html）

### 等待策略
- `x-respond-timing`: 六级精细控制（html → visible-content → mutation-idle → resource-idle → media-idle → network-idle）
- `x-timeout`: 最大超时秒数
- `x-wait-for-selector`: 等待特定 CSS 选择器出现

### 内容过滤
- `x-target-selector`: CSS 选择器过滤，只返回匹配元素内的内容
- `x-max-tokens`: 裁剪输出不超过指定 token 数（≥500）
- `x-token-budget`: 超过预算则拒绝请求（成本控制）
- `x-markdown-chunking`: 语义分块（按标题层级或结构化块）

### 预设配置
- `x-preset`: 预打包的选项组合（reader / index / research / agent / spider），覆盖常见使用场景

这种 Header 驱动的设计保持了 URL 路径的简洁性，同时提供了极其丰富的配置能力。

---

## 6. 反爬虫对抗与代理体系

Reader 构建了多层反爬虫对抗体系：

### 6.1 curl-impersonate
- 模拟真实浏览器的 TLS 指纹和 HTTP 头
- 使用 `licensed/gsa_useragents.txt` 中的真实 User-Agent 列表

### 6.2 内置代理池（SaaS）
- `x-proxy: auto` 启用 Jina 的托管代理池
- 自动轮换住宅/数据中心 IP
- 支持地理定位（`x-proxy: us` 等）
- 自动处理常见的反 Bot 挑战

### 6.3 自定义代理
- `x-proxy-url`: 用户自带代理（支持 http/https/socks4/socks5）
- 支持认证格式：`https://user:pass@host:port`

### 6.4 缓存控制
- `x-no-cache: true` 绕过缓存（3600 秒有效期）
- `x-cache-tolerance`: 可接受的缓存过期时间
- S3 兼容桶缓存（MinIO 本地 / GCS 生产）

### 6.5 地理感知
- 使用 MaxMind GeoLite2 数据库（`GeoLite2-City.mmdb` + `geolite2-asn.mmdb`）
- 支持按地理位置路由请求

---

## 7. 部署架构与基础设施

### 7.1 SaaS 部署
- **容器化**: Docker 镜像部署在 **GCP Cloud Run**
- **元数据存储**: MongoDB Atlas（元数据索引、速率限制）
- **缓存存储**: Google Cloud Storage（页面缓存数据）
- **集群**: 两个独立集群——US（3 个区域：us-central1、us-east1、us-west1）和 EU（1 个区域：europe-west1）
- **内部服务**: 通过 VPC 私有对等连接访问计费、jina-vlm、readerlm-v2 等内部服务
- **协议**: 同时暴露 h2c（HTTP/2 cleartext，端口 8080，供 Cloud Run 使用）和 HTTP/1.1（端口 8081，兼容性回退）

### 7.2 开源自托管
- 预构建 Docker 镜像：`ghcr.io/jina-ai/reader:oss`
- 内置 Headless Chrome + LibreOffice + CJK 字体
- **无状态模式**: 每个请求直接访问目标 URL，无缓存无速率限制
- **桶缓存模式**: 通过 `GCP_STORAGE_*` 环境变量指向 S3 兼容存储（本地 MinIO 或云端）

### 7.3 有状态 vs 无状态
- **开源分支**: 纯无状态或桶缓存模式，MongoDB 存储层被剥离
- **SaaS 分支**: MongoDB Atlas 提供元数据索引和速率限制，GCS 提供缓存

---

## 8. 依赖资产与外部服务

Reader 依赖若干 **许可资产**（存放在 `licensed/` 目录，不随开源分发）：

| 资产 | 用途 |
|------|------|
| `GeoLite2-City.mmdb` | MaxMind 地理位置数据库 |
| `geolite2-asn.mmdb` | MaxMind ASN（自治系统号）数据库 |
| `SourceHanSansSC-Regular.otf` | 思源黑体，PDF/截图中的 CJK 文字渲染 |
| `gsa_useragents.txt` | curl 引擎使用的真实 User-Agent 列表 |

外部依赖服务：
- **SERP 提供商**: 搜索结果主要依赖外部搜索引擎 API
- **VLM (Vision-Language Model)**: 图像描述使用 `gemini-2.5-flash-lite`，可替换为任何具备类似能力的模型
- **代理提供商**: SaaS 模式下的内置代理池

---

## 9. API 设计哲学与开发者体验

### 9.1 极简入口
- 读取：`https://r.jina.ai/<URL>` — 一个前缀搞定
- 搜索：`https://s.jina.ai/<query>` — 同样极简

### 9.2 丰富的控制粒度
- 30+ 个 `x-*` 请求头提供从输出格式到等待策略的精细控制
- 预设配置（`x-preset`）降低常见场景的使用门槛

### 9.3 开发者工具
- 交互式代码片段构建器（Interactive Code Snippet Builder）
- 完整的 API 文档（`https://r.jina.ai/docs`）
- JSON 输出模式（`Accept: application/json`）

### 9.4 免费与商业化平衡
- 免费使用，有速率限制
- API Key 用户获得更高配额和代理访问权限
- 开源版本可自托管，无限制

---

## 10. 架构启示与 Agent 集成价值

### 10.1 对 Agent 架构的核心价值

Jina Reader 是 **Agent 工具链** 中最实用的组件之一：

1. **统一数据入口**: 无论目标是网页、PDF、Office 文档还是图片，一个 `r.jina.ai` 前缀即可获取 LLM 友好的 Markdown
2. **搜索增强**: `s.jina.ai` 让 Agent 获得实时互联网搜索能力，且自动抓取结果页面全文
3. **Token 优化**: `x-max-tokens` 和 `x-token-budget` 帮助 Agent 精确控制上下文窗口使用
4. **语义分块**: `x-markdown-chunking` 支持按标题或结构化块分割，天然适配 RAG 分块需求
5. **引用格式**: `x-retain-links: gpt-oss` 生成标准引用格式，适合 Deep Research 场景

### 10.2 架构设计启示

- **Header 驟动配置**: 保持 URL 路径简洁，配置通过 Header 传递，是一种优雅的 REST API 设计
- **智能引擎切换**: Auto 模式在性能和准确性之间自动权衡，是"让机器做决策"的典范
- **渐进式等待策略**: 六级等待控制从"最快返回"到"最完整返回"，让调用方按需选择延迟/完整性权衡
- **开源与 SaaS 分离**: 存储层解耦后，开源版本保持轻量无状态，SaaS 版本可独立演进

### 10.3 局限性

- Headless Chrome 和 LibreOffice 的高资源需求限制了自托管的轻量化
- 图像描述依赖外部 VLM 服务（当前为 gemini-2.5-flash-lite），自托管时需要自行配置
- 搜索功能依赖外部 SERP 提供商，自托管版本可能受限
- 开源版本缺少 MongoDB 存储层，无法提供完整的速率限制和元数据索引能力

---

## 技术栈总结

| 维度 | 技术选型 |
|------|---------|
| 运行时 | Node.js 22+ (TypeScript) |
| 浏览器引擎 | Puppeteer + Headless Chrome |
| 轻量抓取 | curl-impersonate |
| PDF 解析 | PDF.js |
| Office 转换 | LibreOffice |
| HTML→Markdown | @mozilla/readability + Turndown + ReaderLM v2 |
| 图像描述 | VLM (gemini-2.5-flash-lite) |
| 服务端框架 | Hono (推测，基于端口和 h2c 支持) |
| 容器化 | Docker (ghcr.io/jina-ai/reader:oss) |
| 部署平台 | GCP Cloud Run |
| 元数据存储 | MongoDB Atlas (SaaS) / 无 (开源) |
| 缓存存储 | GCS / S3 兼容 / MinIO |
| 地理数据 | MaxMind GeoLite2 |
| CJK 字体 | Source Han Sans (思源黑体) |
| 协议 | Apache-2.0 |
