# AgentScope (modelscope) 功能研究

研究时间：2026-09-16 深夜轮（cron）
GitHub: https://github.com/modelscope/agentscope （Apache-2.0，Python，#54，31.5k★）
研究方式：codeload tarball（main分支，19MB）源码逐一阅读核心模块
注：AgentScope已重写为v2（原v1的AgentBase/RPCAgent分布式已演进），当前src/agentscope/为v2架构

## 架构概述
AgentScope v2是一个**生产级多agent应用框架**，模块高度正交：
- **agent/**：核心Agent + realtime语音agent + A2A agent
- **sop/**：标准操作流程引擎（executor+verifier双角色步骤，attempt预算，HITL停车/恢复）
- **permission/**：Claude-Code式工具权限系统（5模式+规则引擎848行）
- **workspace/**：8种沙箱后端统一抽象（docker/e2b/daytona/k8s/applecontainer/bubblewrap/opensandbox/local）
- **middleware/**：加权token预算、长期记忆、RAG、tracing、TTS中间件
- **event/**：30+事件类型的细粒度流式事件模型（含HITL事件）
- **rag/**：分块器+多格式解析器(pdf/word/excel/ppt/image)+4种向量库
- **app/**：完整服务端（hub/message_bus/channel IM适配器/workspace_manager/access/storage）
- **credential/**：10+provider凭证工厂

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **SOP引擎（步骤=executor+verifier）**：每步执行者做活+验证者打分，max_attempts耗尽才FAILED，engine只看SOPStepRunState不看内部 | ❌无 | 部分：ai_engine有verifier角色(gpt-4o验证门控)但是任务分解级，非步骤级verify-retry | 部分有 | 高价值。把will/dag_planner的节点升级为"执行+验证"双agent，验证不过带反馈重试N次。SOPStepRunState(151行pydantic)可整体移植 |
| 2 | **SOP停车/恢复（HITL）**：AWAITING态=parked，事件流自然结束不挂起，带UserConfirmResult回来从state续跑 | ❌无 | ❌无（will/无park/resume） | 完全没有 | P0。与之前HITL五方互证(MCP elicitation/Flowise/SuperAGI/DeerFlow/ms-agent-fw)一致。"stream结束但state可续"是关键——不占进程 |
| 3 | **权限5模式+规则引擎**：DEFAULT/ACCEPT_EDITS/EXPLORE/BYPASS/DONT_ASK；规则tool_name+rule_content(Bash子串/Write-Read glob)+behavior(allow/deny/ask/passthrough)+source分层 | ❌无 | ❌无（immune只有casbin用户级RBAC，无工具/路径级） | 完全没有 | P0安全。与claude-code 6模式/AgentVerse/Roo-Code互证。EXPLORE只读模式对售前"先看不动"极有用 |
| 4 | **多后端workspace抽象**：8种沙箱(docker/e2b/daytona/k8s/applecontainer/bubblewrap/opensandbox/local)统一BaseSandbox协议 | ❌无 | ❌无（mirror/sandbox.py目录级假沙箱） | 完全没有 | 与E2B/Daytona研究结论一致。BaseSandbox协议值得抄——一个execute()+upload抽象跑遍所有后端 |
| 5 | **offload协议**：base64 DataBlock→持久化到workspace://URL；压缩context→workspace存储 | ❌无 | ❌无 | 完全没有 | 工具结果外置第六方互证(DeerFlow/DeepAgents/ODR/goose/jina/AgentScope)。"大对象转workspace://引用" |
| 6 | **加权token预算中间件**：cost=in_w*input+out_w*output累计超budget→注入system-reminder+强制tool_choice=none收尾；state存middle_context跨HITL存活 | ❌无 | 部分：hippo有token_budget上下文注入(非逐reply收尾控制) | 部分有 | 高价值。与goose turn_budget注入互证。"预算低→强制收尾不调工具"是长任务质量关键 |
| 7 | **细粒度流式事件模型**：ReplyStart/End+ModelCall+TextBlock/Datablock/ThinkingBlock/ToolCall/ToolResult各Start/Delta/End三态+HITL事件 | ❌部分前端流式 | ❌无（event_stream.py基本SSE，无block级delta） | 完全没有 | OpenMate前端可对齐此事件粒度做"逐块渲染+思考过程+工具调用流"。可观测性地基 |
| 8 | **RAG解析器全家桶**：pdf/word/excel/ppt/image解析+approx_token分块+4向量库(ES/milvus_lite/mongodb/qdrant) | ❌无 | 部分：config有Qdrant(单一)，cortex/graphrag.py概念 | 部分有 | OpenSoul已有Qdrant。补多格式解析器(pdf/ppt/office)对政企文档刚需 |
| 9 | **凭证工厂**：10+provider独立credential类(anthropic/dashscope/deepseek/gemini/kimi/moonshot/ollama/openai/volcengine/xai) | 部分多provider | 部分：.env多key | 部分有 | 已有类似。价值在volcengine/dashscope/moonshot等国产provider适配(OpenSoul可补) |
| 10 | **实时语音多transport**：dashscope/gemini/openai/xai四家Realtime+VAD+playout+aggregator | ❌无 | 部分：src/voice/tts_engine.py(离线TTS非实时) | 部分有 | 与openai-agents-js Realtime三transport互证。语音是OpenMate可选差异化 |
| 11 | **消息总线双实现**：in_memory + redis pub/sub，统一MessageBus协议 | ❌无 | ❌无 | 完全没有 | 后台作业/事件广播地基。与langfuse BullMQ/n8n队列互证。OpenSoul零后台队列 |
| 12 | **IM渠道适配器**：dingtalk/discord/feishu统一channel抽象+credential_binding+dispatcher+routing | 部分gateway | 部分：link/connector | 部分有 | OpenSoul已有gateway多平台。AgentScope的credential_binding(渠道↔凭证绑定)值得参考 |
| 13 | **结构化输出工具**：_structured_output_tool.py 强制reply以pydantic schema收尾 | ❌无 | 部分：cortex有结构化概念 | 部分有 | 每步SOP可用structured_schema约束输出，配合verifier |
| 14 | **A2A agent协议**：_a2a_agent.py + state/a2a_state.py | ❌无 | 部分：src/a2a/task_manager.py已有 | 部分有 | OpenSoul已有a2a。可对照AgentScope实现补全 |
| 15 | **skill本地加载器**：skill/local_loader.py | ✅OpenMate skills/ | 部分：gene/skill_learner.py | 部分有 | 已有类似 |
| 16 | **Dockerfile模板生成**：_make_dockerfile.py + node_from/node_copy模板 | ❌无 | ❌无 | 完全没有 | 沙箱镜像按需构建，配合workspace后端 |

## 源码亮点
1. **SOP的"停车不挂起"哲学**（sop/_engine.py 174行 + _state.py 151行）：HITL时事件流直接结束，不保留进程/协程，需要人时回来带`UserConfirmResultEvent`从持久化的`SOPRunState`续跑。这比"挂起等待"省内存且天然支持断点续跑——是OpenSoul will/最缺的骨架。
2. **PermissionEngine 848行**：Claude-Code权限系统的Python完整复刻。规则匹配按tool类型分流（Bash子串、Write/Read glob、其他tool自定义），source分层（userSettings/projectSettings）决定优先级。**这是OpenSoul从"用户级casbin"升级到"工具/路径级权限"的完整参考实现**。
3. **Middleware stateless + middle_context**：预算中间件实例本身无状态，所有运行时状态存`agent.state.middle_context`（按middleware key），同一中间件实例可跨多agent共享，且跨HITL中断存活。工程范式优雅。
4. **workspace/BaseSandbox统一协议**：8种后端(docker/e2b/daytona/k8s/applecontainer/bubblewrap/opensandbox/local)同一接口。与deepagents"BaseSandbox只需execute()+upload"互证——OpenSoul做真沙箱时照此抽象，后端可插拔。
5. **event模型的三态delta**：每个block(text/thinking/tool_call/tool_result/data)都有Start/Delta/End三事件——前端可做真正的逐token流式渲染+思考链可视化，这是"我都不知道他们在干嘛"的事件层地基。

## 可复用设计（针对OpenSoul）
- **SOPStepRunState + SOPEngine**（最高价值）：把will/dag_planner升级为"executor+verifier+attempt预算+park/resume"。pydantic state(151行)可整体移植为`will/sop_state.py`。
- **PermissionEngine**：移植为`immune/permission_engine.py`，5模式+规则匹配，替换/补充casbin。先支持Bash子串+文件glob两种规则即可覆盖80%场景。
- **ReplyBudgetControlMiddleware**：~80行，"超预算→tool_choice=none强制收尾"，可直接进cortex循环。
- **offload协议**：大工具结果/workspace对象转`workspace://`引用，进acp-proxy或cortex工具结果处理层。
- **MessageBus(in_memory+redis)**：后台队列地基，评估/摄入/导出异步化的前提。

## 与既有研究的互证
- **HITL停车**：AgentScope SOP = 第六方（MCP elicitation/Flowise/SuperAGI/DeerFlow/ms-agent-fw/AgentScope）
- **工具权限**：AgentScope permission = 第N方（claude-code 6模式/AgentVerse/Roo-Code/AgentScope）
- **工具结果外置**：AgentScope offload = 第六方
- **token预算收尾**：AgentScope budget + goose turn_budget = 二方
- **真沙箱**：AgentScope workspace + E2B/Daytona/deepagents BaseSoul = 多方
