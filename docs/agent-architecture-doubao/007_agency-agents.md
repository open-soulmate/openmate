# 007 · msitarzewski/agency-agents 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：The Agency: AI Specialists（作者 msitarzewski）
- **GitHub 地址**：https://github.com/msitarzewski/agency-agents
- **Star 数**：约 152,000（批次数据）；MIT 协议
- **主要语言**：Shell（README 标记），内容本体为 Markdown
- **一句话定位**：一套**开箱即用的"AI 代理公司"角色库**——200+ 个专业化 agent 角色定义，按 division（Engineering/Marketing/Security 等）组织，每个角色是含人格、流程、交付物的 Markdown 文件。
- **目标用户/场景**：想把现成专家角色一键装进 Claude Code / Cursor / Codex / Gemini / OpenCode / Kimi / Hermes 等 harness 的开发者。
- **成熟度**：活跃，已发布配套原生桌面应用（agencyagents.app，macOS/Linux/Windows，自动更新），`brew install --cask` 可装。

> 定性：它**不是可运行的 agent 编排程序**，而是**角色/提示资产包 + 多宿主转换器**。真正的"代码"是 `scripts/convert.sh` 与 `scripts/install.sh`（把单一规范格式翻译为各宿主格式）。第 6/7 章主要落在转换/安装层，主 agent 稳定性标注"不适用"并说明。

## 2. 源码结构总览

据 README（raw main，全文）核实：

```
agency-agents/
├── engineering/      # Engineering Division，约 50+ 角色，如
│   ├── engineering-frontend-developer.md
│   ├── engineering-backend-architect.md
│   ├── engineering-multi-agent-systems-architect.md
│   ├── engineering-rag-pipeline-engineer.md
│   ├── engineering-sre.md
│   └── ...
├── marketing/  security/  ...  # 其他 division（约 17 个）
├── scripts/
│   ├── convert.sh   # 为所有支持工具生成集成文件
│   └── install.sh    # 交互式/定向安装（--tool/--division/--agent/--dry-run/--list）
└── README.md
```

**核心资产**：每个角色一个 `*.md`，内含四要素——身份与人格特质、核心使命与工作流、带代码示例的技术交付物、成功度量与沟通风格。
**入口/流程**：`./scripts/convert.sh` 生成各宿主集成文件 → `./scripts/install.sh [--tool X --division Y --agent Z]` 安装 → 在 harness 里"activate Frontend Developer mode"调用。
**代码规模**：200+ 角色 Markdown + 两个 shell 脚本；无 agent 运行时。

## 3. 系统架构分析

- **编排模式**：**Multi-Agent 角色定义库**（角色静态资产），运行时编排由宿主 harness 承担。批次判断 "Multi-Agent 协作" 在此项目体现为"提供角色模板"而非"运行调度器"。
- **核心组件**：
  1. **单一规范格式**：所有角色用统一 Markdown schema（人格/流程/交付物/度量）。
  2. **转换层** `convert.sh`：把规范格式翻译为 Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Qwen、Copilot、Aider、Windsurf、Kimi、Osaurus、Hermes 等十余种宿主格式。
  3. **安装层** `install.sh`：交互式向导或定向 `--tool/--division/--agent`，支持 `--dry-run`、`--list`，自动探测已装工具。
- **数据流**：作者写规范 `.md` → convert.sh → 各宿主目录（如 `~/.claude/agents/`）→ 宿主会话按"任务路由到最匹配专家角色"调用。
- **关键设计**：一份事实源、多目标格式——与 superpowers/ECC 的"薄适配层"理念一致，但这里的"代码"更薄（纯格式转换）。

## 4. 功能拆解

- **角色库**：Engineering division 已见 50+（前端/后端/移动端/AI/DevOps/SRE/多智能体架构师/RAG 工程师/隐私工程师/支付/桌面端等），覆盖约 17 个 division。
- **多宿主安装**：`install.sh --tool <host>` 定向安装；`--division engineering,security` 只装需要的团队；`--agent frontend-developer` 只装单个。
- **桌面 App**：agencyagents.app 浏览全名册、一键安装到各 harness、自动更新，免 clone/脚本。
- **参考用法**：直接浏览角色 `.md` 复制改编。

