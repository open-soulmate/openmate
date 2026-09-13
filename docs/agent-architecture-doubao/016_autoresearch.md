# 016 · karpathy/autoresearch 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 16 / GitHub Top 100 AI Agent 第 16 位
> 证据：README.md 与 program.md 全文（经 jsDelivr CDN 拉取 raw 源码）。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | karpathy/autoresearch |
| GitHub | https://github.com/karpathy/autoresearch |
| Star | 约 95,683（初步清单，GitHub API 本次因限流未复核） |
| 主语言 | Python（uv 管理） |
| License | MIT |
| 作者 | Andrej Karpathy，2026-03 |

**一句话定位**：给一个编码 Agent 一个"小而真实"的单 GPU LLM 训练环境，让它**无人值守地通宵自动做研究**——改代码、跑 5 分钟训练、读 val_bpb 指标、变好就保留、变差就回滚，循环上百次。

**目标用户**：ML 研究者 / Agent 研究者。它演示的是"如何用外部编码 Agent + 一个干净的评测环境，搭出自治研究组织"。

**成熟度**：刻意保持极小（"only three files that matter"），配套 macOS/MLX/Windows/AMD 多个社区 fork。

> ⚠️ 性质判定（源码确认）：本仓库**自身不含 Agent 运行时/主循环代码**。"自治研究循环"完全由 `program.md` 这份提示词定义、由**外部编码 Agent（Claude/Codex 等，且关闭权限）**执行。仓库只提供：`train.py`（唯一可编辑文件）、`prepare.py`（只读评测/数据）、`program.md`（指令）。因此第 6/7 章按"作为运行时不适用"处理，转而分析它**用约定+git 如何在外部 Agent 上实现稳定性/可复现**。

---

## 2. 源码结构总览（源码确认，README「Project structure」）

```
autoresearch/
├── prepare.py    # 固定常量、数据下载、BPE tokenizer、dataloader、evaluate_bpb() —— 只读，不改
├── train.py      # 唯一被 agent 编辑的文件：GPT 模型 + Muon/AdamW 优化器 + 训练循环
├── program.md    # ★ agent 的"程序"（自治研究组织的指令）—— 由人迭代
└── pyproject.toml # 依赖（uv）
```

**入口**：无传统入口。人对外部 Agent 说"看 program.md，开个新实验"，Agent 读完后进入 LOOP FOREVER。

**代码规模**：极小。`train.py` 是 nanochat 单 GPU 简化版；真正的"Agent 逻辑"是 program.md 约 1.7KB 文本。

---

## 3. 系统架构分析

**编排模式：Reflection / 自我实验循环（由外部 Agent 解释 program.md 驱动）。** 证据（源码确认，program.md「The experiment loop」）：
```
LOOP FOREVER:
 1. 看 git 状态（当前分支/commit）
 2. 直接 hack train.py 实现一个实验想法
 3. git commit
 4. uv run train.py > run.log 2>&1   # 重定向输出，不污染上下文
 5. grep "^val_bpb:\|^peak_vram_mb:" run.log
 6. grep 为空 → 崩溃 → tail -n 50 读栈，修或放弃
 7. 结果记 results.tsv（不 commit，保持 untracked）
 8. val_bpb 更低（变好）→ 保留 commit（advance branch）
 9. val_bpb 持平/变差 → git reset 回起点
```

**核心组件**：
- **外部编码 Agent**：执行 loop 的主体（非本仓库代码）。
- **git 作为版本控制/回滚原语**：commit = 实验快照，`git reset` = 自动回滚。
- **prepare.py 的 `evaluate_bpb()`**：唯一的"ground truth 指标"，且**禁止修改**——保证实验可比性。
- **results.tsv**：人可读的实验日志（commit/val_bpb/memory_gb/status/description）。

