# Huginn 架构深度研究报告

> 仓库: https://github.com/huginn/huginn  
> 抓取通道: cdn.jsdelivr.net/gh/huginn/huginn@master  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate（混合编码 + 个人助手）提供事件 DAG、调度锁、egress 安全、执行幂等借鉴

---

## 0. 诚实性说明

- 成功拉取：`app/models/agent.rb`、`app/models/event.rb`、`app/models/agents/website_agent.rb`、`app/models/agents/digest_agent.rb`、`app/models/agents/scheduler_agent.rb`、`app/models/agents/peak_detector_agent.rb`、`.env.example`、`doc/manual/outbound-requests.md`。
- 404：`lib/huginn_agent.rb`、`app/concerns/agent_controller.rb`（路径以实际 GET 成功为准，不发明）。
- Huginn 是 **Ruby on Rails 事件自动化框架**，不是 LLM Agent 框架。对 openmate 的价值在确定性触发与分布式锁，不在模型循环。

---

## 1. 系统架构

### 1.1 定位与事件图

```
Agent A (create_event)
   ↓ Link (source → receiver)
Agent B (receive(events) → memory → create_event)
   ↓
Agent C (通知: Email / Slack / Webhook / IMAP …)
```

核心模型（`app/models/agent.rb`）：

| 概念 | 实现 |
|------|------|
| Agent | `ActiveRecord::Base` 子类；`options`/`memory` JSON 序列化 |
| Event | `payload` JSON + 可选 `lat`/`lng`/`expires_at` |
| Link | `source_id` → `receiver_id`，构成 DAG |
| ControlLink | controller → control_target（enable/disable/run） |
| Scenario | 一组 Agent 的可导入导出包装 |
| AgentLog | 每 Agent 日志，默认保留 200 行 |

### 1.2 源码布局（实读路径）

| 路径 | 职责 |
|------|------|
| `app/models/agent.rb` | Agent 基类：调度表、锁、事件传播、能力开关 |
| `app/models/event.rb` | 事件：location、过期清理、immediate propagate |
| `app/models/agents/website_agent.rb` | 抓取 Agent：html/xml/json/text 四模式 |
| `app/models/agents/digest_agent.rb` | 攒批摘要 |
| `app/models/agents/scheduler_agent.rb` | cron 控制其他 Agent |
| `app/models/agents/peak_detector_agent.rb` | 峰值检测（std 倍数） |
| `doc/manual/outbound-requests.md` | Smokescreen egress 文档 |
| `.env.example` | 全量配置与安全开关 |

### 1.3 进程与调度

- Rails Web UI + delayed_job 后台 worker。
- `bin/schedule.rb` 周期性调用 `Agent.receive!` 与 `Agent.run_schedule(schedule)`。
- 调度频率：`SCHEDULER_FREQUENCY=0.3`（秒）。
- 事件过期检查：`EVENT_EXPIRATION_CHECK=6h`。
- 失败任务保留：`FAILED_JOBS_TO_KEEP=100`。
- 后台 job 最大运行：`DELAYED_JOB_MAX_RUNTIME=2` 分钟；空闲 sleep `DELAYAY_JOB_SLEEP_DELAY=10` 秒。

### 1.4 事件传播调用链

```
Event.after_create_commit → possibly_propagate
  → 若 receiver.propagate_immediately → Agent.receive!
Agent.receive!（全局 advisory lock PROPAGATION_LOCK_NAME）
  → JOIN links + events，找 last_checked_event_id 之后的新事件
  → 更新 agent.last_checked_event_id
  → Agent.async_receive(agent_id, event_ids) → AgentReceiveJob
AgentCheckJob → with_execution_lock → agent.check
```

关键常量（agent.rb 实读）：

```ruby
EXECUTION_LOCK_PREFIX = "huginn:agent:execution:".freeze
PROPAGATION_LOCK_NAME = "huginn:agent:propagation".freeze
```

