**OpenSoulMate\_TaskScheduler\_v1.0\_任务调度中心规范（定稿冻结）**

**0. 总则**

**0.1 规范目的**

定义 OpenSoulMate 全集群统一任务调度标准，规范 **任务接收、排队策略、依赖解析、Worker 负载派发、状态机流转、超时管控、失败重试、持久化归档** 全流程机制。

作为集群异步协同底座，统一跨模块任务编排逻辑，彻底解决任务堆积、死锁、重复执行、依赖错乱、状态不一致问题，稳定支撑 A2A 智能体协同、RAG 知识库流水线、批量向量化、后台运维作业。

**0.2 适用范围**

* 全局任务调度中心主服务
* 分布式 Worker 工作节点集群
* A2A 跨智能体任务委派模块
* 向量引擎批量处理任务
* Artifact 文档批量导入、解析、快照任务
* MCP 底层运维启停、配置重载任务
* 系统所有异步、定时、批量后台作业模块

**0.3 层级定位**

* **上游依赖**：ACP 人机会话、A2A 集群协同、MCP 系统管控、Artifact 工件服务、Vector 向量引擎
* **下游支撑**：全业务异步作业执行
* **体系依赖**：RBAC 权限鉴权、全局错误码、全链路日志追踪
* **数据隔离**：任务数据独立持久化，与业务数据完全解耦

**0.4 基础强制约束**

* 全局编码：统一 UTF-8
* 任务 ID：全局唯一 task-xxxxxxxx 格式
* 状态机：单向闭环流转，禁止非法状态跳转
* 调度模式：支持普通单任务、DAG 依赖编排任务
* 资源隔离：任务配额绑定项目、Agent 身份，杜绝资源抢占

**1. 核心数据模型**

**1.1 标准任务结构体**

|  |
| --- |
| json {  "taskId": "task-xxxx",  "parentTaskId": "",  "projectId": "",  "ownerAgentId": "",  "taskType": "vector\_embed|a2a\_invoke|artifact\_import|mcp\_ops",  "status": "pending|running|success|failed|cancelled|timeout",  "priority": 2,  "dependencies": ["task-001","task-002"],  "payload": {},  "result": {},  "error": {},  "retryCount": 0,  "maxRetry": 2,  "timeout": 300,  "createdAt": 1788000000,  "startedAt": null,  "finishedAt": null } |

**1.2 任务状态机定义**

* pending：任务入队完成，等待调度派发
* running：已分配 Worker，正在执行中
* success：任务执行完毕，结果正常归档
* failed：执行异常，可触发自动重试逻辑
* cancelled：人工 / 系统主动取消，任务终止作废
* timeout：执行超时，强制终止并标记失败

**1.3 任务优先级分级（数值越小优先级越高）**

* 0：最高优先级，紧急运维、故障自愈任务
* 1：高优先级，ACP 实时会话同步、即时推理任务
* 2：默认优先级，常规 A2A 协同、检索、调用任务
* 3：低优先级，批量知识库处理、离线统计、后台归档任务

**2. 标准 RPC 接口全集**

**2.1 scheduler/task/submit 提交异步任务**

**用途**：所有业务模块统一任务入口

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":1,  "method":"scheduler/task/submit",  "params":{  "projectId":"",  "ownerAgentId":"",  "taskType":"",  "priority":2,  "dependencies":[],  "payload":{},  "maxRetry":2,  "timeout":300  } } |

**2.2 scheduler/task/query 查询任务详情与状态**

**用途**：业务轮询、进度展示、结果获取

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":2,  "method":"scheduler/task/query",  "params":{  "taskId":""  } } |

**2.3 scheduler/task/cancel 取消排队 / 运行中任务**

**用途**：人工终止、会话销毁、任务作废

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":3,  "method":"scheduler/task/cancel",  "params":{  "taskId":""  } } |

**2.4 scheduler/worker/heartbeat Worker 心跳上报**

**用途**：调度中心感知节点存活、负载状态

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":4,  "method":"scheduler/worker/heartbeat",  "params":{  "workerId":"",  "load":0.6,  "runningTaskIds":[]  } } |

**3. 核心调度策略规范**

**3.1 DAG 依赖调度**

存在前置依赖任务时，**所有依赖任务必须为 success 状态**，当前任务才可派发；依赖失败 / 取消，当前任务直接终止，不执行。

**3.2 负载均衡策略**

自动筛选集群负载最低、在线健康的 Worker 节点派发任务，最大化集群吞吐。

**3.3 优先级调度**

高优先级任务**插队入队**，仅影响排队顺序，不抢占正在运行的任务，保证任务执行稳定性。

**3.4 自动重试规则**

仅系统级、网络级、可重试异常触发重试；**业务校验失败、权限失败、参数错误禁止重试**。

**3.5 超时管控**

任务超时后自动回收 Worker 资源，标记为 timeout 状态，终止后续执行，避免线程永久阻塞。

**4. 资源配额与限流规范**

1. 按 **Project 维度** 配置最大并发任务数，防止单项目占用全部集群资源
2. 单 Worker 节点设置最大并发上限，避免节点过载崩溃
3. 工作池满载时，新任务直接抛出 WORKER\_POOL\_FULL 限流错误

**5. 异常错误规范**

严格依从全局错误码规范：

* 80001 WORKER\_POOL\_FULL：工作池已满，任务排队溢出
* 80002 DEPENDENCY\_NOT\_READY：前置依赖任务未就绪，无法调度

**6. 体系依赖规范**

* 权限体系：OpenSoulMate\_Auth&RBAC\_v1.0
* 错误体系：OpenSoulMate\_ErrorCode\_v1.0
* 日志追踪：OpenSoulMate\_Log&Trace\_v1.0
* 业务依赖：ACP / A2A / MCP / Artifact / Vector 全模块

**7. 版本信息**

* 规范版本：v1.0
* 状态：定稿冻结
* 生效时间：2026-09-02
* 兼容策略：核心结构永久稳定，任务类型仅增量扩展，无破坏性变更

|（注：部分内容可能由 AI 生成）