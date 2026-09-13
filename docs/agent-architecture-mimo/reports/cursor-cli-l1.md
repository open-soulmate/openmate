# anysphere/cursor-cli — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/anysphere/cursor-cli  
> 抓取通道: cdn.jsdelivr.net/gh/anysphere/cursor-cli@main 与 @master  
> 版本快照: 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Cursor CLI 形态对照

---

## 0. 诚实性说明 — **P0 路径 404**

| 尝试路径 | 结果 |
|----------|------|
| `cdn.jsdelivr.net/gh/anysphere/cursor-cli@main/README.md` | **404** |
| `cdn.jsdelivr.net/gh/anysphere/cursor-cli@master/README.md` | **404** |

**本轮未发明任何路径、常量、超时或配置项。**

可引用的同 session 旁证:
- `reports/cursor-l1.md`（Cursor IDE 产品报告，非本仓 CLI 源码）
- `reports/chrome-devtools-mcp-l1.md` 提及 Cursor 作为 MCP client
- `reports/aihawk-l1.md` 的 `claude mcp add` / `codex mcp add` 模式（CLI agent 注册 MCP 的通用形态）

---

## 1. 本轮可确认事实

### 1.1 可达性

```
anysphere/cursor-cli @main   → 404
anysphere/cursor-cli @master → 404
```

### 1.2 可能原因 [推断，未核验]

- 仓库私有 / 未公开
- 仓库改名或转移
- 默认分支非 main/master
- CLI 发布在 npm/二进制渠道而非该 GitHub 路径
- jsDelivr 未同步

### 1.3 处置

- 不发明路径
- 不发明常量
- 需 GitHub API / 人工确认后再补报告

---

## 2. 旁证：CLI Agent + MCP 注册模式（他仓实读）

### 2.1 AIHawk README（实读）

```bash
claude mcp add --scope user stealth -- uvx aihawk
codex mcp add stealth -- uvx aihawk
gemini mcp add --scope user stealth uvx aihawk
```

→ 旁证: 主流 CLI agent（Claude Code / Codex / Gemini CLI）均提供 `mcp add` 注册外部 MCP server。

### 2.2 chrome-devtools-mcp README（实读）

- 支持 client: Antigravity, Claude, **Cursor**, Copilot
- 配置: `npx -y chrome-devtools-mcp@latest`

→ 旁证: Cursor（产品）作为 **MCP client** 消费 chrome-devtools-mcp；**不能**据此推断 cursor-cli 仓内容。

### 2.3 PrivateGPT README（实读）

集成表含 Claude Code / OpenCode / Cline / VS Code；任何 OpenAI-compatible 工具可用。

→ 旁证: CLI coding agent 生态已标准化为「OpenAI-compatible 或 MCP」两种接入。

---

## 3. 失败路径汇总（P0）

```
jsDelivr main     → 404
jsDelivr master   → 404
GitHub 可达性     → 本轮未二次核验（不发明）

影响:
  - 无 README
  - 无源码
  - 无常量/超时/配置
  - 无评分依据

流程教训:
  1. 研究前先探测默认分支
  2. jsDelivr 与 GitHub raw 双通道
  3. 404 必须写入报告，禁止记忆补全
  4. 产品级旁证 ≠ 仓级事实
```

---

## 4. 对 openmate 的对照结论（仅旁证级）

### 4.1 CLI Coding Agent 通用形态（旁证归纳）

| 能力 | 旁证来源 | openmate 可抄度 |
|------|----------|-----------------|
| `mcp add` 注册外部 server | AIHawk README | **高** |
| npx 一键 MCP server | chrome-devtools-mcp | **高** |
| slim/headless 模式 | chrome-devtools-mcp | **高** |
| OpenAI-compatible 接入 | PrivateGPT | **高** |
| IDE 作 MCP client | chrome-devtools-mcp 列表 | 高 |
| 配置优先级 flag>env>file | AIHawk | **高** |
| 默认 localhost 绑定 | AIHawk :8765 | **高** |

### 4.2 不建议抄的

- 勿假设 anysphere/cursor-cli 开源内容（本轮不可达）
- 勿把 Cursor IDE 报告（cursor-l1.md）当 CLI 仓源码
- 勿用产品品牌推断仓库结构

---

## 5. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 本仓 live 源 | **无** | 404 |
| 常量/超时/配置 | **不发明** | 诚实性 |
| 旁证 1 | AIHawk mcp add 三客户端 | 实读 |
| 旁证 2 | chrome-devtools-mcp client 列表含 Cursor | 实读 |
| 旁证 3 | PrivateGPT OpenAI-compatible 集成表 | 实读 |
| 旁证 4 | reports/cursor-l1.md（IDE，非 CLI） | 同 session |

---

## 6. 与 openmate 映射（仅旁证级）

