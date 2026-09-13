# Hermes Agent

## 概述

Hermes Agent 是一个通用AI Agent框架。

**仓库**: https://github.com/NousResearch/hermes-agent | **语言**: Python

## 核心架构

[详见源码]

[详见源码]

| 路径 | 用途 |
|---|---|
| `config.yaml` | 全量配置（模型、终端、toolsets、压缩、审批…） |
| `.env` | API keys 与 secrets（chmod 600） |
| `auth.json` | OAuth 凭据（Nous Portal） |
| `skills/` | 全部激活技能（bundled + hub + agent-created） |
| `memories/` | MEMORY.md + USER.md |
| `state.db` | SQLite 会话库（canonical） |
| `sessions/` | gateway 路由索引、JSONL transcript、/save 导出 |
| `cron/` | 定时任务数据 |
| `plugins/` | 用户插件 |

**设计原则**（文档明示）：
- **Prompt stability**：系统提示会话中途不变，不破坏缓存前缀（除非显式 `/model`）
- **Observable execution**：每次工具调用对用户可见
- **Interruptible**：API 调用与工具执行可被用户输入/信号取消
- **Platform-agnostic core**：一个 AIAgent 服务 CLI/gateway/ACP/batch/API
- **Loose coupling**：可选子系统走 registry + `check_fn`，非硬依赖
- **Profile isolation**：每个 profile 独立 HERMES_HOME，可并行跑多 agent

- **自注册**：`tools/*.py` 顶层调用 `registry.register()`；`discover_builtin_tools()` 用 AST 扫描发现，无手工 import 列表
- **Toolset 分组**：~70+ 工具 / ~28 toolsets；平台预设（`hermes-cli`、`hermes-telegram`…）；组合 toolset（research/development/analysis…）
- **可用性门控**：`check_fn`（API key、服务、二进制）；异常=不可用；按次缓存
- **错误双层包裹**：registry.dispatch + handle_function_call，保证模型永远收到合法 JSON 字符串
- **7 终端后端**：local / docker / ssh / singularity / modal / daytona / vercel_sandbox
  - Daytona/Modal 提供 serverless 持久化（空闲休眠、按需唤醒）
- **MCP**：外部服务器工具动态发现；子进程环境变量白名单过滤
- **子 agent**：`delegate_task` 顶层委派默认 background（结果以消息回流）；ORCHESTRATOR 子 agent（depth>0）同步
- **execute_code**：沙箱 Python，可通过 RPC 调用工具，把多步流水线折叠为「零上下文成本」的一轮

- **渐进披露**：
  - L0 `skills_list()` → 名称/描述/类别（~3k tokens）
  - L1 `skill_view(name)` → 全文
  - L2 `skill_view(name, path)` → 具体 reference 文件
