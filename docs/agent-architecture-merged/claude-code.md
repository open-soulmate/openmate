# Claude Code

## 概述

Claude Code 是一个AI编程助手。

**仓库**: https://github.com/anthropics/claude-code

## 核心架构

> 对象：openmate（hybrid coding + personal agent，稳定性重构）
> 日期：2026-09-13
> 来源：Anthropic 官方工程博客、Claude Code 官方文档、GitHub 产品仓库、公开工具/权限设计分析

1. **无工具无行动**：agent 的 agency 完全由工具集定义
2. **工具即接口（ACI）**：描述、参数名、示例、边界与其它工具的差异要像给初级工程师写 docstring
3. **格式贴近模型先验**：自然 markdown > 嵌套 JSON；绝对路径 > 相对路径
4. **难犯错优先**：参数设计 poka-yoke
5. **持续测试模型如何使用工具**：在 workbench 中大量样例迭代

上下文是最稀缺资源。Subagent 在**独立上下文窗口**中工作，只把摘要带回主会话：

- 保留主上下文（探索/研究结果不污染）
- 限制工具访问（安全与专注）
- 复用配置（用户级 subagent）
- 专业化行为（领域 system prompt）
- 控制成本（路由到 Haiku 等便宜模型）

- **Skills 按需加载**：会话开始只见 description，正文用到才载入
- **Subagent 隔离**：探索文件不进主上下文
- **MCP 工具定义延迟加载**：默认 defer，通过 tool search 按需载入；只有工具名与 server instructions 占上下文
- **持久规则放 CLAUDE.md**，不依赖会话历史

> 说明：Claude Code 是闭源产品仓库（GitHub 仅 README、插件与 issue）。系统 prompt 与内部实现未开源。以下为公开文档与社区分析归纳。

1. **工具描述即 prompt 工程**：官方承认 SWE-bench 优化中工具时间 > 总 prompt 时间
2. **工具命名精确、可权限匹配**：`Bash(git commit *)`、`Edit`、`Read` 等字符串同时用于 permission rules、subagent tools、hook matchers——**单一命名空间三处复用**
3. **系统 reminder 分层**：上下文中注入 instructions、CLAUDE.md、auto memory、skills 描述、MCP server instructions，多层叠加但各自可裁剪
4. **模型代际差异显式处理**：Task tools 按模型提供；read-before-edit 新旧模型行为不同——说明 harness 对模型能力有 **capability matrix**
5. **分类器作为第二模型**：auto mode 不是规则引擎，是另一模型的实时安全判断——双模型架构

| Claude Code 模式 | openmate 映射 |
|------------------|---------------|
| Agentic harness 与模型分离 | 稳定性在 harness，不在换模型 |
| Tool-first + ACI 投入 | 工具 schema/文档/边界与 prompt 同等重要 |
| 权限分层：mode + rules + sandbox + org policy | 不要单一 allow-all/deny-all |
| 分类器自动审批 | 高频低风险动作免打扰，高风险走审查 |
| Subagent 隔离上下文与工具 | 长研究/探索不进主对话 |
| Compaction + 按需加载（skills/MCP） | 上下文治理比“更长窗口”更关键 |
| Hooks 硬保证 | 安全与格式化不靠嘱咐 |
| JSONL 会话 + checkpoint | 可恢复会话 + 明确恢复边界 |
| CLAUDE.md 精简纪律 | 记忆文件要 prune，过长即失效 |
| 强制可验证（tests/goal/Stop hook） | 无验证信号则不自治收尾 |
| Plan mode 先探后改 | 多文件变更必须 plan gate |

1. **分离 harness 与 model**：工具执行、权限、状态、隔离独立于具体 LLM
2. **工具契约**：每个工具有 description、schema、权限级别、错误语义、示例；命名与 permission/hook/subagent 共用
3. **权限三层**：模式基线（manual/accept/plan/auto）+ allow/ask/deny 规则 + 沙箱（文件系统+网络）
4. **会话持

## 关键技术

| 类别 | 能力 |
|------|------|
| File operations | Read、Edit、Write、NotebookEdit、文件重命名重组 |
| Search | Glob（文件名模式）、Grep（内容 regex）、Explore subagent |
| Execution | Bash、PowerShell、Monitor（后台命令/日志流）、git |
| Web | WebSearch（官方搜索后端）、WebFetch（抓取并小模型提取） |
| Code intelligence | LSP（跳转定义/引用/类型错误）、代码智能插件 |

**Bash**
- Manual 模式下大部分命令需权限；内置一组只读命令可免提示
- 权限规则支持 `Bash(git commit *)` 等模式
- 可走 Bash sandbox（OS 级隔离）

