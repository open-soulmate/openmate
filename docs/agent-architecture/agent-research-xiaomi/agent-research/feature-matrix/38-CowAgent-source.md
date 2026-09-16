# CowAgent (#38, zhayujie, 47k★) 功能研究 — 源码级（web_extract）

研究时间：2026-09-17 深夜轮6（cron）
研究方式：README(20k字符)+GitHub目录页（agent/全目录+commit message即规格书）+raw源码：agent/permission/policy.py、agent/evolution/trigger.py（memory/summarizer.py被Exa后端故障跳过）
背景：**原名chatgpt-on-wechat**（zhayujie的国民级微信机器人项目改名转型为Agent Harness）；商业版LinkAI。活跃度极高（commit 9小时前），且大量commit由cowagent AI自己提交（agent自举开发，与Warp Factories同信号）。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|---|
| 1 | **per-session权限三档**（policy.py源码级）：read-only（写拒绝+shell限只读工具白名单+副作用工具拒绝）/workspace-write（项目+agent状态目录+tmp内自由，外部拒写，读不限）/full-access（默认，兼容存量）；session_prefs per-session覆盖+全局fallback；别名归一（ro/danger-full-access等12个别名） | 全局三档已有（settings fileAccess full/restricted/readonly+shellWhitelist+networkAccess） | casbin用户级 | 部分有 | 缺per-session粒度；CowAgent"新装严、存量宽"双轨（config-template.json发严值）可抄 |
| 2 | **权限检查诚实声明**（policy.py docstring）："argument-level, not an OS sandbox"；bash尽力解析命令行拒可识别越界（redirect/rm越根/提权），但**"shell启动的程序仍可写任何OS允许的地方"明说**；"要硬边界的用户应该用容器"；UI同样如实告知 | 无 | 无 | 完全没有 | 威胁模型三段式（能防/不能防/该用什么）直接抄进OpenSoul immune文档和OpenMate UI文案 |
| 3 | **idle进化触发器**（trigger.py源码级）：后台线程60s扫描，**idle≥N分钟且（自上次进化≥min_turns个用户turn 或 活跃上下文>0.8×token预算）**才进化；注释明说"mirrors how OpenClacky/Claude Code consolidate under context pressure"；进化后baseline重置（长会话可多次进化不重复判旧内容）；mark_run_active防进化与live turn并发 | 无 | heredity/self_evolution.py（181行：成功率趋势/失败模式/反馈分析→log evolution） | 部分有 | OpenSoul有分析无触发器无动作无推送——把CowAgent trigger.py整抄为self_evolution的调度器 |
| 4 | **进化结果推送回来源渠道**：note_user_turn记录channel_type/receiver，进化完主动推送到用户所在IM渠道 | 无 | 无 | 完全没有 | "进化完告诉你它学到了什么"=可观测性（用户痛点"不知道在干嘛"） |
| 5 | **三层记忆**（context→daily→core）+Deep Dream自动蒸馏+hybrid关键词+向量检索；memory/目录10文件（chunker/embedding/conversation_store/summarizer/vector_backend/rebuild_index...） | 无 | hippo向量+decay+consolidate | 部分有 | 缺daily层和对话蒸馏入口（nanobot Dream两方互证） |
| 6 | **知识自动整理成Markdown wiki+演化知识图谱（可视化浏览）** | 无 | knowledge存储有 | 部分有 | "知识库自动长成wiki"与用户LLM Wiki愿景同构 |
| 7 | **多agent team共享会话**（prompt/commit规格级）：共享transcript每轮reload；**同事历史回复replay为`Name(@id)：`user turn**而非`[Name]`assistant前缀（"让模型没有可复制的东西"+prompt明说不许前缀回复/暴露teammate id+输出侧strip残留speaker label） | 无 | multi_agent.py信箱模型 | 完全没有 | 防"模型复制说话人前缀"的三重防线（结构+prompt+输出清洗）是踩坑总结，直接可抄 |
| 8 | **team_addressing @teammate寻址**：team_addressing.py把行首@teammate解析为说话人，与Langroid @recipient互证升级为两方 | 无 | 无 | 完全没有 | |
| 9 | **subagent run挂parent**：spawned sub agent runs记录在parent之下（agent/subagent/） | 无 | trajectory无parent_id（grep=0） | 完全没有 | 与ms-agent-fw occurrence lineage同方向 |
| 10 | **provider model catalog overlay**（protocol/commit规格级）：`<workspace>/system/models.json`只存overrides+hidden tombstones（不整体替换预设、不膨胀config.json）；编辑器预填"预设−移除+覆盖"的有效列表防一次添加清空其余；resolve_family_spec共享context window/max output预算表给UI和runtime | 无 | llm配置 | 完全没有 | "overlay而非替换"+"tombstone删除标记"是配置系统通用范式 |
| 11 | **model-derived context budget**：per-provider模型目录推导上下文预算（evolution/commit） | 无 | LLM_MAX_TOKENS全局env | 部分有 | 与deepagents harness profiles互证：按模型定预算 |
| 12 | **一进程多IM实例**：每个渠道类型可跑多个独立实例（factory绕@singleton用_fresh）、per-instance凭据、**实例上下文（绑定agent/实例id/team成员）stamp到每条inbound消息**、Web控制台每实例一卡 | gateway单实例 | 无 | 完全没有 | "同一进程多个微信号/飞书号"对多账号运营刚需 |
| 13 | **scheduler run records**：分页(30/页)+单条删除+**output_preview恒1000字截断+显式省略号（"clipped preview never reads as the whole message"）** | 无 | 无 | 完全没有 | 与AIHawk SHOWN/SENT预算哲学互证：截断必须可见 |
| 14 | **deleted agent引用加固**：删除agent时清扫session_prefs孤儿覆盖+从其他会话team roster剪枝+poll/cancel降级不刷错+前端保留last good roster兜底合成default | 无 | 无 | 完全没有 | 删除级联清理清单可抄 |
| 15 | **Skill Hub一键安装**（官方hub/GitHub/ClawHub三源）+自然语言对话创建自定义skill | plugins_api有 | skills.py有 | 部分有 | 三源安装+NL建skill |
| 16 | **UTF-8 BOM容错**：Windows记事本存的config.json带BOM曾致agent列表API失败→专门修复roster路径 | 待查 | 待查 | 待查 | 中文用户Windows编辑配置的现实坑 |

