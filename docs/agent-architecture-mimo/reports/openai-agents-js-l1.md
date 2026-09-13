# openai/openai-agents-js — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/openai/openai-agents-js  
> 抓取通道: cdn.jsdelivr.net/gh/openai/openai-agents-js@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 JS/TS Agents SDK / Sandbox / Realtime / Handoffs 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（概念、安装、三种 Agent、环境）
- 未打开: `packages/agents/src/` 实现
- npm: `@openai/agents`
- 文档: https://openai.github.io/openai-agents-js

---

## 1. 项目定位（README 实读）

> "Lightweight yet powerful framework for building multi-agent workflows in JavaScript/TypeScript. It is provider-agnostic, supporting OpenAI APIs and more."

---

## 2. 核心概念（README 实读，9 项）

| # | 概念 | 说明 |
|---|------|------|
| 1 | **Agents** | LLM + instructions + tools + guardrails + handoffs |
| 2 | **Sandbox Agents** | 配 filesystem workspace + sandbox，长任务（beta） |
| 3 | **Realtime Agents** | 低延迟语音，tools/guardrails/handoffs/history |
| 4 | **Agents as tools / Handoffs** | 委托给其他 agent |
| 5 | **Tools** | functions, MCP, hosted tools |
| 6 | **Guardrails** | 输入/输出校验 |
| 7 | **Human in the loop** | 跨 run 人类介入机制 |
| 8 | **Sessions** | 自动对话历史管理 |
| 9 | **Tracing** | 内置追踪/debug/优化 |

---

## 3. 支持环境（README 实读）

| 环境 | 状态 |
|------|------|
| Node.js **22+** | 支持 |
| Deno | 支持 |
| Bun | 支持 |
| Cloudflare Workers + nodejs_compat | **实验** |

安装:
```bash
npm install @openai/agents zod
```

**zod** 是 schema 校验一等依赖。

---

## 4. 三种 Agent 形态（README 代码实读）

### 4.1 文本 Agent

```js
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant.',
});
const result = await run(
  agent,
  'Write a haiku about recursion in programming.',
);
console.log(result.finalOutput);
```

### 4.2 Sandbox Agent（beta）

```js
import { run } from '@openai/agents';
import { gitRepo, SandboxAgent } from '@openai/agents/sandbox';
import { UnixLocalSandboxClient } from '@openai/agents/sandbox/local';

const agent = new SandboxAgent({
  name: 'Workspace Assistant',
  model: 'gpt-5.5',
  instructions: 'Inspect the repo before changing files.',
  defaultManifest: {
    entries: { repo: gitRepo({ repo: 'openai/openai-agents-js' }) },
  },
});

const result = await run(
  agent,
  'Inspect the repo README and summarize what this project does.',
  { sandbox: { client: new UnixLocalSandboxClient() } },
);
```

**约束（README 实读）**:
- `UnixLocalSandboxClient`: **macOS / Linux only**
- Windows: 用 `DockerSandboxClient` 或 hosted sandbox client
- `defaultManifest.entries.repo = gitRepo({...})` 声明 workspace 来源

### 4.3 Realtime Agent

```js
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

const agent = new RealtimeAgent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant.',
});
const session = new RealtimeSession(agent);
await session.connect({ apiKey: '<client-api-key>' });
```

- 浏览器 WebRTC 自动连麦克风/音频
- 服务端创建 **short-lived ephemeral client token**
- 文本/sandbox agent 用 `OPENAI_API_KEY`

---

## 5. 架构模式（README + 导出路径推断）

### 5.1 包导出结构（从 import 路径实读）

```
@openai/agents           → Agent, run
@openai/agents/sandbox   → SandboxAgent, gitRepo
@openai/agents/sandbox/local → UnixLocalSandboxClient
@openai/agents/realtime  → RealtimeAgent, RealtimeSession
```

### 5.2 Run 接口统一

三种 Agent 共用 `run(agent, input, options?)`:
- 文本: 无 options
- Sandbox: `{ sandbox: { client } }`
- Realtime: `session.connect()`

### 5.3 与 openmate 映射

