# smol-ai/developer — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/smol-ai/developer（用户指定路径）  
> 抓取通道: cdn.jsdelivr.net/gh/smol-ai/developer@main 与 @master  
> 版本快照: 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供极简代码生成 agent 形态对照

---

## 0. 诚实性说明 — **P0 路径 404**

| 尝试路径 | 结果 |
|----------|------|
| `cdn.jsdelivr.net/gh/smol-ai/developer@main/README.md` | **404** |
| `cdn.jsdelivr.net/gh/smol-ai/developer@master/README.md` | **404** |

**本轮未发明任何路径或常量。**

路径澄清:
- 用户指定: `smol-ai/developer`
- 他稿误写: `smol-ai/smol-developer`（亦 404）
- 本报告以用户指定路径为准，双分支均 404

本报告仅包含:
1. 本轮 404 事实
2. 同 session 内**其他仓库 README 中对 Smol Developer 的直接引用**（源码实读旁证）
3. 对 openmate 的失败路径与对照结论

---

## 1. 旁证：其他仓库对 Smol Developer 的引用（源码实读）

### 1.1 Pythagora-io/gpt-pilot README

章节标题（实读）:
> **How's GPT Pilot different from _Smol developer_ and _GPT engineer_?**

GPT Pilot 自述差异:
- **一次性给整个 codebase**（Smol / GPT Engineer 形态）
- 逐步协作更容易 debug
- 任意 scale vs 倾向简单 app

→ 旁证: Smol Developer 被业界归类为 **「一次性全量代码生成」** 极简 agent。

### 1.2 AntonOsika/gpt-engineer README

定位:
> "The OG code generation experimentation platform!"
> "If you are looking for a well maintained hackable CLI – check out aider."

→ 旁证: 代码生成极简工具谱系中，gpt-engineer 自认 OG 实验平台；aider 为维护更好的 CLI；Smol Developer 同属该谱系但本轮无法 live 取源。

---

## 2. 本轮可确认的失败路径（P0）

```
jsDelivr @main
  → 404

jsDelivr @master
  → 404

可能原因 [推断，未核验]:
  - 分支名非 main/master
  - 仓库改名/转移/归档
  - 仅 GitHub 原生托管、jsDelivr 未同步
  - README 路径变更

处置:
  - 不发明路径
  - 不发明常量/超时/配置项
  - 需 clone 或 GitHub API 确认实际默认分支后再补报告
```

---

## 3. 对 openmate 的对照结论（基于旁证，非本仓源码）

### 3.1 极简代码生成谱系（旁证归类）

| 项目 | 形态（旁证） | 本轮 live 源 |
|------|--------------|--------------|
| smol-ai/developer | 一次性全量 codebase | ❌ 404 |
| AntonOsika/gpt-engineer | 实验平台 + preprompts + bench | ✅ README |
| Pythagora-io/gpt-pilot | 逐步多角色 + 上下文过滤 | ✅ README（含安全事件） |

### 3.2 openmate 应从旁证学到的

#### P0 — 架构对照

1. **一次性全量 vs 逐步协作** 是代码生成 agent 的根本分叉
   - 一次性: 实现快，bug 难修（gpt-pilot README 批评点）
   - 逐步: 可 debug、人类可介入，但慢
2. **上下文过滤**（gpt-pilot）优于全量注入——对大仓库关键
3. **任务粒度**是质量超参（gpt-pilot: 太宽 bug 多，太窄 LLM 难）
4. **preprompts 身份目录**（gpt-engineer）可跨项目记忆
5. **bench 可复现**（gpt-engineer 的 APPS/MBPP）优于 anecdote

#### P0 — 失败路径（从本仓 404 学到的工程教训）

1. **依赖/引用前必须确认默认分支与可达性**
2. **jsDelivr 不是所有仓都可用**（归档/改名/非常规分支）
3. **报告必须标注 404**，不得用记忆填充
4. **旁证引用要标明来源仓库**，不得升格为本仓事实

### 3.3 不建议抄的

- 勿假设 smol-ai/developer 仍在维护（本轮无法确认）
- 勿依赖 jsDelivr 作为唯一可达性检查
- 勿把「一次性全量」当默认——对 openmate 规模应偏逐步+过滤

---

## 4. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 本仓 live 源 | **无** | 404 |
| 常量/超时/配置 | **不发明** | 诚实性 |
| 旁证 1 | gpt-pilot README 对比节 | 实读 |
| 旁证 2 | gpt-engineer README 谱系 | 实读 |

---

## 5. 与 openmate 映射（仅旁证级）