## 源码亮点

- **commit message=规格书**：CowAgent的commit把设计动机、备选方案、回归防线全写清（如team prompt同步bug的三层根因分析+修复），配合"Co-authored-by: cowagent"——**agent自举开发+高质量提交叙事**，本身是agent工程化样本。
- **policy.py的`__bool__`便利**+Decision dataclass（allowed+reason）——权限判定返回带理由的对象，理由可直接进审批UI。
- trigger.py把进化状态放agent实例轻量属性（`_evo_last_active`/`_evo_turns`）而非独立表——"轻状态放内存、重结论落库"的取舍有注释。

## 可复用设计

1. **policy.py整体**：三档+别名+per-session覆盖+双轨默认值——OpenMate已有全局三档UI，后端补per-session即可对齐
2. **trigger.py整体**：idle+turn数+上下文压力三条件进化触发，接OpenSoul heredity/self_evolution.py（已有分析，缺调度）
3. **共享会话防说话人泄漏三重防线**：结构化replay+prompt禁令+输出strip
4. **model catalog overlay**（overrides+tombstones）：OpenMate设置页模型管理通用方案

## 行业信号
- chatgpt-on-wechat（纯聊天机器人鼻祖之一）47k★改名转型Agent Harness且全面Claude-Code化（权限三档/子agent/进化/skill hub）——**国内IM机器人赛道集体升级为个人agent**，与AstrBot(#44)/OpenClaw同潮向。
- agent自己提交大部分代码（cowagent/warp-agent署名）已是头部项目常态。
