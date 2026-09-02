# OpenSoulMate v1.0 开发实现记录

> 每实现一项规范，记录实现日期、commit、关键改动。
> 对齐文档：`docs/specs/` 目录下27份规范。

---

## P0 — 核心协议对齐（立即做）

### 1. ACP v1.0 协议对齐
- **规范**: `09-ACP-v1.0-人机交互协议规范.md`
- **状态**: ✅ 已完成
- **日期**: 2026-09-02
- **Commit**: `3948a7c`, `aa051f1`, `00ca90c`, `db7c3a7`, `a952ec6`
- **改动**:
  - `acp-proxy/ws_acp.py` — 新增，ACP JSON-RPC 2.0纯透传WebSocket端点
  - `acp-proxy/app.py` — 注册/ws/acp路由
  - `acp-proxy/agent/acp_server.py` — session/create, session/prompt, session/close, session/approval; session/event统一事件
  - `src/app/(app)/chat/chat-client.tsx` — 前端ACP JSON-RPC 2.0（initialize→session/create→session/prompt）
  - `acp-proxy/.env` — LLM配置
- **验证**: initialize→session/create→session/prompt→流式7 chunks→session.completed ✅

### 2. A2A v1.0 协议对齐
- **规范**: `10-A2A-v1.0-Agent对等协同协议规范.md`
- **状态**: ✅ 已完成
- **日期**: 2026-09-02
- **Commit**: `705047c`
- **改动**:
  - `acp-proxy/a2a/server.py` — tasks/send→a2a/task/delegate, tasks/get→a2a/task/result, tasks/cancel→a2a/task/cancel, 新增a2a/artifact/sync, a2a/agent/heartbeat, 旧方法名保留兼容
  - `acp-proxy/ws_a2a.py` — 新增，ws://8092/ws/a2a WebSocket长连接端点
  - `acp-proxy/app.py` — 注册rpc_router(/rpc/a2a)和ws_a2a(/ws/a2a)
- **验证**: 方法分发表12个方法，5个规范方法+7个兼容方法

### 3. MCP v1.0 协议实现
- **规范**: `11-MCP-v1.0-底层管控协议规范.md`
- **状态**: ✅ 已完成
- **日期**: 2026-09-02
- **Commit**: (同Gateway commit)
- **改动**:
  - `acp-proxy/mcp/server.py` — 7个RPC方法: agent/start|stop|restart, config/reload, health/check, monitor/report, system/restart; control_token鉴权; 事件广播
  - `acp-proxy/ws_mcp.py` — ws://8092/ws/mcp WebSocket管控通道
  - `acp-proxy/app.py` — 注册/admin/mcp HTTP + /ws/mcp WebSocket
- **验证**: 7个方法全部注册通过

### 4. Gateway 统一路由
- **规范**: `07-Gateway-v1.0-网关路由规范.md`
- **状态**: ✅ 已完成
- **日期**: 2026-09-02
- **Commit**: (同上)
- **改动**:
  - `acp-proxy/gateway/router.py` — POST /rpc统一入口，method前缀路由(acp/a2a/mcp/artifact/vector/scheduler)，X-Trace-Id生成透传，四维限流，熔断降级，网关内转发
  - `acp-proxy/gateway/__init__.py` — 模块初始化
  - `acp-proxy/app.py` — 注册gateway_router(/rpc)
- **验证**: 6个路由前缀全部注册

---

## P1 — 核心业务层（近期做）

### 5. ACP 审批弹窗
- **规范**: `09-ACP-v1.0-人机交互协议规范.md` (human.approval.required)
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 前端审批弹窗组件
  - [ ] session/approval 回传
  - [ ] Agent Engine permission回调链路

### 6. EventBus 事件总线
- **规范**: `12-EventBus-v1.0-事件总线规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 标准事件结构体（eventId, eventTopic, eventType, traceId）
  - [ ] 发布/订阅模型
  - [ ] 事件Topic命名规范
  - [ ] 可靠投递+重试+死信队列
  - [ ] 跨进程事件广播

### 7. Session 状态机完善
- **规范**: `24-Session-v1.0-会话生命周期规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 状态机：init→active→frozen→resuming→destroy_pending→destroyed
  - [ ] 冻结/恢复机制
  - [ ] 快照持久化（L3断线恢复）
  - [ ] 子会话模型（A2A嵌套）
  - [ ] 超时自动冻结/销毁

