# E2B / Daytona — Agent 代码沙箱与运行时基础设施调研

> 目标：为 openmate 提供工具隔离、会话生命周期、文件系统与网络策略参考。
> 来源：github.com/e2b-dev/e2b、e2b.dev/docs、github.com/daytonaio/daytona、daytona.io/docs。

---

## 1. 项目定位对比

| 维度 | **E2B** | **Daytona** |
|------|---------|-------------|
| 定位 | 云上安全隔离沙箱跑 AI 生成代码 | 安全弹性 AI 代码执行运行时 |
| 隔离单元 | 按需创建的 Linux VM | Container / Linux VM / Windows VM / GPU |
| 冷启动 | 快速 | 宣称 <90ms |
| 持久化 | Pause 保存文件系统+内存，可无限期保留 | 默认持久；stop 保 FS，pause 保 FS+内存 |
| 自托管 | Terraform（AWS/GCP） | 开源平台；**注意：主仓 2026-06 起转私有，公开仓不再维护** |
| SDK | Python / JS/TS | Python / TS / Ruby / Go / Java |
| 附加能力 | Code Interpreter、Desktop（computer use） | MCP Server、PTY、LSP、Git、Webhooks、VPN |

---

## 2. E2B 深度

### 2.1 沙箱生命周期

```
create() ──运行──► timeout 到期
              │         │
              │         ├─ 自动 pause（保留全状态）
              │         └─ 或 kill
              │
              ├─ setTimeout() 延长运行窗口
              ├─ pause() / resume()
              └─ kill() 立即销毁
```

要点：

- 运行时长上限：Pro 24h / Base 1h；超时后靠 **pause/resume** 突破
- Pause 重置运行时钟，状态（FS+内存）可无限期保留
- `getInfo()`：sandboxId、templateId、metadata、startedAt、endAt
- Python `timeout` 单位秒；JS `timeoutMs` 单位毫秒

### 2.2 构建块

| 组件 | 说明 |
|------|------|
| **Sandbox** | 按需创建的安全 Linux VM，可 pause/resume |
| **Template** | 沙箱启动环境定义 |
| **Persistence** | Pause 同时保存文件系统与内存 |
| **Code Interpreter SDK** | `runCode()` 代码解释执行 |
| **Desktop SDK** | 鼠标/键盘/截图/应用/桌面流（computer use） |

### 2.3 典型用法

```python
from e2b import Sandbox

with Sandbox.create() as sandbox:
    result = sandbox.commands.run('echo "Hello"')
    print(result.stdout)
```

### 2.4 自托管

- infra 仓库 + Terraform
- 支持 AWS、GCP；Azure / 通用 Linux 待做

---

## 3. Daytona 深度

### 3.1 三层隔离边界

| 边界 | 分离内容 | 机制 |
|------|----------|------|
| **Runtime** | 进程、文件系统、内存、设备 | Sandbox classes；保留 vCPU/内存/磁盘硬限制 |
| **Network** | 入站/出站流量 | Network limits；Preview 认证；Linked sandboxes |
| **Organization** | 沙箱/数据/凭证访问 | Org 边界；API key scopes；Secrets |

#### Runtime 细节

| Sandbox class | 边界 |
|---------------|------|
| Container | 独立 namespace + 资源硬限；容器内 root 不影响 runner |
| VM（Linux/Windows） | 独立内核；支持 **pause/resume、fork、hot snapshot** |
| GPU | 独占 GPU 分配，绝不共享 |

资源通过 cgroup 强制：`/sys/fs/cgroup/cpu.max`、`memory.max`。

#### 网络隔离

| 方向 | 默认 | 控制 |
|------|------|------|
| Sandbox → Internet | Tier3+ 开放；Tier1/2 受限 | `networkAllowList` / `domainAllowList` / `networkBlockAll` / `outboundProxyUrl` |
| Internet → Sandbox | 需认证 | Preview token / signed URL / SSH token |
| Sandbox ↔ Sandbox | **无共享网络** | Linked sandboxes 加入 link network（按名可达） |

网络策略关键点：

- 三种出站模式互斥：CIDR allow list、domain allow list、block all
- 运行中可热更新网络策略（需 `WRITE_SANDBOXES`）
- `outboundProxyUrl`：HTTP(S) 出口走上游代理；配合 domainAllowList 防绕过
- 自定义 allow list 时**没有** essential services 自动放行（GitHub/npm/PyPI 需自己加）
- 防数据外泄、缩小攻击面

#### 组织隔离

- 资源归属单一 org，跨 org API key 不可见
- **Scoped API keys** + **Managed API keys**（运行时发子 key 给多租户）
- **Secrets**：沙箱内只有占位符，出站代理按允许 host 替换真实值——**沙箱代码可“用”但不能“读”凭证**
- **Volumes subpath**：多租户只挂自己的切片

### 3.2 三层持久化（崩溃恢复核心）

| 层 | 保留内容 | 机制 |
|----|----------|------|
| **Filesystem** | 文件、包、仓库、构建产物 | stop/start；archive；cold snapshot |
| **Memory** | 运行进程、连接、RAM 状态 | pause/resume；hot snapshot；fork |
| **External storage** | 跨沙箱生命周期的数据 | Volumes（S3 挂载）；mount external storage |

