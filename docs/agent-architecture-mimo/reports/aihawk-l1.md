# feder-cr/AIHawk — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/feder-cr/AIHawk  
> 抓取通道: cdn.jsdelivr.net/gh/feder-cr/AIHawk@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 stealth 浏览器 agent / MCP server / 配置优先级 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（定位、MCP、UI、选项、隐私、License）
- 未打开: 包实现源码
- 历史: 曾为 LinkedIn 自动投递（媒体报道）；现定位 **stealth AI browser agent**
- License: **MIT**（2026-09-02 前分发的仍 AGPL-3.0）

---

## 1. 项目定位（README 实读）

> "Open-source AI browser agent that browses the web undetected: a web browsing agent on a stealth Firefox that anti-bot systems see as a normal person, so no captchas and no blocks."

自然语言指令 → 浏览、点击、输入、阅读真实网页。

**FEATURED IN**: Business Insider, TechCrunch, Semafor, Wired, The Verge, Vanity Fair, 404 Media

---

## 2. 两种使用方式（README 实读）

### 2.1 从 assistant 经 MCP

```powershell
# Windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
uvx invisible-playwright fetch
```

```bash
# Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env
uvx invisible-playwright fetch
```

客户端注册:

```bash
claude mcp add --scope user stealth -- uvx aihawk
codex mcp add stealth -- uvx aihawk
gemini mcp add --scope user stealth uvx aihawk
```

**`aihawk` 无 subcommand = MCP server**；`aihawk ui` = Web UI。

### 2.2 Standalone Web UI

```bash
uvx invisible-playwright fetch
uvx aihawk ui --openrouter-key sk-or-...
# http://127.0.0.1:8765
```

Chat 左，live browser 右。

---

## 3. CLI 选项（README 实读，全量）

| 选项 | 说明 |
|------|------|
| `--openrouter-key` | 或 `OPENROUTER_API_KEY` |
| `--model` | OpenRouter model id 或 `AIHAWK_MODEL`；默认 **`z-ai/glm-5.3-flash`** |
| `--proxy` | `http://user:pass@host:port` 或 `socks5://host:port`；host+port 必填；timezone/locale/egress 跟随 |
| `--binary` | 已有 engine binary；**必须是 seal pin 的 build**，否则拒绝启动（跳过下载不跳过版本检查） |
| `--seed` | 整数；同 seed = 同 browser identity |
| `--profile-dir` | 保留 profile（登录/cookie 跨重启） |
| `--headed` | 显示浏览器窗口 |
| `--host` / `--port` | 默认 `127.0.0.1:8765`；改 host **暴露无鉴权接口** |

### 3.1 .env 约定

```
OPENROUTER_API_KEY=sk-or-...
STEALTHFOX_BINARY=/path/to/firefox
```

**优先级（README 实读）**:
```
--flag  >  环境变量  >  .env  >  默认
```

关键细节:
- .env **从不覆盖**已设置的变量
- **仅读当前目录**，不向上搜索（子目录不会静默捡到不同 key）
- 启动行打印应用的变量名，**从不打印值**
- `--openrouter-key` 会进 shell history / Linux process list → 推荐 env 或 .env

---

## 4. 系统架构（README + 家族仓库）

```
用户自然语言
  → MCP server (aihawk) 或 Web UI
  → OpenRouter LLM（默认 z-ai/glm-5.3-flash）
  → invisible_playwright（引擎，Playwright API）
  → invisible_core（seed→fingerprint→prefs/proxy/geo）
  → Stealth Firefox
  → 真实网页
```

### 4.1 家族仓库