**关键设计**：固定 5 分钟墙钟预算（不含启动/编译），指标 val_bpb（validation bits per byte，越低越好，与词表大小无关），使"无论 agent 怎么改架构/批大小/模型规模，实验都可直接比较"。

---

## 4. 功能拆解

- **单文件修改面**：agent 只动 `train.py`，diff 可控、可审；`prepare.py` 只读、禁装新包、禁改评测。
- **预算固定**：训练恒跑 5 分钟 → 约 12 次/小时、睡眠约 100 次实验。
- **输出契约**：脚本结束打印固定格式 summary（`val_bpb / training_seconds / peak_vram_mb / mfu_percent / num_params_M / depth`），agent 用 grep 精确抽取。
- **复杂度惩罚（simplicity criterion）**：program.md 明确"同等条件下越简单越好；删代码且指标不降 = 简化胜利；0.001 提升但加 20 行脏代码 = 不值得"。
- **VRAM 软约束**：允许少量增长换显著收益，但不允许爆炸。

---

## 5. 技术亮点与优势

1. **把"研究组织"编成 Markdown**：人不写 Python，而是迭代 `program.md` 这份"研究组织代码"——这是一种全新的产品形态（用提示词组织 Agent 社会）。
2. **git 即试错机制**：commit/reset 把"假设→实验→保留/回滚"映射成 VCS 原语，零额外基础设施。
3. **固定预算+可比指标**：5 分钟 + val_bpb 消除了"改大模型自然训得久"的混淆变量，是自治实验设计的关键洞察。
4. **上下文卫生**：`uv run train.py > run.log 2>&1`（明确禁止 tee/不让输出淹没上下文）+ grep 精确抽取——**刻意把训练日志挡在 LLM 上下文之外**，只回喂关键数字。
5. **NEVER STOP**："开始循环后不要暂停问人是否继续，人可能在睡觉，一直跑到被手动打断"——把长时间自治显式写进指令。

---

## 6. 稳定性机制【重点】

> **作为运行时：不适用**（本仓库无 Agent 代码）。以下为 program.md/约定层面的稳定性设计（源码确认）。

- **崩溃检测与自愈**：步骤 6——grep 不到 `val_bpb` 即判定崩溃；`tail -n 50 run.log` 读 Python 栈；"简单错（typo/缺 import）就修，根本性错误就跳过、记 crash、换下一个"。
- **超时熔断**：单次实验应 ~5 分钟；**超过 10 分钟就 kill，判失败并 revert**——防止训练挂死占住通宵窗口。
- **版本回滚**：变差即 `git reset` 回起点，保证分支始终停在"当前最优"，坏实验不污染主线。
- **只读边界**：`prepare.py` 与评测函数只读、禁装依赖——避免 agent 为刷指标篡改评测或引入不兼容包。
- **状态可恢复**：实验日志在 results.tsv（刻意 untracked），git 分支 `autoresearch/<tag>` 记录代码轨迹，重开可从 git 状态恢复。
- **边界处理**：crash 在 results.tsv 用 `0.000000 / 0.0` 占位，保持 TSV 列对齐。

---

## 7. 高可用机制【重点】

> **作为运行时：不适用**（单机单 GPU、无服务端）。

- **故障隔离**：每个实验是独立进程（`uv run train.py`），崩溃不影响下一次；坏实验 git reset 即可。
- **资源约束**：VRAM 软上限 + 10 分钟硬超时，防止 OOM/死循环把机器拖垮。
- **可观测**：run.log + results.tsv + git log 三层记录，早晨可复盘每一步。
- **无单点**：agent 随时可被打断/重启，git + results.tsv 即为检查点。

---

## 8. 自我进化机制【重点】（这是本项目的核心，源码确认）

