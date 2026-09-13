# AgentScope 架构深度研究报告

> 仓库: https://github.com/agentscope-ai/agentscope（原 modelscope/agentscope）  
> 版本快照: main · AgentScope 2.0 · Commits 575  
> 星数: ~31.5k · Fork ~3.5k  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 ReAct 中间件栈、Permission/HITL、Workspace 沙箱、事件总线、多租户 Agent Service 借鉴  
> License: Apache-2.0

---

## 0. 元信息与现状

| 项 | 值 |
|---|---|
| 语言 | Python 3.11+（uv） |
| 定位 | 生产向 Agent 框架：「Build and run agents you can see, understand and trust」 |
| 核心理念 | 随模型能力提升而放宽编排，而非强 prompt 约束 |
| 服务 | FastAPI backend + Web UI（examples/web_ui，pnpm） |
| 集成 | MCP Hub（GitHub MCP Registry、ClawHub）· A2A · Realtime voice · Feishu/Discord/DingTalk |

> 对 openmate：AgentScope 2.0 的 **Permission & HITL**、**Context compaction/offload 中间件**、**多后端 Workspace 沙箱**、**Event System 流式** 与 openmate 个人助手需求高度对齐，是 P0 级借鉴源。

---

## 1. 系统架构

### 1.1 顶层模块图（SDK 层）

```
┌──────────────────────────────────────────────────────────┐
│  Agent（src/agentscope/agent/）                           │
│   ReAct 循环 · 结构化输出 · 中断/恢复 · 批量 tool acting │
├──────────────────────────────────────────────────────────┤
│  Toolkit（tool/）  模型（model/）  Context（middleware/）  │
│  Event（event/）   Permission（permission/）              │
│  Memory（skill/ + 外部 ReMe/Mem0） Workspace（workspace/）│
├──────────────────────────────────────────────────────────┤
│  Agent Service（examples/agent_service + app/）           │
│   多租户 · 会话隔离 · Team · Channels · RAG · 调度       │
└──────────────────────────────────────────────────────────┘
```

### 1.2 真实源码布局（经 GitHub tree 核实）

```
agentscope/
├── src/agentscope/
│   ├── _utils/
│   ├── agent/                 # Agent 核心
│   ├── app/                   # 服务装配
│   ├── console/               # launch_console
│   ├── credential/            # API key / provider 凭证
│   ├── embedding/
│   ├── event/                 # 统一事件总线
│   ├── exception/
│   ├── formatter/
│   ├── mcp/                   # MCP 客户端/工具
│   ├── message/
│   ├── middleware/            # 权限/压缩/系统提示等钩子
│   ├── model/                 # OpenAI/Anthropic/Gemini/DashScope/…
│   ├── permission/            # 精细权限 + HITL
│   ├── pipeline/              # Pipeline 多 agent 固定逻辑
│   ├── rag/                   # RAG 服务侧
│   ├── realtime/              # RealtimeAgent 语音
│   ├── skill/                 # 技能
│   ├── sop/                   # 标准作业流程
│   ├── state/
│   ├── tool/                  # Toolkit + Bash/Read/Write/Edit/Grep/Glob
│   ├── tts/
│   ├── tui/
│   ├── types/
│   ├── workspace/             # 本地/Docker/E2B/Daytona/K8s 等
│   ├── __init__.py
│   ├── _logging.py
│   └── _version.py
├── examples/                  # agent_service、web_ui、model_examples 等
├── docs/ · tests/ · scripts/
└── pyproject.toml
```

### 1.3 进程/线程模型

- 库 + 可选 Agent Service（FastAPI）
- Console：终端流式调试
- Channels：飞书/Discord/DingTalk 接入
- Background task offload：长工具后台化，结果唤醒 agent

### 1.4 与 LLM 的调用链路

```
用户/Channel/Console
  → Agent.reply()
  → middleware 链（system prompt / permission / context compress）
  → model/ 调用（流式 event）
  ← tool_call
  → permission/ 确认或 bypass
  → workspace/ 隔离执行（Bash/Read/…）
  → tool-result offload（过大卸载）
  → 事件总线推送前端
  → compaction 达阈值时压缩
```

失败路径（设计层）：
- 工具被拒绝 → 事件回流，agent 可改道
- 上下文溢出 → 自动 compaction
- 长任务 → background offload，完成后 wakeup
- Ctrl+C 中断 → Realtime interruption & resume（README）

---

## 2. 核心机制深潜

### 2.1 Agent / ReAct

| 构件 | 职责 |
|---|---|
| ReAct | 推理-行动循环，结构化输出，中断恢复，顺序/并发批量 acting |
| Toolkit | Python 工具 + MCP + skills；内置 shell/file/search/task-plan |
| Model | LLM / embedding / TTS 多厂商 |
| Context | 自动 compaction、tool-result offload、system/RAG/memory 注入 |
| Event | 统一事件流（reasoning/tool/multimodal） |
| Permission | 工具与资源细粒度控制、确认、bypass |
| Middleware | reply/reasoning/acting/model/permission/compress/system 可组合钩子 |
| Memory | 可切换后端（ReMe、Mem0） |
| Workspace | local / Docker / Apple Container / Bubblewrap / E2B / OpenSandbox / Daytona / K8s |

### 2.2 工具系统

