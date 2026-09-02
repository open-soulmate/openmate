OpenMateACPv1.0完整协议规范（Agent

ControlProtocol）

OpenMateACPv1.0完整协议规范（定稿）

0.总览&定位

0.1协议全称

ACP（AgentControlProtocol）

⼈机控制协议：⽤于Human↔Agent/Host↔Agent双向可控会话通信

0.2核⼼定位（与A2A严格隔离）

ACP=⼈机通道：会话、流式输出、⼈⼯审批、状态展⽰、⽤⼾⼲预

A2A=智能体对等协作通道：任务委派、⼦任务、Artifact、SSE、多Agent调度

永远不混⽤：⼈操作Agent⾛ACP，Agent调Agent⾛A2A

0.3传输层规范

底层标准：JSON-RPC2.0严格合规

WebSocket链路： ws://127.0.0.1:8092/ws/acp （唯⼀标准⼊⼝）

⼦进程stdio链路：NDJSON换⾏分隔（⼀⾏⼀帧JSON-RPC）

⽇志隔离：stdout=协议流，stderr=⽇志，禁⽌混写

0.4架构（⽅案A最终定型）

前端：原⽣发送ACPJSON-RPC（彻底废弃LegacyJSON）

ACPGateway(8092)：纯路由、鉴权、会话管理、透传⽆协议翻译

下游全部统⼀ACP：

SoulMateEngine(8787)：原⽣ACP

Hermes/OpenClaw：原⽣完整ACP⽀持（开箱即⽤）

OpenCode：轻量ACPAdapter适配

1.基础报⽂结构（强制标准）

•••••••••◦◦◦1.1请求报⽂（Client→Agent，必须带 id ）

代码块

1

2

3

4

5

6

{

  "jsonrpc": "2.0",

  "id": number | string,

  "method": "xxx/xxx",

  "params": {}

}

1.2响应报⽂（Agent→Client，对应 id ）

代码块

1

2

3

4

5

{

  "jsonrpc": "2.0",

  "id": number | string,

  "result": {}

}

1.3事件通知报⽂（Agent→Client，⽆id，纯推送）

ACP所有流式、状态、审批、⽇志统⼀⾛该通知：

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

{

  "jsonrpc": "2.0",

  "method": "session/event",

  "params": {

    "session_id": "string",

    "event_type": "string",

    "payload": {}

  }

}

1.4错误报⽂

代码块

1

2

3

4

{

  "jsonrpc": "2.0",

  "id": number | string | null,

  "error": {

5

6

7

8

9

    "code": number,

    "message": "string",

    "data": {}

  }

}

2.全部标准RPC⽅法（Client→Agent/Gateway）

2.1 session/create 创建会话

⽤途：初始化Agent会话、绑定agent_id、分配session上下⽂

请求：

代码块

1

2

3

4

5

6

7

8

{

  "jsonrpc":"2.0","id":1,

  "method":"session/create",

  "params":{

    "agent_id":"hermes | soulmate | opencode | openclaw",

    "metadata":{}

  }

}

响应：

代码块

1

2

3

4

5

6

7

8

{

  "jsonrpc":"2.0","id":1,

  "result":{

    "session_id":"sess-xxxx",

    "agent_id":"hermes",

    "created_at":1234567890

  }

}

2.2 session/prompt 发送⽤⼾消息（主交互⼊⼝）

请求：

代码块

1

2

{

  "jsonrpc":"2.0","id":2,

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

  "method":"session/prompt",

  "params":{

    "session_id":"sess-xxxx",

    "message":{

      "role":"user",
      "content":"⽤⼾输⼊⽂本",
      "parts":[{"type":"text","text":"⽤⼾输⼊⽂本"}]
    }

  }

}

2.3 session/approval ⼈⼯审批结果回传（ACP核⼼）

⽤途：前端审批弹窗确认/拒绝后回传给Agent，恢复/终⽌任务

请求：

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