- **SKILL.md 格式**：frontmatter（name/description≤60字符/version/platforms/required_environment_variables/metadata.hermes.*）+ 标准章节（When to Use / Prerequisites / How to Run / Quick Reference / Procedure / Pitfalls / Verification）
- **条件激活**：`fallback_for_toolsets/tools`、`requires_toolsets/tools`——例如 Firecrawl 可用时隐藏 DuckDuckGo fallback 技能
- **安全加载**：缺失 env var 不隐藏技能，首次加载时 CLI 安全提示收集；网关永不带内收集 secret
- **分层优先级**：project (`.hermes/skills/` / `.agents/skills/

## 关键技术

[详见源码]

- **自注册**：`tools/*.py` 顶层调用 `registry.register()`；`discover_builtin_tools()` 用 AST 扫描发现，无手工 import 列表
- **Toolset 分组**：~70+ 工具 / ~28 toolsets；平台预设（`hermes-cli`、`hermes-telegram`…）；组合 toolset（research/development/analysis…）
- **可用性门控**：`check_fn`（API key、服务、二进制）；异常=不可用；按次缓存
- **错误双层包裹**：registry.dispatch + handle_function_call，保证模型永远收到合法 JSON 字符串
- **7 终端后端**：local / docker / ssh / singularity / modal / daytona / vercel_sandbox
  - Daytona/Modal 提供 serverless 持久化（空闲休眠、按需唤醒）
- **MCP**：外部服务器工具动态发现；子进程环境变量白名单过滤
- **子 agent**：`delegate_task` 顶层委派默认 background（结果以消息回流）；ORCHESTRATOR 子 agent（depth>0）同步
- **execute_code**：沙箱 Python，可通过 RPC 调用工具，把多步流水线折叠为「零上下文成本」的一轮

**内置双文件（有界、策展式）**：

| 文件 | 用途 | 字符上限 | ~token |
|---|---|---|---|
| MEMORY.md | agent 个人笔记：环境事实、约定、经验教训 | 2,200 | ~800 |
| USER.md | 用户画像：偏好、沟通风格、期望 | 1,375 | ~500 |

- 会话开始时以**冻结快照**注入系统提示（保护前缀缓存）；会话中写盘立即生效，但要下一会话才进 prompt
- `memory` 工具动作：`add` / `replace` / `remove`（子串匹配）；无 `read`（自动注入）
- **满载不自动丢弃**：超限返回错误 + 当前条目，要求 agent 同轮 consolidate 后重试
- 安全扫描：注入/外泄模式、隐形 Unicode → 拒绝
- 写审批：`memory.write_approval: true` 时前台内联批准、网关/后台 review 进 `/memory pending` 暂存
- **session_search vs memory**：memory ~1.3k token 固定成本；session_search 无限容量、~20ms FTS5、按需

**外部记忆提供商**（8 个内置，集合已关闭新增）：Honcho（dialectic 用户建模）、Mem0、Supermemory、Hindsight、Holographic、RetainDB、ByteRover、OpenViking。实现 `MemoryProvider` ABC（`sync_turn` / `prefetch` / `shutdown` / 可选 `post_setup`）；新提供商必须独立插件仓库。

- **渐进披露**：
  - L0 `skills_list()` → 名称/描述/类别（~3k tokens）
  - L1 `skill_view(name)` → 全文
  - L2 `skill_view(name, path)` → 具体 reference 文件
- **SKILL.md 格式**：frontmatter（name/description≤60字符/version/platforms/required_environment_variables/metadata.hermes.*）+ 标准章节（When to Use / Prerequisites / How to Run / Quick Reference / Procedure / Pitfalls / Verification）
- **条件激活**：`fallback_for_toolsets/tools`、`requires_toolsets/tools`——例如 Firecrawl 可用时隐藏 DuckDuckGo fallback 技能
- **安全加载**：缺失 env var 不隐藏技能，首次加载时 CLI 安全提示收集；网关永不带内收集 secret
- **分层优先级**：project (`.hermes/

## 对openmate的启示

这是 Hermes 的核心差异化，README 明言「the only agent with a built-in learning loop」。

> openmate 定位：混合编码 + 个人 agent，当前阶段目标是**稳定性重构**。

8. **有界双文件记忆（MEMORY + USER）+ 冻结快照 + 满载 consolidate**
   - 刻意小（~1.3k token），防 prompt 膨胀；会话边界靠 `/new` 让学习闭环触发

9. **技能=程序性记忆（SKILL.md 标准 + 渐进披露 + 条件激活）**
   - 与记忆分工：事实进 memory，流程进 skill
   - 兼容 agentskills.io，避免私有格式

10. **Background Review Fork（廉价模型 + digest 重放 + 写审批门）**
    - turn 结束后异步提炼；默认可关（`enabled: false`）防 token 失控
    - P1 先做「可选 + 人审」，再考虑全自动

11. **session_search（FTS5 跨会话回忆）**
    - 与 memory 互补：固定成本 vs 按需精确；中文需 trigram

12. **Tool 自注册 registry + check_fn 门控 + 错误双层包裹**
    - 新工具零中心列表维护；模型永远收合法 JSON

13. **子 agent 委派（隔离上下文 + 独立预算 + 后台结果回流）**
    - 编码场景适合并行「改测试 / 查文档 / 实现」

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 豆包（003_hermes-agent.md）
- MiMo报告（hermes-agent.md）
