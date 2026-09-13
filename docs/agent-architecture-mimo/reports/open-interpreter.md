# Open Interpreter 架构报告

> 研究对象：https://github.com/OpenInterpreter/open-interpreter  
> 定位：面向低成本模型优化的本地编码 Agent（Rust，Codex fork）  
> 研究日期：2026-09-13

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 仓库 | `OpenInterpreter/open-interpreter`（现名 OpenInterpreter） |
| 语言 | Rust（新版本）；原 Python 版迁至社区 fork `endolith/open-interpreter` |
| 基座 | **OpenAI Codex 的 fork**，保持 Codex exec 协议兼容 |
| 许可 | Apache-2.0 |
| 安装 | `curl -fsSL https://www.openinterpreter.com/install \| sh`（Win: irm） |
| 启动 | `i` 或 `interpreter` |
| 核心卖点 | Provider 无关 + **Harness 仿真**（榨干低成本模型）+ 原生沙箱 + 可移植数据 |
| 兼容 | ACP（`interpreter acp`）、Codex SDK（`codexPathOverride: "interpreter"`）、MCP、AGENTS.md |

### 产品定位变化

```
历史：Python 本地代码解释器（执行任意代码）
现在：Rust 终端编码 Agent（Codex 系）
差异：强调 harness 模拟、多供应商、便携生态，而非仅「代码解释器」
```

---

## 2. 架构

### 2.1 总体分层（继承 Codex 并扩展）

```
┌────────────────────────────────────────────────┐
│  TUI / exec / ACP / App Server / GitHub Action  │
├────────────────────────────────────────────────┤
│  Harness 层（可切换的模型面向协议）              │
│   native · claude-code · kimi-code · qwen-code  │
│   zcode · deepseek-tui · swe-agent · minimal…   │
├────────────────────────────────────────────────┤
│  Codex-compatible Core                          │
│   Agent Loop · Tools · Sessions · Subagents     │
├────────────────────────────────────────────────┤
│  Safety：Sandbox modes × Approval × Permissions │
├────────────────────────────────────────────────┤
│  Providers：OpenAI / Anthropic / Moonshot /     │
│             DeepSeek / GLM / 本地 / Chat兼容     │
├────────────────────────────────────────────────┤
│  OS Sandbox：Seatbelt / Bubblewrap+seccomp / Win│
└────────────────────────────────────────────────┘
```

### 2.2 共享生态面（Portability）

| 能力 | 共享标准 |
|---|---|
| 项目指令 | `AGENTS.md` |
| 项目技能 | `.agents/skills/` |
| 个人技能 | `~/.agents/skills/` |
| 工具集成 | MCP |
| 编辑器集成 | ACP |
| 程序执行 | Codex exec 协议 |

产品私有目录 `~/.openinterpreter` **仅**放配置、凭证、会话、缓存、daemon 状态——明确拒绝「私有数据岛」。

---

## 3. 核心机制

### 3.1 Computer Interface / Harness 仿真（本项目最独特机制）

Harness 不是「调用外部 CLI」，而是**在原生 Rust 运行时内改写**：

- 面向模型的 **system prompt**
- **工具 schema / 消息格式**
- **wire 路由**（responses / chat / messages）
- **响应解析与错误处理**

```
用户配置 harness = "kimi-code"
        │
        ▼
┌───────────────────────────┐
│ 请求整形器（Harness Builder）│
│  · system prompt           │
│  · tool defs               │
│  · cache key / thinking    │
└────────────┬──────────────┘
             ▼
      Provider API（chat）
             │
             ▼
┌───────────────────────────┐
│ 响应解析 → 工具调用         │
│ 执行仍在 OI 原生 Rust 核心  │
└───────────────────────────┘
```

#### 内置 Harness ID

| ID | Wire | 对齐对象 |
|---|---|---|
| 空 / native | responses | Codex 原生面 |
| 空 + chat | chat | 通用 OpenAI 兼容 |
| `claude-code` / `claude-code-bare` | responses/chat/messages | Anthropic Claude Code |
| `zcode` | messages | Z.AI GLM 编码面 |
| `kimi-code` | chat | Kimi K3 推荐 harness |
| `kimi-cli` | chat | 旧版 Kimi CLI |
| `qwen-code` | chat | Qwen Code |
| `deepseek-tui` | chat | DeepSeek TUI / CodeWhale |
| `swe-agent` | chat | SWE-agent 命令-观察循环 |
| `minimal` | chat | 最小 chat-tool 面 |

#### 自动默认

| 检测到的模型族 | 默认 harness |
|---|---|
| Anthropic / Claude / messages | `claude-code` |
| Kimi / Moonshot | `kimi-code` |
| Qwen / QwQ / DashScope | `qwen-code` |
| DeepSeek | `claude-code-bare` |

#### 路由兼容（严格）

| wire_api | 允许的 harness |
|---|---|
| `responses` | native, claude-code, claude-code-bare |
| `chat` | native-chat, claude-code*, deepseek-tui, kimi-*, qwen-code, swe-agent, minimal |
| `messages` | claude-code*, zcode（native 被拒） |