**Edit / Write**
- Edit：针对文件做定向编辑
- Write：整文件覆盖，不追加
- 新模型可在“读取无需权限 + Read 工具可用”条件下覆盖未读文件；旧模型强制 read-before-edit
- 部分 Read（PARTIAL view）与 Jupyter 文件始终要求先读

**WebFetch**
- 设计上有损：抓取 → Markdown 化 → 小模型按 prompt 提取，通常给模型的是提取结果而非原始页
- 缓存 15 分钟；跨 host 重定向不自动跟随
- 域名安全检查 + 权限提示（可 allowlist）

**WebSearch**
- 最多 8 次后端搜索/次调用；不抓页面，需再 WebFetch
- 会话级上限 200 次（含 subagent）

**AskUserQuestion**
- 多选题收集需求/澄清歧义
- 在 auto mode 分类器中属“需用户交互”的工具，不被自动批准

**Task tools（TaskCreate / TaskGet / TaskUpdate / TaskList / TodoWrite）**
- 在部分模型上默认提供（写 checklist）；新模型可能不提供（减少上下文占用）
- 可用环境变量或 `--allowedTools` 强制开启

**Monitor**
- 后台运行命令，把每行输出反馈给 Claude，可对日志/文件变化做出反应
- 也可开 WebSocket 把消息当事件

**其他编排工具**
- Agent：spawn subagent
- EnterPlanMode / ExitPlanMode：进入/退出规划模式
- EnterWorktree / ExitWorktree：git worktree 隔离
- SendMessage / ListAgents：跨会话、agent team 消息
- Cron* / ScheduleWakeup / RemoteTrigger：会话内定时与远程例程
- PushNotification / SendUserFile：通知与文件投递

1. **无工具无行动**：agent 的 agency 完全由工具集定义
2. **工具即接口（ACI）**：描述、参数名、示例、边界与其它工具的差异要像给初级工程师写 docstring
3. **格式贴近模型先验**：自然 markdown > 嵌套 JSON；绝对路径 > 相对路径
4. **难犯错优先**：参数设计 poka-yoke
5. **持续测试模型如何使用工具**：在 workbench 中大量样例迭代

Auto mode 引入**独立分类器模型**，在动作执行前审查，替代人工批准：

**默认拦截类别（部分）：**
- `curl | bash` 等下载执行
- 敏感数据外发
- 生产部署与迁移
- 云存储批量删除
- IAM/仓库权限提升
- 共享基础设施修改
- 会话前已存在文件的不可逆销毁
- force push
- 把含 secret 的变更 commit/push 出去
- `git reset --hard`、`git checkout -- .`、`git clean -fd` 等丢弃未提交更改
- `git commit --amend`（HEAD 非本会话创建，或已 push）
- `terraform/pulumi/cdk/terragrunt destroy`
- 写 secret manager、改 DNS/TLS
- 合并无人类批准的 PR、自批自 PR
- 关闭/开关生产 feature flag
- DaemonSet / admission webhook 等全节点 K8s 资源
- 反

## 对openmate的启示

| Claude Code 模式 | openmate 映射 |
|------------------|---------------|
| Agentic harness 与模型分离 | 稳定性在 harness，不在换模型 |
| Tool-first + ACI 投入 | 工具 schema/文档/边界与 prompt 同等重要 |
| 权限分层：mode + rules + sandbox + org policy | 不要单一 allow-all/deny-all |
| 分类器自动审批 | 高频低风险动作免打扰，高风险走审查 |
| Subagent 隔离上下文与工具 | 长研究/探索不进主对话 |
| Compaction + 按需加载（skills/MCP） | 上下文治理比“更长窗口”更关键 |
| Hooks 硬保证 | 安全与格式化不靠嘱咐 |
| JSONL 会话 + checkpoint | 可恢复会话 + 明确恢复边界 |
| CLAUDE.md 精简纪律 | 记忆文件要 prune，过长即失效 |
| 强制可验证（tests/goal/Stop hook） | 无验证信号则不自治收尾 |
| Plan mode 先探后改 | 多文件变更必须 plan gate |

| 失败模式 | 修复 |
|----------|------|
| Kitchen sink session（无关任务混进同一会话） | `/clear` 分任务 |
| 反复纠正仍错 | 两次后 `/clear`，用学到的重写初始 prompt |
| CLAUDE.md 过长 | 无情裁剪；能从代码推断的删除或改 hook |
| Trust-then-verify gap | 永远提供验证；不能验证就不交付 |
| Infinite exploration | 限定研究范围或用 subagent |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- MiMo报告（claude-code.md）