## 5. 技术亮点与优势

1. **单一事实源 + 格式转换**：角色只写一遍，convert.sh 翻译到十余宿主——维护成本低、跨宿主一致。
2. **交付物导向的角色设计**：不只写人格，还写"成功度量 + 可运行代码示例"，比泛泛 prompt 模板更可用。
3. **安装工程化**：`--dry-run`/`--list`/交互式向导/自动探测，且对宿主限制做了适配（见下）。
4. **生态卡位**：覆盖从 Coding harness 到 Hermes/Qwen/Kimi 的新宿主，随生态扩展。

## 6. 稳定性机制【重点】

> 主 agent 稳定性**不适用**（无运行时循环）；本章仅评转换/安装层。

- **宿主容量边界处理（README 直接证据）**：明确记录 "OpenCode's runtime currently registers only ~119 agents and silently drops the rest"，并对策——用 `--division` 子集安装把数量压到上限以下，**"The installer warns you when a selection would exceed it"**。这是对"宿主静默丢配置"这一真实故障的工程应对：安装前 dry-run/校验 + 超限告警。
- **幂等/可重复安装**：`install.sh` 支持 `--dry-run` 预览、`--list teams` 盘点、`--division/--agent` 精确选择——安装动作可预览、可重复、可审计，避免误装全量。
- **回退**：桌面 App 自动更新；脚本安装可只装子集，卸载即删对应 `.md`，无状态残留。
- **不适用项**：无重试/退避/超时/崩溃恢复/并发一致性（无服务进程）。

## 7. 高可用机制【重点】

**主 agent 高可用不适用**（纯静态资产包，无服务端）。转换/安装层可提及的工程点：
- **降级/兼容**：convert.sh 为每个宿主生成适配文件，宿主缺特性时退化为"角色说明文件"而非整体失败。
- **可观测**：`--dry-run` + 超限告警 = 安装前可预测结果；`--list` 提供清单自检。
- **横向扩展**：不适用；其"扩展"是新增 division/角色与新增宿主适配脚本，与运行时扩展无关。

## 8. 自我进化机制【重点】

**不适用（无 agent 自我进化）。**
- **反思/记忆**：无。角色是静态人格定义，无运行时反思、无记忆、无自反馈。
- **技能进化**：角色库靠**人工社区贡献**（PRs Welcome）迭代，非 agent 自动学习。
- **评估回路**：角色里写了"成功度量"字段，但这是供人/宿主评判的标准，不是自动 eval 回路。
- **对 openmate 的间接参考**：其"每个角色都带成功度量"的写法，可作为日后给 openmate 角色/技能挂验收标准的模板。

## 9. openmate 可借鉴点【重点】

- **P0｜单一规范格式 + 多端转换器**：openmate 规划桌面/手机多端，应把"角色/提示/技能"写成一份端无关规范，再由薄转换层翻译成各端——而非为每端维护三份。这与 superpowers/ECC 互证。
- **P1｜安装前 dry-run + 容量校验告警**：openmate 多端同步配置/技能时，先 `--dry-run` 预览、对"目标端能加载的条目数上限"做校验并超限告警——对应其 OpenCode 119 上限的教训。预期收益：避免"静默丢配置"。
- **P1｜角色定义四要素模板**：人格/流程/交付物/成功度量——openmate 设计专家子角色时照此模板写，比空泛人设更可验收。
- **P2｜子集安装（按 division/agent）**：让用户只装需要的角色，控制加载面与 token——openmate 的技能/角色启用管理可参考。

## 10. 源码验证标注

**直接获取**：`README.md`（raw main，全文前 ~20%）——定位、Engineering Division 角色表（含文件路径如 `engineering/engineering-frontend-developer.md`）、`convert.sh`/`install.sh` 用法与参数、OpenCode 119 上限及告警对策、桌面 App 信息。
**文档/推断**：未读取任何角色 `.md` 正文，也未读 `convert.sh`/`install.sh` 脚本实现；约 17 division、232 角色数为批次数据/README 自述。
**不可得说明**：GitHub API 限流，未枚举完整 tree；角色定义内部 schema 未逐文件核实，四要素据 README 描述归纳。