| 需求 | openai-agents-js 机制 | 可复用度 |
|------|----------------------|----------|
| 统一 run() | 文本/Sandbox/Realtime | **高** |
| Agents as tools | 委托 | **高** |
| Handoffs | 控制权转移 | **高** |
| Guardrails | 输入/输出 | **高** |
| Sessions | 自动历史 | **高** |
| Tracing | 内置 | **高** |
| Sandbox workspace | manifest + gitRepo | **高** |
| Realtime 语音 | WebRTC + ephemeral token | 中 |
| zod schema | 一等依赖 | 高 |
| provider-agnostic | 不绑死 OpenAI | 高 |
| HITL | 跨 run 机制 | **高** |
| MCP tools | Tools 支持 | 高 |
| Windows sandbox | Docker 或 hosted | 注意 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Node | 22+ | README |
| 其他 runtime | Deno, Bun | README |
| CF Workers | 实验（nodejs_compat） | README |
| 包名 | @openai/agents | README |
| peer/依赖 | zod | README |
| Sandbox | beta | README |
| UnixLocalSandboxClient | macOS/Linux only | README |
| Windows sandbox | DockerSandboxClient / hosted | README |
| Sandbox 示例模型 | gpt-5.5 | README |
| Realtime | WebRTC + ephemeral token | README |
| 概念数 | 9 | README |
| 文档 | openai.github.io/openai-agents-js | README |
| 构建工具致谢 | zod, Starlight, vite, vitest, pnpm, Next.js | README |

---

## 7. 失败路径 / 边界

```
Node < 22
  → 不支持

Windows + UnixLocalSandboxClient
  → 不可用；改 Docker 或 hosted

Cloudflare Workers
  → 实验；需 nodejs_compat

Sandbox Agent
  → beta；API 可能变

Realtime 浏览器
  → 需服务端发 ephemeral token；勿暴露长期 key

模型不支持 tools/guardrails
  → 相关功能失败

zod 未装
  → schema 校验缺失
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **统一 `run(agent, input, options?)`** 跨形态
2. **Agents as tools + Handoffs** 双委托模式
3. **Guardrails 输入/输出对称**
4. **Sessions 自动历史**（不手写 memory 拼接）
5. **Tracing 内置**非可选
6. **Sandbox manifest + gitRepo()** 声明式 workspace
7. **三形态包路径分离**（`/sandbox` `/realtime`）
8. **zod 作为 schema 一等公民**
9. **Realtime ephemeral token** 模式（浏览器不持长期 key）
10. **HITL 跨 run 机制**

### P1

- provider-agnostic 定位
- Deno/Bun 支持
- Windows 用 Docker sandbox 的明确指引

### P2

- CF Workers 实验支持
- Realtime 语音深度

---

## 9. 应避免的坑

- Windows 勿用 UnixLocalSandboxClient
- Sandbox 仍是 beta
- Realtime 勿把长期 API key 给浏览器
- Node 必须 22+
- 勿发明 packages/ 内部路径

---

## 10. 源码锚点速查

```
README.md
  npm: @openai/agents + zod
  Exports: @openai/agents, /sandbox, /sandbox/local, /realtime
  Concepts: Agents, Sandbox Agents, Realtime Agents,
            Agents-as-tools/Handoffs, Tools, Guardrails,
            HITL, Sessions, Tracing
  Envs: Node 22+, Deno, Bun, CF Workers (exp)
  run(agent, input, options?)
  Sandbox: SandboxAgent, gitRepo, UnixLocalSandboxClient
  Windows sandbox: DockerSandboxClient or hosted
  Realtime: RealtimeAgent, RealtimeSession, WebRTC, ephemeral token
  Model example: gpt-5.5
  Docs: openai.github.io/openai-agents-js
  Examples: examples/
  Thanks: zod, Starlight, vite, vitest, pnpm, Next.js
```

**未本轮打开**: `packages/` 实现。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | Tools + MCP + hosted |
| 权限/安全边界 | 4 | Guardrails + ephemeral token |
| 容错与会话恢复 | 4 | Sessions |
| 上下文工程 | 4 | Sessions + handoffs |
| 可扩展（技能/MCP） | 5 | MCP tools + agents-as-tools |
| 可观测与可评测 | 5 | Tracing 内置 |
| 生产可用成熟度 | 4 | Sandbox 仍 beta |

**综合**: **JS/TS 多 Agent SDK 标准形态**。openmate 抄统一 run、双委托、Sessions、Tracing 与 sandbox manifest。

---

## 12. 关键链接

- https://github.com/openai/openai-agents-js
- https://openai.github.io/openai-agents-js
- https://www.npmjs.com/package/@openai/agents
- 相关: `reports/openai-agents.md`、`reports/agentops-l1.md`、`reports/mcp.md`

---

## 13. 附录 A — 三形态 API 对照（README 实读）

| 能力 | Text Agent | Sandbox Agent | Realtime Agent |
|------|------------|---------------|----------------|
| 入口 | `Agent` | `SandboxAgent` | `RealtimeAgent` |
| 运行 | `run(agent, input)` | `run(..., {sandbox:{client}})` | `session.connect()` |
| 包路径 | `@openai/agents` | `@openai/agents/sandbox` | `@openai/agents/realtime` |
| Client | 无 | `UnixLocalSandboxClient` / `DockerSandboxClient` / hosted | WebRTC |
| 状态 | 无 workspace | manifest + gitRepo | 会话历史 |
| 平台 | Node/Deno/Bun | macOS/Linux local；Win 用 Docker | 浏览器 |
| 稳定 | GA 形态 | **beta** | 语音场景 |
| Key | OPENAI_API_KEY | OPENAI_API_KEY | **ephemeral client token** |
| 示例模型 | （未指定） | gpt-5.5 | （未指定） |

### A1. 统一 run 契约

```js
// 文本
const r1 = await run(agent, 'hello');

