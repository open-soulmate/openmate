# jina-ai/reader — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/jina-ai/reader  
> 抓取通道: cdn.jsdelivr.net/gh/jina-ai/reader@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 URL→LLM 输入 / Search / header 控制面 / 预设 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（Read/Search、headers、Docker、本地开发）
- 未打开: `src/` 实现；README 指向 `src/dto/crawler-options.ts`、`architecture.md`
- OSS 分支: stateless 或 bucket-cached；**MongoDB SaaS 层不在此仓**
- License: Apache-2.0

---

## 1. 项目定位（README 实读）

> "Your LLMs deserve better input."

两件事:
1. **Read**: `https://r.jina.ai/https://your.url` → LLM-friendly 输入
2. **Search**: `https://s.jina.ai/your+query` → 搜索+读取

生产可用、免费、稳定、可扩展（有 rate limit）。

### 1.1 时间线（README Updates 实读）

| 日期 | 事件 |
|------|------|
| 2026-04 | OSS 分支与 SaaS 同步；去 MongoDB；可选 MinIO/S3 缓存 |
| 2025-12 | 存储解耦；PDF/Office 直接 POST `file` 字段 |
| 2025-03 | 去 Firebase；Cloud Run + MongoDB Atlas |
| 2024-05 | s.jina.ai 上线；PDF.js |
| 2024-04 | r.jina.ai 上线 |

---

## 2. 能读什么（README 实读）

| 类型 | 方式 |
|------|------|
| Web pages | headless Chrome 或 curl-impersonate，智能选择 |
| PDFs | 任何 URL，PDF.js → markdown |
| MS Office | Word/Excel/PowerPoint，LibreOffice → HTML/PDF |
| Images | VLM caption，给 text-only LLM 提示 |

### 2.1 Search 行为（README 实读）

`s.jina.ai` 背后: 搜索 → 取 top **5** 结果 → 访问每个 URL → 应用 r.jina.ai。

**差异**: 多数 agent/RAG 的 web search 只返回 title/URL/description；Reader **自动抓 top5 正文**。

站内搜索:
```bash
curl 'https://s.jina.ai/When%20was%20Jina%20AI%20founded%3F?site=jina.ai&site=github.com'
```

---

## 3. Header 控制面（README 实读，源真理在 `src/dto/crawler-options.ts`）

### 3.1 x-respond-with

| 值 | 输出 |
|----|------|
| markdown | 不经 readability 的 markdown |
| html | documentElement.outerHTML |
| text | document.body.innerText |
| screenshot | 截图 URL |
| pageshot | 全页截图 |
| frontmatter | YAML frontmatter + markdown |
| markdown+frontmatter | 全页 + frontmatter |

### 3.2 x-engine

`browser` | `curl` | `auto`（默认，组合）

### 3.3 缓存与代理

| Header | 作用 |
|--------|------|
| x-proxy-url | 自定义代理 |
| x-cache-tolerance | 秒；可接受陈旧度 |
| x-no-cache: true | 绕过缓存（lifetime 3600s）= tolerance 0 |

### 3.4 选择器与等待

| Header | 作用 |
|--------|------|
| x-target-selector | 只返回匹配元素内容 |
| x-wait-for-selector | 等元素渲染（有 target 可省略） |
| x-timeout | 秒，max **180**；设了不 early return |

### 3.5 Token 控制

| Header | 行为 |
|--------|------|
| x-max-tokens | ≥500；**截断**不拒绝 |
| x-token-budget | 超预算**拒绝**；成本控制用；search 端点忽略 |

### 3.6 x-respond-timing（延迟 vs 完整性）

| 值 | 时机 |
|----|------|
| html | 原始 HTML 到达即返回 |
| visible-content | 可读内容可解析 |
| mutation-idle | DOM mutation ≥0.2s 静默 |
| resource-idle | 影响内容资源 ≥0.5s 静默（默认启发式） |
| media-idle | 媒体也完成；配 screenshot/pageshot/vlm |
| network-idle | networkidle0；x-timeout≥20 时隐含 |

未指定时由 `presumedRespondTiming`（crawler-options.ts）根据 respond-with/timeout/iframe 推导。

### 3.7 保留策略

| Header | 值 |
|--------|-----|
| x-retain-images | all(默认) / none / alt |
| x-retain-links | all(默认) / none / text / **gpt-oss**（【id†】引用+URL footer） |
| x-retain-media | link(默认) / none / text / image / html |

### 3.8 Summary 与分块

| Header | 作用 |
|--------|------|
| x-with-links-summary | 链接去重 footer；`all` 保留全部 |
| x-with-images-summary | 图片 footer |
| x-markdown-chunking | true/h1-h5 或 structured/s1-s5；返回 JSON 数组 |

### 3.9 x-preset 预设

