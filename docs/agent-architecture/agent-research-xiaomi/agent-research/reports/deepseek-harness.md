# DeepSeek Harness 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub deepseek-ai/deepseek-harness（master）、docs/architecture.md、cordis-primer.md、AGENTS.md、根 package.json

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | DeepSeek Harness（`dsh`） |
| 仓库 | https://github.com/deepseek-ai/deepseek-harness |
| 文档 | https://deepseek-harness.github.io/deepseek-harness/ |
| 定位 | DeepSeek 开源 **agent harness**：everything-is-a-plugin，Web/Headless/SDK/ACP/Desktop 多入口 |
| 版本（调研时） | `0.1.5-rc.2`（developer preview，**明确会有 breaking changes**） |
| 语言/运行时 | TypeScript ESM monorepo（pnpm workspaces）；Node `^22.19 \|\| >=24`；Python SDK/runtime wheel |
| 许可 | MIT |
| 框架底座 | **Cordis**（vendored @deepseek-ai/cordis）— 服务/事件/可逆 effect 插件框架；论文 *A Programming Paradigm for Spatiotemporal Composability* |
| 形态 | `dsh web` / `--profile headless\|sdk\|sdk-minimal\|acp`；Electron Desktop（私有 host，无 loopback） |
| 运行 | `npx @deepseek-ai/dsh web`（默认 http://127.0.0.1:3080） |

### 0.1 一句话架构

**没有特权内核可打补丁：模型适配、工具注册、会话日志、甚至 agent loop 本身都是 Cordis 插件；运行时 = Profile 叠层 + Bundle 补丁组成的插件树，Session 日志是模型可见上下文的唯一真源。**

---

## 1 系统架构

### 1.1 Cordis 五要点（框架前提）

1. Plugin 实现 `Service`（函数 + inject/apply 或 Service 子类）  
2. Context 是服务仓库：`ctx.tools` / `ctx.llm` / `ctx.sessions`…  
3. `inject` 声明依赖，加载顺序由服务需求表达  
4. Typed Events：declaration merging；dispatch 模式 emit/waterfall/parallel/serial/bail  
5. **注册即可逆 effect**：`ctx.effect()` / `ctx.on()`，卸载时反向清理  

Waterfall 是 around-middleware：必须 `next()` 委派，否则短路。

### 1.2 Profile / Bundle 组合

```
空 entry list
  + profile 顺序列出的 bundles
  + profile 自己的 cordis.patch.yml
  + Harness home 级 patch
  + CLI --patch overlay
= 运行时插件树
```

| 概念 | 含义 |
|---|---|
| **Profile** | Harness home 中的命名组合：`web` / `headless` / `sdk` / `sdk-minimal` / `acp` / `desktop` |
| **Bundle** | 可安装的配置行 + 代码分发单位；`package.json` 的 `dsh.bundle` 指向 patch 文件 |
| **dsh-base** | web/headless/sdk/acp 共享首层：模型、工具、持久化、沙箱与审批、settings、凭证、遥测 |
| **sdk-minimal** | 例外：完整显式树，不叠 dsh-base |

- 自定义 profile 默认 **live patch reload**  
- `headless/sdk/acp` 启动时一次叠层（避免 one-shot/stdio 生命周期失效）  
- `dsh --profile web --dump-config` 可检视整树  

**应用启动铁律：** 仅 `dsh` profile 启动受支持 Node 应用；package bin / demo / 公共 SDK argv 旁路被 `verify-application-entrypoints` 拒绝。

### 1.3 Desktop

- Electron 内嵌 **签名的 dsh 生产运行时** + 捆绑 Node  
- `$DSH_HOME/profiles/desktop` 存外部插件与宿主包链接  
- Unary RPC / Remote streams 走 framed byte pipes；`dsh-app://` 安全协议；**不开 Web 端口**  
- 插件事务用私有 pnpm store  

### 1.4 核心包 → `ctx` 键

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

### 1.5 仓库布局（产品脊柱）

```
packages/core/          session, system-prompt, tools, agent, agent-loop
packages/llm/           LLM 能力 + DeepSeek providers
packages/shell|subprocess|terminal|fs|lsp|web|skill|compaction|
         context|subagent|workflow|webhook|todo|plan|preset|
         guard|self-modification|hooks|session|settings|
         credentials|acp|interaction|boot|sdk/...
packages/bundle/        profile 安装包
packages/experimental/  预稳定原型
python/                 Python SDK/runtime
apps/                   CLI / desktop / web frontend
```