// Sandbox
const r2 = await run(agent, 'inspect repo', {
  sandbox: { client: new UnixLocalSandboxClient() },
});

// Realtime 无 run；用 session
const session = new RealtimeSession(agent);
await session.connect({ apiKey: ephemeralToken });
```

openmate 建议: 保留 `run(work, input, options?)` 单入口，options 命名空间化（sandbox / realtime / guardrails）。

---

## 14. 附录 B — 九大概念 openmate 落地映射

| # | 概念 | openmate 落地 | 优先级 |
|---|------|---------------|--------|
| 1 | Agents | `Agent(name, instructions, tools)` | P0 |
| 2 | Sandbox Agents | workspace manifest + 沙箱 client | P0 |
| 3 | Realtime Agents | 语音会话（可后置） | P2 |
| 4 | Agents as tools / Handoffs | 子 Agent 作工具 vs 转交控制权 | **P0** |
| 5 | Tools | function + MCP + hosted | P0 |
| 6 | Guardrails | 输入/输出对称校验 | **P0** |
| 7 | HITL | 跨 run 人工审批点 | **P0** |
| 8 | Sessions | 自动历史，勿手写拼接 | **P0** |
| 9 | Tracing | 内置 span，非可选 | **P0** |

### B1. Handoffs vs Agents-as-tools（设计差异）

```
Agents-as-tools:
  父 Agent 保留控制权
  子 Agent 返回结果给父
  适合: 分析、检索、评审

Handoffs:
  控制权转移给子 Agent
  父不再继续本轮
  适合: 路由到专业域（计费/技术/安全）
```

openmate: 两者都要；默认 as-tools，显式 handoff。

---

## 15. 附录 C — 失败路径明细

```
Node < 22
  → engines 拒绝；改用 Deno/Bun 或升级

Windows + UnixLocalSandboxClient
  → 文档明确不可用
  → openmate: 运行时检测 + 自动切 DockerSandboxClient

Cloudflare Workers
  → 实验；需 nodejs_compat
  → openmate: 标记 experimental，不进默认路径

Sandbox API 变更
  → beta；openmate 隔离适配层

Realtime 长期 key 进浏览器
  → 安全事故
  → openmate: 只接受 ephemeral token，启动校验前缀

zod 未安装
  → schema 校验静默缺失
  → openmate: 把 zod 列为 peerDependency 必装

模型不支持 tools
  → 工具调用失败
  → openmate: 启动时 capability probe

manifest 引用不存在 git repo
  → sandbox 初始化失败
  → openmate: 预检 + 明确错误码
```

---

## 16. 附录 D — 源码导出路径核对表

| Import | 导出符号 | 本轮验证 |
|--------|----------|----------|
| `@openai/agents` | Agent, run | README 代码 |
| `@openai/agents/sandbox` | SandboxAgent, gitRepo | README 代码 |
| `@openai/agents/sandbox/local` | UnixLocalSandboxClient | README 代码 |
| `@openai/agents/realtime` | RealtimeAgent, RealtimeSession | README 代码 |
| zod | （peer） | README install |

**未验证**: 具体 packages/ 目录内部文件名。不发明。

---

## 17. 附录 E — 致谢依赖的工程含义（README 实读）

| 依赖 | 用途 | openmate 启示 |
|------|------|---------------|
| zod | schema 校验 | 一等 peer |
| Starlight | 文档站 | 文档即产品 |
| vite / vitest | 构建/测试 | 现代 TS 工具链 |
| pnpm | 包管理 | monorepo 友好 |
| Next.js | 示例/文档 | demo 可部署 |

---

## 18. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | Tools + MCP + hosted 三类 |
| 权限安全 | 4 | Guardrails + ephemeral token |
| 容错恢复 | 4 | Sessions 自动历史 |
| 上下文 | 4 | Sessions + handoffs 分流 |
| 可扩展 | 5 | MCP + agents-as-tools |
| 可观测 | 5 | Tracing 内置 |
| 成熟度 | 4 | OpenAI 维护；Sandbox beta |

**净推荐**: openmate 以本 SDK 的 **概念九件套 + 统一 run + 双委托** 为 JS/TS 侧黄金参考；Sandbox 适配层保持可替换。
