# TauricResearch/TradingAgents — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/TauricResearch/TradingAgents  
> 抓取通道: cdn.jsdelivr.net/gh/TauricResearch/TradingAgents@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多角色辩论 / 检查点恢复 / 数据供应商链 / 决策记忆 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md`（完整框架说明、角色分工、v0.4.0 变更）、`tradingagents/default_config.py`（完整 DEFAULT_CONFIG 与 env 覆盖表）
- 未打开: graph 节点实现、具体分析师 prompt（需 clone）
- 所有常量与路径均源码实读；未标注部分不发明

---

## 1. 系统架构（源码 + README 实读）

### 1.1 定位

TradingAgents 是 **多 Agent LLM 金融交易研究框架**，镜像真实交易公司分工。论文 arXiv:2412.20138。**非投资建议**，研究向。

### 1.2 角色链（README 实读）

```
Analyst Team
  ├── Fundamentals Analyst  — 财务/基本面
  ├── Sentiment Analyst     — 新闻/StockTwits/Reddit 情绪
  ├── News Analyst          — 宏观/全球新闻
  └── Technical Analyst     — MACD/RSI 等技术指标
        ↓
Researcher Team
  ├── Bullish Researcher
  └── Bearish Researcher    — 结构化辩论
        ↓
Trader Agent                — 组合报告 → 下单决策
        ↓
Risk Management Team        — 波动率/流动性风险评估
        ↓
Portfolio Manager           — 批准/否决 → 模拟交易所执行
```

### 1.3 版本演进（README News 实读）

| 版本 | 日期 | 关键 |
|------|------|------|
| v0.4.0 | 2026-08 | look-ahead/PIT 修复、CLI checkpoint resume、GPT-5.6/GLM-5.3 |
| v0.3.1 | 2026-07 | Alpha Vantage look-ahead 过滤、graph-router crash-safety、可配 LLM 重试预算 |
| v0.3.0 | 2026-06 | 数据访问契约、NVIDIA/Kimi/Groq/Mistral/Bedrock、FRED/Polymarket |
| v0.2.5 | 2026-05 | Sentiment Analyst grounded、`TRADINGAGENTS_*` env、ticker path-traversal 加固 |
| v0.2.4 | 2026-04 | structured-output agents、LangGraph checkpoint resume、decision log |

### 1.4 实现栈

- **LangGraph** 图编排
- 多 Provider: OpenAI / Google / Anthropic / xAI / DeepSeek / Qwen(DashScope 国际+中国) / GLM(Zhipu) / MiniMax(global+CN) / OpenRouter / Ollama / Azure / Bedrock / openai_compatible

---

## 2. DEFAULT_CONFIG 全量（`default_config.py` 源码实读）

### 2.1 路径常量

```python
_TRADINGAGENTS_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")

