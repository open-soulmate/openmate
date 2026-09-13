# DeepSeek Harness

## 概述

DeepSeek Harness 是一个DeepSeek Agent编排。

**仓库**: https://github.com/deepseek-ai/deepseek-harness | **语言**: Python

## 核心架构

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub deepseek-ai/deepseek-harness（master）、docs/architecture.md、cordis-primer.md、AGENTS.md、根 package.json

**没有特权内核可打补丁：模型适配、工具注册、会话日志、甚至 agent loop 本身都是 Cordis 插件；运行时 = Profile 叠层 + Bundle 补丁组成的插件树，Session 日志是模型可见上下文的唯一真源。**

1. **Session 日志唯一真源 + Model-visible⟺Logged** 不变量（比“UI 状态当历史”稳一个数量级）  
2. **世代化 JSONL + 独占发布 + 不可变历史**（崩溃安全与 fork/resume）  
3. **可逆注册（effect/disposer）**：热更新配置不泄漏监听器/工具  
4. **Capability Seam 三角色**：FS/Sandbox/Shell 可整体替换，personal/coding 共用  
5. **取消语义**：准备期 vs 提交期边界清晰  
6. **Fail-loud 配置** + branded id + 按边界的运行时校验（不信任同进程 TS 边界过度校验）

## 关键技术

| 包 | 职责 | ctx |
|---|---|---|
| `core/session` | 追加式 SessionEvent 日志 + 内存存储 | `ctx.sessions` |
| `core/system-prompt` | Prompt 段与 tool schema 装配 | `ctx.systemPrompt` |
| `core/tools` | 作用域工具注册 + 守卫执行管线 | `ctx.tools` |
| `core/agent` | Agent 接口、注册表、`agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 默认驱动 | `ctx.agentLoop` |
| `core/scope` | 按 agent 作用域注册原语 | library |
| `llm/llm` | 消息/流词表 + adapter 缝 | `ctx.llm` |
| `webhook/webhook` | 认证投递 → Workspace Session | `ctx.webhookRuntime` |

三角色必须齐全：
1. **Service Definition**（接口）  
2. **Service Provider**（实现）  
3. **Consumer**（常为模型工具）  

效果：换 FS/subprocess provider 即可把 Bash/PTY/LSP 整体挪到远端沙箱，**无需 fork 各 provider**。Subagent provider 可从“子 agent”到“委托另一产品 turn”。

- 覆盖率门禁：CI **per-file 100%** on `packages/*/*/src`（`test:coverage`）  
- Snapshot 测试：keyless 录制会话回放；双 SDK 期望同 PR 更新  
- 文档门禁：`doc-sync`、双语、预算、死链  
- Agent Notes：非平凡变更必须附决策笔记  
- `!!js` 仅允许在 cordis.yml 的 `config`/`disabled`  
- 跨边界 id 用 `Branded`  
- Misconfiguration fail-loud  
- 防御模式文档 `docs/defensive-patterns.md`  

| 主题 | 做法 |
|---|---|
| 取消安全 | prepareCall 前取消不提交 system/user；attempt 与 message 分离 |
| 会话耐久 | 追加日志世代 + 独占发布 + 不可变 committed 文件 |
| 格式迁移 | 相邻 vN→vN+1 链；open 时一次合成 |
| 未密封尾部 | 普通修复归 handle consumer；迁移仅处理已密封重启边界 |
| 可逆扩展 | 插件卸载 unwind effect，避免“半注册”状态 |
| 沙箱 | `ctx.sandbox` + interaction/approval 策略在 dsh-base |
| Desktop | 无端口、签名资源、隔离 pnpm store |
| 预览风险 | 0.1.x developer preview，API 未稳，生产慎用 |

1. **Session 日志唯一真源 + Model-visible⟺Logged** 不变量（比“UI 状态当历史”稳一个数量级）  
2. **世代化 JSONL + 独占发布 + 不可变历史**（崩溃安全与 fork/resume）  
3. **可逆注册（effect/disposer）**：热更新配置不泄漏监听器/工具  
4. **Capability Seam 三角色**：FS/Sandbox/Shell 可整体替换，personal/coding 共用  
5. **取消语义**：准备期 vs 提交期边界清晰  
6. **Fail-loud 配置** + branded id + 按边界的运行时校验（不信任同进程 TS 边界过度校验）

## 对openmate的启示

DeepSeek Harness 是本批 **架构方法论含金量最高** 的工程：把“可维护 harness”提升到 **插件树 + 会话日志不变量 + 能力缝**。openmate 稳定性重构应 **P0 落地 session-event-log 与可逆注册**，**P1 用 bundle 分离 coding/personal**；**不要照搬其 rc 速度与 100% per-file 门禁成本**，但应抄 **snapshot 回放与 Agent Note 治理**。

---

```
openmate runtime
├─ profile: core          (session log, tools, llm seam, approval)
├─ bundle: coding         (edit/bash/lsp/fs policy=strict)
├─ bundle: personal       (calendar/memory/mail, fs policy=notes/**)
└─ patch: user cordis.yml (live reload 开发体验)
```

*报告结束。*

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- MiMo报告（deepseek-harness.md）
