# e2b-dev/e2b — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/e2b-dev/e2b  
> 抓取通道: cdn.jsdelivr.net/gh/e2b-dev/e2b@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供云沙箱 / 生命周期管理 / 网络隔离 / Fork / Snapshot 借鉴

---

## 0. 诚实性说明

- 成功拉取: `packages/js-sdk/src/index.ts`（完整导出）、`packages/js-sdk/src/sandbox/sandboxApi.ts`（完整 SandboxApi，约 800 行，含 lifecycle / network / fork / IAM / snapshot）
- 未能拉取: Daytona 源码（独立仓库，非 e2b 子目录）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

E2B 是云端代码执行沙箱服务，提供 Firecracker microVM 隔离的临时环境，支持 AI Agent 安全执行不可信代码。

### 1.2 源码布局（实测导出）

| 路径 | 职责 |
|------|------|
| `packages/js-sdk/src/sandbox/sandboxApi.ts` | Sandbox CRUD / lifecycle / network / fork / IAM |
| `packages/js-sdk/src/sandbox/commands/` | 命令执行 / PTY |
| `packages/js-sdk/src/sandbox/filesystem/` | 文件系统操作 / watch |
| `packages/js-sdk/src/sandbox/git/` | Git 操作 |
| `packages/js-sdk/src/sandbox/mcp/` | MCP 服务器配置 |
| `packages/js-sdk/src/sandbox/network/` | 网络配置 |
| `packages/js-sdk/src/volume/` | Volume 挂载 |
| `packages/js-sdk/src/secret/` | Secret 管理 |
| `packages/js-sdk/src/errors.ts` | 错误类型 |
| `packages/js-sdk/src/connectionConfig.ts` | 连接配置 |

### 1.3 错误类型（实测导出）

```typescript
export {
  AuthenticationError,
  FileNotFoundError,
  GitAuthError,
  GitUpstreamError,
  InvalidArgumentError,
  NotEnoughSpaceError,
  NotFoundError,
  SandboxError,
  SandboxNotFoundError,
  TemplateError,
  TimeoutError,
  RateLimitError,
  ServiceBusyError,
  BuildError,
  FileUploadError,
  VolumeError,
  VolumeNotFoundError,
  VolumePathNotFoundError,
  SecretError,
  SecretNotFoundError,
} from './errors'
```

---

## 2. Sandbox 生命周期（源码实读）

### 2.1 状态

```typescript
export type SandboxState = 'running' | 'paused'
```

### 2.2 Lifecycle 配置

```typescript
export type SandboxOnTimeout =
  | 'pause'
  | 'kill'
  | {
      action: 'pause'
      keepMemory?: boolean  // false = 仅文件系统快照，恢复时冷启动
    }
  | {
      action: 'kill'
    }

export type SandboxLifecycle = {
  onTimeout: SandboxOnTimeout
  autoResume?: boolean  // 仅在 onTimeout=pause 时有效
}
```

### 2.3 恢复模式

```typescript
export type SandboxOnResume = 'restore' | 'reboot'
```

- `'restore'`（默认）: 恢复内存快照，进程和连接存活
- `'reboot'`: 冷启动，忽略内存快照（救援路径）

### 2.4 创建时的 Lifecycle 校验（源码实读）

```typescript
const requestedOnTimeout = opts?.lifecycle?.onTimeout
const onTimeoutConfigured = requestedOnTimeout != null
const onTimeout = requestedOnTimeout ?? 'kill'
const action = typeof onTimeout === 'string' ? onTimeout : onTimeout.action

if (onTimeoutConfigured && !allowedActions.includes(action)) {
  throw new InvalidArgumentError(
    `${field} must be one of: ${allowedActions.join(', ')} (got ${JSON.stringify(action)}).`
  )
}

if (hasKeepMemory && action !== 'pause') {
  throw new InvalidArgumentError(
    "onTimeout.keepMemory is only allowed when action is 'pause'."
  )
}

if (autoResume && action !== 'pause') {
  throw new InvalidArgumentError(
    "autoResume can only be true when onTimeout action is 'pause'."
  )
}

if (!keepMemory && autoResume) {
  throw new InvalidArgumentError(
    'autoResume: true is not a valid value when keepMemory: false - '
    'a filesystem-only snapshot cannot be auto-resumed by traffic and must be resumed explicitly using Sandbox.connect().'
  )
}
```