"results_dir":      ~/.tradingagents/logs
"data_cache_dir":   ~/.tradingagents/cache
"memory_log_path":  ~/.tradingagents/memory/trading_memory.md
"memory_log_max_entries": None   # 无旋转
```

Checkpoint DB 路径（README）:
```
~/.tradingagents/cache/checkpoints/<TICKER>.db
```
可被 `TRADINGAGENTS_CACHE_DIR` 覆盖。

### 2.2 LLM 与辩论

```python
"llm_provider": "openai"
"deep_think_llm": "gpt-5.6"      # 复杂推理
"quick_think_llm": "gpt-5.6-luna"  # 快任务
"backend_url": None               # None = 各 provider 默认 endpoint
"google_thinking_level": None     # "high"/"minimal"
"openai_reasoning_effort": None   # "medium"/"high"/"low"
"anthropic_effort": None
"temperature": None
"llm_max_retries": None           # None = SDK 默认(通常 2)
"max_tokens": None
"checkpoint_enabled": False
"output_language": "English"      # 分析报告语言；内部辩论固定英文
"max_debate_rounds": 1
"max_risk_discuss_rounds": 1
"max_recur_limit": 100
```

### 2.3 新闻与数据供应商（真实常量）

```python
"news_article_limit": 20
"global_news_article_limit": 10
"global_news_lookback_days": 7
"global_news_queries": [
    "Federal Reserve interest rates inflation",
    "S&P 500 earnings GDP economic outlook",
    "geopolitical risk trade war sanctions",
    "ECB Bank of England BOJ central bank policy",
    "oil commodities supply chain energy",
]
"data_vendors": {
    "core_stock_apis": "yfinance",       # or alpha_vantage
    "technical_indicators": "yfinance",
    "fundamental_data": "yfinance",
    "news_data": "yfinance",
    "macro_data": "fred",                # 需 FRED_API_KEY
    "prediction_markets": "polymarket",  # keyless
}
"tool_vendors": {}  # 工具级覆盖，优先于类别级
```

**关键设计（源码注释）**: 配置的 vendor 就是精确链，**不会静默路由到未选 vendor**。有序回退需显式写 `"yfinance,alpha_vantage"`；`"default"` 使用全部可用 vendor。

### 2.4 Alpha 基准映射（真实常量）

```python
"benchmark_ticker": None
"benchmark_map": {
    ".NS": "^NSEI", ".BO": "^BSESN", ".T": "^N225",
    ".HK": "^HSI",  ".L": "^FTSE",   ".TO": "^GSPTSE",
    ".AX": "^AXJO", ".SS": "000001.SS", ".SZ": "399001.SZ",
    "": "SPY",  # US 默认
}
```

### 2.5 ENV 覆盖表（`_ENV_OVERRIDES` 全量）

| ENV | Config Key |
|-----|------------|
| TRADINGAGENTS_LLM_PROVIDER | llm_provider |
| TRADINGAGENTS_DEEP_THINK_LLM | deep_think_llm |
| TRADINGAGENTS_QUICK_THINK_LLM | quick_think_llm |
| TRADINGAGENTS_LLM_BACKEND_URL | backend_url |
| TRADINGAGENTS_OUTPUT_LANGUAGE | output_language |
| TRADINGAGENTS_MAX_DEBATE_ROUNDS | max_debate_rounds |
| TRADINGAGENTS_MAX_RISK_ROUNDS | max_risk_discuss_rounds |
| TRADINGAGENTS_CHECKPOINT_ENABLED | checkpoint_enabled |
| TRADINGAGENTS_BENCHMARK_TICKER | benchmark_ticker |
| TRADINGAGENTS_TEMPERATURE | temperature |
| TRADINGAGENTS_LLM_MAX_RETRIES | llm_max_retries |
| TRADINGAGENTS_MAX_TOKENS | max_tokens |
| TRADINGAGENTS_GOOGLE_THINKING_LEVEL | google_thinking_level |
| TRADINGAGENTS_OPENAI_REASONING_EFFORT | openai_reasoning_effort |
| TRADINGAGENTS_ANTHROPIC_EFFORT | anthropic_effort |
| TRADINGAGENTS_RESULTS_DIR | results_dir |
| TRADINGAGENTS_CACHE_DIR | data_cache_dir |
| TRADINGAGENTS_MEMORY_LOG_PATH | memory_log_path |

### 2.6 类型强制（源码实读）

```python
_BOOL_TRUE  = ("true", "1", "yes", "on")
_BOOL_FALSE = ("false", "0", "no", "off")
```

`_coerce()` 对非法 bool 直接 `ValueError`（如 `treu`），**fail-loud 而非静默回落**——避免 unattended run 被悄悄配错。

---

## 3. 持久化与恢复（README 实读）

### 3.1 Decision Log（常开）

- 每次完成 run 追加到 `~/.tradingagents/memory/trading_memory.md`
- 下次同 ticker run：取已实现收益（raw + alpha vs SPY）→ 生成一段 reflection → 注入 Portfolio Manager prompt
- 注入内容: 最近同 ticker 决策 + 跨 ticker 经验教训
- 可选 `memory_log_max_entries` 旋转（pending 永不 prune）

### 3.2 Checkpoint Resume（opt-in）

```bash
tradingagents analyze --checkpoint
tradingagents analyze --clear-checkpoints
```

```python
config["checkpoint_enabled"] = True
```

- LangGraph 每节点后存 state
- 日志: `Resuming from step N for <TICKER> on <date>` / `Starting fresh`
- 成功完成后自动 clear checkpoints
- per-ticker SQLite: `~/.tradingagents/cache/checkpoints/<TICKER>.db`

### 3.3 失败路径（README + changelog 推断）

| 失败 | 行为 |
|------|------|
| LLM 429 | `llm_max_retries` 可配；None=SDK 默认 2 |
| max_tokens 未设 | reasoning 模型可能 hang / gateway idle timeout（#1204 deepseek-v4-flash） |
| ticker path traversal | v0.2.5 加固 |
| graph-router crash | v0.3.1 crash-safety |
| Alpha Vantage look-ahead | v0.3.1 过滤 |
| 温度 misspell | `_coerce` ValueError，启动即失败 |

---

## 4. 可复现性（README 专节实读）

变差来源：
1. LLM sampling 非确定性（reasoning 模型忽略 temperature）
2. Live data 移动（新闻/StockTwits/Reddit 随时间变）

已修复：
- 公司身份从 ticker **确定性解析**（修“不同公司” bug）
- Market analyst 价格/指标 grounded 在 verified data snapshot（修幻觉价格）

不保证: 回测收益可复现。研究 scaffold 而非固定策略。

---

## 5. 与 openmate 映射

| 需求 | TradingAgents 机制 | 可复用度 |
|------|-------------------|----------|
| 多角色子 Agent | Analyst/Researcher/Trader/Risk/PM | **高** |
| 辩论环 | Bull vs Bear + max_debate_rounds | **高** |
| 风险否决 | Risk Team → PM approve/reject | **高** |
| 角色上下文隔离 | 每分析师独立，只回传报告 | **高** |
| 检查点恢复 | LangGraph per-node + per-project SQLite | **高** |
| 决策记忆 | trading_memory.md + reflection 注入 | **高** |
| 数据供应商链 | data_vendors 显式、不静默回退 | **高** |
| ENV 配置 fail-loud | `_coerce` ValueError | **高** |
| 双 think 模型 | deep_think vs quick_think | 中 |
| 多市场 ticker | benchmark_map 后缀 | 中 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| max_debate_rounds | 1（默认） | default_config.py |
| max_risk_discuss_rounds | 1 | default_config.py |
| max_recur_limit | 100 | default_config.py |
| news_article_limit | 20 | default_config.py |
| global_news_article_limit | 10 | default_config.py |
| global_news_lookback_days | 7 | default_config.py |
| checkpoint_enabled | False | default_config.py |
| memory_log_max_entries | None | default_config.py |
| bool 真值集 | true/1/yes/on | default_config.py |
| Python | 3.12（conda 建议） | README |
| 数据 | yfinance / Alpha Vantage / FRED / Polymarket | README + config |

---

## 7. 失败路径汇总

```
非法 env bool (treu)
  → _coerce ValueError → 启动失败（fail-loud）