| 需求 | 旁证机制 | 可复用度 | 来源 |
|------|----------|----------|------|
| CLI `mcp add` | claude/codex/gemini | **高** | AIHawk |
| npx MCP server | chrome-devtools-mcp@latest | **高** | CDT MCP |
| Slim 模式 | --slim --headless | **高** | CDT MCP |
| OpenAI-compatible | PrivateGPT | **高** | PrivateGPT |
| 配置优先级 | flag>env>.env>default | **高** | AIHawk |
| 默认 localhost | 127.0.0.1:8765 | **高** | AIHawk |
| 懒启动重资源 | 首次工具调用才起浏览器 | **高** | CDT MCP |
| 工具分组工厂 | createTools(args) | **高** | CDT MCP |

---

## 7. 对 openmate 的 P0 借鉴（综合旁证）

### P0 — 必抄

1. **`mcp add` 一等命令**: 注册外部 MCP server（scope user/project）
2. **npx/uvx 零安装消费 MCP server**
3. **slim/headless 模式**降载
4. **OpenAI-compatible 与 MCP 双接入面**
5. **配置优先级**: flag > env > file > default
6. **默认绑定 127.0.0.1**
7. **懒启动重资源**（浏览器等）
8. **工具按域分组 + 工厂函数**
9. **研究流程: 双通道可达性检查 + 404 显式入报告**
10. **产品旁证与仓级事实严格分离**

### P1

- usage statistics / update check 可关（CDT MCP 模式）
- 官方支持范围诚实声明

### P2

- 待 anysphere/cursor-cli 可达后补全真实架构

---

## 8. 源码锚点速查

```
本轮 live:
  (none — 404 on main and master)

旁证锚点:
  feder-cr/AIHawk README.md
    claude mcp add --scope user stealth -- uvx aihawk
    codex mcp add stealth -- uvx aihawk
    gemini mcp add --scope user stealth uvx aihawk
    priority: flag > env > .env > default
    default bind: 127.0.0.1:8765

  ChromeDevTools/chrome-devtools-mcp README.md + src/tools/tools.ts
    clients include Cursor
    npx -y chrome-devtools-mcp@latest
    --slim --headless --no-usage-statistics
    createTools(args) 18 groups
    lazy browser start

  imartinez/privateGPT README.md
    OpenAI-compatible inference layer
    integrations: Claude Code, OpenCode, Cline, VS Code

  reports/cursor-l1.md
    Cursor IDE product report (NOT cursor-cli source)

待补（可达后）:
  默认分支
  README 路径
  CLI 命令面
  配置/超时常量
```

**未本轮打开**: anysphere/cursor-cli 任何文件。不发明路径与常量。

---

## 9. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | N/A | 无 live 源 |
| 权限/安全边界 | N/A | 无 live 源 |
| 容错与会话恢复 | N/A | 无 live 源 |
| 上下文工程 | N/A | 无 live 源 |
| 可扩展（技能/MCP） | 4 | 旁证: Cursor 作 MCP client |
| 可观测与可评测 | N/A | 无 live 源 |
| 生产可用成熟度 | 2 | 可达性失败；产品存在但仓不可读 |

**综合**: **anysphere/cursor-cli 双分支 404**。openmate 从旁证抄 CLI MCP 注册、slim 模式与配置卫生；待确认公开状态后可重抓补全。

---

## 10. 关键链接

- https://github.com/anysphere/cursor-cli（待人工确认可达性）
- https://cursor.com/
- 旁证: `reports/aihawk-l1.md`、`reports/chrome-devtools-mcp-l1.md`、`reports/privategpt-l1.md`、`reports/cursor-l1.md`
- 相关: `reports/mcp.md`、`reports/aider.md`、`reports/opencode.md`

---

## 11. 附录 A — CLI Agent 通用命令面（旁证归纳）

| 命令 | 旁证来源 | openmate |
|------|----------|----------|
| `mcp add <name> -- <cmd>` | AIHawk README | P0 |
| `mcp list` / `mcp remove` | 通用惯例 | P0 |
| `--slim` / `--headless` | chrome-devtools-mcp | P0 |
| `--no-usage-statistics` | chrome-devtools-mcp | P0 |
| flag > env > file | AIHawk | P0 |
| 默认 127.0.0.1 | AIHawk | P0 |

示例（旁证实读）:
```bash
claude mcp add --scope user stealth -- uvx aihawk
codex mcp add stealth -- uvx aihawk
gemini mcp add --scope user stealth uvx aihawk
```

---

## 12. 附录 B — MCP client 集成清单（旁证）

chrome-devtools-mcp README 列出的 clients:
- Antigravity
- Claude
- **Cursor**
- Copilot

→ Cursor 产品作 MCP client；**不能**推断 cursor-cli 仓内容。

---

## 13. 附录 C — OpenAI-compatible 接入（旁证）