| 仓库 | 职责 |
|------|------|
| [invisible_playwright](https://github.com/feder-cr/invisible_playwright) | 引擎，Python 库，API 是 Playwright 的 |
| [invisible_core](https://github.com/feder-cr/invisible_core) | seed → fingerprint → preferences / proxy / geolocation |
| AIHawk | MCP server + Web UI 包装 |

### 4.2 MCP 配置

Wiki: [The MCP server](https://github.com/feder-cr/AIHawk/wiki/mcp-server) — config blocks、settings、tools。

官方 MCP Registry token（README HTML 注释）:
```
mcp-name: io.github.feder-cr/aihawk
```

---

## 5. 隐私模型（README 实读）

**本机运行，无自有 server**。外传数据:

| 接收方 | 内容 |
|--------|------|
| 访问的网站 | 浏览器指纹（如普通 Firefox） |
| 模型 provider (OpenRouter) | 对话 + agent 读到的页面内容（UI）；MCP 时由客户端 provider |
| GitHub | engine 二进制下载；proxy 时 GeoIP DB；每次启动拉一行计数文件（无标识符） |

本地存储: sessions、profiles、screenshots 在 `AIHAWK_HOME` 或系统 app-data；可删；无其他留存。

---

## 6. 责任使用（README 实读）

> "Read the terms of the sites you point it at, respect their rate limits, and do not submit anything a human has not read."

---

## 7. 与 openmate 映射

| 需求 | AIHawk 机制 | 可复用度 |
|------|------------|----------|
| MCP browser server | `uvx aihawk` 即 server | **高** |
| Stealth 反检测 | Stealth Firefox + invisible_core | **高** |
| Seed 可复现身份 | `--seed` 同 seed 同指纹 | **高** |
| Profile 持久化 | `--profile-dir` 保登录 | **高** |
| 配置优先级 | flag > env > .env > default | **高** |
| .env 不向上搜索 | 仅当前目录 | **高** |
| 不打印密钥值 | 启动只打名字 | **高** |
| Proxy 隔离 geo/locale | timezone/locale/egress 跟随 | 高 |
| Binary 版本 pin | seal 必须匹配否则拒绝 | **高** |
| 默认绑定 127.0.0.1:8765 | 安全默认；改 host 无鉴权警告 | 高 |
| Playwright API 兼容 | invisible_playwright | 高 |
| 双形态 | MCP + UI | 高 |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 默认模型 | z-ai/glm-5.3-flash | README |
| 默认 host:port | 127.0.0.1:8765 | README |
| Provider | OpenRouter | README |
| 引擎 | invisible-playwright (Stealth Firefox) | README |
| 配置优先级 | flag > env > .env > default | README |
| .env 搜索 | 仅当前目录 | README |
| Binary 检查 | seal pin 必须匹配 | README |
| MCP 名 | io.github.feder-cr/aihawk | README 注释 |
| License | MIT（2026-09-02 后）；之前 AGPL-3.0 | README |
| 安装 | uvx invisible-playwright fetch; uvx aihawk | README |

---

## 9. 失败路径 / 边界

```
Binary 与 seal pin 不匹配
  → 启动拒绝（跳过下载不跳过版本检查）

改 --host 暴露接口
  → 无鉴权；README 明确警告

--openrouter-key 进 history / process list
  → 推荐 OPENROUTER_API_KEY 或 .env

.env 在子目录
  → 不会向上找到；可能用默认/环境变量

网站反爬升级
  → stealth 可能失效；责任使用条款

OpenRouter key 缺失
  → UI 无法工作

proxy 缺 host 或 port
  → 配置无效（host+port 均必填）

License 混用
  → 2026-09-02 前分发仍 AGPL-3.0
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **MCP browser server 形态**: 无 subcommand 即 server
2. **配置优先级**: flag > env > .env > default
3. **.env 仅当前目录、不覆盖已有、不向上搜索**
4. **启动日志打名不打值**
5. **--seed 可复现浏览器身份**
6. **--profile-dir 持久化登录**
7. **Binary 版本 pin 校验**（拒绝不匹配）
8. **默认 127.0.0.1 + 改 host 无鉴权警告**
9. **引擎与 UI 分包**（invisible_playwright vs aihawk）
10. **MCP Registry 官方 token 注释约定**

### P1

- Proxy 决定 timezone/locale/egress
- 双形态（MCP + 独立 UI）
- 隐私外传清单透明化

### P2

- 反检测 stealth Firefox
- 媒体案例库（wiki）

---

## 11. 应避免的坑

- 勿用 `--openrouter-key` 传生产密钥（history/process list）
- 勿改 `--host` 到 0.0.0.0 而不加鉴权
- 勿混用未 pin 的 Firefox binary
- License 历史 AGPL，商业需核对分发日期
- 勿发明 Python 包内部路径

---

## 12. 源码锚点速查

```
README.md
  Positioning: stealth Firefox browser agent
  Modes: MCP (uvx aihawk) | UI (uvx aihawk ui)
  Default model: z-ai/glm-5.3-flash
  Default bind: 127.0.0.1:8765
  Options: --openrouter-key --model --proxy --binary --seed
           --profile-dir --headed --host --port
  Env: OPENROUTER_API_KEY, AIHAWK_MODEL, STEALTHFOX_BINARY, AIHAWK_HOME
  Priority: flag > env > .env > default
  .env: cwd only, never overrides set vars, prints names not values
  Binary: must match seal pin
  Family: invisible_playwright, invisible_core
  MCP name: io.github.feder-cr/aihawk
  Claude/Codex/Gemini CLI registration examples
  Privacy: sites see Firefox; OpenRouter sees conversation+page; GitHub sees download+counter
  License: MIT (post 2026-09-02); AGPL-3.0 before
```

**未本轮打开**: 包实现源码。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | MCP tools 在 wiki |
| 权限/安全边界 | 4 | 默认 localhost；host 警告 |
| 容错与会话恢复 | 3 | profile-dir 保 cookie |
| 上下文工程 | 3 | 页面内容送 LLM |
| 可扩展（技能/MCP） | 5 | 原生 MCP server |
| 可观测与可评测 | 2 | 弱 |
| 生产可用成熟度 | 3 | uvx 一键；无鉴权 UI |

**综合**: **stealth 浏览器 + MCP server + 严格配置卫生**。openmate 抄配置优先级、.env 约定、seed/profile、binary pin 与 MCP 形态。

---

## 14. 关键链接

- https://github.com/feder-cr/AIHawk
- https://github.com/feder-cr/invisible_playwright
- https://github.com/feder-cr/invisible_core
- https://github.com/feder-cr/AIHawk/wiki/mcp-server
- 相关: `reports/mcp.md`、`reports/browser-use.md`、`reports/chrome-devtools-mcp-l1.md`

---

## 15. 附录 A — 配置优先级 openmate 规范（P0）

```
1. CLI flag          --openrouter-key
2. 环境变量          OPENROUTER_API_KEY
3. .env（仅 cwd）    OPENROUTER_API_KEY=...
4. 默认值            z-ai/glm-5.3-flash
```

规则（AIHawk README 实读）:
- .env **从不覆盖**已设置变量
- **不向上搜索**父目录
- 启动打印变量**名**不打印**值**
- flag 会进 shell history / process list → 文档警告

openmate 强制:
- 同一优先级顺序
- cwd-only .env
- 日志脱敏
- 密钥类 flag 标记 deprecated

---

## 16. 附录 B — Seed / Profile / Binary Pin

| 机制 | AIHawk | openmate |
|------|--------|----------|
| --seed | 同 seed 同 identity | 可复现实验 |
| --profile-dir | 保 cookie/登录 | 会话持久化 |
| --binary + seal pin | 版本必须匹配否则拒绝 | 供应链完整性 |
| --headed | 显示窗口 | 调试 |
| --proxy | geo/locale/egress 跟随 | 地域隔离 |

失败路径:
```
binary 与 seal 不匹配
  → 拒绝启动（不跳过版本检查）

seed 未设
  → 每次新 identity（不可复现）

profile-dir 未设
  → 重启丢登录

改 --host 0.0.0.0
  → 无鉴权暴露；openmate 必须加 token
```

---

## 17. 附录 C — MCP server 形态（P0）

```
aihawk                 # 无 subcommand = MCP server
aihawk ui              # Web UI
aihawk --help          # 帮助
```

注册:
```bash
claude mcp add --scope user stealth -- uvx aihawk
codex mcp add stealth -- uvx aihawk
gemini mcp add --scope user stealth uvx aihawk
```

MCP Registry token:
```
mcp-name: io.github.feder-cr/aihawk
```

openmate: 二进制默认 MCP；`ui` 子命令可选；提供三客户端注册文档。

---

## 18. 附录 D — 隐私外传清单模板

| 接收方 | 数据 | 用户可见 |
|--------|------|----------|
| 目标网站 | 浏览器指纹 | 是 |
| 模型 provider | 对话 + 页面内容 | 是 |
| GitHub | 二进制下载 + 计数文件（无 PII） | 是 |
| 作者本人 | **无** | 是 |

openmate: 启动打印「外传摘要」；`--no-network-stats` 关计数。

---

## 19. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 默认模型 | z-ai/glm-5.3-flash | README |
| 默认 bind | 127.0.0.1:8765 | README |
| 优先级 | flag>env>.env>default | README |
| .env | cwd only, never override | README |
| Binary | seal pin 必须匹配 | README |
| MCP 名 | io.github.feder-cr/aihawk | README |
| License | MIT（2026-09-02 后） | README |
| 家族 | invisible_playwright, invisible_core | README |

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | MCP tools 在 wiki |
| 权限安全 | 4 | localhost + host 警告 |
| 容错恢复 | 3 | profile-dir |
| 上下文 | 3 | 页面送 LLM |
| 可扩展 | 5 | 原生 MCP |
| 可观测 | 2 | 弱 |
| 成熟度 | 3 | uvx 一键；无鉴权 UI |

**净推荐**: openmate 抄 **配置卫生 + MCP 形态 + seed/profile/binary pin**；浏览器引擎可替换。
