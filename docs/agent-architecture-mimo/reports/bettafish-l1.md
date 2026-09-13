# 666ghj/BettaFish — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/666ghj/BettaFish  
> 抓取通道: cdn.jsdelivr.net/gh/666ghj/BettaFish@main/README.md  
> 版本快照: main @ 2026-09-13（version badge **v1.2.1**）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 论坛协作 / IR 报告管线 / 爬虫+分析分离 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（中文，架构树、流程表、配置、免责声明）
- 未打开: 各 Engine 的 agent.py 实现
- License: **GPL-2.0**
- 后续: MiroFish-预测万物（独立仓）

---

## 1. 项目定位（README 实读）

**微舆 / BettaFish**: 从 0 实现的 **多智能体舆情分析系统**。

- 破除信息茧房，还原舆情原貌，预测走向
- 用户像聊天一样提需求
- 全自动分析 **国内外 30+ 主流社媒** + **数百万条大众评论**

命名: BettaFish（斗鱼）= 小而强大、不畏挑战。

### 1.1 六大优势（README 实读）

1. **AI 驱动全域监控**: 爬虫集群 7x24；微博/小红书/抖音/快手等 10+；下钻用户评论
2. **超越 LLM 的复合分析引擎**: 5 类专业 Agent + 微调模型 + 统计模型中间件
3. **强大多模态**: 短视频内容 + 搜索引擎结构化卡片（天气/日历/股票）
4. **Agent「论坛」协作机制**: 不同工具集+思维模式；辩论主持人；链式思维碰撞
5. **公私域数据无缝融合**: 高安全性接口接内部业务库
6. **轻量化高扩展**: 纯 Python 模块化；一键部署

---

## 2. 系统架构（README 实读）

### 2.1 四大 Agent

| Agent | 职责 |
|-------|------|
| **Query Agent** | 国内外网页精准搜索 |
| **Media Agent** | 多模态内容分析（视频/图片） |
| **Insight Agent** | 私有数据库挖掘 |
| **Report Agent** | 智能报告生成（内置模板多轮） |

### 2.2 完整分析流程（README 表实读）

| 步骤 | 阶段 | 操作 | 组件 | 循环 |
|------|------|------|------|------|
| 1 | 用户提问 | Flask 收查询 | Flask | - |
| 2 | 并行启动 | 三 Agent 同时工作 | Query/Media/Insight | - |
| 3 | 初步分析 | 各自专属工具概览搜索 | Agent+工具集 | - |
| 4 | 策略制定 | 分块研究策略 | 各 Agent 决策模块 | - |
| 5-N | **循环** | **论坛协作+深度研究** | ForumEngine+所有 Agent | **多轮** |
| 5.1 | 深度研究 | 论坛主持人引导专项搜索 | Agent+反思+论坛引导 | 每轮 |
| 5.2 | 论坛协作 | ForumEngine 监控发言→主持人引导 | ForumEngine+LLM 主持人 | 每轮 |
| 5.3 | 交流融合 | 据讨论调整方向 | Agent+forum_reader | 每轮 |
| N+1 | 结果整合 | 收集分析+论坛内容 | Report Agent | - |
| N+2 | **IR 中间表示** | 模板/样式选择，多轮生成元数据，装订 IR | Report+模板引擎 | - |
| N+3 | 报告生成 | 分块质量检测，IR→交互式 HTML | Report+装订引擎 | - |

### 2.3 代码结构树（README 实读，关键路径）

```
BettaFish/
├── QueryEngine/          # 搜索 Agent
│   ├── agent.py, llms/, nodes/, tools/, utils/, state/, prompts/
├── MediaEngine/          # 多模态 Agent
├── InsightEngine/        # 私有库 Agent
│   ├── tools/keyword_optimizer.py    # Qwen 关键词优化中间件
│   ├── tools/sentiment_analyzer.py   # 情感分析集成
│   ├── utils/db.py                   # SQLAlchemy 异步只读
├── ReportEngine/         # 报告 Agent
│   ├── agent.py                      # 总调度: 模板→布局→篇幅→章节→渲染
│   ├── flask_interface.py            # Flask/SSE
│   ├── core/{template_parser,chapter_storage,stitcher}.py
│   ├── ir/{schema,validator}.py      # IR 契约与校验
│   ├── nodes/{template_selection,document_layout,word_budget,chapter_generation}.py
│   ├── renderers/{html,pdf,pdf_layout_optimizer,chart_to_svg}.py
│   └── report_template/*.md
├── ForumEngine/          # 论坛协作
│   ├── monitor.py, llm_host.py
├── MindSpider/           # 社媒爬虫
│   ├── BroadTopicExtraction/, DeepSentimentCrawling/MediaCrawler/
│   └── schema/ (SQLAlchemy + SQL)
├── SentimentAnalysisModel/  # 微调模型集
│   ├── WeiboSentiment_Finetuned/{BertChinese-Lora,GPT2-Lora}
│   ├── WeiboMultilingualSentiment/
│   ├── WeiboSentiment_SmallQwen/
│   └── WeiboSentiment_MachineLearning/
├── SingleEngineApp/      # 单 Agent Streamlit
├── utils/{forum_reader,github_issues,retry_helper}.py
├── tests/
├── app.py, config.py, .env.example
├── docker-compose.yml, Dockerfile
└── report_engine_only.py  # CLI 报告
```