状态机（VM）：

```
STARTED ──stop()──► STOPPED ──start()──► STARTED
   │                   │
   └─pause()──► PAUSED ──start()──► STARTED
                   │
                   └─delete()──► DELETED
```

- Container：stop 保 FS（仍在 runner，占磁盘配额）；内存清空
- VM：stop 把 FS 卸载到近旁存储；pause 冻结 VM（FS+内存）
- GPU：默认 ephemeral，stop 即删；结果写 Volume

#### 快照与 Fork

- **Cold snapshot**：捕获 FS（停机状态）
- **Hot snapshot**：捕获 FS+内存（运行中）；从热快照启动的沙箱进程已在跑
- **Fork**：复制 VM 的 FS+内存为独立沙箱；可再 fork；父沙箱有活跃子 fork 时不可删
- 快照独立于源沙箱存续

#### 生命周期自动化

| 间隔 | 适用 | 默认 | 效果 |
|------|------|------|------|
| Auto-stop | Container/GPU | 15min 空闲 | 停止；GPU 即删 |
| Auto-pause | VM | 60min 空闲 | 暂停，保 FS+内存 |
| Auto-archive | Container | 7 天 stopped | FS 移对象存储 |
| Auto-delete | 全部 | 关闭 | stopped 后删除 |
| Wall-clock TTL | 全部 | 关闭 | 固定墙钟后销毁 |

Ephemeral 沙箱：stop 即删，无停止态磁盘计费。

### 3.3 Agent 工具面

进程与代码执行、文件系统操作、Git、LSP、PTY、日志流、MCP Server、Computer Use、Agent Skills。

---

## 4. openmate 应借鉴的设计

### 4.1 工具隔离（最高优先级）

1. **危险代码必须出进程**：文件写、shell、任意代码执行 → 独立沙箱，绝不与 Agent 主进程同命。
2. **默认拒绝网络**：`networkBlockAll` 或最小 domain allow list；防数据外泄。
3. **凭证不落盘**：学 Daytona Secrets——沙箱持占位符，代理在允许 host 注入真实值。
4. **资源硬限**：vCPU / 内存 / 磁盘 cgroup 强制，防单任务拖垮节点。
5. **多租户切片**：Volume subpath 或命名空间隔离。

### 4.2 会话生命周期 / 崩溃恢复

1. **Pause/Resume 是长会话关键**：Agent 主机崩溃后，从 paused 沙箱恢复全部进程状态。
2. **Hot snapshot 做检查点**：长任务定期打热快照，崩溃可回滚到最近一致点。
3. **Fork 做实验/自进化**：从稳定状态 fork 出分支试危险改动，失败不影响原环境。
4. **Volumes 跨沙箱存续**：中间结果、模型权重写 Volume，沙箱删了数据还在。
5. **显式 TTL + auto-pause**：防僵尸沙箱吃资源；空闲自动 pause 而非杀。
6. **Ephemeral 用于一次性工具调用**：无状态任务用完即焚，零残留。

### 4.3 与 openmate 架构映射

```
openmate Agent 主进程
    │
    ├─ MCP Tool: run_code  ──►  E2B/Daytona Sandbox（网络默认关）
    ├─ MCP Tool: edit_file ──►  Sandbox FS（独立于宿主）
    ├─ 会话 ID ──────────────►  sandbox_id + handle（MCP 有状态模式）
    │
    ├─ 崩溃恢复：sandbox pause 状态 + Volume 中间结果 + Langfuse trace
    └─ 自进化：fork 稳定 sandbox → 试新工具/策略 → 成功则 snapshot 固化
```

### 4.4 选型建议

| 需求 | 倾向 |
|------|------|
| 快速集成、JS/Python、computer use | **E2B** |
| 自托管可控、多语言 SDK、细粒度网络策略、fork/hot-snapshot | **Daytona**（注意开源仓停维护，需评估闭源路线或 fork） |
| 仅需本地隔离 | 可先用容器/命名空间模拟最小沙箱，协议对齐上述模型 |

```
短期：危险工具走沙箱；默认 networkBlockAll；凭证用代理注入
中期：pause/resume + hot snapshot 检查点；Volume 存中间态
长期：fork 自进化实验环；与 MCP handle 打通沙箱生命周期
```

---

## 5. 风险与注意

- Daytona 公开仓 **2026-06 起不再维护**，核心开发转私有——自托管依赖需另作评估
- E2B 自托管依赖 Terraform + 云账号；无“单机 Linux”路径
- E2B 运行时长上限需用 pause 突破，设计上不能假设无限 running
- Daytona Tier1/2 无法在沙箱级覆盖组织网络策略
- Container 类沙箱 pause 不支持；需要进程级恢复必须用 VM class
- 自定义 allow list 会掐断 essential services，需显式列出 npm/PyPI/GitHub

---

## 6. 参考链接

- https://github.com/e2b-dev/e2b
- https://e2b.dev/docs
- https://e2b.dev/docs/sandbox
- https://github.com/daytonaio/daytona
- https://www.daytona.io/docs/isolation/
- https://www.daytona.io/docs/persistence/
- https://www.daytona.io/docs/network-limits/
