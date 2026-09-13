# Pythagora-io/gpt-pilot — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/Pythagora-io/gpt-pilot  
> 抓取通道: cdn.jsdelivr.net/gh/Pythagora-io/gpt-pilot@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多角色开发流水线 / 上下文过滤 / 安全供应链教训 借鉴

---

## 0. 诚实性说明 — **P0 安全事件**

**README 顶部 CAUTION（源码实读）**:

> **Malicious code was found and removed.** A supply-chain worm (credential stealer) was hidden in `core/telemetry/` from **August 2025** until **11 June 2026**.

| 项 | 事实 |
|----|------|
| 恶意 commit | `065ee8eb`，2025-08-24，伪装 "Revert 'Implemented weekend discount'" |
| 公开报告 | 2026-06-08 外部安全研究员 |
| 移除 | 2026-06-11 |
| Loader | `core/telemetry/_hooks.py`（程序启动自动执行） |
| Payload | `core/telemetry/_runtime.bin`（Shai-Hulud 类蠕虫） |
| 行为 | 下载 Bun runtime → 混淆 payload → 窃取 AWS/GitHub/npm/SSH 凭证 → 横向传播 |
| IoC | `_runtime.bin`、`_hooks.py`、`.loader.lock`、意外 bun 二进制、`rt-*` 临时目录 |
| 维护状态 | **本仓不再活跃维护**（恶意 commit 长期未被发现的原因） |

**对 openmate 的直接教训**:
1. 供应链监控必须覆盖 telemetry/ 隐藏目录
2. 不活跃仓库不可作为依赖
3. 伪装成 revert 的 commit 需审查
4. 启动即执行的 hook 目录是攻击面

**本报告其余部分基于清理后的 main 分支 README。**

---

## 1. 项目定位（README 实读）

> "GPT Pilot doesn't just generate code, it builds apps!"

- VS Code extension 的核心技术（PythagoraTechnologies.pythagora-vs-code）
- 目标: **AI 写 ~95% 代码，人类写 5%**（直到 AGI）
- **本仓不再维护** → 转向 pythagora.ai
- YC 公司

### 1.1 与 Smol Developer / GPT Engineer 的差异（README 实读）

| 特性 | GPT Pilot | Smol/GPT Engineer |
|------|-----------|-------------------|
| 协作方式 | 与开发者逐步协作 | 一次性给整个 codebase |
| Debug | 过程中可 debug | bug 更难修 |
| 规模 | 任意 scale | 倾向小项目 |
| 上下文 | **过滤器只放相关代码** | 全量 |

---

## 2. 多角色流水线（README 实读）

```
1. 用户输入 app name + description
2. Product Owner agent      — 故意什么都不做（像真实产品）
3. Specification Writer     — 需求澄清提问
4. Architect agent          — 技术选型 + 检查/安装依赖
5. Tech Lead agent          — 拆 development tasks
6. Developer agent          — 每 task 人类可读描述
7. Code Monkey agent        — 基于描述+现有文件实现
8. Reviewer agent           — 审每步，错则打回 Code Monkey
9. Troubleshooter agent     — 帮用户给出好反馈
10. Debugger agent          — 出问题时救援
11. Technical Writer agent  — 写文档
```

**关键设计**:
- **Product Owner 故意 no-op**（真实产品流程隐喻）
- **Reviewer 可打回 Code Monkey**（闭环）
- **Code Monkey 与 Developer 分离**（计划 vs 实现）

---

## 3. 安装与配置（README 实读）

### 3.1 要求

- **Python 3.9+**
- 可选 PostgreSQL（默认 SQLite）

### 3.2 步骤

```bash
git clone https://github.com/Pythagora-io/gpt-pilot.git
cd gpt-pilot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp example-config.json config.json
python main.py
```

### 3.3 config.json 项（README 实读）

- LLM Provider: `openai` | `anthropic` | `groq`
- Azure / OpenRouter 经 openai 设置
- API key（null 则读环境变量）
- 数据库: sqlite 默认；PostgreSQL 需 `asyncpg` + `psycopg2`
- `fs.ignore_paths`: 忽略编译产物等

PostgreSQL URL:
```
postgresql+asyncpg://<user>:<password>@<db-host>/<db-name>
```

### 3.4 CLI（真实命令）

```bash
python main.py --list                    # 列出项目
python main.py --project <app_id>        # 继续最新 step
python main.py --project <app_id> --step <step>  # 回到指定 step（删除之后进度）
python main.py --delete <app_id>         # 删除（不可撤销）
python main.py --help
```

**Branches**: 当前仅支持 `main` branch。

生成代码存储: `workspace/<app_name>/`

---

## 4. 核心架构模式

### 4.1 上下文过滤（README 实读）

> "It has mechanisms that filter out the code, so in each LLM conversation, it doesn't need to store the entire codebase in context, but it shows the LLM only the relevant code for the current task"