---

## 3. ReportEngine IR 管线（README 实读）

### 3.1 节点链

```
template_selection_node  → 模板候选收集 + LLM 筛选
document_layout_node     → 标题/目录/主题设计
word_budget_node         → 篇幅规划与章节指令
chapter_generation_node  → 章节级 JSON 生成 + 校验
stitcher                 → Document IR 装订（锚点/元数据）
html_renderer            → 交互式 HTML
pdf_renderer             → WeasyPrint PDF
pdf_layout_optimizer     → PDF 布局优化
chart_to_svg             → 图表转 SVG
```

### 3.2 IR 契约

- `ir/schema.py`: 块/标记 Schema 常量
- `ir/validator.py`: 章节 JSON 结构校验

### 3.3 重新生成工具

```bash
python regenerate_latest_html.py
python regenerate_latest_md.py
python regenerate_latest_pdf.py
python report_engine_only.py --query "土木工程行业分析" --skip-pdf --verbose
```

---

## 4. 配置（README 实读）

### 4.1 Docker

```bash
cp .env.example .env
docker compose up -d
```

### 4.2 PostgreSQL 默认（README 表）

| 项 | 值 |
|----|-----|
| DB_HOST | db |
| DB_PORT | 5432 |
| DB_USER | bettafish |
| DB_PASSWORD | bettafish |
| DB_NAME | bettafish |

也支持 MySQL（改 DIALECT）。

### 4.3 分 Agent LLM（OpenAI 兼容）

```bash
INSIGHT_ENGINE_API_KEY=
INSIGHT_ENGINE_BASE_URL=
INSIGHT_ENGINE_MODEL_NAME=
# Media / Query 同模式
```

### 4.4 Agent 配置常量（README 示例）

```python
# QueryEngine
max_reflections = 2
max_search_results = 15
max_content_length = 8000

# MediaEngine
comprehensive_search_limit = 10
web_search_limit = 15

# InsightEngine
default_search_topic_globally_limit = 200
default_get_comments_limit = 500
max_search_results_for_llm = 50

# Sentiment
model_type: 'multilingual' | 'bert' | 'qwen'
confidence_threshold = 0.8
batch_size = 32
max_sequence_length = 512
```

---

## 5. MindSpider 爬虫（README 实读）

```bash
cd MindSpider
python main.py --setup
python main.py --broad-topic
python main.py --complete --date 2024-01-20
python main.py --deep-sentiment --platforms xhs dy wb
```

模块: BroadTopicExtraction（话题）+ DeepSentimentCrawling（深度）+ MediaCrawler 核心。

---

## 6. 启动（README 实读）

```bash
# 源码
uv pip install -r requirements.txt
playwright install chromium
python app.py          # http://localhost:5000

# 单 Agent
streamlit run SingleEngineApp/query_engine_streamlit_app.py --server.port 8503
streamlit run SingleEngineApp/media_engine_streamlit_app.py --server.port 8502
streamlit run SingleEngineApp/insight_engine_streamlit_app.py --server.port 8501
```

Python: **3.9+**；内存建议 **2GB+**。

---

## 7. 与 openmate 映射

| 需求 | BettaFish 机制 | 可复用度 |
|------|---------------|----------|
| 多 Agent 并行启动 | Query/Media/Insight 同时 | **高** |
| 论坛协作+主持人 | ForumEngine + llm_host | **高** |
| forum_reader 工具 | Agent 读论坛 | **高** |
| 反思轮次 | max_reflections=2 | **高** |
| IR 中间表示 | schema+validator+stitcher | **高** |
| 报告节点链 | 模板→布局→篇幅→章节→渲染 | **高** |
| 分块质量检测 | chapter 级 validator | **高** |
| 爬虫与分析分离 | MindSpider 独立 | **高** |
| 分 Agent LLM 配置 | 各自 KEY/BASE_URL/MODEL | **高** |
| 中间件（非纯 LLM） | Qwen 关键词优化、情感模型 | **高** |
| SQLAlchemy 只读封装 | utils/db.py | 高 |
| retry_helper | 网络重试 | 高 |
| 单 Agent Streamlit 独立调试 | SingleEngineApp | **高** |
| CLI 跳过分析直接报告 | report_engine_only.py | **高** |
| 免责声明前置 | 爬虫/数据/技术 | 高 |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 版本 | v1.2.1 | badge |
| Python | 3.9+ | README |
| 内存建议 | 2GB+ | README |
| Flask 端口 | 5000 | README |
| Streamlit 端口 | 8501/8502/8503 | README |
| max_reflections | 2 | config 示例 |
| max_search_results | 15 | QueryEngine |
| max_content_length | 8000 | QueryEngine |
| web_search_limit | 15 | MediaEngine |
| get_comments_limit | 500 | InsightEngine |
| max_search_results_for_llm | 50 | InsightEngine |
| confidence_threshold | 0.8 | Sentiment |
| batch_size | 32 | Sentiment |
| max_sequence_length | 512 | Sentiment |
| DB 默认 | bettafish/bettafish@db:5432 | README |
| License | GPL-2.0 | README |
| 社媒覆盖 | 30+ | README |