### 8. Memory 记忆系统
- **规范**: `03-Memory-v1.0-记忆系统规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 短期记忆（会话内上下文）
  - [ ] 长期记忆（跨会话持久化）
  - [ ] 工作记忆（当前任务临时状态）
  - [ ] 记忆检索（向量/关键词混合）
  - [ ] AgentCore ↔ Memory 联动

### 9. traceId 全链路追踪
- **规范**: `22-LogAndTrace-v1.0-日志链路追踪规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] Gateway生成traceId
  - [ ] 全链路Header透传
  - [ ] 日志统一格式（traceId, spanId, timestamp, level）
  - [ ] ACP/A2A/MCP全链路绑定

---

## P2 — 中间件与扩展层（中期做）

### 10. RBAC 完整权限体系
- **规范**: `15-RBAC-v1.0-权限角色规范.md`
- **状态**: ⏳ 基础JWT已有，需扩展
- **改动**:
  - [ ] 五层模型：User→Role→Permission→Resource→Action
  - [ ] 角色管理（管理员/普通用户/访客/运维）
  - [ ] 工具级权限开关
  - [ ] 跨Agent最小权限委派
  - [ ] 全操作审计日志

### 11. Config 配置中心
- **规范**: `14-Config-v1.0-配置中心规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 四层命名空间（cluster→project→service→instance）
  - [ ] 配置版本管理+回滚
  - [ ] 灰度下发
  - [ ] 热更新推送
  - [ ] 敏感配置加密
  - [ ] 本地缓存兜底

### 12. Plugin 插件系统
- **规范**: `13-Plugin-v1.0-插件扩展规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 插件manifest定义
  - [ ] 插件加载/卸载生命周期
  - [ ] Hook拦截点
  - [ ] 插件沙箱隔离
  - [ ] 插件权限管控

### 13. PromptStore 提示词仓库
- **规范**: `06-PromptStore-v1.0-提示词仓库规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] Prompt版本管理
  - [ ] 变量模板引擎
  - [ ] 多租户隔离
  - [ ] AgentCore调用PromptStore加载Prompt

### 14. ModelGateway 模型网关
- **规范**: `08-ModelGateway-v1.0-模型网关规范.md`
- **状态**: ⏳ 待实现
- **改动**:
  - [ ] 统一模型代理（所有LLM调用收口）
  - [ ] 多模型路由+负载均衡
  - [ ] 限流熔断
  - [ ] 用量统计+计费
  - [ ] 模型节点注册/健康探测

---

## P3 — 底座可观测层（远期做）

### 15. Telemetry 遥测
- **规范**: `16-Telemetry-v1.0-遥测观测规范.md`
- **状态**: ⏳ 待实现

### 16. Monitor 监控大盘
- **规范**: `17-Monitor-v1.0-集群指标监控规范.md`
- **状态**: ⏳ 待实现

### 17. Alert 告警中心
- **规范**: `18-Alert-v1.0-告警中心规范.md`
- **状态**: ⏳ 待实现

### 18. SLA 服务等级
- **规范**: `19-SLA-v1.0-服务等级指标规范.md`
- **状态**: ⏳ 待实现

### 19. Health 健康检查扩展
- **规范**: `20-Health-v1.0-健康检查规范.md`
- **状态**: ⏳ 基础/health已有，需扩展

### 20. Backup 备份恢复
- **规范**: `21-Backup-v1.0-集群备份恢复规范.md`
- **状态**: ⏳ 待实现

### 21. ErrorCode 全局错误码
- **规范**: `23-ErrorCode-v1.0-全局错误码规范.md`
- **状态**: ⏳ 基础ACP错误码已有，需对齐规范

### 22. AgentCore 智能体内核完善
- **规范**: `02-AgentCore-v1.0-智能体内核规范.md`
- **状态**: ⏳ 基础agent loop已有，需扩展
- **改动**:
  - [ ] 反思迭代机制
  - [ ] 自动任务规划
  - [ ] 多Agent协同（A2A委派）
  - [ ] 状态机：idle→planning→running→pause→success/fail/cancel

### 23. Artifact 知识库产物
- **规范**: `04-Artifact-v1.0-知识库产物规范.md`
- **状态**: ⏳ 基础artifact.py已有，需对齐规范

### 24. Scheduler 任务调度
- **规范**: `05-Scheduler-v1.0-集群调度规范.md`
- **状态**: ⏳ 待实现

### 25. AgentMemory 智能体记忆（扩展）
- **规范**: `03-Memory-v1.0-记忆系统规范.md`
- **状态**: ⏳ 同第8项

---

## 统计

| 优先级 | 总数 | 已完成 | 进行中 | 待实现 |
|--------|------|--------|--------|--------|
| P0 | 4 | 1 | 0 | 3 |
| P1 | 5 | 0 | 0 | 5 |
| P2 | 5 | 0 | 0 | 5 |
| P3 | 11 | 0 | 0 | 11 |
| **合计** | **25** | **1** | **0** | **24** |