- `tool/Toolkit`：注册 Python 工具、MCP server、skills
- 内置编码工具：`Bash`, `Grep`, `Glob`, `Read`, `Write`, `Edit`
- task/plan 工具：任务拆解与计划更新
- MCP：GitHub MCP Registry、ClawHub 作为内建 hub，可安装进 library / workspace

### 2.3 上下文管理

- **自动 compaction**（middleware）
- **tool-result offload**：大结果卸载，防爆上下文
- 注入通道：system prompt、RAG、memory
- RealtimeAgent：DashScope/OpenAI/Gemini/xAI realtime API

### 2.4 状态与持久化

- Agent Service：SQL & NoSQL 持久化 agent 状态与会话
- 多租户、多会话隔离
- 资源共享：组/组织级共享 model、MCP、skills、workspace

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

| 路径 | 行为 |
|---|---|
| 工具拒绝/失败 | 事件回流，循环可继续 |
| 上下文溢出 | compaction |
| 长工具 | background offload + wakeup |
| 中断 | interruption & resume（ReAct） |
| durable transcript writer claim | **未在公开 README 明示**（需读代码确认） |

### 3.2 会话管理

- Service 层多会话隔离
- Scheduling：计划任务、agent 唤醒、后台卸载

### 3.3 隔离

- **多后端 Workspace/Sandbox**（Docker/E2B/Daytona/K8s/…）
- Permission bypass 模式 vs 确认模式

### 3.4 幂等性与可观测

- Event System：前端可「看见」reasoning/tool
- Console 调试
- 无公开 WS idempotency 细节

---

## 4. 自我进化

| 维度 | 现状 |
|---|---|
| 记忆 | 可切换 ReMe / Mem0 |
| 技能 | skill/ + MCP hub 安装 |
| 评测 | tests/ + examples |
| 反馈 | HITL 确认；无 Dreaming |

---

## 5. 对 openmate 的借鉴

### 直接可抄（P0）

1. **Permission & HITL 中间件**：工具确认、bypass、资源级权限
2. **Context 中间件**：compaction + tool-result offload + 注入
3. **Event 总线**：统一流式事件给 UI
4. **Workspace 多后端**：本地开发 Docker，生产 E2B/Daytona
5. **Agent Service 形态**：多租户/会话/调度作为可组合服务

### 应避免的坑

- 2.0 范式较新，API 仍在动（2026-09 仍有 realtime/A2A 新增）
- 全量中间件栈对个人助手可能过重，需裁剪
- 沙箱后端运维成本差异大

### 重构优先级

- **P0**：HITL 审批 + bypass
- **P0**：compaction + offload
- **P0**：事件流式协议
- **P1**：Docker workspace
- **P2**：MCP hub / A2A / Realtime voice

---

## 6. 源码阅读笔记

| 路径 | 作用 |
|---|---|
| `src/agentscope/agent/` | Agent 核心 |
| `src/agentscope/tool/` | Toolkit + 内置编码工具 |
| `src/agentscope/permission/` | 权限与 HITL |
| `src/agentscope/middleware/` | 可组合钩子 |
| `src/agentscope/context` 相关 middleware | compaction/offload |
| `src/agentscope/event/` | 事件总线 |
| `src/agentscope/workspace/` | 沙箱 |
| `src/agentscope/mcp/` | MCP |
| `src/agentscope/model/` | 多厂商模型 |
| `src/agentscope/console/` | launch_console |
| `examples/agent_service/` | FastAPI 服务 |
| `examples/web_ui/` | pnpm Web UI |

值得摘录：
- Console 示例：Agent + Toolkit(Bash/Grep/Glob/Read/Write/Edit) + DashScope
- Service 能力表：Serving / Team / Channels / RAG / MCP Hub / Resource / Persistence / Scheduling

失败/边界路径备忘：
- bypass 模式无确认 → 高风险工具自动执行，需默认收紧
- 沙箱后端不可用 → 降级策略未在 README 写死，需读代码

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|---|---|---|
| 工具调用策略清晰度 | 4 | ReAct + Toolkit + MCP |
| 权限/安全边界 | **5** | Permission + HITL + 多沙箱 |
| 容错与会话恢复 | 3 | 中断恢复/offload；durable 需核实 |
| 上下文工程 | **5** | compaction + offload + 注入 |
| 可扩展（技能/MCP） | 4 | MCP hub + skill |
| 可观测与可评测 | 4 | Event + Console |
| 生产可用成熟度 | 3 | 2.0 快速演进中 |

**综合**：3.9 / 5 — **openmate P0 借鉴首选之一**。

---

## 8. 关键链接

- README：https://github.com/agentscope-ai/agentscope  
- Docs：https://docs.agentscope.io/  
- 相关报告：`cards/agentscope.md`、`reports/openclaw.md`、`reports/langgraph.md`

---

## 9. 验证深度诚实声明

- **已核实**：`src/agentscope/` 完整一级子包列表（agent/app/console/credential/event/mcp/middleware/model/permission/pipeline/rag/realtime/skill/sop/state/tool/tts/tui/workspace 等）、README 能力表、Apache-2.0、Python 3.11+、examples/agent_service 与 web_ui 启动方式。
- **未能逐文件打开**：ReAct 主循环实现、compaction 默认阈值、permission 默认策略。
- **推断标注**：「失败路径」多为架构设计推论，非本次逐行验证。
- 本报告路径均来自 GitHub HTML tree 与 README，**无捏造路径**。