---

## 9. 失败路径 / 边界（README 实读 + 推断）

```
Streamlit 端口占用
  → kill 占用进程（README 注 1）

PDF 依赖缺失
  → weasyprint 装不上；跳过步骤 2 则 PDF 不可用

机器学习部分不想装
  → 注释 requirements 中 ML 部分

Docker 拉取慢
  → docker-compose.yml 注释中备用镜像

爬虫合规
  → 免责声明：学习/研究；遵守 robots；法律后果自负

商业使用
  → 声明仅供学习学术教育；禁商用

DB 凭证默认弱
  → bettafish/bettafish 必须改

单引擎启动顺序
  → 需先配 .env
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **论坛协作机制**: ForumEngine monitor + llm_host 主持人
2. **forum_reader 工具**: Agent 读取讨论调整方向
3. **并行启动多 Agent** 再进入多轮论坛循环
4. **IR 中间表示**: schema + validator + stitcher 三件套
5. **报告节点链**: 模板选择→布局→篇幅→章节生成→渲染
6. **章节级质量校验**后再装订
7. **爬虫与分析引擎分离**（MindSpider 独立可单独跑）
8. **分 Agent 独立 LLM 配置**（KEY/BASE_URL/MODEL）
9. **中间件层**: 关键词优化、情感分析（非纯 LLM）
10. **单 Agent 独立 Streamlit 调试入口**
11. **CLI 跳过分析直接重报告**（report_engine_only.py）
12. **max_reflections / max_content_length 等硬常量可配**

### P1

- SQLAlchemy 异步只读封装
- retry_helper 网络重试
- chart_to_svg / PDF layout optimizer
- 免责声明模板

### P2

- 多语言情感微调模型集
- MiroFish 预测扩展

---

## 11. 应避免的坑

- GPL-2.0 传染性
- 默认 DB 弱凭证必须改
- 爬虫合规风险（免责声明已前置）
- PDF 依赖系统级（weasyprint）
- Streamlit 端口残留
- 勿发明各 Engine 内部实现细节

---

## 12. 源码锚点速查

```
README.md
  v1.2.1; GPL-2.0
  Agents: Query, Media, Insight, Report
  ForumEngine: monitor.py, llm_host.py; forum_reader.py
  ReportEngine: template→layout→word_budget→chapter→stitch→html/pdf
  IR: ir/schema.py, ir/validator.py, core/stitcher.py
  MindSpider: --setup, --broad-topic, --complete, --deep-sentiment
  Sentiment: BERT-LoRA, GPT2-LoRA, multilingual, SmallQwen, ML
  Config: max_reflections=2, max_search_results=15, max_content_length=8000
          get_comments_limit=500, max_search_results_for_llm=50
          confidence_threshold=0.8, batch_size=32, max_seq=512
  DB: bettafish/bettafish@db:5432 postgresql
  Ports: Flask 5000; Streamlit 8501-8503
  Python 3.9+; 2GB+ RAM
  CLI: report_engine_only.py, regenerate_latest_{html,md,pdf}.py
  Follow-up: MiroFish
```

**未本轮打开**: 各 `*/agent.py` 实现。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | 分 Agent 专属工具集 |
| 权限/安全边界 | 3 | 只读 DB；免责声明 |
| 容错与会话恢复 | 3 | retry_helper；重生成工具 |
| 上下文工程 | 5 | max_content_length + 反思 + 论坛融合 |
| 可扩展（技能/MCP） | 4 | 纯 Python 模块化 |
| 可观测与可评测 | 3 | logs/ + IR 校验 |
| 生产可用成熟度 | 3 | Docker 有；舆情垂直 |

**综合**: **论坛协作 + IR 报告管线的多 Agent 分析系统**。openmate 抄 ForumEngine、IR 三件套、爬虫分离与分 Agent LLM 配置。

---

## 14. 关键链接

- https://github.com/666ghj/BettaFish
- https://github.com/666ghj/MiroFish
- https://github.com/666ghj/DeepSearchAgent-Demo
- 相关: `reports/gpt-researcher.md`、`reports/storm.md`、`reports/deer-flow.md`