{

  "jsonrpc":"2.0","id":3,

  "method":"session/approval",

  "params":{

    "session_id":"sess-xxxx",

    "request_id":"req-xxxx",

    "action":"approve | reject",

    "comment":""

  }

10

}

2.4 session/close 关闭会话、销毁实例

请求：

代码块

1

2

3

4

5

{

  "jsonrpc":"2.0","id":4,

  "method":"session/close",

  "params":{"session_id":"sess-xxxx"}

}

3.全部标准Event事件（Agent→Client）

统⼀⼊⼝： method: session/event 

3.1 agent.message 流式⽂本输出

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

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"agent.message",
    "payload":{"chunk":"⽂本增量⽚段"}
  }

}

3.2 human.approval.required 申请⼈⼯审批（ACP最强能⼒）

Agent遇到⾼危操作主动暂停，挂起任务，等待⼈⼲预

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

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"human.approval.required",

    "payload":{

      "request_id":"req-xxxx",

      "tool_name":"browser | shell | write_file | delete_file",

      "risk_level":"low | medium | high",
      "description":"即将执⾏的⾼危操作说明"
    }

  }

}

3.3 agent.tool_call ⼯具调⽤触发事件

代码块

1

2

3

4

5

6

7

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"agent.tool_call",

    "payload":{"tool":"string","args":{}}

8

9

  }

}

3.4 agent.state.update SKILL.state结构化状态同步

对接你SKILL.state⻓时序状态机

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

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"agent.state.update",

    "payload":{"state":{},"state_patch":{}}

  }

}

3.5 session.completed 任务正常结束

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

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"session.completed",

    "payload":{}

  }

}

3.6 session.error 会话异常

代码块

1

2

3

4

5

6

7

{

  "jsonrpc":"2.0",

  "method":"session/event",

  "params":{

    "session_id":"sess-xxxx",

    "event_type":"session.error",
    "payload":{"code":int,"msg":"错误信息"}

8

9

  }

}

4.错误码规范（ACP全局统⼀）

错误码

-32600

-32601

-32602

-32001

-32002

-32003

-32004

-32005

含义

⽆效请求

⽅法不存在

参数⾮法

鉴权失败

Session不存在/已过期

Agent进程异常

审批被拒绝

任务超时

5.各AgentACP⽀持现状（真实适配度）

5.1原⽣完整⽀持ACPv1.0

Hermes：完整标准ACP、stdioNDJSON、session⽣命周期、审批、流式、state同步

OpenClaw：同Hermes，零改造直接接⼊

5.2已有ACP、⽆需改造

SoulMateAgentEngine(8787)：原⽣ACPJSON-RPC

5.3需要轻量适配层

OpenCode：内部编码逻辑不变，外层套ACPAdapter即可对⻬标准

6.最终架构链路（⽅案A定稿）

代码块

1

2

3

4

前端（原⽣ACP JSON-RPC）
        ↓ ws://8092/ws/acp
ACP Gateway 8092（⽆翻译、纯标准路由）
        ├ agent_id=soulmate → 转发 8787 ACP

••••5

6

7

8

9

10

        ├ agent_id=hermes → spawn 原⽣ACP⼦进程
        ├ agent_id=openclaw → spawn 原⽣ACP⼦进程
        └ agent_id=opencode → spawn ACP-Adapter⼦进程

# Agent内部跨协作（永远不⾛ACP）
Hermes → A2A协议 → OpenCode / OpenClaw

7.新旧彻底切割规则

1. 彻底废弃LegacyJSON，⽹关不再维护翻译层

2. 所有新功能、新客⼾端、新Agent只兼容本ACPv1.0

3. ACP只做⼈机控制

4. A2A只做Agent对等委派、Task/Artifact/SSE

5. 双向完全解耦、协议⼲净、可商业化、可对外标准化输出

8.版本声明

协议版本：OpenMateACPv1.0Final

⽣效时间：2026-09-02

兼容：HermesACP/ZeroClawACP⽣态

状态：冻结定稿，后续增量不破坏兼容

（注：部分内容可能由AI⽣成）

••••