---

## 2. Agent Loop / 事件系统 / 工具面

### 2.1 Agent 生命周期

基类能力开关（类方法，子类声明）：

| 方法 | 作用 |
|------|------|
| `cannot_be_scheduled!` | 不参与 schedule |
| `cannot_receive_events!` | 不接事件 |
| `cannot_create_events!` | 不发事件 |
| `can_control_other_agents!` | 可走 ControlLink |
| `can_dry_run!` | 支持 dry-run |
| `no_bulk_receive!` | 逐事件队列，不批量 |
| `default_schedule "every_12h"` | 默认调度 |

SCHEDULES 枚举（agent.rb 实读）：

```
every_1m every_2m every_5m every_10m every_30m
every_1h every_2h every_5h every_12h
every_1d every_2d every_7d
midnight 1am … 11am noon 1pm … 11pm never
```

EVENT_RETENTION_SCHEDULES：`0`(Forever)、1h、6h、1d、2…365 days。

### 2.2 事件模型（event.rb 实读）

- `payload` JSON 序列化；可选 `lat`/`lng`（`acts_as_mappable`）。
- `expires_at`：`keep_events_for > 0` 时 `keep_events_for.seconds.from_now`。
- MySQL 特例：`to_expire` 排除 `maximum(:id)`，保护 InnoDB AUTO_INCREMENT。
- `cleanup_expired!`：删过期事件并刷新 `events_count`。
- `possibly_propagate`：仅对 `propagate_immediately: true` 的 receiver 立刻 `receive!`。

### 2.3 WebsiteAgent（抓取工具面）

```ruby
UNIQUENESS_LOOK_BACK = 200
UNIQUENESS_FACTOR = 3
```

- 类型：`html` / `xml` / `json` / `text`。
- 抽取：CSS / XPath / JSONPath / regexp+index。
- 模式：`on_change`（默认）/ `all` / `merge`。
- 唯一性回看：`max(UNIQUENESS_LOOK_BACK, UNIQUENESS_FACTOR * num_events)`。
- `http_success_codes`：可把 404/422 当成功。
- 编码：`force_encoding` → Content-Type → BOM/meta → UTF-8。
- 错误：`error "Error when fetching url: #{e.message}\n#{e.backtrace…}"`。

### 2.4 DigestAgent

- `memory["queue"]` 收 event id；`check` 时合并发一条。
- `retained_events`：0–999（校验强制）；>0 时滚动保留。
- 默认 schedule：`6am`。

### 2.5 SchedulerAgent（cron 控制器）

- `cannot_be_scheduled!` + `cannot_receive_events!` + `cannot_create_events!`。
- 行为：`run` / `disable` / `enable` 目标 Agent。
- cron 扩展：时区后缀、秒字段、`L` 月末、星期名、`Sun#1`/`Sun#L1`。
- 秒精度默认关闭：`ENABLE_SECOND_PRECISION_SCHEDULE=false`；关闭时秒字段仅允许 `0/15/30/45/60`。

### 2.6 PeakDetectorAgent

```ruby
DEFAULT_SEARCH_URL = 'https://twitter.com/search?q={q}'
```

默认：`window_duration_in_days=14`、`min_peak_spacing_in_days=2`、`std_multiple=3`、`min_events=4`。

峰值条件：`newest_value > mean + std_multiple * stddev`，且距上次峰 ≥ spacing。

### 2.7 DelayAgent（缓冲队列，实读）

```ruby
default_options = {
  'expected_receive_period_in_days' => 10,
  'max_events' => 100,
  'keep' => 'newest',   # 或 'oldest'
  'max_emitted_events' => '',
  'emit_interval' => 0,
  'events_order' => [],
}
```

- `memory['event_ids']` 环形缓冲；超 `max_events` 时按 `keep` 丢弃。
- `check` 时 `extract_emitted_events!` + 可选 `sleep emit_interval`。
- `with_lock` 保护 memory 读写。

