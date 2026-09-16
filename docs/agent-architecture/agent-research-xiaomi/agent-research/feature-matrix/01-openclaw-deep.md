# OpenClaw 源代码深度研究

研究时间：2026-09-16 03:00
源码：github.com/openclaw/openclaw（390k stars，81.9k forks）

## 已读源代码文件

### 1. context-engine/delegate.ts
- 上下文引擎委托桥接
- 将自定义引擎桥接到内置压缩和记忆提示路径
- `delegateCompactionToRuntime()` — 委托压缩到运行时
- `buildMemorySystemPromptAddition()` — 构建记忆系统提示
- `prepareMemorySystemPromptAddition()` — 异步准备记忆状态
- 关键设计：第三方引擎可调用内置压缩算法，无需自己实现

### 2. context-engine/registry.ts
- 上下文引擎注册表
- 引擎注册、解析、兼容性、隔离
- `createOwnedContextEngine()` — 创建拥有资源的引擎
- `resolveContextEngineFactory()` — 解析引擎工厂
- 关键设计：引擎工厂模式+资源管理+隔离机制

### 3. context-engine/types.ts
- 上下文引擎公共类型
- `AssembleResult` — 组装结果（消息+token估计+系统提示）
- `CompactResult` — 压缩结果（摘要+保留条目+token前后对比）
- `ContextEngine` 接口 — bootstrap/ingest/assemble/compact/prepareSubagentSpawn/onSubagentEnded
- 关键设计：可插拔上下文管理生命周期

### 4. context-engine/runtime-settings.ts
- 运行时设置构建
- `buildContextEngineRuntimeSettings()` — 构建运行时设置
- 模式：normal/fallback/degraded
- 诊断：fallbackReason/degradedReason
- 关键设计：运行时模式+诊断信息

### 5. fleet/containers.runtime.ts
- 容器运行时管理
- Docker/Podman容器生命周期
- `FleetContainerInspectResult` — 容器检查结果
- `FleetNetworkInspectResult` — 网络检查结果
- 关键设计：容器隔离+资源限制+安全策略

### 6. snapshot/git-backup.ts
- Git备份系统
- `GitBackupCreateResult` — 备份创建结果
- 提交+推送+警告
- 关键设计：git备份+manifest+恢复

### 7. talk/agent-consult-tool.ts
- Agent咨询工具
- `REALTIME_VOICE_AGENT_CONSULT_TOOL` — 实时语音agent咨询工具
- 策略：safe-read-only/owner/none
- 工具白名单：read/web_search/web_fetch/x_search/memory_search/memory_get
- 关键设计：语音agent委托+安全策略+工具白名单

## 核心架构发现

### 1. 可插拔上下文引擎
- 引擎工厂模式：注册→解析→创建→使用→销毁
- 资源管理：引擎持有资源，销毁时释放
- 隔离机制：引擎故障不影响主系统
- 委托模式：第三方引擎可委托到内置压缩

### 2. 压缩系统
- 压缩触发：token预算+阈值
- 压缩结果：摘要+保留条目+token对比
- 压缩委托：第三方引擎可调用内置压缩
- 压缩诊断：fallback/degraded模式

### 3. 容器隔离
- Docker/Podman支持
- 资源限制：内存+CPU+PID
- 安全策略：capability drop+security opt
- 网络隔离：内部网络+端口绑定

### 4. 备份系统
- Git备份：提交+推送+manifest
- SQLite快照：验证+恢复
- 安全：路径隔离+权限检查

### 5. 语音Agent委托
- 工具定义：question/context/responseStyle/confirmationId
- 策略控制：safe-read-only/owner/none
- 工具白名单：只读工具+记忆工具
- 转录集成：最近12条转录作为上下文

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 可插拔上下文引擎 | ❌ | ❌ | 大 | 引擎工厂+资源管理 |
| 压缩系统 | ❌ | ❌ | 大 | token预算+阈值触发 |
| 容器隔离 | ❌ | ❌ | 大 | Docker容器运行agent代码 |
| Git备份 | ❌ | 部分 | 中 | git commit+push |
| 语音Agent委托 | ❌ | 部分 | 中 | 工具定义+策略控制 |

## 可复用设计

1. **引擎工厂模式**：注册→解析→创建→使用→销毁
2. **资源管理**：引擎持有资源，销毁时释放
3. **隔离机制**：引擎故障不影响主系统
4. **委托模式**：第三方引擎可委托到内置压缩
5. **容器隔离**：Docker容器运行agent代码
6. **Git备份**：提交+推送+manifest
7. **语音Agent委托**：工具定义+策略控制
