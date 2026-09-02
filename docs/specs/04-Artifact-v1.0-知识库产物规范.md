OpenSoulMateArtifactv1.0全局⼯件规范

（定稿冻结）

0.规范总览

0.1定位

Artifact（智能体⼯件）：OpenSoulMate全⽣态唯⼀标准产出物模型。

所有Agent推理、⼯具执⾏、任务委派、⽂件⽣成、代码产出、⽂档报告、截图⽇志，统⼀封装为

Artifact。

0.2核⼼作⽤

A2A跨Agent协作唯⼀数据载体（任务结果、⼦任务产物、资源同步）

ACP会话可展⽰、可追溯、可审批的实体

MCP资源管控、存储配额、⽂件⽣命周期管理对象

0.3层级依赖

依赖协议： A2A v1.0 、 ACP v1.0 

下游依赖：⽇志、存储、权限、SKILL.state状态机

全系统唯⼀产物标准，禁⽌⾃定义私有产出结构

0.4版本状态

版本： v1.0 Final 

状态：冻结定稿，所有增量兼容，不破坏字段

⽣效时间：2026-09-02

1.核⼼定义

Artifact：由智能体/⼯具⽣成的可序列化、可追溯、可流转、可持久化、可版本化的结构化产物。

三⼤特征：

1. 全局唯⼀ID：全系统可寻址

2. 强类型：固定类型枚举，杜绝随意格式

•••••••••3. 可溯源：绑定task_id/session_id/agent_id/parent_id

2.Artifact顶层标准Schema（强制）

所有⼯件必须严格遵守，⽆例外。

代码块

1

2

3

4

5

6

7

8

9

10

11

12

13

14

15

16

17

18

19

20

{

  "artifact_id": "art-xxxxxxxx",

  "parent_artifact_id": "art-xxxxxxxx | null",

  "type": "enum",

  "sub_type": "string",

  "mime": "string",

  "version": "1.0.0",

  "hash_sha256": "string",

  "size_bytes": number,

  "owner_agent": "string",

  "create_time": 1720000000000,

  "update_time": 1720000000000,

  "session_id": "sess-xxxx | null",

  "task_id": "task-xxxx | null",

  "state": "active | archived | deleted",

  "readonly": true | false,

  "content": {},

  "preview": "string",

  "meta": {}

}

字段强制说明

字段

必填

说明

artifact_id

parent_artifact_id

type

sub_type

mime

✅

❌

✅

✅

✅

全局唯⼀雪花ID，art-前缀

派⽣⼯件、补丁、迭代产物溯

源⽗ID

⼀级⼤类枚举（固定）

业务细分类型

标准MIME类型

version

hash_sha256

size_bytes

owner_agent

create_time

update_time

session_id

task_id

state

readonly

content

preview

meta

✅

✅

✅

✅

✅

✅

❌

❌

✅

✅

✅

✅

✅

语义化版本

内容哈希，防篡改、去重

字节⼤⼩，⽤于MCP资源配

额

产出AgentID

毫秒时间戳

最后修改时间

归属ACP会话

归属A2A任务

⽣命周期状态

是否禁⽌覆盖修改

真实内容体（结构化）

前端可预览摘要/⽚段

⾃定义标签、参数、上下⽂

3.Artifact全局类型枚举（固定不可增删主类型）

3.1⼀级Type全集

代码块

1

2

3

4

5

6

7

8

9

10

11

text

code

document

image

file

log

patch

report

data

config

state

3.2类型释义与适⽤Agent

code ：OpenCode专属（代码⽂件、项⽬结构、代码补丁）

patch ：增量变更、⽂件差异、代码修改块

document ：Markdown、协议⽂档、需求、总结

report ：任务报告、执⾏分析、巡检报告

image ：浏览器截图、OCR图、可视化图

file ：任意⼆进制/附件

log ：任务⽇志、⼯具⽇志、异常栈

state ：SKILL.state结构化状态快照