### 2.8 ChangeDetectorAgent（属性变更检测，实读）

- `cannot_be_scheduled!`；事件驱动。
- `memory['last_property']` 存上次值。
- Liquid 可用 `last_property` 变量实现「只在降价时触发」等。
- 变则 `create_event payload: event.payload` 并更新 memory。

### 2.9 EmailAgent（出站通知，实读）

```ruby
can_dry_run!
default_schedule "never"
cannot_create_events!
no_bulk_receive!
```

- Liquid 渲染 `subject` / `body` / `from` / `content_type`。
- `SystemMailer.send_message(...).deliver_now`。
- 发送失败：`error(...)` + **re-raise**（让 job 层重试）。

### 2.10 Liquid 插值

- 事件经 Liquid Drop 暴露：`agent`、`created_at`、payload key、`_location_`。
- WebsiteAgent 注入 `_url_`、`_response_`（status/headers/url）。

---

## 3. 稳定性 / HA

### 3.1 分布式锁与幂等

| 锁 | 常量 | 作用 |
|----|------|------|
| 单 Agent 执行 | `huginn:agent:execution:<id>` | `with_execution_lock` 防同 Agent 并发 |
| 事件传播 | `huginn:agent:propagation` | 全局串行 `receive!` |
| 实现 | `with_advisory_lock!` | DB advisory lock；`disable_query_cache: true` |

`last_checked_event_id` 前进式游标：崩溃后不重复消费已推进的事件；异常在 `receive!` 事务内回滚。

### 3.2 错误与恢复

- Agent 错误：`error(msg)` → `AgentLog` level 4；`working?` 可查 `recent_error_logs?`。
- Job 失败：delayed_job 重试；`FAILED_JOBS_TO_KEEP=100`。
- 事件过期：`EVENT_EXPIRATION_CHECK=6h` 周期清理。
- 无 LLM 重试/熔断——它不是模型网关。

### 3.3 会话与状态

- Agent `memory` JSON 落库；崩溃后队列/峰值窗口仍在。
- Digest `memory["queue"]`、Peak `memory['data']`/`memory['peaks']` 即恢复点。
- 无「聊天 checkpoint」——产品形态是事件图，不是对话 Harness。

### 3.4 HTTP 客户端（web_request_concern.rb 实读）

**OutboundProxy 强制**：

```ruby
if OutboundProxy.enforced?
  errors.add(:base, "proxy cannot be set because outbound requests of this Huginn instance go through OUTBOUND_PROXY")
end
```

设了全局 `OUTBOUND_PROXY` 后 per-Agent `proxy` 选项直接校验失败——**防用户绕过**。

**Faraday 超时**：

```ruby
builder.options.timeout = (Delayed::Worker.max_run_time.seconds - 2).to_i
```

HTTP 超时比后台 job 最大运行时间短 2 秒，避免 worker 被挂死请求卡住。

**后端选择**：

```ruby
faraday_backend
  ENV.fetch('FARADAY_HTTP_BACKEND') {
    case interpolated['backend']
    in 'typhoeus' | 'net_http' | 'httpclient' | 'em_http' => backend
    else 'typhoeus'
    end
  }.to_sym
```

默认 `typhoeus`；可按 Agent 覆盖。

**编码中间件 `CharacterEncoding`**：

1. `force_encoding` 优先
2. Content-Type `charset=` 参数
3. text/xml/json 类型 → `default_encoding`（UTF-8）
4. 其他 → 不转码（binary）
5. `unzip: gzip` 可解压

**User-Agent**：

```ruby
DEFAULT_HTTP_USER_AGENT = "Huginn - https://github.com/huginn/huginn"
# ENV DEFAULT_HTTP_USER_AGENT 可覆盖
```

**redirect**：默认 `follow_redirects`；`disable_redirect_follow` 可关。

