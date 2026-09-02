# OpenSoulMate\_PromptStore\_v1\.0\_提示词仓库规范（定稿冻结）

# 0\. 总则

## 0\.1 规范目的

定义 OpenSoulMate 集群**全局统一 Prompt 仓库管理体系**，包含提示词模板标准化、版本管理、分类标签、变量渲染、权限隔离、租户私有/公共模板、缓存策略、热更新、A/B测试、调用溯源全套规范。

解决集群提示词散落硬编码、版本混乱、无法复用、无统一管控、租户提示词互相污染、渲染规则不统一、无法追溯调用记录、无法灰度迭代等问题，构建**可复用、可版本化、可隔离、可灰度、可审计、可热更新**的全局 AI 提示词资产底座。

## 0\.2 适用范围

- 全集群 Agent 智能体、模型网关、任务调度、知识库问答、插件系统的所有 Prompt 调用

- 公共全局提示词、租户私有提示词、项目专属提示词模板管理

- Prompt 模板 CRUD、版本迭代、回滚、发布、下架流程模块

- 模板变量解析、动态渲染、参数校验、内容脱敏模块

- Prompt 缓存、预热、命中率统计、性能优化模块

- Prompt A/B 灰度、优先级覆盖、模板冲突检测模块

- Prompt 调用日志、溯源、权限审计、用量统计模块

- 与 ModelGateway、EventBus、Plugin、Telemetry、Monitor 体系联动模块

## 0\.3 层级定位

- **上游**：Agent核心、业务服务、插件系统、调度中心、租户应用

- **下游**：ModelGateway模型网关、各类LLM推理服务

- **体系依赖**：ModelGateway模型网关、EventBus事件总线、Plugin插件系统、Telemetry遥测、Monitor监控、RBAC权限、Log\&Trace链路追踪

- **职责边界**：仅负责提示词资产托管、版本管理、动态渲染、权限管控、灰度发布、调用统计；**不参与模型推理、不执行业务决策逻辑**

## 0\.4 基础强制约束

1. 所有业务 Prompt **禁止代码硬编码**，必须统一托管至 PromptStore 仓库

2. Prompt 模板结构、变量语法、渲染规则、版本规则全局统一固化

3. 严格区分全局公共模板、租户私有模板、项目专属模板三层隔离

4. 所有 Prompt 调用必须绑定 TraceId，实现模板、版本、调用链路全溯源

5. 模板变更、发布、回滚、下架全部通过 EventBus 推送标准事件

6. 模板内容强制脱敏校验，禁止注入敏感、违规、越权内容

7. 模板优先级固化，多层模板冲突按固定优先级覆盖，杜绝随机覆盖

# 1\. 核心数据模型（全局固化）

## 1\.1 Prompt 模板主模型

```json
{
  "promptId": "prompt-xxxx",
  "promptKey": "agent.task.execute",
  "name": "Agent任务执行通用模板",
  "category": "agent|chat|qa|tool|system",
  "visibility": "public|namespace|private",
  "namespace": "proj-001",
  "version": "1.2.0",
  "latestStable": true,
  "priority": 50,
  "content": "",
  "variables": ["taskId", "userInput", "context", "history"],
  "description": "",
  "tags": ["official", "stable"],
  "status": "draft|published|deprecated|offline",
  "createAt": 1788000000,
  "updateAt": 1788000000
}
```

## 1\.2 Prompt 版本快照模型

```json
{
  "versionId": "prompt-ver-xxxx",
  "promptId": "prompt-xxxx",
  "version": "1.2.0",
  "contentSnapshot": "",
  "variableSnapshot": [],
  "changeLog": "优化上下文拼接逻辑",
  "operator": "admin",
  "traceId": "trace-xxxx",
  "createAt": 1788000000
}
```

## 1\.3 Prompt 调用渲染模型

```json
{
  "renderId": "prompt-render-xxxx",
  "traceId": "trace-xxxx",
  "promptId": "prompt-xxxx",
  "version": "1.2.0",
  "promptKey": "agent.task.execute",
  "namespace": "proj-001",
  "inputParams": {},
  "renderedContent": "",
  "costMs": 12,
  "cacheHit": true,
  "timestamp": 1788000000
}
```

## 1\.4 A/B 灰度规则模型