---

## 2 核心机制

### 2.1 Turn / Step 生命周期（事件契约）

- **Step** = 一次模型请求 + 其工具调用  
- **Turn** = 0..N steps；从认领输入开始，到无欠账结束  

```
turn/start
  claim input + queue
  assemble prompt + tools
  agent/pre-step          # 可拒绝/重写；空认领可无 step 关 turn
  step/start
  agent/request → prepareCall   # 取消则 system/user 均不提交
  stream → llm/stream → agent/assistant-stream
  tool/call* → tools/pre-execute → execute → post-execute → tool/result*
  step/end
  （欠账或新输入 → 下一 step）
agent/turn-stopping       # 串行，无 next()，可停 turn
turn/end
```

**持久 vs 活事件：**
- 持久（进日志）：`turn/*` `step/*` `system|user|assistant/message` `assistant/attempt` `tool/*`  
- 活扩展点：`agent/*`、`tools/*` 瀑布、`llm/stream`  

### 2.2 Session 日志 = 上下文真源

铁律：**Model-visible ⟺ Logged**。任何进入模型请求的内容必须可从日志重建；新可见输入必须先扩展 `SessionEventMap`。

- `deriveMessages()` 从日志投影模型历史  
- `assistant/message` 内嵌产生它的紧凑流；失败/重试/取消进 `assistant/attempt`（不进模型历史）  
- JSONL 世代：`session.vN.jsonl[.zstd]`；**committed 世代永不改名/覆盖/删除**；迁移只写相邻后继  
- `dsh-session-projection`：增量折叠 committed events，宿主用 `stateOf()` / `snapshot()`  
- 写打开：编码 → 校验 → **独占发布** 新世代  

### 2.3 System Prompt 作为 Surface

- Prompt 以 `system/message` 历史传播  
- 空渲染清除 active system 节点  
- 能力路由可 append 非空更新到缓存前缀后；不能力路由或新 request series 在第一 system 节点合并  
- 首个 admitted step 即使空 prompt 也预留 system head  

### 2.4 Capability Seam（能力缝）

三角色必须齐全：
1. **Service Definition**（接口）  
2. **Service Provider**（实现）  
3. **Consumer**（常为模型工具）  

效果：换 FS/subprocess provider 即可把 Bash/PTY/LSP 整体挪到远端沙箱，**无需 fork 各 provider**。Subagent provider 可从“子 agent”到“委托另一产品 turn”。

### 2.5 扩展点表（节选）

| 目标 | 机制 |
|---|---|
| 新模型 | `ctx.llm` adapter |
| 新工具 | `ctx.tools` |
| Shell | `ctx.shell` + `ctx.subprocess` |
| 持久终端 | `ctx.terminals` + `dsh-tool-terminal` |
| 人命令 | `ctx.commands` |
| 后台任务 | `ctx.jobs` + `job_*` tools |
| Webhook 开 Session | `ctx.webhookRuntime` |
| FS/策略 | `ctx.fs` + `fs/*` |
| 进程限制 | `ctx.sandbox` |
| 拦截请求/工具/turn | `agent/*` `tools/*` |
| 注入上下文 | `agent.inject()` |
| 子 agent | `subagent` capability |
| Plan 模式 | `plan`：**logged state** |
| TODO | `todo_write` |
| Agent 自改 | `self-modification`：检查并挂载自身插件 |
| Hook 桥 | Claude Code / Codex hooks |
| 目标 | `ctx.goals` |
| Fork | `ctx.agents.create({ sessionId, seed, meta: { parentSession }})` |

### 2.6 工程治理（对稳定性重构极有价值）

- 覆盖率门禁：CI **per-file 100%** on `packages/*/*/src`（`test:coverage`）  
- Snapshot 测试：keyless 录制会话回放；双 SDK 期望同 PR 更新  
- 文档门禁：`doc-sync`、双语、预算、死链  
- Agent Notes：非平凡变更必须附决策笔记  
- `!!js` 仅允许在 cordis.yml 的 `config`/`disabled`  
- 跨边界 id 用 `Branded<B>`  
- Misconfiguration fail-loud  
- 防御模式文档 `docs/defensive-patterns.md`  

---

## 3 稳定性 / HA

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

---

## 4 自我进化 / 可扩展