config ：系统配置、Agent配置、热更新配置

data ：结构化数据JSON/CSV

4.标准内容体规范（content结构标准化）

4.1code类型（OpenCode强制）

代码块

1

2

3

4

5

6

7

{

  "filename": "main.py",

  "lang": "python",

  "code": "...",

  "lines": 120,

  "is_complete": true

}

4.2patch类型（增量更新标准）

代码块

1

2

3

4

5

6

{

  "target_file": "xxx.py",

  "patch": "diff content",

  "patch_type": "add | remove | modify",

  "apply_success": false

}

••••••••••4.3document/report

代码块

1

2

3

4

5

6

{

  "format": "markdown",

  "title": "",

  "content": "",

  "toc": []

}

4.4state类型（对接SKILL.state）

代码块

1

2

3

4

5

6

{

  "sigma": {},

  "sigma_patch": {},

  "skill_name": "",

  "step": 0

}

4.5log类型

代码块

1

2

3

4

5

6

{

  "level": "info/warn/error",

  "trace_id": "",

  "message": "",

  "stack": ""

}

5.Artifact⽣命周期状态机（严格不可乱改）

5.1状态枚举

active ：正常可⽤

archived ：归档只读，可查看不可改

deleted ：逻辑删除（保留索引，清除内容）

•••5.2状态流转规则

代码块

1

2

3

4

active → archived（⼈⼯归档/任务结束）
active → deleted（删除）
archived → active（可恢复）
deleted → 不可恢复

6.A2A协议联动规范

6.1任务产出必须返回Artifact列表

a2a/task/result 强制携带artifact_list:Artifact[]

6.2产物同步协议

a2a/artifact/sync 唯⼀同步⼊⼝

⽀持多Agent批量同步

⽀持按task_id/session_id批量拉取

7.ACP协议联动规范

7.1前端展⽰规则

所有Agent输出禁⽌裸⽂本

必须封装：

agent.message→普通⽂本Artifact

tool_call→⼯具⽇志Artifact

state_update→stateArtifact

7.2审批绑定

⾼危⼯具⽣成的Artifact⾃动绑定审批记录

8.MCP管控联动规范

8.1资源配额

•••••MCP根据 size_bytes 统计Agent磁盘占⽤、内存占⽤

8.2⾃动GC规则

临时Artifact：24h⾃动清理

会话绑定Artifact：session销毁7天后清理

核⼼报告/代码：永久保留

8.3防篡改

hash_sha256 ⽤于MCP校验完整性、检测⽂件篡改

9.寻址规范（全局统⼀URI）

所有⼯件全局可通过URI寻址：

代码块

1

artifact://{artifact_id}

⽀持：前端预览、Agent读取、MCP管理、A2A同步

10.版本与增量策略

1. 完整产物：version递增

2. 增量补丁：parent_artifact_id指向⽗产物

3. 所有修改必须产⽣新版本Artifact，禁⽌原地覆盖

11.权限规范

1. 产出Agent：完全读写

2. 同会话/同任务Agent：可读

3. 其他Agent：默认禁⽌访问，需MCP授权

12.禁⽌事项（红线）

1. ❌禁⽌Agent直接返回裸⽂本、裸JSON、裸代码（必须包Artifact）

•••2. ❌禁⽌⾃定义产出结构

3. ❌禁⽌⽆hash、⽆version、⽆owner的产物

4. ❌禁⽌跨Agent私⾃传递⽂件（必须⾛A2Aartifact/sync）

13.兼容与迁移

所有旧裸产出全部废弃

新代码强制Artifact标准化输出

过渡期：⽹关⾃动兼容解析旧内容转为临时Artifact

14.版本声明

规范版本：Artifactv1.0Final

体系归属：OpenSoulMate底层数据模型基座

冻结状态：永久稳定，增量扩展不破坏兼容

依赖协议：ACPv1.0/A2Av1.0/MCPv1.0

（注：部分内容可能由AI⽣成）

•••••••