```json
{
  "abRuleId": "ab-xxxx",
  "promptKey": "agent.task.execute",
  "versionA": "1.1.0",
  "versionB": "1.2.0",
  "percentB": 30,
  "namespaceWhiteList": [],
  "enable": true,
  "startAt": 1788000000,
  "endAt": 1789000000
}
```

# 2\. 模板分类与可见性规范

## 2\.1 五大模板分类（固化）

- **agent**：智能体任务执行、规划、反思、拆解模板

- **chat**：通用对话、多轮记忆、闲聊应答模板

- **qa**：知识库问答、检索增强、溯源问答模板

- **tool**：工具调用、参数生成、函数匹配模板

- **system**：系统级底座、安全校验、兜底降级模板

## 2\.2 三级可见性隔离

- **public 公共模板**：全集群所有租户可见，官方标准基线模板

- **namespace 租户模板**：仅当前租户项目可见，跨租户隔离

- **private 私有模板**：仅创建人/指定角色可见，用于测试、定制调试

# 3\. 模板优先级覆盖规则（永久固化）

优先级数值越大越优先，同 Key 模板覆盖顺序：**私有模板\(90\) \> 租户自定义\(70\) \> 公共官方模板\(50\)**

禁止公共模板覆盖租户模板，保障租户定制化独立性。

# 4\. 变量与渲染语法规范

## 4\.1 标准变量语法

统一变量占位符：`{{varName}}`，禁止自定义 `${}`、`#var#` 等私有格式。

## 4\.2 强制渲染规则

- 缺失必填变量直接返回标准化参数错误，禁止带空变量进入模型请求

- 渲染自动去除首尾空行、多余空格，统一文本格式

- 内置时间、租户ID、集群环境等全局默认变量自动注入

- 渲染结果自动脱敏，拦截高危指令、越权提示、越狱提示

# 5\. 版本管理与发布规范

## 5\.1 版本号规则

采用 `主版本.次版本.修订号`语义化版本：

- 主版本：结构性变更、不兼容改造

- 次版本：能力新增、逻辑优化

- 修订号：文案微调、Bug修复

## 5\.2 发布生命周期

草稿编辑 → 语法校验 → 渲染测试 → 灰度发布 → 全量稳定 → 废弃下线

所有发布、回滚、下线操作永久留存版本快照，支持任意历史版本回溯。

# 6\. 缓存与性能规范

- 稳定模板默认开启内存缓存\+磁盘持久缓存，降低渲染耗时

- 模板更新自动失效对应缓存，保证一致性

- 高频内置模板支持预热加载，冷启动零延迟可用

- 统计缓存命中率、渲染耗时、失败率，接入监控告警

# 7\. A/B 灰度测试规范

- 支持按流量百分比、租户白名单、时段灰度新版本模板

- 灰度期间双版本并行统计效果、耗时、成功率、回答质量

- 数据达标后一键全量切换，异常自动回滚至稳定版本

# 8\. 事件联动与插件钩子规范

## 8\.1 标准 EventBus 事件

- `prompt/create/update/delete` 模板变更事件

- `prompt/publish/rollback/deprecate` 版本发布事件

- `prompt/render/success/fail` 渲染执行事件

## 8\.2 插件钩子点位

- `prompt.before.render` 渲染前参数校验、内容预处理

- `prompt.after.render` 渲染后内容过滤、日志归档

# 9\. 权限与审计规范

- 模板查看、版本查询、调用记录查询：只读权限

- 租户模板新建、编辑、灰度发布：租户运维权限

- 公共官方模板审核、全量下线、全局规则配置：管理员权限

- 所有模板变更、渲染、灰度、回滚操作全量审计、TraceId 溯源、永久留存

# 10\. 可观测与指标规范

- 模板渲染 QPS、成功率、P95 渲染耗时

- 缓存命中率、缺失次数

- 各版本调用占比、灰度流量分布

- 模板错误、参数缺失、脱敏拦截次数

# 11\. 版本信息

- 规范版本：v1\.0

- 状态：定稿冻结

- 生效时间：2026\-09\-02

- 兼容策略：核心模型、渲染语法、优先级规则、可见性体系永久冻结，支持新增分类与扩展字段增量迭代

> （注：部分内容可能由 AI 生成）
