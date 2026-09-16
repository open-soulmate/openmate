# Jina Reader（#83, 8k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/jina-reader（2.4MB，r.jina.ai的oss分支，源码级深读）

URL→LLM友好Markdown的生产级服务（TypeScript/civkit+tsyringe DI）。OpenSoul web_extract的"完全体对照"。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. 三引擎抓取自动降级（puppeteer浏览器→curl-impersonate(反指纹TLS)→Cloudflare Browser Rendering，x-engine头可指定，auto按URL难度分派） | 无 | browser工具+requests | 完全没有 | 反爬核心：curl-impersonate伪装TLS指纹是绕过Cloudflare WAF的关键；与anti-crawling-toolkit skill呼应 |
| 2. 三格式化profile（@mozilla/readability / markify自研规则引擎 / **ReaderLM-v2小模型HTML→MD**，x-respond-with选择） | 无 | 简单html提取 | 完全没有 | 规则引擎处理模板页+小模型处理脏页面的组合拳；ReaderLM-v2可本地CPU跑 |
| 3. Header协议化选项（x-target-selector/x-remove-selector/x-wait-for-selector/x-timeout/x-with-generated-alt(img alt生成)/x-with-links-summary/x-with-shadow-dom/x-respond-timing等20+） | 无 | web_extract无参数 | 完全没有 | "抓取行为=HTTP头声明"——OpenSoul web_extract应升级为选项化API |
| 4. x-retain-images/x-retain-links（保留图片/链接为markdown引用）+x-markdown-chunking（抓取即分块） | 无 | 无 | 完全没有 | 抓取与chunking管道合并，省一次解析 |
| 5. Worker线程池（CPU重活DOM/PDF/markify进worker，按超线程数定maxWorkers，PseudoTransfer共享状态） | 无 | 单进程async | 完全没有 | Node示范：CPU密集不阻塞事件循环；Python等效=ProcessPool |
| 6. 双存储模式同一代码（noop-storage全方法空实现 vs bucket-storage MinIO缓存——**不写if(storage)判断**，靠noop对象穿透） | 无 | 无 | 完全没有 | 空对象模式代替条件分支，缓存层可插拔的优雅实现 |
| 7. 页面缓存+CDN（findPageCache先查缓存，rateLimit走storage层） | 无 | reflex/cache语义缓存 | 部分有 | URL级页面缓存与语义缓存是两回事 |
| 8. 反滥用（GeoLite2-City地理库+integrity-check强制构建检查） | 无 | 无 | 完全没有 | 政企公网服务需要地理围栏 |
| 9. 三独立服务（crawl/search/serp同代码库不同入口，启动时互斥清理registry标签） | 无 | 单体 | 参考价值 | 同库多宿主部署 |
| 10. ReaderEnvelope内容协商错误（JSON/markdown/SSE三分支统一错误响应） | 无 | 无 | 参考价值 | API错误响应按Accept头协商 |
| 11. cookbooks.md（RAG/embedding/deep-research管道的header配方文档） | 无 | 无 | 文档价值 | 配方化使用文档，降低集成门槛 |

## 源码亮点
- **noop存储穿透**：StorageLayer每个方法返回undefined→请求自然落到live fetch——"缓存缺席"不是错误路径而是正常路径
- **engines auto分派**在crawler.ts一处dispatch——新引擎=注册singleton+挂dispatch，扩展点干净
- integrity-check.cjs：构建期强校验外部资产存在（GeoLite2缺失直接fail）——部署完整性门禁

## 可复用设计
1. 三引擎降级链 → OpenSoul web_extract升级：requests(带curl_cffi)→playwright→降级提示，反爬成功率直接翻倍
2. header选项协议 → OpenSoul web_extract(selector/timeout/wait_for/retain_images参数化）
3. ReaderLM-v2集成 → 中文页面HTML→MD质量远超readability，本地CPU可跑
4. noop对象模式 → OpenSoul存储层设计（可选缓存不写条件分支）