对 openmate: **按 task 裁剪上下文**，不全量注入。

### 4.2 逐步开发 vs 一次性生成

```
逐步:
  Tech Lead 拆 task → Developer 描述 → Code Monkey 实现 → Reviewer 审
  → 每步可 debug / 人类介入

一次性:
  prompt → 全量 codebase → bug 难定位
```

### 4.3 任务粒度敏感（README Development 节）

> "quality of the code generated is very sensitive to the size of the development task. When the task is too broad, the code has too many bugs... when too narrow, GPT also seems to struggle"

**对 openmate**: task 粒度是质量关键超参，需可调。

### 4.4 持久化

- SQLite 默认 / PostgreSQL
- 每 project 有 steps，可 `--step` 回退
- **回退删除后续进度**（危险操作）

---

## 5. 与 openmate 映射

| 需求 | GPT Pilot 机制 | 可复用度 |
|------|---------------|----------|
| 多角色流水线 | 11 角色链 | **高** |
| Reviewer 闭环 | 打回 Code Monkey | **高** |
| 计划/实现分离 | Developer vs Code Monkey | **高** |
| 上下文过滤 | 只放当前 task 相关代码 | **高** |
| Step 级回退 | --project --step | 高 |
| 任务粒度调优 | 太宽/太窄都差 | **高** |
| Product Owner no-op | 流程隐喻 | 低 |
| 供应链安全教训 | telemetry 蠕虫 | **P0 警示** |
| VS Code 集成 | extension | 中 |
| 多 provider | openai/anthropic/groq | 高 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9+ | README |
| LLM Provider | openai, anthropic, groq | README |
| Azure/OpenRouter | via openai setting | README |
| DB 默认 | SQLite | README |
| DB 可选 | PostgreSQL + asyncpg + psycopg2 | README |
| Branches | 仅 main | README |
| 输出目录 | workspace/ | README |
| CLI 续跑 | --project / --step | README |
| 删除 | --delete 不可撤销 | README |
| 维护状态 | **不再维护** | README CAUTION |
| 安全事件 | 2025-08 ~ 2026-06-11 | README CAUTION |

---

## 7. 失败路径 / 安全路径

```
供应链蠕虫（历史）
  core/telemetry/_hooks.py 启动执行
  → 下载 Bun → _runtime.bin 窃密
  → IoC: _runtime.bin, _hooks.py, .loader.lock, bun, rt-*

--step 回退
  → 删除该 step 之后所有进度

--delete
  → 不可撤销

task 过宽
  → bug 多难修

task 过窄
  → LLM 实现困难

PostgreSQL
  → 需额外装 asyncpg psycopg2

Windows
  → venv\Scripts\activate

配置
  → config.json 必须从 example-config.json 复制

LLM key
  → config.json 或环境变量
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄（功能）

1. **11 角色开发流水线**（尤其 Developer vs Code Monkey 分离）
2. **Reviewer 打回闭环**
3. **上下文过滤器**: 只注入当前 task 相关代码
4. **任务粒度作为一等超参**（可配宽/窄）
5. **Step 级持久化与回退**（含删除后续警告）

### P0 — 必避（安全）

1. **telemetry/ 类目录启动即执行 = 攻击面**，需 code review + 不自动 import
2. **不活跃仓库不可作生产依赖**
3. **伪装 revert 的 commit 需人工审**
4. **供应链扫描要覆盖隐藏 loader + 二进制 payload**
5. **凭证轮换流程必须有**（事件响应）

### P1

- Product Owner no-op（流程完整度）
- Technical Writer 独立角色
- Troubleshooter 帮用户写好反馈

---

## 9. 应避免的坑

- **本仓已不维护 + 有供应链事故史 → 勿直接依赖**
- --step 回退删除数据
- --delete 不可撤销
- task 粒度需实测调优
- 勿发明 core/ 内部实现路径（恶意文件已删，本轮未打开源码）

---

## 10. 源码锚点速查

```
README.md
  CAUTION: supply-chain worm core/telemetry/ 2025-08 ~ 2026-06-11
  commit 065ee8eb, loader _hooks.py, payload _runtime.bin
  IoC: bun binary, rt-* folders, .loader.lock
  11 agents: ProductOwner, SpecWriter, Architect, TechLead,
             Developer, CodeMonkey, Reviewer, Troubleshooter,
             Debugger, TechnicalWriter
  Python 3.9+, config.json from example-config.json
  providers: openai, anthropic, groq
  CLI: --list, --project, --step, --delete
  workspace/<app_name>/
  Context filter: only relevant code per task
  Task size sensitivity documented
  Not maintained → pythagora.ai
