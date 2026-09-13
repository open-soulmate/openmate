# CowAgent

## 概述

CowAgent 是一个协作型Agent框架。

**仓库**: https://github.com/zhayujie/CowAgent | **语言**: Python

## 核心架构

> **项目**: [zhayujie/CowAgent](https://github.com/zhayujie/CowAgent)
> **前身**: chatgpt-on-wechat（已更名）
> **定位**: 开源超级 AI 助手 & Agent Harness 工程参考实现
> **语言**: Python | **协议**: MIT | **最新版**: v2.1.7 (2026.08.20)

CowAgent 采用**三层解耦架构**，消息流为：**Channel → Agent Core → Model → 回传 Channel**。

[详见源码]

核心设计原则：**每层可独立替换和扩展**。Channel 不知道 Agent 内部逻辑，Agent 不关心消息来源，Model 层通过工厂模式按配置动态创建。

`channel/channel.py` 定义了 `Channel` 抽象基类，所有渠道实现必须实现 `start()`、`stop()`、`send(reply, context)`、`handle_text(msg)` 四个核心方法。

**关键设计模式**：
- **多实例支持**：每个 Channel 实例可绑定不同的 `bound_agent_id`，通过 `apply_instance()` 注入实例凭证和团队成员，实现"同一渠道类型、多个 Agent 实例"
- **凭证隔离**：`cfg()` 方法优先读取实例级 `_creds`，再 fallback 到全局 `conf()`，解决了同类型多实例的凭证冲突
- **团队上下文传播**：`stamp_instance_context()` 将实例的路由标识注入入站消息，确保下游路由正确

def _handle(self, context):
    reply = self._generate_reply(context)      # Agent 生成回复
    reply = self._decorate_reply(context, reply) # 格式化（@前缀、语音转换等）
    self._send_reply(context, reply)            # 发送 + extra_replies
```

| 层级 | 存储 | 生命周期 |
|------|------|---------|
| Context（短期） | Agent messages 列表 | 当前会话 |
| Daily（中期） | `memory/daily/YYYY-MM-DD.md` | 自动归档 |
| Core（长期） | `MEMORY.md` | 经 Deep Dream 蒸馏后持久化 |

这是 CowAgent 最具特色的子系统。`agent/evolution/` 目录包含 6 个模块。

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

`agent/subagent/` 实现了子 Agent 机制（v2.1.6 引入）：

- `runner.py`：子 Agent 运行器，支持并行任务委派
- `templates.py`：子 Agent 模板定义
- `assets/`：子 Agent 运行时资源

关键事件传播：
- `subagent_step` 事件实时转发到前端（不等整个 spawn 完成）
- `artifact` 事件即时推送文件产物
- Sub Agent 的 tool_call 通过 `card_id` 关联到父级的 loading 卡片

| 维度 | 设计亮点 |
|------|---------|
| **解耦** | Channel / Bridge / Agent / Model 四层解耦，每层可独立替换 |
| **多渠道** | 13+ 渠道统一抽象，支持多实例 + 凭证隔离 |
| **工具系统** | 两阶段执行 + M

## 关键技术

| 参数 | 默认 |
|---|---|
| `agent` | `true` |
| `agent_workspace` | `~/cow` |
| `agent_max_context_tokens` | `50000` |
| `agent_max_context_turns` | `20` |
| `agent_max_steps` | `20` |
| `agent_permission_mode` | `full-access`（可选 `read-only` / `workspace-write`） |
| `enable_thinking` | `false` |
| `knowledge` | `true` |
| `self_evolution_enabled` | 新装默认 true（文档表写 false，以“new installs”注释为准） |
| `cow_lang` | `auto` |

[详见源码]python
_memory_configs: Dict[str, MemoryConfig] = {}
_pinned_memory_config: Optional[MemoryConfig] = None
_memory_config_lock = threading.RLock()

def _key(workspace_root: str) -> str:
    return os.path.realpath(expand_path(str(workspace_root)))
[详见源码]

**降级语义（L53-63 源码注释）：**

> When None is passed, memory degrades to keyword-only search instead of silently re-initializing a vendor here, which would bypass the caller's state checks and risk corrupting the index.

即：**无 embedding provider → 只做关键词检索**，不偷偷建向量索引。

`search()`：

```python
max_results = max_results or self.config.max_results   # 10
min_score = min_score or self.config.min_score         # 0.1
scopes = ["shared"] if include_shared else []
if user_id: scopes.append("user")
```

混合权重：vector 0.7 + keyword 0.3。

| 场景 | 行为 |
|---|---|
| embedding provider 缺失 | keyword-only，log info，不 crash |
| embedding 未初始化却被调用 | 注释明确：不在 MemoryManager 内隐式初始化，避免破坏索引 |
| 会话/进化/undo 无 config 参数 | 走 `get_default_memory_config()` 按路由 workspace 解析 |
| 配置 key 不规范 | realpath 规范化后仍 miss 则返回 bare default |

源码注释：

> Simple rule: Skills are auto-enabled if their requirements are met.
> - Has required API keys → enabled
> - Wrong keys → enabled but will fail at runtime (LLM will handle error)

requires 字段：

| 字段 | 含义 |
|---|---|
| `bins` | 必需可执行文件 |
| `anyBins` | 任一即可 |
| `env` | 必需环境变量 |
| `anyEnv` | 任一即可 |

平台映射：`platform_map` 归一化 runtime platform。

`agent/tools/tool_manager.py`：直接 import 每个 tool class，加载失败逐个 log 不中断。

工具列表（从列表 API + docs/tools/）：

bash, browser, edit, env-config, evolution-undo, ls, mcp, memory-get, memor

## 对openmate的启示

> 供 openmate（个人助手 + 多通道 Agent）参考：记忆 + 技能 + 自进化
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `zhayujie/CowAgent@master` 源码（GitHub raw 超时，改用 `cdn.jsdelivr.net/gh/...`）
> 版本锚点：`docs/intro/architecture.mdx` 标题 “CowAgent 2.0 system architecture”；`pyproject.toml` 存在；`cli/VERSION` 在列表中

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（66-cowagent.md）
- MiMo报告（cowagent-l1.md）
- MiMo卡片（cowagent.md）
