# OpenSoulMate\_EventBus\_v1\.0\_事件总线规范（定稿冻结）

# 0\. 总则

## 0\.1 规范目的

定义 OpenSoulMate 集群全局**分布式事件总线统一标准**，包含事件主题规范、事件结构体、发布订阅模式、可靠投递、重试机制、事件溯源、跨进程跨节点广播、事件隔离策略。

解决系统组件耦合严重、事件格式混乱、订阅规则不统一、消息丢失、重复消费、跨模块状态不同步、无统一事件溯源体系等问题，构建**全系统异步解耦、高可靠、可溯源、可回放**的事件驱动底座。

## 0\.2 适用范围

- 全集群微服务、Agent 智能体、调度中心、网关、模型网关、插件系统

- 所有系统异步事件、状态变更、任务生命周期、资源变更、配置变更事件

- 事件发布、订阅、路由、重试、死信、回放、溯源模块

- 跨进程、跨节点、跨租户事件同步机制

- Telemetry 遥测事件、监控事件、告警事件统一投递入口

## 0\.3 层级定位

- **上游**：所有业务服务、插件系统、模型网关、调度系统、遥测系统

- **下游**：事件订阅器、事件持久化、死信队列、事件回放引擎

- **体系依赖**：Monitor监控、Telemetry遥测、RBAC权限、Log\&Trace链路追踪

- **职责边界**：仅负责事件分发、解耦、可靠投递、溯源；不执行业务逻辑、不直接管控集群资源

## 0\.4 基础强制约束

1. 全局事件结构体、Topic命名、事件字段**完全统一固化**，禁止私有自定义事件格式

2. 所有系统状态变更、任务变更、资源变更**必须通过EventBus发布**，禁止裸接口硬编码同步

3. 核心事件强制持久化、支持回放；普通日志事件可临时内存投递

4. 事件必须携带 TraceId、ClusterId、ServiceName、Timestamp，实现全链路溯源

5. 严格区分全局广播事件、租户私有事件、服务内部事件三层隔离

6. 所有事件消费支持幂等，杜绝重复消费异常

# 1\. 核心数据模型（全局固化）

## 1\.1 标准事件结构体

```json
{
  "eventId": "evt-xxxx",
  "eventTopic": "system/state/changed",
  "eventType": "global|namespace|service",
  "timestamp": 1788000000123,
  "traceId": "trace-xxxx",
  "clusterId": "cluster-main",
  "namespace": "proj-001",
  "sourceService": "scheduler",
  "sourceInstanceId": "inst-xxxx",
  "payload": {},
  "meta": {
    "persist": true,
    "retryTimes": 0,
    "maxRetry": 3
  }
}
```

## 1\.2 事件订阅模型

```json
{
  "subId": "sub-xxxx",
  "topic": "agent/task/#",
  "targetService": "all|vector|memory",
  "namespaceFilter": ["*"],
  "callbackUrl": "internal://event/callback",
  "enableRetry": true,
  "enableDlq": true,
  "status": "enabled"
}
```

# 2\. 事件 Topic 全局命名规范（固化）

层级格式：`领域/模块/事件动作`，支持 \# 通配符订阅

## 2\.1 系统级全局事件

- `system/config/updated` 全局配置更新

- `system/node/online/offline` 节点上下线

- `system/service/start/stop/crash` 服务进程状态变更

- `system/alert/trigger/cancel` 告警事件

## 2\.2 Agent 任务事件

- `agent/task/pending/running/success/failed/cancel`

- `agent/heartbeat/update`

- `agent/artifact/sync`

## 2\.3 模型网关事件

- `model/request/start/end`

- `model/error/occur`

- `model/rate/limit`

## 2\.4 插件生命周期事件

- `plugin/load/unload/enable/disable`

- `plugin/hook/execute`

# 3\. 事件投递策略

## 3\.1 三级事件隔离

1. **Global 全局事件**：全集群所有服务订阅，系统级变更

2. **Namespace 租户事件**：仅当前租户资源可见，租户隔离

3. **Service 私有事件**：单服务内部状态同步，不对外广播

## 3\.2 可靠投递机制

- 核心事件：持久化、至少一次投递、自动重试3次、失败进入死信队列

- 轻量事件：内存投递、无持久化、低延迟

- 所有消费逻辑强制幂等设计

# 4\. 事件溯源与回放规范

- 所有持久化事件支持**按时间范围、TraceId、Topic、租户**回放

- 用于故障复盘、状态重建、数据一致性修复

- 回放操作全程审计、权限管控

# 5\. 权限与审计规范

- 事件订阅、查看：只读权限

- 自定义Topic注册、事件回放：运维权限

- 总线核心配置修改：管理员权限

- 所有事件投递、消费、回放操作永久审计留存

# 6\. 体系依赖

- 遥测观测：Telemetry\_v1\.0

- 监控体系：Monitor\_v1\.0

- 链路追踪：Log\&Trace\_v1\.0

- 权限体系：RBAC\_v1\.0

# 7\. 版本信息

- 规范版本：v1\.0

- 状态：定稿冻结

- 生效时间：2026\-09\-02

- 兼容策略：事件结构体、Topic体系、隔离策略永久冻结，支持业务事件增量扩展

> （注：部分内容可能由 AI 生成）