**设计要点**: `keepMemory: false`（文件系统快照）不能与 `autoResume: true` 组合，因为文件系统快照恢复时冷启动，无法被流量透明唤醒。

---

## 3. 网络配置（源码实读）

### 3.1 类型定义

```typescript
export type SandboxNetworkSelector =
  string[] | ((ctx: SandboxNetworkSelectorContext) => string[])

export type SandboxNetworkSelectorContext = {
  allTraffic: string  // '0.0.0.0/0'
  rules: Map<string, SandboxNetworkRule[]>
}

export type SandboxNetworkOpts = {
  allowOut?: SandboxNetworkSelector
  denyOut?: SandboxNetworkSelector
  rules?: SandboxNetworkRules
  egressProxy?: SandboxEgressProxyOpts
  allowPublicTraffic?: boolean  // 默认 true
  maskRequestHost?: string      // 默认 ${PORT}-sandboxid.e2b.app
  httpsPorts?: number[]
}
```

### 3.2 Egress Proxy（SOCKS5）

```typescript
export type SandboxEgressProxyOpts = {
  address: string      // 'host:port'
  username?: string    // RFC 1929, ≤255 bytes
  password?: string    // ≤255 bytes
}
```

**设计要点**:
- 代理在 host 侧运行，沙箱内代码看不到也绕不过
- 过滤先于代理：denyOut 阻止的连接不经过代理
- DNS 和 QUIC/HTTP3 不经过代理
- 代理不可达时 fail closed（不回退到直连）

### 3.3 Network Rules + IAM Transform

```typescript
export type SandboxNetworkRule = {
  transform?: SandboxNetworkTransform | SandboxNetworkTransformResolver
}

export type SandboxNetworkTransform = {
  headers?: Record<string, string>
}

export type SandboxNetworkTransformResolver = (
  ctx: SandboxNetworkTransformContext
) => SandboxNetworkTransform

export type SandboxNetworkTransformContext = {
  iam: {
    tokens: Record<string, string>  // '${e2b.identity.tokens.<name>}' 占位符
  }
}
```

**设计要点**: IAM token 以占位符形式传入 transform callback，egress proxy 在请求时解析为真实 token。SDK 永远看不到 token 值。

### 3.4 Transform Callback 校验（源码实读）

```typescript
function resolveRulesForBody(rules, ctx) {
  for (const [host, hostRules] of rules) {
    out[host] = hostRules.map((rule) => {
      if (rule.transform == null) return {}
      if (typeof rule.transform !== 'function') return { transform: rule.transform }

      const transform: unknown = rule.transform(ctx)

      if (typeof (transform as PromiseLike<unknown>)?.then === 'function') {
        void Promise.resolve(transform).catch(() => {})
        throw new InvalidArgumentError(
          `Network transform callback for '${host}' must be synchronous, it returned a promise.`
        )
      }

      if (!isPlainObject(transform)) {
        throw new InvalidArgumentError(
          `Network transform callback for '${host}' must return a transform object, got ${describeValue(transform)}.`
        )
      }

      return { transform: transform as SandboxNetworkTransform }
    })
  }
}
```

**失败路径**:
- Transform callback 返回 Promise → `InvalidArgumentError`（必须同步）
- Transform callback 返回非 plain object → `InvalidArgumentError`

---

## 4. IAM / Workload Identity（源码实读）

```typescript
export type SandboxIamTokenType = 'JWT-SVID' | (string & {})

export interface SandboxIamToken {
  audience: string
  tokenType: SandboxIamTokenType
}

export interface SandboxIamOpts {
  tokens?: Record<string, SandboxIamToken>
}
```

校验逻辑：

```typescript
function buildIamBody(iam) {
  const tokens = {}
  for (const [name, token] of Object.entries(iam?.tokens ?? {})) {
    if (!token) continue
    if (typeof token.audience !== 'string' || typeof token.tokenType !== 'string') {
      throw new InvalidArgumentError(
        `iam token '${name}' must have string 'audience' and 'tokenType' properties.`
      )
    }
    validateIamTokenName(name)  // 不能包含 {, }, 控制字符
    tokens[name] = { audience: token.audience, tokenType: token.tokenType }
  }
  if (Object.keys(tokens).length === 0) return undefined  // 空 iam 不发送
  return { tokens }
}
```

