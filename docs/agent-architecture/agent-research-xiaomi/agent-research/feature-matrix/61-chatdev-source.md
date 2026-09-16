# ChatDev (OpenBMB) 功能研究 — 文档级

研究时间：2026-09-16 深夜轮（cron）
GitHub: https://github.com/OpenBMB/ChatDev （Apache-2.0，Python，#61，26k★）
研究方式：⚠️ **文档级**（GitHub网络今晚对中大仓库持续超时/curl exit 28/11MB截断，源码未能下载；基于README+官方公告+论文）。**下轮需补源码级验证**（clone到chatdev1.0分支看经典版、main分支看2.0、puppeteer分支看RL编排器）。

## 关键背景：仓库已分裂为三条产品线
- **ChatDev 2.0 (DevAll)** = main分支（2026-01发布）：**零代码多agent编排平台**，配置定义agent/workflow/task，编排数据可视化、3D生成、深度研究等场景
- **ChatDev 1.0 (Legacy)** = `chatdev1.0`分支：经典**虚拟软件公司**（CEO/CTO/Programmer角色扮演，全程SDLC自动化：设计→编码→测试→文档）
- **puppeteer分支** = NeurIPS 2025论文"Multi-Agent Collaboration via Evolving Orchestration"：**可学习的中心编排器（RL优化）**，动态激活+排序agent构建推理路径

## 功能清单（文档级，需源码确认）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **零代码多agent编排平台(2.0)**：配置定义agent/workflow/task，无编码编排复杂场景 | 部分：xyflow画布12节点+graph-engine DAG校验 | 部分：will/dag_planner | 部分有 | OpenMate已有画布。差距在"配置即运行"的执行运行时（与Flowise/Langflow结论一致） |
| 2 | **虚拟软件公司角色扮演(1.0)**：CEO/CTO/Programmer/Reviewer/Tester等，inception prompt让每个agent记住角色+任务+同伴+历史 | ❌无 | ❌无（multi_agent.py仅88行硬编码Researcher→Analyzer→Writer） | 完全没有 | 中价值。政企"数字员工团队"场景。inception prompt三要素(角色/同事/阶段记忆)可移植 |
| 3 | **功能研讨会(seminar)协作**：多agent围绕单任务分轮对话打磨（设计研讨/代码研讨/测试研讨），阶段化 | ❌无 | ❌无 | 完全没有 | 与AgentVerse环境步进/RoleAssigner互证。"分阶段多角色对话"是OpenSoul multi_agent升级方向 |
| 4 | **RL中心编排器(puppeteer分支)**：可学习的central orchestrator用RL动态决定"激活哪个agent+什么顺序"，降低token成本+提升推理质量 | ❌无 | ❌无 | 完全没有 | 前沿（NeurIPS 2025）。OpenSoul短期不必上RL，但"动态激活agent序列"思想可启发multi_agent |
| 5 | **MacNet协作网络**：DAG结构组织agent协作（Multi-Agent Collaboration Networks） | ❌无 | 部分：will/dag_planner(任务DAG非agent协作DAG) | 部分有 | 与AgentVerse环境五件套/crewai互证 |
| 6 | **文档/代码/测试自动化产物**：设计文档+代码+测试用例+用户手册全SDLC产出 | ❌无 | 部分：limb/executor | 部分有 | 低优先级，属垂直应用 |

## 源码亮点（待验证）
1. **三线分裂的行业信号**：一个26k★项目主动把"虚拟软件公司"降为legacy，主线转向"零代码编排平台"——说明**角色扮演式多agent（1.0）市场验证不如"通用编排平台"（2.0）**。这对OpenSoul multi_agent方向有参考价值：与其硬编码角色流水线，不如做可配置编排。
2. **puppeteer RL编排器**（NeurIPS 2025）：中心编排器学习"何时激活哪个agent"，是multi-agent从"静态流水线"到"动态调度"的学术前沿。OpenSoul可先做规则版（按任务类型选agent序列），数据够了再考虑学习版。

## 可复用设计（针对OpenSoul，需源码确认）
- **inception prompt模板**（角色/同伴/阶段记忆三要素）→ 可给multi_agent.py的每个agent注入
- **分阶段seminar流程** → 升级88行硬编码流水线为"阶段化多角色对话"
- **动态agent激活**（规则版）→ 替代固定Researcher→Analyzer→Writer顺序

## 下轮TODO
- clone `chatdev1.0`分支读经典虚拟软件公司源码（角色定义/inception prompt/seminar机制/clean scrum流程）
- clone main分支读2.0零代码编排平台（配置schema/执行引擎）
- 对照puppeteer分支论文读RL编排器实现

## 与既有研究互证
- 零代码编排 = OpenMate画布 vs Flowise/Langflow（已有结论：缺执行运行时/子图/HITL/NL生成）
- 动态agent调度 = AgentVerse RoleAssigner/环境五件套 + crewai + ChatDev
- multi-agent从静态流水线到动态调度是行业共识