| 预设 | 场景 |
|------|------|
| reader | 人类阅读 |
| index | 语义索引/embedding |
| research | AI 研究，结构化可引用 |
| agent | AI agent 日常浏览 |
| spider | 递归爬取+链接清单 |

**规则**: preset 只影响调用方**未显式设置**的选项。

### 3.10 其他

| Header | 作用 |
|--------|------|
| x-with-generated-alt: true | VLM caption 无 alt 图片 |
| x-detach-invisibles | 移除 display:none；禁用缓存 |
| x-set-cookie | 转发 cookie；**有 cookie 不缓存** |
| x-md-* | markdown 细调（turndown-tweakable-options.ts） |

---

## 4. SPA 处理（README 实读）

### 4.1 Hash 路由

```bash
curl -X POST 'https://r.jina.ai/' -d 'url=https://example.com/#/route'
```
（`#` 后内容不发服务器）

### 4.2 预加载内容

```bash
curl ... -H 'x-timeout: 10'
curl ... -H 'x-wait-for-selector: #content'
# 组合等满 timeout:
curl ... -H 'x-timeout: 30' -H 'x-wait-for-selector: non-existent-element'
```

### 4.3 JSON 模式

```bash
curl -H "Accept: application/json" https://r.jina.ai/https://...
```

---

## 5. Docker 自托管（README 实读）

```bash
docker pull ghcr.io/jina-ai/reader:oss
```

| 端口 | 协议 |
|------|------|
| 8080 | h2c（HTTP/2 cleartext；Cloud Run 用） |
| 8081 | HTTP/1.1 fallback |

```bash
# 快速试用
docker run --rm -p 3000:8081 ghcr.io/jina-ai/reader:oss
# curl http://localhost:3000/https://example.com

# 生产形态
docker run --rm -p 3000:8080 -p 3001:8081 ghcr.io/jina-ai/reader:oss
```

**默认完全 stateless** — 无缓存、无限流。适合试用/CI。

### 5.1 S3 缓存模式

```bash
docker run --rm -p 3000:8081 \
  -e GCP_STORAGE_ENDPOINT=https://s3.example.com \
  -e GCP_STORAGE_BUCKET=reader-cache \
  -e GCP_STORAGE_ACCESS_KEY=... \
  -e GCP_STORAGE_SECRET_KEY=... \
  ghcr.io/jina-ai/reader:oss
```

---

## 6. 本地开发与 licensed 资产

```bash
git clone git@github.com:jina-ai/reader.git
cd reader
npm install
docker compose up -d   # 可选 MinIO
npm run dev
```

### 6.1 licensed/ 非再分发资产

| 文件 | 用途 |
|------|------|
| GeoLite2-City.mmdb | 地理定位 |
| geolite2-asn.mmdb | ASN |
| SourceHanSansSC-Regular.otf | CJK PDF/截图渲染 |
| gsa_useragents.txt | curl engine UA 列表 |

```bash
npm run assets:download
# FORCE_DOWNLOAD_EXTERNAL=1 覆盖
# SKIP_DOWNLOAD_EXTERNAL=1 跳过
```

脚本幂等：已存在则跳过；部分网络失败也 exit 0。

---

## 7. 反爬排查阶梯（README 实读，升序）

1. **用 API key**（匿名限流最严、最低信任池）
2. **bypass 缓存**: `x-no-cache: true`
3. **强制 browser**: `x-engine: browser`
4. **SaaS 代理**: `x-proxy: auto`（需 key）；可 pin 国家 `x-proxy: us`
5. **自备代理**: `x-proxy-url`（http/https/socks4/socks5；`https://user:pass@host:port`）

---

## 8. 与 openmate 映射

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

## 9. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| x-timeout max | 180s | README |
| x-max-tokens min | 500 | README |
| cache lifetime | 3600s | README |
| mutation-idle | ≥0.2s | README |
| resource-idle | ≥0.5s | README |
| Search top results | 5 | README |
| Docker 端口 | 8080 h2c, 8081 h1 | README |
| 默认模式 | stateless | README |
| 有 cookie | 不缓存 | README |
| detach-invisibles | 禁用缓存 | README |
| License | Apache-2.0 | README |

---

## 10. 失败路径

```
SPA hash 路由
  → GET 丢 # 后内容；用 POST url body

SPA 预加载抢跑
  → x-timeout / x-wait-for-selector

缓存到已 block 响应
  → x-no-cache: true

curl 引擎被反爬
  → x-engine: browser

匿名限流最严
  → 用 API key

x-token-budget 超限
  → 拒绝请求（非截断）

x-max-tokens 超限
  → 截断返回

自托管无 key
  → stateless 无限流（生产需自建）

licensed 资产缺失
  → npm run assets:download

h2c 端口
  → 普通 curl 需 --http2-prior-knowledge
```

---

