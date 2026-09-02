**OpenSoulMate\_MCP\_v1.0\_中间层管控协议规范（定稿冻结）**

**0. 总则**

**0.1 规范目的**

定义 OpenSoulMate 体系下 MCP（Middle Control Protocol）中间层管控协议，统一集群 Agent 进程生命周期管理、资源配额管控、配置热更新、健康巡检、故障自愈、运维审计的标准化通信协议。

MCP 作为**底层管控平面**，完全隔离于业务通信，为上层 ACP 人机交互、A2A 智能体协同提供稳定、可控、可观测的系统运行底座。

**0.2 适用范围**

本规范适用于：

* OpenSoulMate 网关管控核心模块
* 所有 Agent 进程管理器
* 集群资源调度系统
* 分布式配置中心
* 系统监控、健康检查、故障自愈模块

本协议**仅用于系统运维与底层管控**，不承载任何用户会话、业务任务、Agent 协同逻辑。

**0.3 三层协议严格隔离规范**

* **ACP（人机业务层）**：用户 ↔ Agent 会话、问答、流式输出、人工审批（业务面）
* **A2A（集群协同层）**：Agent ↔ Agent 任务委派、子任务调度、工件同步（协同面）
* **MCP（底层管控层）**：进程启停、资源限制、配置变更、健康巡检、运维审计（管控面）

三层协议 **端口隔离、链路隔离、报文隔离、权限隔离、错误码隔离**，严禁跨协议混用通道、转发消息、越权操作。

**0.4 协议基础约束**

* 底层标准：严格兼容 JSON‑RPC 2.0
* 字符编码：统一 UTF‑8
* 管控长连接通道：ws://127.0.0.1:8092/ws/mcp
* 运维 HTTP 兜底通道：http://127.0.0.1:8092/admin/mcp
* 安全策略：所有 MCP 请求必须携带合法 control\_token，禁止匿名访问
* 通信模型：管控端主动下发、节点被动响应、状态主动上报

**1. 基础报文结构定义**

**1.1 管控请求报文（管控端 → Agent 节点）**

所有运维操作必须携带唯一请求 ID

|  |
| --- |
| json {  "jsonrpc": "2.0",  "id": "",  "method": "mcp/xxx/xxx",  "params": {  "control\_token": "",  "target": "agent|gateway|system|resource"  } } |

**1.2 管控响应报文（Agent 节点 → 管控端）**

响应 ID 必须与请求一一对应

|  |
| --- |
| json {  "jsonrpc": "2.0",  "id": "",  "result": {  "success": true,  "code": 0,  "msg": "",  "data": {}  } } |

**1.3 系统事件推送报文（节点主动上报）**

进程状态、资源告警、配置变更、故障事件统一入口

|  |
| --- |
| json {  "jsonrpc": "2.0",  "method": "mcp/system/event",  "params": {  "agent\_id": "",  "node\_id": "",  "event\_level": "info|warn|error|fatal",  "event\_type": "",  "payload": {}  } } |

**1.4 错误报文标准格式**

|  |
| --- |
| json {  "jsonrpc": "2.0",  "id": "",  "error": {  "code": 0,  "message": "",  "data": {}  } } |

**2. 标准 MCP 运维 RPC 方法全集**

**2.1 mcp/agent/start 启动 Agent 实例**

**用途**：管控端拉起指定 Agent 进程，初始化资源配额、绑定配置版本、开启保活策略

请求：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":1,  "method":"mcp/agent/start",  "params":{  "control\_token":"",  "agent\_id":"hermes|soulmate|opencode|openclaw",  "node\_id":"node-xxxx",  "resource\_quota":{  "cpu":1.0,  "memory\_mb":2048  },  "config\_version":"v1.0",  "auto\_restart":true  } } |

响应：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":1,  "result":{  "success":true,  "instance\_id":"inst-xxxx",  "pid":12345,  "status":"starting"  } } |

**2.2 mcp/agent/stop 停止 Agent 实例**

**用途**：支持优雅停机与强制停机，安全回收资源、终止会话与任务

请求：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":2,  "method":"mcp/agent/stop",  "params":{  "control\_token":"",  "instance\_id":"inst-xxxx",  "stop\_mode":"graceful|force",  "timeout":10000  } } |

**2.3 mcp/config/reload 配置热更新**

**用途**：不重启进程，动态加载权限、模型、路由、风控配置，支持预演校验

请求：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":3,  "method":"mcp/config/reload",  "params":{  "control\_token":"",  "instance\_id":"inst-xxxx",  "update\_keys":[],  "new\_config":{},  "dry\_run":false  } } |

**2.4 mcp/health/check 健康巡检**

**用途**：管控端定时探测节点存活、依赖连通性、任务堆积、异常状态

请求：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":4,  "method":"mcp/health/check",  "params":{  "control\_token":"",  "instance\_id":"inst-xxxx"  } } |

**2.5 mcp/monitor/report 资源指标上报**

**用途**：Agent 周期性主动上报负载、内存、CPU、任务数，用于集群调度与告警

请求：

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":5,  "method":"mcp/monitor/report",  "params":{  "control\_token":"",  "instance\_id":"inst-xxxx",  "metrics":{  "cpu\_usage":0.0,  "mem\_used\_mb":0,  "task\_active\_count":0  }  } } |

**2.6 mcp/system/restart 网关 / 系统重启**

**用途**：底层网关服务重启、热重载，仅限管理员管控通道

**3. MCP 标准系统事件清单**

* agent.started：Agent 启动完成就绪
* agent.stopped：Agent 正常停机完成
* agent.crash：进程异常崩溃
* config.updated：配置热更新成功生效
* config.failed：配置加载失败
* resource.warn：资源接近阈值
* resource.overflow：资源超限触发保护
* health.pass：健康检查正常
* health.fail：健康检查异常

**4. MCP 强制管控规范**

1. **所有底层运维操作，仅允许通过 MCP 通道执行**
2. ACP、A2A 业务通道禁止任何进程启停、资源修改、配置变更操作
3. 所有 MCP 操作必须留存审计日志、操作人、时间戳、变更快照
4. 资源超限自动触发限流、冻结、自愈重启，防止集群雪崩
5. 配置上线必须支持预演，禁止非法配置直接注入运行环境
6. MCP 管控权限独立于业务 RBAC，属于最高运维权限体系

**5. 依赖关联规范**

* 权限体系：OpenSoulMate\_Auth&RBAC\_v1.0\_身份认证与 RBAC 权限体系规范
* 错误体系：OpenSoulMate\_ErrorCode\_v1.0\_全局统一错误码注册表
* 日志追踪：OpenSoulMate\_Log&Trace\_v1.0\_全局日志与全链路追踪规范
* 部署规范：OpenSoulMate\_Deployment\_v1.0\_部署打包与环境适配规范

**6. 版本信息**

* 规范版本：v1.0
* 状态：定稿冻结
* 生效时间：2026-09-02
* 兼容策略：首版冻结，后续迭代向下兼容，不做破坏性变更

|（注：部分内容可能由 AI 生成）