```

**未本轮打开**: `core/` 实现（恶意文件已移除；不发明路径）。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 角色链清晰，非工具型 |
| 权限/安全边界 | 1 | **供应链蠕虫事故** |
| 容错与会话恢复 | 3 | step 级回退 |
| 上下文工程 | 4 | 过滤器只放相关代码 |
| 可扩展（技能/MCP） | 2 | 不再维护 |
| 可观测与可评测 | 2 | telemetry 已成攻击面 |
| 生产可用成熟度 | 1 | 不维护 + 事故 |

**综合**: **多角色开发流水线的优秀设计 + 供应链安全反面教材**。openmate 抄角色链/上下文过滤/任务粒度，**绝不抄其 telemetry 自动加载模式，且不依赖此仓**。

---

## 12. 关键链接

- https://github.com/Pythagora-io/gpt-pilot
- https://www.pythagora.ai/
- 相关: `reports/gpt-engineer-l1.md`、`reports/smol-developer-l1.md`、`reports/devika-l1.md`

---

## 13. 附录 A — 11 角色 openmate 映射表（P0）

| # | GPT Pilot 角色 | openmate 对应 | 优先级 |
|---|----------------|---------------|--------|
| 1 | Product Owner | （可选）需求确认 | P2 |
| 2 | Specification Writer | 需求澄清 Agent | P1 |
| 3 | Architect | 技术选型 + 依赖检查 | **P0** |
| 4 | Tech Lead | 任务拆分 | **P0** |
| 5 | Developer | 步骤人类可读描述 | **P0** |
| 6 | Code Monkey | 实现（与 Developer 分离） | **P0** |
| 7 | Reviewer | 审查并可打回 | **P0** |
| 8 | Troubleshooter | 收集用户反馈 | P1 |
| 9 | Debugger | 失败救援 | **P0** |
| 10 | Technical Writer | 文档 | P2 |
| 11 | （人类） | HITL 审批 | **P0** |

### A1. Reviewer 闭环

```
Code Monkey 产出
  → Reviewer 审
  → 通过 → 下一 task
  → 不通过 → 打回 Code Monkey（带上问题）
  → 连续 N 次失败 → Debugger / 人类
```

openmate: N 默认 3；超限升级。

---

## 14. 附录 B — 上下文过滤器规范（P0）

GPT Pilot README:
> filter out the code, so each LLM conversation shows only relevant code

openmate 最小过滤器:

```
输入: current_task, repo
输出: context_bundle
  - 相关文件路径列表（≤20）
  - 每文件摘录（符号级，≤200 行）
  - 项目结构树（深度 3）
  - 任务描述 + 验收标准
排除: 依赖目录、构建产物、测试夹具（可配）
```

失败路径:
- 过滤过狠 → 缺关键符号 → Reviewer 打回
- 过滤过松 → token 爆炸 → max_tokens 截断
- 缓解: Reviewer 可请求「扩大上下文」

---

## 15. 附录 C — 任务粒度超参（P0）

README:
> too broad → many bugs; too narrow → LLM struggles

openmate:

```
task_granularity: broad | medium | narrow
  broad:  1 task ≈ 1 feature（慎用）
  medium: 1 task ≈ 1 函数/模块（默认）
  narrow: 1 task ≈ 1 行/补丁（调试用）
```

建议: 默认 medium；连续 Reviewer 打回时自动降 narrow。

---

## 16. 附录 D — 供应链安全 openmate 强制清单（P0 警示）

从 gpt-pilot 事故提炼:

| 控制 | 要求 |
|------|------|
| 启动即执行目录 | telemetry/hooks 类必须人工审 |
| 二进制 payload | 仓内禁止；构建期拉取需 checksum |
| 伪装 revert | commit message 与 diff 必须一致 |
| 不活跃依赖 | >6 个月无维护需告警 |
| CI | 秘密扫描 + 恶意模式（bun 下载、混淆 bin） |
| 发布 | SBOM + 签名 |
| 事件响应 | 凭证轮换 runbook |

**绝不** `import` 未审的 `telemetry`/`hooks`/`_runtime` 模块。

---

## 17. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 恶意 commit | 065ee8eb | README CAUTION |
| 窗口 | 2025-08 ~ 2026-06-11 | README |
| Loader | core/telemetry/_hooks.py | README |
| Payload | core/telemetry/_runtime.bin | README |
| IoC | bun, rt-*, .loader.lock | README |
| 角色数 | 11 | README |
| Python | 3.9+ | README |
| Providers | openai, anthropic, groq | README |
| 维护 | 不再维护 | README |

---

## 18. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 3 | 角色链清晰，非工具型 |
| 权限安全 | 1 | 供应链蠕虫 |
| 容错恢复 | 3 | step 回退 |
| 上下文 | 4 | 过滤器 |
| 可扩展 | 2 | 不维护 |
| 可观测 | 2 | telemetry 成攻击面 |
| 成熟度 | 1 | 不维护 + 事故 |

**净推荐**: openmate **抄设计不抄仓**；11 角色 / 过滤器 / 任务粒度为 P0；安全清单为 P0 强制。