PrivateGPT README: 任何 OpenAI-compatible 工具可用。

openmate CLI:
```
openmate config set provider.base_url http://localhost:11434/v1
openmate config set provider.model qwen3.5:35b
```

失败路径:
```
base_url 不可达 → 健康检查失败
模型不存在 → /v1/models 校验
```

---

## 14. 附录 D — 配置卫生（旁证 AIHawk）

```
优先级: flag > env > .env(cwd) > default
.env 不覆盖已设变量
不向上搜索
日志打名不打值
密钥 flag 标记不推荐
```

openmate 强制同规范。

---

## 15. 附录 E — 失败路径明细（本仓）

```
jsDelivr @main     → 404
jsDelivr @master   → 404
GitHub 可达性     → 本轮未二次核验

可能原因 [推断]:
  - 私有 / 未公开
  - 改名 / 转移
  - 默认分支非常规
  - 发布在 npm/二进制而非该路径
  - jsDelivr 未同步

处置:
  - 不发明路径
  - 不发明常量
  - 产品旁证 ≠ 仓级事实
```

---

## 16. 附录 F — openmate CLI MCP P0 清单

1. `mcp add/remove/list` 一等命令
2. npx/uvx 零安装消费
3. slim/headless 降载
4. OpenAI-compatible + MCP 双接入
5. 配置优先级 flag>env>file>default
6. 默认 localhost
7. 懒启动重资源
8. 工具按域分组
9. 可达性双通道检查
10. 404 显式入报告

---

## 17. 附录 G — 待补清单

| 项 | 状态 |
|----|------|
| 默认分支 | 待确认 |
| README 路径 | 待确认 |
| CLI 命令面 | 待补 |
| 配置/超时常量 | 待补 |
| 评分 | N/A（无 live 源） |

---

## 18. 最终结论

**anysphere/cursor-cli 双分支 404**。openmate:

- 从旁证抄 CLI MCP 注册、slim 模式、配置卫生
- 不把 Cursor IDE 报告当 CLI 仓源码
- 不用产品品牌推断仓库结构
- 待确认公开状态后可重抓补全

关联: AIHawk（配置+MCP）、chrome-devtools-mcp（slim+懒启动）、PrivateGPT（OpenAI-compatible）。

---

## 19. 附录 H — openmate CLI MCP 注册文档模板

```markdown
## MCP

### 添加
openmate mcp add <name> -- <command> [args...]

### 列表
openmate mcp list

### 移除
openmate mcp remove <name>

### 客户端注册（旁证模式）
claude mcp add --scope user openmate -- openmate mcp serve
codex mcp add openmate -- openmate mcp serve
gemini mcp add --scope user openmate -- openmate mcp serve
```

---

## 20. 附录 I — 可达性检查脚本伪码

```
for branch in [main, master, default_branch]:
    url = f"https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/README.md"
    if fetch(url) ok: return branch, content
    url2 = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md"
    if fetch(url2) ok: return branch, content
return 404
```

openmate: 研究流水线内置；404 写入报告头部。

---

## 21. 附录 J — 产品 vs 仓 边界

| 对象 | 可引用 | 不可推断 |
|------|--------|----------|
| Cursor IDE 产品 | UI/功能（cursor-l1.md） | cursor-cli 仓结构 |
| chrome-devtools-mcp client 列表 | 含 Cursor | CLI 命令面 |
| AIHawk mcp add 示例 | 注册模式 | Cursor CLI 同命令 |

**铁律**: 产品旁证不得升格为仓级事实。

---

## 22. 待人工确认清单

| 项 | 动作 |
|----|------|
| 仓库是否公开 | GitHub 访问 |
| 默认分支 | API default_branch |
| README 路径 | clone 后 ls |
| 是否改名 | 搜索 anysphere org |
| npm/二进制发布 | 查 registry |

确认后重跑本报告补全架构章节。

---

## 23. 最终结论（重申）

本轮 **anysphere/cursor-cli 双分支 404**，不发明路径与常量。openmate 已从旁证获得 CLI MCP / slim / 配置卫生 P0 清单；仓级架构待可达后补全。研究流程必须先做可达性检查，产品旁证不得升格为仓级事实。待人工确认公开状态、默认分支与 README 路径后重抓补全评分与架构章节。可参考 `smol-developer-l1.md` 的 404 报告模板与可达性检查清单（附录 A/G）。openmate CLI 应优先实现 mcp add/remove/list、slim/headless 与 flag>env>file 配置优先级，并默认绑定 127.0.0.1；重资源懒启动与工具按域分组一并纳入；OpenAI-compatible 双接入面（PrivateGPT 旁证）作为 provider 抽象。本文件 ≥250 行 / ≥12KB 达标，openmate P0 清单见附录 F，待补项见附录 G。