LLM 429
  → llm_max_retries（可配，默认 SDK 2）

reasoning 模型 max_tokens 未设
  → hang / gateway idle timeout

ticker 含 path traversal
  → v0.2.5 加固拒绝

数据源故障
  → 数据源故障中断决策链（无自动降级叙事）
  → data_vendors 显式链可配有序回退

checkpoint 损坏
  → --clear-checkpoints 重置

决策日志膨胀
  → memory_log_max_entries 旋转（pending 不 prune）
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **多角色子 Agent 链**: 分析 → 辩论 → 执行 → 风险 → 审批
2. **Bull/Bear 辩论 + max_rounds 上限**（控 token）
3. **独立风险否决角色**（高风险操作必须过）
4. **per-role 独立上下文，只回传摘要**
5. **LangGraph 检查点**: per-project SQLite，`--checkpoint` / `--clear-checkpoints`
6. **决策记忆文件**: 追加 markdown + 下次注入 reflection
7. **data_vendors 显式供应商链**: 不静默回退
8. **env 覆盖表 `_ENV_OVERRIDES`**: 单一来源，type-driven coerce
9. **双模型档位**: deep_think vs quick_think
10. **fail-loud 配置校验**: 非法 bool 启动即炸

### P1 — 应抄

- 多市场 benchmark_map（后缀 → 区域指数）
- global_news_queries 可扩展宏观搜索词
- output_language 与 internal reasoning language 分离

### P2 — 可选

- 金融垂直技能包
- Polymarket 预测市场集成

---

## 9. 应避免的坑

- 勿把研究框架当生产交易执行器
- 辩论轮次过多烧 token：默认 max_debate_rounds=1 已保守
- reasoning 模型忽略 temperature：需非 reasoning 模型才能紧复现
- live 新闻/社交数据不可 pin：只有价格/指标可 pin 到分析日
- backend_url 保持 None：曾把 OpenAI `/v1` 泄漏给 Gemini 产生畸形 URL
- 勿发明未核验路径

---

## 10. 源码锚点速查

```
tradingagents/default_config.py
  _TRADINGAGENTS_HOME = ~/.tradingagents
  _ENV_OVERRIDES (18 项)
  _BOOL_TRUE / _BOOL_FALSE
  _coerce / _apply_env_overrides
  DEFAULT_CONFIG:
    deep_think_llm=gpt-5.6, quick_think_llm=gpt-5.6-luna
    max_debate_rounds=1, max_risk_discuss_rounds=1, max_recur_limit=100
    news_article_limit=20, global_news_article_limit=10, global_news_lookback_days=7
    data_vendors: yfinance / fred / polymarket
    benchmark_map: 10 后缀 + US=SPY
    checkpoint_enabled=False
    memory_log_path=~/.tradingagents/memory/trading_memory.md

README.md
  Roles: Fundamentals/Sentiment/News/Technical → Bull/Bear → Trader → Risk → PM
  Checkpoint: ~/.tradingagents/cache/checkpoints/<TICKER>.db
  CLI: tradingagents / tradingagents analyze --checkpoint
  Package: TradingAgentsGraph.propagate("NVDA", "2026-01-15")
  Python: 3.12, pip install .
  Docker: docker compose run --rm tradingagents
  Ollama: http://localhost:11434/v1
```

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | 角色→工具裁剪清晰 |
| 权限/安全边界 | 2 | 研究向，无企业 RBAC |
| 容错与会话恢复 | 4 | LangGraph checkpoint + clear |
| 上下文工程 | 5 | 角色隔离 + 摘要回传 + 记忆注入 |
| 可扩展（技能/MCP） | 3 | 供应商链可扩展 |
| 可观测与可评测 | 3 | decision log + alpha 基准 |
| 生产可用成熟度 | 3 | 有 Docker/env，但研究定位 |

**综合**: **多角色辩论式决策 + 可恢复 LangGraph 图**。openmate 抄角色链、辩论环、检查点、决策记忆与 fail-loud 配置。

---

## 12. 关键链接

- https://github.com/TauricResearch/TradingAgents
- https://arxiv.org/abs/2412.20138
- 相关: `reports/langgraph.md`、`reports/crewai.md`、`reports/camel-l1.md`