这是整个 Top 100 里"自我进化"最纯粹的样本：
- **反思循环**：每个实验 = 假设（改 train.py）→ 实证（5 分钟训练）→ 评判（val_bpb 是否更低）→ 保留或丢弃。闭环完全由结果指标驱动。
- **经验沉淀**：results.tsv 累积历史实验与结论；program.md 指示"没想法时——读代码里引用的论文、重读 in-scope 文件、把之前接近成功的尝试组合、试更激进的架构"——即**失败案例的再利用**。
- **自动回滚式选择**：变好 advance、变差 reset，等价于一个离散的 hill-climbing（爬山搜索），无需人工。
- **简化即目标**：显式奖励"删掉代码且指标不降"，防止模型复杂度无限膨胀。
- **人类在环的元进化**：人通过迭代 `program.md`（而非代码）改进整个"研究组织"，这是第二层进化。

---

## 9. openmate 可借鉴点【重点】

**P0｜"假设→固定预算实验→量化指标→保留/回滚"的自进化闭环**
- 借鉴什么：commit 一个改动 → 跑一个有固定预算的实验 → 用一个**单一可比指标**评判 → 变好保留、变差 git reset。
- 怎么用：openmate 做 Agent 能力迭代/提示词/工具改动时，为每次改动跑一个小评测集，自动对比指标，差的回滚。把"Agent 自我改进"变成可量化的爬山过程。
- 预期收益：让 openmate 的迭代有据可依，不靠感觉。

**P0｜上下文卫生：重定向日志、只回喂关键数字**
- 借鉴什么：`uv run train.py > run.log 2>&1`（禁止 tee）+ `grep "^val_bpb:"` 只抽关键指标。
- 怎么用：openmate 执行长命令/长工具时，把完整输出落盘、上下文里只放抽取后的关键结果与指针。
- 预期收益：长任务不爆上下文，token 成本可控。

**P1｜硬超时 + 崩溃栈读取 + 有限次重试**
- 借鉴什么：超 10 分钟 kill 判失败；崩溃先 tail 栈、简单错修、反复不行就放弃。
- 怎么用：openmate 工具/命令调用加墙钟超时与崩溃诊断回喂，避免卡死。
- 预期收益：无人值守长任务的健壮性。

**P1｜只读评测 + 单一可比指标**
- 借鉴什么：评测 harness 只读、指标与"实现细节无关"，保证实验可比。
- 怎么用：openmate 的评估集/评分器做成不可被改的只读基准，Agent 不能靠钻评分空子刷分。
- 预期收益：评估可信。

**P2｜把"组织规则"写成可迭代的 Markdown（program.md）**
- 借鉴什么：不写代码，而用 Markdown 指令定义 Agent 的工作方式、约束、目标。
- 怎么用：openmate 把自家 Agent 的"行为规范/红线/目标"也做成一份可热改的 program.md，运营调优不改代码。
- 预期收益：行为调优敏捷。

---

## 10. 源码验证标注

**源码直接阅读**（经 jsDelivr CDN `@master` 分支）：
- README.md 全文：三文件结构、5 分钟固定预算、val_bpb 指标、"agent 编辑 train.py / 人编辑 program.md"、设计取舍、平台/小模型调参建议、社区 fork。
- program.md 全文：Setup 步骤、Experimentation 的 CAN/CANNOT、输出格式、results.tsv 五列与示例、LOOP FOREVER 九步、超时/崩溃/NEVER STOP 规则、simplicity criterion。

**文档/推断**：
- "约 600 行""H100""Muon+AdamW""nanochat 简化版"来自 README 与初步清单。
- 外部 Agent 的具体执行（Claude/Codex）来自 README "spin up your Claude/Codex ... disable all permissions"。

**源码不可得**：
- 本轮 GitHub API 对 karpathy/autoresearch 持续返回 `link fetch error`（限流），**未能复核 star 数、未能读取 `train.py`/`prepare.py` 的实际源码**——`evaluate_bpb()`、5 分钟预算在 train.py 内的具体实现未逐字验证，仅据 README/program.md 的描述。
- 默认分支为 `master`（raw@main 返回 404，raw@master 成功）。