> **对 openmate 的核心启示**：把「模型适配层」做成可插拔 harness，而不是在 prompt 里堆 if-else。

### 3.2 Computer Use / QA Skill（界面操作）

- 内置 **QA skill**，让任意模型操作与测试界面
- Web 应用：通过 [agent-browser](https://github.com/vercel-labs/agent-browser) 驱动真实浏览器
- 原生应用：通过 [trycua](https://github.com/trycua/cua) 操作与测试
- 这是「Computer Interface」在当前 Rust 版的主要落地形态（区别于早期 Python 版的通用 computer API）

### 3.3 Safety：Sandbox × Approval × Permissions

#### 沙箱模式

| 模式 | 行为 |
|---|---|
| `read-only` | 可检查允许文件，不可写 |
| `workspace-write` | 工作区内可写；网络默认关 |
| `danger-full-access` | 无本地沙箱边界 |

#### 审批策略

| 策略 | 行为 |
|---|---|
| `untrusted` | 可能改状态前询问 |
| `on-request` | 沙箱内跑，升级前询问 |
| `never` | 不询问，仅沙箱兜底 |

#### Permissions Profile（细粒度，新体系）

```toml
default_permissions = "project-edit"

[permissions.project-edit.filesystem]
":minimal" = "read"
[permissions.project-edit.filesystem.":workspace_roots"]
"." = "write"
".devcontainer" = "read"
"**/*.env" = "deny"

[permissions.project-edit.network]
enabled = true
[permissions.project-edit.network.domains]
"api.openai.com" = "allow"
"tracking.example.com" = "deny"

[permissions.project-edit.network.unix_sockets]
"/var/run/docker.sock" = "allow"
```

要点：
- 内置 profile：`:read-only` `:workspace` `:danger-full-access`
- 文件规则：read / write / deny（deny 优先）
- 网络默认关；域名 allow/deny；本地地址单独管控
- Unix socket 逃生口（如 Docker）
- **与旧 sandbox_mode 互斥**：配置了 sandbox_mode 则旧设置优先

#### OS 强制

| 平台 | 机制 |
|---|---|
| macOS | Seatbelt profiles |
| Linux/WSL | Bubblewrap、seccomp |
| Windows | 原生沙箱；WSL 走 Linux 模型 |

原则：策略无法 enforce 时 **fail-closed**。

危险口：`--yolo`、`--dangerously-bypass-approvals-and-sandbox`。

### 3.4 Language Clients / 自动化面

| 接口 | 用途 |
|---|---|
| `interpreter` TUI | 交互会话 |
| `interpreter exec` | 非交互执行 |
| `interpreter acp` | ACP agent，供编辑器启动 |
| App Server | 供桌面/远程客户端连接 |
| Codex SDK 兼容 | 一行 `codexPathOverride: "interpreter"` |
| Chat Completions | `--chat-completions` 走任意 OpenAI 兼容端点 |
| GitHub Action | CI 集成 |
| MCP Server / MCP Client | 双向工具互联 |

### 3.5 Skills

```
.agents/skills/          # 仓库级（共享、工具中立）
~/.agents/skills/        # 个人级
~/.openinterpreter/skills/  # 仅遗留兼容
$INTERPRETER_HOME/skills/.system/  # 官方内置，只读缓存，版本升级可覆盖
```

Skill 形态：

```
cut-release/
├── SKILL.md        # 必需：name + description + 流程
├── scripts/        # 可运行脚本
├── references/     # 长参考
└── assets/         # 模板
```

- 先读元数据，命中才加载全文（延迟加载）
- Skill 脚本走正常沙箱与审批，**不允许**绕过权限
- 内置 bundle 指纹刷新机制：新版本启动时自动更新 `.system/`

### 3.6 Provider Catalog 生成

- 供应商/模型成员**不在 Rust 里手写**
- `python3 scripts/write_provider_catalog.py` 按需刷新
- 降低多模型维护成本，避免硬编码腐化

---

## 4. 稳定性

| 维度 | 评估 |
|---|---|
| 实现语言 | Rust（自 Codex 继承），可靠性高 |
| 协议稳定 | 深度对齐 Codex exec + ACP + MCP，抗供应商锁定 |
| 沙箱 | 与 Codex 同源 OS 沙箱 + 更新的 Permissions 体系 |
| 数据迁移 | Portability 原则明确，用户数据可带走 |
| 版本分裂 | 存在「新 Rust」与「旧 Python 社区 fork」双线，需注意文档归属 |
| 生态依赖 | Harness 名义上仿真 Claude Code/Kimi 等，存在法律/兼容性边界 |
| 发布成熟度 | 文档站完整；产品演进快，部分能力（computer use）依赖外部项目 |

**风险点**：
- 产品身份从「代码解释器」大幅转向，社区认知可能滞后
- Harness 仿真需持续追各上游 CLI 的协议变化
- Computer Use 依赖 agent-browser / trycua 等外部组件

---

## 5. 自我进化

| 机制 | 说明 |
|---|---|
| **Skills** | 可复用流程包；元数据优先加载；共享 `.agents/skills` |
| **Memories**（可选） | `use_memories` + `generate_memories`；独立提取/整合模型；`/memories` 检视 |
| **AGENTS.md** | 项目约定持续沉淀 |
| **Rules** | 项目规则层（文档索引中存在） |
| **Harness 切换** | 根据模型族自动选最优协议面，间接「适应环境」 |
| **Bundled skill 刷新** | 官方 skill 更新自动注入，用户 skill 不被覆盖 |

与 Gemini Auto Memory 对比：

| | Gemini Auto Memory | OI Memories |
|---|---|---|
| 提炼来源 | 本地 transcript | 会话（extract 模型） |
| 应用方式 | inbox 人审 patch | 配置开关生成/注入 |
| Skill 自动起草 | 有 | 主要靠手工/内置 bundle |
| 安全边界 | 禁止直改活文件 | 默认关闭，可关外部上下文生成 |

OI 更偏「用户显式开关 + 技能包」，Gemini 更偏「后台挖掘 + 人审晋升」。

---

## 6. openmate 借鉴

### 高价值可直接移植

1. **Harness 层抽象（最高优先级）**  
   将「模型适配」独立成可插拔 harness：
   - system prompt / tool schema / wire 协议 / 响应解析
   - 按 provider/model 自动推断默认 harness
   - 严格路由表，禁止不兼容组合  
   → openmate 支持多供应商时，这是避免 prompt 爆炸的关键。

2. **Portability 原则**  
   - 指令用 `AGENTS.md`  
   - 技能用 `.agents/skills/`  
   - 产品目录只放密钥/缓存/会话  
   - 先找行业标准，再考虑私有格式  
   → 用户可带着数据离开，反而提高信任与采用。

3. **Permissions Profile 表达力**  
   文件 read/write/deny + 网络域名 + Unix socket，比「三档沙箱」更贴企业需求。

4. **Skills 延迟加载**  
   先 `SKILL.md` 描述匹配，再加载 scripts/references，控制上下文成本。

5. **Provider Catalog 生成**  
   脚本从 API 拉模型清单，而非硬编码——openmate 接多模型时必抄。

6. **ACP + Codex SDK 双兼容**  
   用标准协议嵌入编辑器生态，而不是再造私有 IDE 插件协议。

7. **Computer Use 以 Skill 形式挂载**  
   浏览器/桌面操作作为可选 skill，不污染核心循环。

### 建议架构草图（openmate）

```
openmate-runtime (Codex-like core 或自研)
    │
    ├── harness/
    │     ├── native.rs
    │     ├── claude_code.rs
    │     ├── kimi_code.rs
    │     └── router (wire_api × harness 兼容表)
    │
    ├── safety/
    │     ├── sandbox (read|workspace|full)
    │     ├── approval (untrusted|on-request|never)
    │     └── permissions (fs + net profiles)
    │
    ├── skills/  (.agents/skills, SKILL.md 延迟加载)
    ├── memories/ (extract + consolidate 模型可配)
    └── ports: ACP · MCP · exec · AppServer
```

---

## 7. 关键路径

| 路径 / 入口 | 说明 |
|---|---|
| `codex-rs/` | Rust 主体（Codex 基座） |
| `scripts/write_provider_catalog.py` | 供应商目录生成 |
| `scripts/test-codex-sdk-compat.sh` | Codex SDK 兼容测试 |
| `docs/portability.md` | 可移植边界与演进规则 |
| `FORK_BRANDING.md` | 发行版品牌化 |
| 文档：harness | https://www.openinterpreter.com/docs/terminal/harness |
| 文档：sandbox | https://www.openinterpreter.com/docs/terminal/sandbox |
| 文档：permissions | https://www.openinterpreter.com/docs/terminal/permissions |
| 文档：skills | https://www.openinterpreter.com/docs/terminal/skills |

---

## 8. 评分

| 维度 | 分数 (1-10) | 说明 |
|---|---|---|
| 架构清晰度 | 8 | Codex 基座清晰；Harness 层是漂亮扩展 |
| 多模型适配 | 10 | Harness 仿真 + catalog 生成，三者最强 |
| 沙箱与安全 | 9 | Codex 沙箱 + 更新 Permissions profile |
| Computer Use | 8 | QA skill + agent-browser + trycua，实用但依赖外部 |
| 可移植性 | 9 | AGENTS.md / .agents/skills / MCP / ACP 全对齐行业标准 |
| 自我进化 | 7 | Skills + Memories 够用；自动提炼弱于 Gemini |
| 文档完整度 | 8 | 新站完善；需区分 Rust/Python 双线 |
| 对 openmate 参考价值 | **10** | Harness 与 Portability 直接命中 openmate 多模型与生态策略 |
| **综合** | **8.6** | 「低成本模型最大化 + 生态可移植」的差异化标杆 |

---

## 9. 一句话总结

> Open Interpreter 在 Codex 基座上以可插拔 Harness 仿真层榨干低成本模型，并用 AGENTS.md / .agents/skills / MCP / ACP 坚持生态可移植，是 openmate 做多供应商适配与数据不绑架时的第一参考。