1. **Everything is a Plugin**：agent-loop 可替换（勿改 loop，换插件）  
2. **Profiles/Bundles**：组织分发“产品切片”  
3. **`dsh plugin`**：安装树外插件  
4. **self-modification**：agent 检查/挂载自身插件（极致自进化，需强审批）  
5. **Skills / presets / goals / plan-as-state**  
6. **双 SDK**（TS/Python）投影同一 loop  
7. **Hooks 桥接** Claude Code/Codex 生态  
8. Agent Teams（实验）：roster + task board + mailbox  

---

## 5 对 openmate 借鉴（P0/P1/P2）

### P0（架构级，直接对应“稳定性重构”）
1. **Session 日志唯一真源 + Model-visible⟺Logged** 不变量（比“UI 状态当历史”稳一个数量级）  
2. **世代化 JSONL + 独占发布 + 不可变历史**（崩溃安全与 fork/resume）  
3. **可逆注册（effect/disposer）**：热更新配置不泄漏监听器/工具  
4. **Capability Seam 三角色**：FS/Sandbox/Shell 可整体替换，personal/coding 共用  
5. **取消语义**：准备期 vs 提交期边界清晰  
6. **Fail-loud 配置** + branded id + 按边界的运行时校验（不信任同进程 TS 边界过度校验）

### P1
1. Profile/Bundle 分层：openmate = `core` + `coding-bundle` + `personal-bundle`  
2. Plan/todo/goals 作为 **logged state** 而非 UI 临时态  
3. Subagent provider 抽象（子进程 vs 委托）  
4. Snapshot 会话回放作回归门禁  
5. Webhook → Session 自动化入口（个人日程触发）

### P2
1. self-modification（仅在强审批+审计下）  
2. Agent Teams  
3. Electron 无端口 Desktop host  
4. per-file 100% 覆盖门禁（成本高，可对 core 采用）

---

## 6 源码路径（调研锚点）

| 路径 | 内容 |
|---|---|
| `README.md` | 预览声明、快速启动 |
| `docs/architecture.md` | **权威架构**：Cordis/Profile/Turn/Session/Seam/扩展表 |
| `docs/cordis-primer.md` | 插件框架五要点与 waterfall 语义 |
| `AGENTS.md` | 仓库布局、门禁、工程约定 |
| `package.json` | 0.1.5-rc.2、scripts（coverage/snapshot/doc gates） |
| `packages/bundle/*` | dsh-base / web-app / headless / sdk-* / acp-app |
| `packages/core/*` | session/tools/agent/agent-loop |
| `packages/self-modification` | 自修改插件 |
| `apps/cli` `apps/desktop` | 启动器 |

### 依赖/技术指纹

- Cordis（vendor）  
- tsdown / vitest / oxlint / jscpd  
- native system addon  
- Electron desktop  
- zstd 压缩会话  

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **5** | 无特权内核 + Profile/Bundle + Capability Seam；扩展点文档化到事件级 |
| **Agent Loop 表达力** | **4.5** | turn/step/inject/pre-step/attempt 分离完整；预览期 API 仍可能大改 |
| **工具与权限模型** | **4** | guarded pipeline + approval + sandbox seam；产品级 UI 审批细节依赖 Web/Desktop |
| **上下文工程** | **4.5** | system surface、session 投影、compaction capability、logged-only 约束 |
| **稳定性 / 可恢复性** | **4.5** | 日志世代、取消边界、可逆 effect；扣分：developer preview |
| **多 Provider / 模型适配** | **4** | adapter 缝 + DeepSeek 官方 provider；社区 provider 广度仍在建设 |
| **产品完成度 / 生态** | **3.5** | 多入口齐全但 rc 预览、文档自指强、生态早期 |

**综合（未加权平均）：≈ 4.3 / 5**

### 对 openmate 的简要结论

DeepSeek Harness 是本批 **架构方法论含金量最高** 的工程：把“可维护 harness”提升到 **插件树 + 会话日志不变量 + 能力缝**。openmate 稳定性重构应 **P0 落地 session-event-log 与可逆注册**，**P1 用 bundle 分离 coding/personal**；**不要照搬其 rc 速度与 100% per-file 门禁成本**，但应抄 **snapshot 回放与 Agent Note 治理**。

---

## 附录：与 openmate 目标态对齐示意

```
openmate runtime
├─ profile: core          (session log, tools, llm seam, approval)
├─ bundle: coding         (edit/bash/lsp/fs policy=strict)
├─ bundle: personal       (calendar/memory/mail, fs policy=notes/**)
└─ patch: user cordis.yml (live reload 开发体验)
```

---

*报告结束。*