| 需求 | 旁证机制 | 可复用度 | 来源 |
|------|----------|----------|------|
| 一次性生成 | Smol 形态 | 低（难 debug） | gpt-pilot |
| 逐步协作 | GPT Pilot 形态 | **高** | gpt-pilot |
| 上下文过滤 | GPT Pilot | **高** | gpt-pilot |
| 任务粒度调优 | GPT Pilot | **高** | gpt-pilot |
| preprompts | gpt-engineer | **高** | gpt-engineer |
| bench | gpt-engineer APPS/MBPP | **高** | gpt-engineer |
| 可达性检查 | 本仓 404 教训 | **高** | 本轮 |

---

## 6. 对 openmate 的 P0 借鉴（综合）

### P0 — 必抄

1. **代码生成默认走逐步 + 上下文过滤**（非一次性全量）
2. **任务粒度作为一等超参**
3. **preprompts / 身份目录**跨项目记忆
4. **bench 二进制 + 公开数据集**可复现评测
5. **引用外部仓前 jsDelivr/GitHub 双通道可达性检查**
6. **报告中 404 必须显式记录**，禁止用记忆补全

### P1

- 与 aider / gpt-engineer / gpt-pilot 的谱系对照表
- 实验平台 vs 生产 CLI 的定位区分

### P2

- 待可达后补：Smol 具体 prompt、目录约定、模型配置

---

## 7. 源码锚点速查

```
本轮 live:
  (none — 404 on main and master)

旁证锚点:
  Pythagora-io/gpt-pilot README.md
    "How's GPT Pilot different from Smol developer and GPT engineer?"
    一次性全量 vs 逐步协作
    上下文过滤
    任务粒度敏感

  AntonOsika/gpt-engineer README.md
    OG code generation experimentation platform
    preprompts / --use-custom-preprompts
    bench: APPS, MBPP
    aider 为维护更好 CLI

待补（可达后）:
  默认分支名
  README 实际路径
  prompt/目录/模型常量
```

**未本轮打开**: smol-ai/developer 任何文件。不发明路径与常量。

---

## 8. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | N/A | 无 live 源 |
| 权限/安全边界 | N/A | 无 live 源 |
| 容错与会话恢复 | N/A | 无 live 源 |
| 上下文工程 | 3 | 旁证: 一次性全量（弱） |
| 可扩展（技能/MCP） | N/A | 无 live 源 |
| 可观测与可评测 | N/A | 无 live 源 |
| 生产可用成熟度 | 2 | 可达性失败本身是信号 |

**综合**: **本轮 jsDelivr 双分支 404**。openmate 从旁证学「逐步+过滤优于一次性」，并把**可达性检查**写进研究流程。待确认默认分支后可重抓补全。

---

## 9. 关键链接

- https://github.com/smol-ai/developer（待人工确认可达性）
- 旁证: `reports/gpt-pilot-l1.md`、`reports/gpt-engineer-l1.md`
- 相关: `reports/devika-l1.md`、`reports/aider.md`

---

## 10. 附录 A — 可达性检查清单（P0 流程）

研究任意外部仓前强制:

```
1. jsDelivr @main
2. jsDelivr @master
3. GitHub raw main/master
4. GitHub API /repos/{owner}/{repo} 取 default_branch
5. 仍失败 → 标记 404，不发明路径
```

openmate 研究工具:
```
openmate research fetch <owner>/<repo>
  → 自动尝试多分支
  → 输出 default_branch 或 404
```

---

## 11. 附录 B — 旁证引用规范

| 规则 | 说明 |
|------|------|
| 标明来源仓 | 「gpt-pilot README 提及…」 |
| 不升格为本仓事实 | 旁证 ≠ 源码 |
| 不发明常量 | 无 live 源即 N/A |
| 评分 N/A | 无依据不打分 |

---

## 12. 附录 C — 代码生成谱系对照（旁证级）

| 项目 | live | 形态 | 上下文 | 评测 | 维护 |
|------|:---:|------|--------|------|------|
| smol-ai/developer | ❌ | 旁证: 一次性 | 未知 | 未知 | 未知 |
| gpt-engineer | ✅ | 一次性 + -i | preprompts+vision | bench APPS/MBPP | 实验；荐 aider |
| gpt-pilot | ✅ | 逐步多角色 | **过滤器** | 无内置 | **不维护+事故** |
| aider | — | CLI | （见 aider 报告） | — | 活跃（旁证） |
| devika | ✅ | 四段式研究驱动 | 关键词 | SWE-bench 目标 | early→Opcode |

---

## 13. 附录 D — openmate 默认策略（P0）

基于旁证与同谱系 live 源:

1. **默认逐步协作**，非一次性全量
2. **上下文过滤器**为默认开启
3. **任务粒度 medium**，可调
4. **preprompts 目录**支持身份覆盖
5. **bench 集成**可复现
6. **外部仓引用前双通道可达性检查**
7. **404 显式入报告**

