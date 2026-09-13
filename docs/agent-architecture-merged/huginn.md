# Huginn

## 概述

Huginn 是一个自动化任务引擎。

**仓库**: https://github.com/huginn/huginn

## 核心架构

> **仓库**: [huginn/huginn](https://github.com/huginn/huginn)
> **语言**: Ruby (Rails)
> **License**: MIT
> **定位**: 自托管的 IFTTT/Zapier 替代品，通过 Agent 有向图实现事件驱动的自动化任务

`WebhookAgent` 展示了 Agent 如何处理外部 HTTP 请求：

```ruby
class WebhookAgent < Agent
  cannot_be_scheduled!
  cannot_receive_events!
  
  def receive_web_request(request)
    # 验证 secret
    # 验证 HTTP 方法
    # 可选 reCAPTCHA 验证
    # 创建事件
...

Agent 通过 `receive_web_request` 方法处理 HTTP 请求，框架负责路由和锁管理。

Huginn 是一个标准的 Rails MVC 应用：
- **Web UI**：Bootstrap 风格的管理界面，支持 Agent 创建、编辑、拖拽连线
- **WebHook 端点**：每个 Agent 都有独立的 WebHook URL，格式为 `/users/:user_id/web_requests/:agent_id/:secret`
- **API**：支持通过 API 创建和管理 Agent

Agent 的 WebHook 端点设计很有特色：URL 中包含 secret token 作为认证机制，同时支持 reCAPTCHA 验证。

Huginn 支持多种部署方式：
- **Docker**：官方镜像，最简单的方式
- **Heroku**：一键部署
- **OpenShift**：模板部署
- **手动安装**：支持 MySQL/PostgreSQL

架构组件：
- Rails 应用服务器
- 数据库（MySQL 或 PostgreSQL）
- 后台任务队列（Sidekiq/Delayed Job）
- 调度进程（bin/schedule.rb）

---

## 关键技术

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

- 仓库：https://github.com/huginn/huginn  
- 出站安全：`doc/manual/outbound-requests.md`  
- 相关报告：`reports/openclaw.md`、`reports/aihawk-l1.md`、`reports/mem0.md`

## 对openmate的启示

1. **事件驱动 + 有向图**：这是自动化系统的经典架构模式，经过验证且高效
2. **STI + Mixin**：Ruby 的单表继承和 Mixin 模式非常适合插件化架构
3. **声明式能力**：Agent 通过类方法声明自身能力，框架据此优化调度
4. **Liquid 模板**：将编程能力以低代码方式暴露给用户
5. **自托管优先**：用户数据主权的设计理念

- **事件传播机制**：`possibly_propagate` 的推拉结合模式值得借鉴
- **Agent 能力声明**：声明式设计让框架可以做更多优化
- **执行锁设计**：advisory lock 方案在分布式场景下依然有效
- **Liquid 模板**：低代码配置能力可以降低 Agent 使用门槛

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（61-huginn.md）
- MiMo报告（huginn-l1.md）
- MiMo卡片（huginn.md）