## 11. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **前缀式 URL API**: `https://r.jina.ai/<url>` 极简集成
2. **Search 自动抓 top5 正文**（不只 title/description）
3. **完整 header 控制面** 作为一等 API
4. **x-preset 预设包**（reader/index/research/agent/spider）
5. **截断 vs 拒绝分离**: max-tokens（截断） vs token-budget（拒绝）
6. **respond-timing 6 级**延迟/完整性权衡
7. **retain-images/links/media 三轴保留策略**
8. **gpt-oss 引用格式**（【id†】+ footer）
9. **markdown 语义分块**（heading / structured s1-s5）
10. **反爬排查阶梯文档化**

### P1

- 双端口 h2c + h1
- S3 兼容缓存 env
- VLM generated alt
- SPA POST + wait-for-selector 组合

### P2

- licensed 资产管理脚本
- spider 预设全链接清单

---

## 12. 应避免的坑

- GET 无法带 hash 路由 → 必须 POST
- 勿混用 max-tokens（截断）与 token-budget（拒绝）
- preset 不覆盖显式设置
- 有 cookie / detach-invisibles 不缓存
- h2c 端口普通 curl 不通
- 勿发明 src/ 内部路径（真理在 crawler-options.ts）

---

## 13. 源码锚点速查

```
README.md
  Read: https://r.jina.ai/<url>
  Search: https://s.jina.ai/<query>  (top 5 + full content)
  Site search: ?site=a&site=b
  Headers source of truth: src/dto/crawler-options.ts
  Markdown tweaks: src/dto/turndown-tweakable-options.ts
  Architecture: architecture.md
  Presets: reader, index, research, agent, spider
  Timing: html|visible-content|mutation-idle|resource-idle|media-idle|network-idle
  Token: x-max-tokens (truncate, ≥500) | x-token-budget (reject)
  Timeout max: 180
  Cache: 3600s; cookie=no-cache; detach-invisibles=no-cache
  Engine: browser|curl|auto
  Docker: ghcr.io/jina-ai/reader:oss  ports 8080 h2c / 8081 h1
  Cache env: GCP_STORAGE_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY
  Assets: npm run assets:download
  Anti-bot ladder: key > no-cache > browser > x-proxy > x-proxy-url
  License: Apache-2.0
```

**未本轮打开**: `src/` 实现。

---

## 14. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | header 控制面完整 |
| 权限/安全边界 | 3 | API key 分层 |
| 容错与会话恢复 | 3 | 缓存 + no-cache |
| 上下文工程 | 5 | token 截断/拒绝 + 分块 + retain |
| 可扩展（技能/MCP） | 4 | 预设 + 自定义 header |
| 可观测与可评测 | 3 | 有 codecov |
| 生产可用成熟度 | 5 | SaaS 验证 + Docker 双端口 |

**综合**: **URL/Search → LLM 输入的生产级网关**。openmate 抄前缀 API、header 控制面、preset、token 双模式与反爬阶梯。

---

## 15. 关键链接

- https://github.com/jina-ai/reader
- https://r.jina.ai/docs
- https://jina.ai/reader#pricing
- 相关: `reports/firecrawl.md`、`reports/mcp.md`、`reports/gpt-researcher.md`

---

## 16. 附录 A — 五预设 openmate 配置档（P0）

| 预设 | retain-links | retain-images | timing | chunking |
|------|--------------|---------------|--------|----------|
| reader | all | all | visible-content | false |
| index | text | alt | resource-idle | h3 |
| research | gpt-oss | alt | resource-idle | structured s2 |
| agent | text | none | mutation-idle | false |
| spider | all | none | network-idle | false |

规则: preset 只影响未显式设置的选项。

---

## 17. 附录 B — Token 双模式（P0）

```
x-max-tokens: ≥500   → 截断返回
x-token-budget: N    → 超限拒绝
```

openmate:
- 上下文窗口已满 → token-budget 拒绝
- 继续拼接 → max-tokens 截断
- search 端点忽略 budget

---

## 18. 附录 C — 反爬排查阶梯

```
1. 用 API key
2. x-no-cache: true
3. x-engine: browser
4. x-proxy: auto / us
5. x-proxy-url: socks5://...
```

openmate: 文档化阶梯；自动升级可选。

---

## 19. 附录 D — 关键常量

```
x-timeout max: 180s
cache lifetime: 3600s
mutation-idle: ≥0.2s
resource-idle: ≥0.5s
Search top: 5
Docker: 8080 h2c, 8081 h1
cookie → no-cache
detach-invisibles → no-cache
```

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | header 控制面 |
| 权限安全 | 3 | API key 分层 |
| 容错恢复 | 3 | 缓存 |
| 上下文 | 5 | token 双模式 + 分块 |
| 可扩展 | 4 | 预设 + header |
| 可观测 | 3 | codecov |
| 成熟度 | 5 | SaaS + Docker |

**净推荐**: openmate 抓取层以 **前缀 API + 五预设 + token 双模式 + 反爬阶梯** 为 P0。