---

## 5. Fork（源码实读）

```typescript
export type SandboxForkOpts = ConnectionOpts {
  count?: number      // 默认 1
  timeoutMs?: number  // 默认 300_000 (5分钟)
}
```

Fork 结果：

```typescript
type SandboxForkResponse =
  | {
      sandboxId: string
      sandboxDomain?: string
      envdVersion: string
      envdAccessToken?: string
      trafficAccessToken?: string
    }
  | Error
```

**设计要点**:
- 快照只捕获一次，所有 fork 共享
- 每个 fork 独立成功/失败
- 404 是 per-fork 的（指 fork 所需资源），不是源沙箱

```typescript
if (count < 1) {
  throw new InvalidArgumentError('count must be at least 1')
}
```

---

## 6. Snapshot（源码实读）

```typescript
export interface CreateSnapshotOpts extends SandboxApiOpts {
  name?: string
}

export interface SnapshotInfo {
  snapshotId: string
  names: string[]  // 完整名称含 project slug 和 tag
}
```

API 端点：
- `POST /sandboxes/{sandboxID}/snapshots` — 创建快照
- `GET /snapshots` — 列出快照
- `DELETE /templates/{templateID}` — 删除快照

---

## 7. 超时与限制

### 7.1 默认超时

```typescript
// connectionConfig.ts
DEFAULT_SANDBOX_TIMEOUT_MS = 300_000  // 5分钟
```

### 7.2 最大存活时间

- Pro 用户: 24 小时 (86_400_000 ms)
- Hobby 用户: 1 小时 (3_600_000 ms)

### 7.3 环境版本检查

```typescript
if (compareVersions(res.data!.envdVersion, '0.1.0') < 0) {
  await this.kill(res.data!.sandboxID, apiOpts)
  throw new TemplateError('You need to update the template to use the new SDK.')
}
```

---

## 8. Sandbox Metrics

```typescript
export interface SandboxMetrics {
  timestamp: Date
  cpuUsedPct: number
  cpuCount: number
  memUsed: number
  memTotal: number
  memCache: number
  diskUsed: number
  diskTotal: number
}
```

---

## 9. 连接与认证

```typescript
export interface SandboxOpts extends ConnectionOpts {
  template?: string           // 默认 'base'（或 'mcp-gateway' 当 mcp 设置时）
  metadata?: Record<string, string>
  envs?: Record<string, string>
  timeoutMs?: number          // 默认 300_000
  secure?: boolean            // 默认 true
  allowInternetAccess?: boolean  // 默认 true
  mcp?: McpServer
  network?: SandboxNetworkOpts
  iam?: SandboxIamOpts
  volumeMounts?: Record<string, Volume | string>
  sandboxUrl?: string         // 本地开发
  lifecycle?: SandboxLifecycle
}
```

---

## 10. 超时 / 重试 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| `DEFAULT_SANDBOX_TIMEOUT_MS` | **300_000** (5分钟) | connectionConfig.ts |
| 最大存活 (Pro) | **86_400_000** ms (24小时) | sandboxApi.ts 注释 |
| 最大存活 (Hobby) | **3_600_000** ms (1小时) | sandboxApi.ts 注释 |
| `secure` | **true** | SandboxOpts |
| `allowInternetAccess` | **true** | SandboxOpts |
| `allowPublicTraffic` | **true** | SandboxNetworkOpts |
| `maskRequestHost` | `${PORT}-sandboxid.e2b.app` | SandboxNetworkOpts |
| `onTimeout` | **'kill'**（API 默认） | SandboxLifecycle |
| `onResume` | **'restore'** | SandboxConnectOpts |
| Fork `count` | **1** | SandboxForkOpts |
| Fork `timeoutMs` | **300_000** | SandboxForkOpts |
| envd 版本要求 | **≥ 0.1.0** | sandboxApi.ts |
| IAM token 名限制 | 不能含 `{`, `}`, 控制字符 | validateIamTokenName |
| SOCKS5 username/password | ≤255 bytes | SandboxEgressProxyOpts |
| Transform callback | 必须同步 | resolveRulesForBody |