**basic_auth**：`"user:pass"` 或 `["user","pass"]`；其他格式 `ArgumentError`。

### 3.5 JSON 一致性（utils.rb 实读）

```ruby
def self.normalize_json(value)  # Hash key 排序 + 递归
def self.stable_json(value)     # JSON.dump(normalize_json)
def self.same_json?(left, right)
```

WebsiteAgent `on_change` 模式用 `same_json?` 判断「无变化则只续期 expires_at，不发新事件」。

### 3.6 出站安全（Smokescreen）

`doc/manual/outbound-requests.md` 实读：

- Docker：`ENABLE_SMOKESCREEN=true` → 监听 `127.0.0.1:4750`，自动设 `OUTBOUND_PROXY`。
- 默认拒绝：loopback、link-local（含 `169.254.169.254`）、RFC1918、`fc00::/7`、CGNAT `100.64.0.0/10`、multicast、嵌 IPv4 的 IPv6。
- 显式放行：`SMOKESCREEN_OPTS=--allow-address=…` / `--allow-range=10.1.2.0/24`。
- 设了 `OUTBOUND_PROXY` 后**拒绝 per-Agent `proxy` 选项**，防用户绕过。
- 非 HTTP（FTP/IMAP/MQTT/XMPP）不经代理，需网络层限制。

其他安全开关（`.env.example`）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_INSECURE_AGENTS` | `false` | 才允许 ShellCommandAgent |
| `USE_JQ` | 注释掉 | JqAgent 可能死循环，不默认开 |
| `ENABLE_SECOND_PRECISION_SCHEDULE` | `false` | 防秒级滥用 |
| `FARADAY_HTTP_BACKEND` | `typhoeus` | HTTP 后端 |
| `DEFAULT_HTTP_USER_AGENT` | `"Huginn - https://github.com/huginn/huginn"` | 默认 UA |

---

## 4. 自我进化

- 几乎无学习型进化；进化 = 人写新 Agent / 外部 gem。
- `ADDITIONAL_GEMS` 注入垂直 Agent：`huginn_nlp_agents(~> 0.2.1)` 等。
- 事件历史可分析，但不自动改写行为。
- 对 openmate：价值在**确定性自动化层**，不在自我反思。

---

## 5. 权限 / 安全边界

### 5.1 账户策略（.env 实读）

| 变量 | 默认 |
|------|------|
| `MIN_PASSWORD_LENGTH` | `8` |
| `MAX_FAILED_LOGIN_ATTEMPTS` | `10` |
| `LOCK_STRATEGY` | `failed_attempts` |
| `UNLOCK_STRATEGY` | `both` |
| `UNLOCK_AFTER` | `1.hour` |
| `RESET_PASSWORD_WITHIN` | `6.hours` |
| `REMEMBER_FOR` | `4.weeks` |
| `INVITATION_CODE` | `try-huginn`（必须改） |
| `APP_SECRET_TOKEN` | `REPLACE_ME_NOW!`（必须 rake secret） |

### 5.2 多用户隔离

- Agent 归属 user；`validates :sources/:receivers/:controllers, owned_by: :user_id`。
- 凭证：`user.user_credentials`；Agent `credential(name)` 带 per-agent cache。
- 无企业 RBAC；信任模型 = 实例内多用户 + 出站代理。

---

## 6. 对 openmate 的借鉴（P0 优先级）

### 6.1 直接可抄

1. **事件 DAG**：监控/触发用图，不塞进单一 chat loop。
2. **advisory lock 双锁**：单资源执行锁 + 全局传播锁。
3. **前进式 `last_checked_event_id`**：崩溃安全的消费游标。
4. **Egress proxy 默认拒绝内网/元数据**：Smokescreen 模式。
5. **能力开关 DSL**：`cannot_be_scheduled!` 等类方法声明，运行时统一校验。
6. **峰值检测参数化**：window / spacing / std_multiple / min_events。
7. **Digest 滚动保留**：`retained_events` 0–999。
8. **配置安全实践**：秒精度默认关、insecure agents 默认关、jq 默认关。

### 6.2 应避免的坑

- 不要用 Huginn 当 LLM 编排层；应 **LLM 负责意图，Huginn 式事件层负责可靠触发**。
- Ruby 栈与 openmate 选型不合时只抄模型。
- 站点选择器易过期，需维护成本。
- 非 HTTP 协议不经 egress proxy，多租户时要网络策略兜底。

### 6.3 重构优先级

- **P0**：openmate 内建「定时/事件触发」抽象（类 Huginn Agent + Link）
- **P0**：单任务执行锁 + 全局传播锁（advisory lock 语义）
- **P1**：出站网络策略（代理/允许列表，默认拒 169.254.169.254 与 RFC1918）
- **P1**：事件过期与 `last_checked_*` 游标
- **P2**：与 LLM 工具的双向桥（事件→唤醒 Agent；Agent→注册监控）

---

## 7. 源码锚点速查

```
app/models/agent.rb
  EXECUTION_LOCK_PREFIX = "huginn:agent:execution:"
  PROPAGATION_LOCK_NAME = "huginn:agent:propagation"
  SCHEDULES = every_1m … never
  receive! / async_receive / run_schedule / bulk_check / async_check
  with_execution_lock / credential / create_event / log / error