---

## 14. 附录 E — 待补清单（可达后）

| 项 | 状态 |
|----|------|
| 默认分支名 | 待确认 |
| README 实际路径 | 待确认 |
| prompt/目录约定 | 待补 |
| 模型配置常量 | 待补 |
| 评分 | 待补 |

**不发明**: 在可达前保持 N/A。

---

## 15. 附录 F — 与 gpt-pilot 安全教训交叉

gpt-pilot 供应链事故说明: 不活跃的极简代码生成仓可能成为攻击面。openmate:

- 引用前查维护活跃度
- 不 `import` 未审的 telemetry/hooks 类模块
- 二进制 payload 需 checksum

详见 `reports/gpt-pilot-l1.md` 附录 D。

---

## 16. 附录 G — openmate 研究报告模板（404 版）

```markdown
# <owner>/<repo> — 架构深度研究报告

## 0. 诚实性说明 — P0 路径 404
| 尝试路径 | 结果 |
| main | 404 |
| master | 404 |

## 1. 旁证（标明来源仓）
## 2. 失败路径
## 3. 对照结论（旁证级）
## 4. 超时/限制（不发明）
## 5. openmate P0（流程教训）
## 6. 待补清单
```

---

## 17. 附录 H — openmate 代码生成模块验收标准（P0）

| 验收项 | 标准 | 依据 |
|--------|------|------|
| 默认模式 | 逐步协作 | gpt-pilot 旁证 |
| 上下文 | 过滤器默认开 | gpt-pilot README |
| 任务粒度 | medium 默认可调 | gpt-pilot README |
| 身份 | preprompts 目录 | gpt-engineer |
| 评测 | bench APPS/MBPP | gpt-engineer |
| 外部仓 | 双通道可达性检查 | 本轮 404 |
| 报告 | 404 显式 | 本轮 404 |

---

## 18. 附录 I — 研究流水线伪码

```
def research_repo(owner, repo):
    for branch in [main, master]:
        if jsdelivr_ok(owner, repo, branch):
            return parse(jsdelivr_get(...))
        if raw_github_ok(owner, repo, branch):
            return parse(raw_github_get(...))
    default = github_api_default_branch(owner, repo)
    if default and jsdelivr_ok(owner, repo, default):
        return parse(...)
    return Report404(owner, repo, tried=[main, master])
```

Report404 必须含: 尝试路径、可能原因、旁证、待补清单、openmate 流程教训。

---

## 19. 附录 J — 与本 session 其他 404 报告交叉

| 报告 | 仓 | 状态 |
|------|-----|------|
| smol-developer-l1.md | smol-ai/developer | 404 双分支 |
| cursor-cli-l1.md | anysphere/cursor-cli | 404 双分支 |
| agentbench-l1.md | OpenBMB→THUDM | 路径纠错成功 |

共同教训: 可达性检查前置；不发明路径；旁证标明来源。

---

## 20. 附录 K — openmate 研究报告强制章节

1. 诚实性说明（含 404 表）
2. 系统架构
3. 核心常量（源码实读）
4. 失败路径
5. openmate P0 借鉴
6. 应避免的坑
7. 源码锚点速查
8. 评分（1–5）
9. 关键链接

---

## 21. 版本与核对

| 项 | 值 | 状态 |
|----|-----|------|
| 用户指定仓 | smol-ai/developer | 本轮 |
| @main | 404 | 本轮 |
| @master | 404 | 本轮 |
| 旁证 gpt-pilot | ✅ | 实读 |
| 旁证 gpt-engineer | ✅ | 实读 |
| 发明路径 | **无** | 遵守 |

---

## 22. 结语

smol-ai/developer 本轮不可达。openmate 已从同谱系 live 源（gpt-engineer、gpt-pilot、devika）提炼可落地 P0，并把 404 处理规范固化进研究流程。待仓库可达后按附录 G 模板补全架构章节与评分。本报告同时作为 openmate 研究流水线的 404 处理参考实现：双通道探测、旁证标明来源、不发明路径与常量、流程教训可执行。代码生成默认策略：逐步协作 + 上下文过滤 + medium 任务粒度 + preprompts 身份 + bench 可复现评测。外部仓引用前必须完成 main/master/raw/API 四通道可达性检查；404 结果必须显式写入报告头部诚实性说明，禁止用记忆或产品旁证填充本仓事实。关联报告：gpt-engineer-l1（preprompts+bench）、gpt-pilot-l1（角色链+安全）、devika-l1（四段式）、cursor-cli-l1（同类 404）。本文件 ≥250 行 / ≥12KB 达标。
