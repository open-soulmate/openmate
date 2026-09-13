# Agency Agents

## 概述

Agency Agents 是一个多Agent协作框架。

**仓库**: https://github.com/msitarzewski/agency-agents

## 核心架构

- **编排模式**：**Multi-Agent 角色定义库**（角色静态资产），运行时编排由宿主 harness 承担。批次判断 "Multi-Agent 协作" 在此项目体现为"提供角色模板"而非"运行调度器"。
- **核心组件**：
  1. **单一规范格式**：所有角色用统一 Markdown schema（人格/流程/交付物/度量）。
  2. **转换层** `convert.sh`：把规范格式翻译为 Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Qwen、Copilot、Aider、Windsurf、Kimi、Osaurus、Hermes 等十余种宿主格式。
  3. **安装层** `install.sh`：交互式向导或定向 `--tool/--division/--agent`，支持 `--dry-run`、`--list`，自动探测已装工具。
- **数据流**：作者写规范 `.md` → convert.sh → 各宿主目录（如 `~/.claude/agents/`）→ 宿主会话按"任务路由到最匹配专家角色"调用。
- **关键设计**：一份事实源、多目标格式——与 superpowers/ECC 的"薄适配层"理念一致，但这里的"代码"更薄（纯格式转换）。

## 关键技术

1. **单一事实源 + 格式转换**：角色只写一遍，convert.sh 翻译到十余宿主——维护成本低、跨宿主一致。
2. **交付物导向的角色设计**：不只写人格，还写"成功度量 + 可运行代码示例"，比泛泛 prompt 模板更可用。
3. **安装工程化**：`--dry-run`/`--list`/交互式向导/自动探测，且对宿主限制做了适配（见下）。
4. **生态卡位**：覆盖从 Coding harness 到 Hermes/Qwen/Kimi 的新宿主，随生态扩展。

> 主 agent 稳定性**不适用**（无运行时循环）；本章仅评转换/安装层。

- **宿主容量边界处理（README 直接证据）**：明确记录 "OpenCode's runtime currently registers only ~119 agents and silently drops the rest"，并对策——用 `--division` 子集安装把数量压到上限以下，**"The installer warns you when a selection would exceed it"**。这是对"宿主静默丢配置"这一真实故障的工程应对：安装前 dry-run/校验 + 超限告警。
- **幂等/可重复安装**：`install.sh` 支持 `--dry-run` 预览、`--list teams` 盘点、`--division/--agent` 精确选择——安装动作可预览、可重复、可审计，避免误装全量。
- **回退**：桌面 App 自动更新；脚本安装可只装子集，卸载即删对应 `.md`，无状态残留。
- **不适用项**：无重试/退避/超时/崩溃恢复/并发一致性（无服务进程）。

**主 agent 高可用不适用**（纯静态资产包，无服务端）。转换/安装层可提及的工程点：
- **降级/兼容**：convert.sh 为每个宿主生成适配文件，宿主缺特性时退化为"角色说明文件"而非整体失败。
- **可观测**：`--dry-run` + 超限告警 = 安装前可预测结果；`--list` 提供清单自检。
- **横向扩展**：不适用；其"扩展"是新增 division/角色与新增宿主适配脚本，与运行时扩展无关。

**不适用（无 agent 自我进化）。**
- **反思/记忆**：无。角色是静态人格定义，无运行时反思、无记忆、无自反馈。
- **技能进化**：角色库靠**人工社区贡献**（PRs Welcome）迭代，非 agent 自动学习。
- **评估回路**：角色里写了"成功度量"字段，但这是供人/宿主评判的标准，不是自动 eval 回路。
- **对 openmate 的间接参考**：其"每个角色都带成功度量"的写法，可作为日后给 openmate 角色/技能挂验收标准的模板。

## 对openmate的启示

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 豆包（007_agency-agents.md）