app/models/event.rb
  reemit! / cleanup_expired! / possibly_propagate
  location / expires_at / to_expire (MySQL 保护 maximum(:id))

app/models/agents/website_agent.rb
  UNIQUENESS_LOOK_BACK = 200
  UNIQUENESS_FACTOR = 3
  store_payload! / previous_payloads / extract_{xml,json,text}

app/models/agents/digest_agent.rb
  retained_events 0–999
  memory["queue"] → check 合并发一条

app/models/agents/scheduler_agent.rb
  ENABLE_SECOND_PRECISION_SCHEDULE
  Fugit::Cron；秒字段仅 0/15/30/45/60（默认）

app/models/agents/peak_detector_agent.rb
  DEFAULT_SEARCH_URL = 'https://twitter.com/search?q={q}'
  window=14d, spacing=2d, std_multiple=3, min_events=4

doc/manual/outbound-requests.md
  Smokescreen 127.0.0.1:4750
  拒绝 loopback / link-local / 169.254.169.254 / RFC1918 / CGNAT

.env.example
  SCHEDULER_FREQUENCY=0.3
  EVENT_EXPIRATION_CHECK=6h
  AGENT_LOG_LENGTH=200
  DELAYED_JOB_MAX_RUNTIME=2
  FAILED_JOBS_TO_KEEP=100
  ENABLE_INSECURE_AGENTS=false
  FARADAY_HTTP_BACKEND=typhoeus
  OUTBOUND_PROXY / ENABLE_SMOKESCREEN
  ADDITIONAL_GEMS
```

---

## 8. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 规则/事件驱动，非 LLM tool calling |
| 权限/安全边界 | 4 | egress proxy + 账户锁 + insecure 默认关 |
| 容错与会话恢复 | 4 | DB 状态 + advisory lock + 游标 |
| 上下文工程 | 2 | 非聊天上下文产品 |
| 可扩展（技能/MCP） | 3 | Agent gem；无 MCP 原生 |
| 可观测与可评测 | 3 | AgentLog + 事件历史 |
| 生产可用成熟度 | 5 | 2013 起持续维护 |

**综合**：**确定性个人自动化的祖师爷**。openmate 应吸收事件图、双锁、egress 安全，用 LLM 增强决策，而不是整仓替换为纯 LLM loop。

---

## 9. 关键链接

- 仓库：https://github.com/huginn/huginn  
- 出站安全：`doc/manual/outbound-requests.md`  
- 相关报告：`reports/openclaw.md`、`reports/aihawk-l1.md`、`reports/mem0.md`
