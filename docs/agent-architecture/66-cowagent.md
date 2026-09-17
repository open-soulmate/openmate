# 66. CowAgent 架构深度分析

> **项目**: [zhayujie/CowAgent](https://github.com/zhayujie/CowAgent)
> **前身**: chatgpt-on-wechat（已更名）
> **定位**: 开源超级 AI 助手 & Agent Harness 工程参考实现
> **语言**: Python | **协议**: MIT | **最新版**: v2.1.7 (2026.08.20)

---

## 1. 总体架构设计

CowAgent 采用**三层解耦架构**，消息流为：**Channel → Agent Core → Model → 回传 Channel**。

```
┌─────────────────────────────────────────────────────┐
│                    Channel Layer                     │
│  Web / WeChat / Feishu / DingTalk / Telegram / ...  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   Bridge Layer                       │
│     Bridge (singleton) → AgentBridge → ChatService   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Agent Core Layer                    │
│  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Memory  │ │  Skills │ │  Tools   │ │Evolution  │  │
│  │ Manager │ │ Manager │ │  Manager │ │ Trigger   │  │
│  └─────────┘ └────────┘ └──────────┘ └───────────┘  │
│  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐  │
│  │Knowledge│ │SubAgent│ │  Prompt  │ │  Protocol │  │
│  │  Wiki   │ │ Runner │ │  System  │ │  (Stream) │  │
│  └─────────┘ └────────┘ └──────────┘ └───────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   Model Layer                        │
│  DeepSeek / Claude / GPT / Gemini / Qwen / GLM / ...│
└─────────────────────────────────────────────────────┘
```

核心设计原则：**每层可独立替换和扩展**。Channel 不知道 Agent 内部逻辑，Agent 不关心消息来源，Model 层通过工厂模式按配置动态创建。

---

## 2. Channel 层：多渠道统一接入

### 抽象基类设计

`channel/channel.py` 定义了 `Channel` 抽象基类，所有渠道实现必须实现 `start()`、`stop()`、`send(reply, context)`、`handle_text(msg)` 四个核心方法。

**关键设计模式**：
- **多实例支持**：每个 Channel 实例可绑定不同的 `bound_agent_id`，通过 `apply_instance()` 注入实例凭证和团队成员，实现"同一渠道类型、多个 Agent 实例"
- **凭证隔离**：`cfg()` 方法优先读取实例级 `_creds`，再 fallback 到全局 `conf()`，解决了同类型多实例的凭证冲突
- **团队上下文传播**：`stamp_instance_context()` 将实例的路由标识注入入站消息，确保下游路由正确

### ChatChannel 会话管理

`channel/chat_channel.py` 是核心会话管理器（702 行），实现了：

- **消息队列化**：每个 session_id 绑定一个 `Dequeue` + `BoundedSemaphore(concurrency_in_session)`，防止并发冲突
- **群聊匹配**：支持前缀匹配、关键词匹配、@提及检测，自动剥离机器人名称
- **多模态路由**：根据 `ContextType`（TEXT / VOICE / IMAGE / IMAGE_CREATE / FILE / SHARING）分发到不同处理分支
- **快捷命令快速路径**：`/cancel`、`/steer` 等命令绕过消息队列直接执行
- **Sub Agent 步骤转发**：`subagent_step` 事件实时推送到前端，而非等待整个 spawn 完成

```python
# 消息处理核心流程
def _handle(self, context):
    reply = self._generate_reply(context)      # Agent 生成回复
    reply = self._decorate_reply(context, reply) # 格式化（@前缀、语音转换等）
    self._send_reply(context, reply)            # 发送 + extra_replies
```

---

## 3. Bridge 层：模型路由与 Agent 桥接

`bridge/bridge.py` 是全局单例，承担两个核心职责：

### 模型路由器

通过 `model` 配置项的前缀自动识别提供商：

| 前缀模式 | 提供商 |
|---------|--------|
| `claude*` | Claude API |
| `gpt*` / `text-davinci*` | OpenAI |
| `deepseek*` | DeepSeek |
| `gemini*` | Google Gemini |
| `qwen*` / `qwq*` / `qvq*` | 阿里通义 |
| `glm*` | 智谱 GLM |
| `kimi*` | Moonshot/Kimi |
| `doubao*` | 字节豆包 |
| `mimo-*` | 小米 MiMo |
| `minimax*` | MiniMax |
| `ernie*` | 百度文心 |

每种能力（chat、vision、image_gen、ASR、TTS、embedding）可独立路由到不同提供商。

### Agent 桥接器

`Bridge.fetch_agent_reply()` → `AgentBridge.agent_reply()` → `ChatService.run()`，这条链路将传统 chat 模式和 Agent 模式统一在一个入口下。Agent 模式失败时自动 fallback 到普通 chat 模式。

---

## 4. Tool 系统：原子能力与 MCP 集成

### BaseTool 框架

`agent/tools/base_tool.py` 定义了工具基类，核心特性：

- **两阶段执行**：`ToolStage.PRE_PROCESS`（Agent 主动选择）vs `ToolStage.POST_PROCESS`（final_answer 后自动执行）
- **并行安全标记**：`parallel_safe = False` 默认串行，只有独立且慢速的工具才开启并行
- **进度与事件回调**：`report_progress()` 和 `emit_event()` 支持实时 UI 反馈
- **取消感知**：`is_cancelled()` 让长时间运行的工具可以提前中止
- **卡片自渲染**：`renders_own_cards()` 避免重复的通用进度卡片

### ToolManager 动态加载

`agent/tools/tool_manager.py` 是工具管理器，采用**工作区级单例**模式（非全局单例），每个 Agent workspace 有独立实例。

内置工具清单（15+）：
`bash`、`browser`、`read`、`write`、`edit`、`ls`、`search_files`、`send`、`memory`、`env_config`、`web_fetch`、`web_search`、`vision`、`scheduler`、`mcp`

### MCP 集成

MCP（Model Context Protocol）集成是 CowAgent 的亮点：

- **配置格式兼容**：同时支持 `mcp_servers`（列表）和 `mcpServers`（字典）两种格式
- **传输协议**：支持 stdio 和 SSE/Streamable HTTP
- **懒加载 + 幂等**：`_mcp_loaded` 标志防止重复 fork 子进程
- **按需工具检索**：通过 embedding 向量索引实现语义匹配，不用全量注入所有 MCP 工具
- **热重载**：基于 `mcp.json` 的 mtime + sha256 检测变更，支持增量重载

---

## 5. Memory 系统：三层长期记忆

### 三层架构

| 层级 | 存储 | 生命周期 |
|------|------|---------|
| Context（短期） | Agent messages 列表 | 当前会话 |
| Daily（中期） | `memory/daily/YYYY-MM-DD.md` | 自动归档 |
| Core（长期） | `MEMORY.md` | 经 Deep Dream 蒸馏后持久化 |

### 混合检索

`agent/memory/manager.py` 实现了 **vector + keyword 混合检索**：

```python
# 向量搜索 + 关键词搜索 + 时间衰减融合
combined_score = vector_weight * vector_score + keyword_weight * keyword_score
combined_score *= temporal_decay(path)  # 日期文件指数衰减
```

- **时间衰减**：带日期的文件按半衰期 30 天指数衰减，`MEMORY.md` 等常青文件不衰减
- **Embedding 降级**：无 embedding provider 时自动退化为纯 FTS5 关键词搜索
- **增量同步**：两趟设计——先收集变更的 chunk，再批量 embed，减少 HTTP 调用

### Deep Dream 蒸馏

每晚自动触发，将散落的对话记忆蒸馏为结构化条目和叙事日记，写入 `MEMORY.md` 和 `memory/dreams/` 目录。

---

## 6. Evolution 系统：自我进化

这是 CowAgent 最具特色的子系统。`agent/evolution/` 目录包含 6 个模块。

### 空闲触发机制

`trigger.py` 实现了**基于空闲的进化触发器**：

```python
# 两个触发条件（OR 关系）：
enough_signal = turns >= cfg.min_turns or context_pressure_reached(agent)

# 上下文压力阈值：当活跃上下文超过 token 预算的 80% 时触发
_CONTEXT_RATIO = 0.8
```

- 后台线程每 60 秒扫描一次所有活跃 Agent 会话
- 跳过正在运行中的会话（`_evo_run_active` 标志）
- 进化完成后重置计数器，支持长会话多次进化

### 进化内容

`executor.py` 执行的实际进化内容包括：
- 自动回顾对话，提取经验教训
- 跟进未完成的任务
- 整合记忆和知识
- 通过日常使用持续成长

---

## 7. Skills 系统：可组合工作流

### 架构设计

`agent/skills/` 包含完整的技能生命周期管理：

| 模块 | 职责 |
|------|------|
| `types.py` | Skill / SkillEntry / SkillSnapshot 数据结构 |
| `loader.py` | 从 builtin + custom 目录扫描加载 |
| `manager.py` | 生命周期管理（启用/禁用/过滤/快照） |
| `formatter.py` | 格式化为 system prompt 注入内容 |
| `frontmatter.py` | 解析 SKILL.md 的 YAML frontmatter |
| `service.py` | 运行时服务层 |
| `config.py` | 需求检查和环境匹配 |

### 双层选择机制

```python
# 第一层：Agent 级选择（哪些 Agent 能用哪些 skill）
if self.selection is not None and name not in self.selection:
    return False

# 第二层：实例级开关（skills_config.json 中的 enabled 字段）
return entry.get("enabled", True)
```

### Skill Hub 生态

支持从 Cow Skill Hub、GitHub、ClawHub、URL 等多种来源一键安装，还支持通过 `skill-creator` 对话式创建自定义技能。

---

## 8. Sub Agent 系统：并行任务委派

`agent/subagent/` 实现了子 Agent 机制（v2.1.6 引入）：

- `runner.py`：子 Agent 运行器，支持并行任务委派
- `templates.py`：子 Agent 模板定义
- `assets/`：子 Agent 运行时资源

关键事件传播：
- `subagent_step` 事件实时转发到前端（不等整个 spawn 完成）
- `artifact` 事件即时推送文件产物
- Sub Agent 的 tool_call 通过 `card_id` 关联到父级的 loading 卡片

---

## 9. 协议与流式通信

### CHAT Socket 协议

`agent/chat/service.py` 的 `ChatService` 将 Agent 事件翻译为标准化的 CHAT 协议块：

| Agent Event | CHAT Chunk Type | 说明 |
|-------------|----------------|------|
| `reasoning_update` | `reasoning` | 思考过程增量 |
| `message_update` | `content` | 文本内容增量 |
| `tool_execution_start` | `tool_start` | 工具开始执行 |
| `tool_execution_end` | `tool_calls` | 工具执行结果 |
| `subagent_step` | `subagent_step` | 子 Agent 步骤 |
| `artifact` | `artifact` | 文件产物 |
| `turn_end` | (flush) | 回合结束，刷新缓冲 |

### 取消与引导

- **Cancel Registry**：每个 in-flight 运行注册一个取消令牌，`/cancel` 命令可精确中止
- **Steer Registry**：`/steer` 命令可以在运行中重定向当前任务方向

---

## 10. 部署与扩展性

### 部署模式

| 模式 | 适用场景 |
|------|---------|
| 一行安装脚本 | 个人用户快速部署 |
| Docker Compose | 服务器标准化部署 |
| Desktop 客户端 | macOS/Windows 桌面（后端内嵌） |
| LinkAI 托管 | 企业零部署云端 |

### Web Console

默认端口 `9899`，提供统一管理界面：对话、模型配置、渠道管理、技能安装、记忆浏览、知识图谱可视化。

### CLI 工具

```bash
cow start | stop | restart    # 服务控制
cow status | logs              # 状态查看
cow update                     # 更新并重启
cow skill install <name>       # 安装技能
cow install-browser            # 安装浏览器自动化
```

### 多工作区支持

v2.1.7 引入多工作区，每个 Agent 有独立的状态目录（skills、memory、config），ToolManager 也是工作区级单例，避免跨 Agent 污染。

---

## 总结：核心设计亮点

| 维度 | 设计亮点 |
|------|---------|
| **解耦** | Channel / Bridge / Agent / Model 四层解耦，每层可独立替换 |
| **多渠道** | 13+ 渠道统一抽象，支持多实例 + 凭证隔离 |
| **工具系统** | 两阶段执行 + MCP 原生集成 + 按需向量检索 |
| **记忆** | 三层架构 + 混合检索 + 时间衰减 + Deep Dream 蒸馏 |
| **自我进化** | 空闲触发 + 上下文压力触发，自动回顾和改进 |
| **技能生态** | Hub 市场 + 对话式创建 + 双层选择机制 |
| **子 Agent** | 并行委派 + 实时步骤流式转发 |
| **流式协议** | 标准化事件翻译 + 取消/引导原语 |
| **多模型** | 15+ 提供商按前缀自动路由，每种能力独立配置 |
| **部署** | 一行脚本 / Docker / Desktop / 云端托管四种模式 |

CowAgent 从 chatgpt-on-wechat 演进而来，保留了中文社区友好的设计（微信/飞书/钉钉/QQ 原生支持），同时在 Agent 工程化方面达到了相当的深度——特别是自我进化机制和 MCP 集成，使其在开源 Agent 框架中具有独特定位。