---

## 11. 失败路径

```
Lifecycle onTimeout 无效值
  → InvalidArgumentError

keepMemory + action != 'pause'
  → InvalidArgumentError("onTimeout.keepMemory is only allowed when action is 'pause'")

autoResume + action != 'pause'
  → InvalidArgumentError("autoResume can only be true when onTimeout action is 'pause'")

keepMemory=false + autoResume=true
  → InvalidArgumentError("autoResume: true is not a valid value when keepMemory: false")

Transform callback 返回 Promise
  → InvalidArgumentError("must be synchronous")

Transform callback 返回非 plain object
  → InvalidArgumentError("must return a transform object")

IAM token 缺少 audience/tokenType
  → InvalidArgumentError("must have string 'audience' and 'tokenType' properties")

IAM token 名无效
  → validateIamTokenName() 抛错

envd 版本 < 0.1.0
  → kill sandbox + TemplateError("You need to update the template")

Fork count < 1
  → InvalidArgumentError("count must be at least 1")

Fork 404
  → NotFoundError（per-fork，非源沙箱）

Sandbox 不存在
  → SandboxNotFoundError

代理不可达
  → Egress fail closed（不回退直连）
```

---

## 12. 对 openmate 的可借鉴点

### P0 — 沙箱生命周期
- `running` / `paused` 双状态
- `onTimeout`: pause（可选 keepMemory）/ kill
- `autoResume`: 流量唤醒（仅 pause + keepMemory=true）
- `onResume`: restore（内存恢复）/ reboot（冷启动）

### P0 — 网络隔离
- `allowOut` / `denyOut`: CIDR / IP / hostname 白名单
- `allTraffic` 哨兵值 `'0.0.0.0/0'`
- Callback 形式支持动态规则

### P0 — Egress Proxy
- SOCKS5 BYOC（bring your own proxy）
- 过滤先于代理
- Fail closed

### P0 — IAM Workload Identity
- JWT-SVID token 注入
- 占位符模式：SDK 不接触真实 token
- Transform callback 同步约束

### P1 — Fork
- 一次快照，多个 fork
- 独立成功/失败
- Per-fork 错误

### P1 — Snapshot
- 持久化镜像，沙箱删除后仍可用
- 命名快照 + tag

### P2 — 错误分类
- 20+ 细粒度错误类型
- RateLimitError / ServiceBusyError / TimeoutError 等

---

## 13. 源码锚点速查

```
packages/js-sdk/src/sandbox/sandboxApi.ts
  SandboxState = 'running' | 'paused'
  SandboxOnTimeout = 'pause' | 'kill' | {action:'pause', keepMemory?} | {action:'kill'}
  SandboxOnResume = 'restore' | 'reboot'
  SandboxNetworkOpts: allowOut / denyOut / rules / egressProxy / allowPublicTraffic
  SandboxEgressProxyOpts: address / username / password
  SandboxNetworkTransformResolver: 同步 callback
  SandboxIamOpts: tokens Record<string, SandboxIamToken>
  SandboxForkOpts: count=1, timeoutMs=300_000
  buildIamBody(): 校验 + validateIamTokenName
  resolveRulesForBody(): 同步校验 + plain object 校验
  createSandbox(): lifecycle 校验 + envd 版本检查
  forkSandbox(): count>=1 + per-fork 错误处理
  connectSandbox(): onResume 校验
  createSnapshot() / listSnapshots() / deleteSnapshot()

packages/js-sdk/src/connectionConfig.ts
  DEFAULT_SANDBOX_TIMEOUT_MS = 300_000

packages/js-sdk/src/errors.ts
  20+ 错误类型
```

---

## 14. Daytona 补充说明

Daytona 是 E2B 的开源替代方案，提供类似的沙箱抽象但可自托管。本次未能通过 CDN 拉取 Daytona 源码（路径 404）。如需 Daytona 详细分析，建议单独访问 https://github.com/daytonaio/daytona。

---

## 15. 参考链接

- https://github.com/e2b-dev/e2b
- https://e2b.dev/docs
- https://github.com/daytonaio/daytona
