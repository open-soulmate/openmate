# Scientific Agent Skills 源码级调研报告（Rank 60）

> 调研对象：`K-Dense-AI/scientific-agent-skills`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支（v2.68.0）

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Scientific Agent Skills（原 Claude Scientific Skills） |
| GitHub | https://github.com/K-Dense-AI/scientific-agent-skills |
| Star | 约 4.62w（清单快照 46,243） |
| 主要语言 | Markdown（165 个 SKILL.md）+ 每技能 `scripts/`（Python） |
| 许可证 | MIT |
| 一句话定位 | **K-Dense 出品的 165 个开箱即用的科研技能库：把跨生信/化学/临床/医学影像/材料/物理/工程的科研工作流，按开放 Agent Skills 标准打包成 SKILL.md，让任意兼容 agent 变成"AI 科学家"** |

**目标用户/场景**：科研人员想用 Cursor/Claude Code/Codex/Antigravity 做多步科研工作流（文献综述、单细胞分析、分子对接、PK/PD、合规文档）。配套有 K-Dense BYOK 桌面 co-scientist。

**成熟度**：v2.68.0、165 skills、100+ 数据库、arXiv 论文（2609.00065）、CI（security-scan + skill-tests）、符合 agentskills.io / agent-plugins.org 双标准。

> **性质判定**：纯技能内容库（skill package），非 Agent 运行时。本报告重点章节按技能库视角写。

---

## 2. 源码结构总览

```
scientific-agent-skills/
├── plugin.json        # 可移植 Agent Plugin 清单
├── skills/            # 165 个技能，每个含 SKILL.md + scripts/
├── pyproject.toml     # v2.68.0
└── (CI: security-scan.yml, skill-tests.yml)
```

**核心源码文件（HTTP 200）**：`README.md`（74,666 字节，通读）。
**技能组成（README:85-91）**：每个技能 = `SKILL.md` 文档 + 代码示例 + 用例 + 集成指南 + 参考材料；**带 `scripts/` 的技能必须自带测试套件，CI 会拦住没有测试就加工具脚本的 PR**（:91）。

---

## 3. 系统架构分析

### 编排模式：技能库（被宿主 agent 加载）——文档确认

仓库本身不跑 loop。它是**可移植 Agent Plugin**（`plugin.json` + `skills/`），插件型客户端一次加载整包；普通客户端按需读单个 `SKILL.md`。覆盖：
- 100+ 数据库（统一 database-lookup 技能经 78 公开库 + DepMap/PrimeKG/NCATS ARAX 等专用技能）；
- 70+ Python 包技能（RDKit/Scanpy/PyTorch Lightning/PathML/pydicom/QuTiP/OpenMM 等，version-aware）；
- 9 个科研集成（Benchling/DNAnexus/OMERO/Opentrons…）；
- 30+ 分析与沟通工具（文献综述、证据可追溯写作、Peer Review、Paperclip 全文检索、PPTX 海报）；
- 10+ 研究/临床工具（假设生成、grant 写作、PK/PD、ICH/USP/CLSI 方法验证）。

宿主 agent 据用户意图选技能→读 SKILL.md→按其指导调 Python 脚本/API。

---

## 4. 功能拆解

- **生信/基因组**：单细胞、变异注释、系统发育。
- **化学/药发现**：分子性质、虚拟筛选、ADMET、分子对接。
- **临床/合规**：PK/PD 建模、剂量选择、ICH Q2/USP/CLSI 方法验证（强调"为合格评审准备材料，非认证"）。
- **医学影像/病理**：隐私感知 DICOM、WSI 分析。
- **ML/物理/工程/地理空间/实验室自动化**。
- **科研沟通**：证据可追溯写作、同行评审、PPTX 海报、Mermaid、引用管理。

---

## 5. 技术亮点与优势

1. **版本感知 + 脚本化**：技能针对具体 Python 包版本写工作流，附带可跑脚本。
2. **每个带脚本的技能强制测试**：CI 拦截"加工具脚本无测试"的 PR——技能库也讲工程质量。
3. **双标准合规**：同时符合 Agent Skills（agentskills.io）与 Agent Plugins（agent-plugins.org），跨客户端可移植。
4. **安全 + 领域边界声明**：医疗/动物/合规类技能反复声明"是辅助不是决策、不做患者诊断/认证"。
5. **证据可追溯**：Paperclip 类技能行级 pinned citation，科研可复现。

---

## 6. 稳定性机制【重点】

> 技能库的"稳定性"=质量门禁与安全扫描。

- **CI 双重门禁**：`security-scan.yml` + `skill-tests.yml`（README badges）。**每个带 scripts/ 的技能必须带测试套件，无测试的加脚本 PR 被 CI 拦下**（README:91）。这是技能库少见的硬性质量约束。**文档确认**。
- **领域安全边界声明**：临床/动物/合规模块明确"research-only、不做诊断/认证/放行决策"，防止 agent 越权输出。
- **版本感知文档**：针对包版本写工作流，减少"版本漂移导致脚本跑不通"。
- **无运行时代码（如实）**：无服务/无重试/无崩溃恢复；稳定性=文档与 CI 质量。

---

## 7. 高可用机制【重点】

**不适用**：纯内容库，无服务。其"可移植性"=插件包一次加载、跨 Cursor/Claude Code/Codex/Antigravity 多宿主可用；状态不依赖单一服务。

---

## 8. 自我进化机制【重点】

- **Autoskill（工作流落成技能）**：README:83 提到"workflow-derived skill drafting with Autoskill"——把跑通的科研工作流反向草稿成新技能。
- **持续扩充**：版本 v2.68.0、随社区贡献新增技能，技能库随时间增长。
- **未发现**：无在线学习；进化=人工/工具辅助把重复工作流沉淀为新 SKILL.md。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】技能 = SKILL.md + scripts/ + 强制测试**：直接抄 Scientific Agent Skills 的技能打包约定——文档、可跑脚本、用例、测试四件套。openmate 把重复性工作流做成技能时，"带脚本必带测试"是很好的内部规范。
- **【P0】按领域组织技能目录 + 路由**：165 个技能分 20 个领域，宿主按需选。openmate 技能多了也要分类路由，别堆成一个大提示词。
- **【P1】领域安全边界写进技能**：凡涉及高风险输出（医疗/财务/合规），在技能里明确"辅助非决策"。
- **【P1】证据可追溯输出**：科研类技能行级 citation，openmate 若做报告/总结类功能，学"结论绑定来源行"。
- **【P2】Autoskill 式工作流落技能**：把跑通的多步任务草稿成新技能，是低成本的经验沉淀。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读）**：
- `README.md`（74,666 字节：165 技能目录、v2.68.0、双标准、plugin.json+skills/、每技能组成、scripts 必带测试的 CI 门禁、领域清单、BYOK/论文）

**文档/推断**：
- 单个 SKILL.md 与 scripts/ 实现未逐个下载；技能数/分类据 README。
- 星级/活跃度来自清单快照。
