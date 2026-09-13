# Jina Reader

## 一句话定位
把任意 URL 转成对 LLM 友好的 Markdown/文本，是 Agent 网页阅读的基础设施。

## 核心架构（4点）
1. **HTTP 端点**：`r.jina.ai/<url>` 直接返回净化后正文
2. **渲染管线**：无头浏览器渲染 + 正文抽取，去导航/广告噪音
3. **多格式输出**：Markdown / text / 结构化元数据
4. **与 Embeddings/Search 配套**：Jina 生态的读-搜-向量化组合

## 稳定性亮点
- 无状态、可缓存，适合高并发抓取
- 对 JS 重站比裸 requests 更稳，减少「空页面」失败
- 作为独立服务，失败可降级到本地抓取

## 对 openmate 借鉴
1. **网页阅读做成独立工具层**：Agent 不要自己拼 HTML 解析，统一走 Reader 风格端点
2. **输出强制 Markdown**：降低上下文噪音，提升工具结果可用性

## 链接
https://github.com/jina-ai/reader
