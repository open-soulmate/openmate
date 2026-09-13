# CowAgent 深度架构报告（openmate 参考级）

> 供 openmate（个人助手 + 多通道 Agent）参考：记忆 + 技能 + 自进化
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `zhayujie/CowAgent@master` 源码（GitHub raw 超时，改用 `cdn.jsdelivr.net/gh/...`）
> 版本锚点：`docs/intro/architecture.mdx` 标题 “CowAgent 2.0 system architecture”；`pyproject.toml` 存在；`cli/VERSION` 在列表中

---

## 0. 验证状态

| 项 | 状态 |
|---|---|
| 仓库列表 | ✅ `data.jsdelivr.com` flat 列表 723 files |
| 实拉源码 | ✅ OutFile 下载，字节数与列表一致 |
| docs 架构页 | ✅ `docs/intro/architecture.mdx` 7419 B |

**实拉关键文件：**

| 路径 | 字节 | 作用 |
|---|---|---|
| `agent/memory/manager.py` | 22935 | MemoryManager 混合检索 |
| `agent/memory/conversation_store.py` | 101894 | 会话存储（最大单文件之一） |
| `agent/memory/storage.py` | 48310 | SQLite 存储层 |
| `agent/memory/summarizer.py` | 35668 | MemoryFlush / 摘要 |
| `agent/memory/config.py` | 4976 | MemoryConfig 常量 |
| `agent/memory/chunker.py` | 4501 | 分块 |
| `agent/memory/embedding/*` | 7.7k-21k | 向量提供方 |
| `agent/skills/manager.py` | 15554 | SkillManager |
| `agent/skills/loader.py` | 10904 | SkillLoader |
| `agent/skills/config.py` | 8054 | 依赖检测 / 启用规则 |
| `agent/skills/types.py` | 2428 | Skill 类型 |
| `agent/tools/tool_manager.py` | 36737 | 工具注册与执行 |
| `agent/protocol/agent_stream.py` | 85080→125037 | 流式协议 |
| `bridge/agent_bridge.py` | 50414→98421 | Agent 桥 |
| `channel/chat_channel.py` | 28324→35051 | 通道基类 |
| `agent/chat/session_service.py` | 9559→19305 | 会话服务 |
| `agent/evolution/executor.py` | 23382→27040 | 自进化执行器 |
| `agent/prompt/builder.py` | 34213→47820 | Prompt 构建 |
| `common/const.py` | 12415→13863 | Provider/模型常量 |
| `common/token_bucket.py` | 1445 | TPM 限流 |
| `common/expired_dict.py` | 1161 | TTL 字典 |
| `docs/intro/architecture.mdx` | 7419 | 官方架构说明 |

---

## 1. 官方架构（源码自证）

`docs/intro/architecture.mdx` 明确模块表：

| 模块 | 职责 |
|---|---|
| Plan | 意图理解 → 多步计划 → 迭代调用工具 |
| Memory | 自动持久化 core memory + daily memory；**关键词 + 向量混合检索** |
| Knowledge | 按主题组织 Markdown；自主蒸馏 + 索引 + 交叉引用 |
| Evolution | 会话空闲后在隔离环境复盘：改进技能、跟进未完成任务、回填记忆/知识 |
| Multi-agent | 团队协作；各有模型与 workspace；群聊 / 任务委派 / 子代理 |
| Tools | 文件读写、终端、浏览器、调度器、记忆搜索、web 搜索等 10+ |
| Skills | Skill Hub / GitHub 一键安装；对话式创建 |
| Models | OpenAI / Claude / Gemini / DeepSeek / MiniMax / GLM / Qwen 统一接入 |
| Channels | Web console、微信、飞书、钉钉、企微、公众号… |
| CLI | `cow` 终端命令 + `/` 聊天命令 |

### 1.1 工作区布局（architecture.mdx L44-67）

```
~/cow/
├── SYSTEM.md          # Agent system prompt
├── USER.md            # 用户画像
├── MEMORY.md          # 核心记忆
├── memory/YYYY-MM-DD.md  # 日记忆
├── knowledge/index.md + <category>/
├── skills/skill-N/
└── agents/team.json + <agent-id>/
~/.cow/.env            # 技能密钥（与 workspace 分离）
```

### 1.2 会话级配置默认值（architecture.mdx L94-118）

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

### 1.3 权限三档（L88）

- `read-only`
- `workspace-write`
- `full-access`

可 **per session** 覆盖全局默认。强隔离建议容器。

---

## 2. 记忆子系统（openmate 最该抄的部分）

### 2.1 MemoryConfig 真实常量（`agent/memory/config.py` L25-54）

```python
@dataclass
class MemoryConfig:
    embedding_provider: str = "openai"       # "openai" | "local"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    chunk_max_tokens: int = 500
    chunk_overlap_tokens: int = 50
    max_results: int = 10
    min_score: float = 0.1
    vector_weight: float = 0.7
    keyword_weight: float = 0.3
    sources: list[str] = ["memory", "session"]
    enable_auto_sync: bool = True
    sync_on_search: bool = True
```

**openmate P0 直接抄这组默认值。**

### 2.2 多 Agent 配置注册表（config.py L77-148）

问题意识（源码注释）：

> One config per workspace, not one per process… A single slot means whichever Agent initialized last decides where every other Agent's memory is written.

解法：

```python
_memory_configs: Dict[str, MemoryConfig] = {}
_pinned_memory_config: Optional[MemoryConfig] = None
_memory_config_lock = threading.RLock()

def _key(workspace_root: str) -> str:
    return os.path.realpath(expand_path(str(workspace_root)))
```

- `register_memory_config(config)`：按 workspace realpath 注册
- `get_default_memory_config()`：先看 pin，再查表，miss 时 double-checked locking 创建默认
- `set_global_memory_config`：测试/单 Agent 进程级覆盖
- 注释警告：key 必须 realpath 规范化，否则 `~/cow` 与 `/private/var/...` 会静默 miss

**openmate P1：** 多 workspace 时绝不能用进程级单例 config。

### 2.3 MemoryManager（`agent/memory/manager.py`）

初始化链：

```python
self.storage = MemoryStorage(db_path)                    # SQLite
self.chunker = TextChunker(max_tokens=500, overlap=50)
self.embedding_provider = embedding_provider             # 可为 None
self._embedding_cache = EmbeddingCache()
self.flush_manager = MemoryFlushManager(workspace_dir, llm_model)
```

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

### 2.4 失败路径（记忆）

| 场景 | 行为 |
|---|---|
| embedding provider 缺失 | keyword-only，log info，不 crash |
| embedding 未初始化却被调用 | 注释明确：不在 MemoryManager 内隐式初始化，避免破坏索引 |
| 会话/进化/undo 无 config 参数 | 走 `get_default_memory_config()` 按路由 workspace 解析 |
| 配置 key 不规范 | realpath 规范化后仍 miss 则返回 bare default |

---

## 3. 技能子系统

### 3.1 SkillManager（`agent/skills/manager.py`）

```python
SKILLS_CONFIG_FILE = "skills_config.json"
```

双目录：

- `builtin_dir`：项目根 `skills/`
- `custom_dir`：workspace `skills/`（或 `state_dir.skills_dir(identity)`）

**selection 与 skills_config 分离（L78-82 注释）：**

> Kept separate from skills_config.json because that file describes the instance-wide library, which every Agent reads and which one Agent turning a skill off for itself must not rewrite.

即：库级配置 vs Agent 级开关，**单 Agent 关技能不能改全局库**。

`build_skill_manager`：

- Agent 无独立 skills 目录 → 回落到共享目录（安装一次全员可用）
- `RuntimeIdentity(agent_id=...)` 路由
- registry 解析失败时 **不剥夺技能**，回落无过滤共享集（L43-46）

### 3.2 启用规则（`agent/skills/config.py` L110-113）

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

### 3.3 失败路径（技能）

| 场景 | 行为 |
|---|---|
| 工具类 ImportError | logger.error，继续加载其他工具 |
| 工具类 init 异常 | logger.error，跳过该工具 |
| registry 不可解析 | 回落共享技能全集 |
| 错误 API key | 仍 enabled，运行时由 LLM 处理错误 |

---

## 4. 工具层

`agent/tools/tool_manager.py`：直接 import 每个 tool class，加载失败逐个 log 不中断。

工具列表（从列表 API + docs/tools/）：

bash, browser, edit, env-config, evolution-undo, ls, mcp, memory-get, memory-search, read, scheduler, send, vision, web-fetch, web-search, write

MCP 相关大文件：

- `agent/tools/mcp/mcp_client.py` 29254 B
- `agent/tools/mcp/mcp_oauth.py` 17126 B
- `agent/tools/mcp/tool_retrieval.py` 6390 B → **工具检索**（按需选工具，非全量注入）

---

## 5. 限流与 TTL 原语

### 5.1 TokenBucket（`common/token_bucket.py` 全文）

```python
class TokenBucket:
    def __init__(self, tpm, timeout=None):
        self.capacity = int(tpm)
        self.tokens = 0
        self.rate = int(tpm) / 60
        self.timeout = timeout
        self.cond = threading.Condition()
        self.is_running = True
        threading.Thread(target=self._generate_tokens).start()
```

- 容量 = TPM；速率 = TPM/60 tokens/s
- `get_token()`：`cond.wait(self.timeout)`，超时返回 `False`
- 示例：`TokenBucket(20, None)` = 每分钟 20 tokens
- `close()` 置 `is_running=False`

**openmate P1：** 用这个做 per-provider TPM 限流，timeout 参数决定是阻塞还是快速失败。

### 5.2 ExpiredDict（`common/expired_dict.py`）

- 存 `(value, expiry_time)` 元组
- `__getitem__` 过期则 `del` + `KeyError("expired ...")`，**读时刷新过期时间**（sliding TTL）
- `keys()` / `items()` / `__iter__` 都过滤过期键

---

## 6. 会话服务

`agent/chat/session_service.py`：

- `SessionService(agent_id=None)` 按 agent 路由 store
- `_truncate_fallback_title(..., max_len=30)`：无 LLM 时标题截断 30 字符
- `_cancel_running(session_id)`：删除前取消运行中的任务
- `clear_context` 返回清掉的条数
- `dispatch(action, payload)` 统一动作入口

---

## 7. 自进化（Evolution）

`agent/evolution/executor.py` 23k+；配套：

- `trigger.py` 空闲触发
- `prompts.py` 进化 prompt
- `backup.py` / `record.py` 可回滚
- 工具 `evolution_undo` 可撤销

架构文档：会话空闲后在 **隔离环境** 复盘，改进技能、跟进未完成任务、回填记忆/知识。

**openmate P2：** 自进化必须可 undo + 有 backup，CowAgent 的 evolution_undo 工具是正确形态。

---

## 8. Provider / 模型常量（`common/const.py`）

Provider 类型：`openai, baidu, qianfan, xunfei, chatGPTOnAzure, linkai, claudeAPI, dashscope, gemini, zhipu, moonshot, minimax, deepseek, mimo, custom, modelScope`

`CUSTOM` 注释：`bot_type won't auto-switch on model change`（自定义兼容端点不随模型自动切换）。

模型常量覆盖 Claude 3→5、Gemini 1→3.8、GPT-3.5→6、DeepSeek V3/V4、ERNIE、Qwen 等。`custom_provider.py` 支持 OpenAI 兼容自定义端点。

---

## 9. 通道与桥

- `channel/chat_channel.py` 28k+：通道基类
- 各平台：dingtalk / discord / feishu / qq / slack / telegram / wechat_kf / wechatcom / wechatmp / wecom_bot / weixin / web / terminal
- `bridge/agent_bridge.py` 50k+：Agent 与通道协议桥
- `channel/file_cache.py` 3059 B：文件缓存
- `channel/wechat_kf/wechat_kf_cursor_store.py` 2876 B：微信客服游标存储（跨重启续传）

---

## 10. 失败路径汇总

| 场景 | CowAgent 行为 | 出处 |
|---|---|---|
| embedding 缺失 | keyword-only 降级 | memory/manager.py L53-63 |
| 隐式重建向量索引 | 明确禁止（防索引损坏） | 同上 |
| 工具加载失败 | 单工具 log 后继续 | tool_manager.py |
| Agent registry 坏 | 回落共享技能 | skills/manager.py L43-46 |
| 单 Agent 关技能 | 不改全局 skills_config.json | skills/manager.py L78-82 |
| TokenBucket 超时 | get_token 返回 False | token_bucket.py |
| TTL 键过期 | 读时删除 + KeyError | expired_dict.py |
| 删除运行中会话 | 先 _cancel_running | session_service.py L310 |
| workspace 路径不一致 | realpath 规范化 key | memory/config.py L87-95 |
| 多 Agent 写同一 workspace | per-workspace 注册表 + RLock | memory/config.py L77-84 |

---

## 11. openmate 设计抄袭清单

### P0

1. **MemoryConfig 默认值照抄**：chunk 500/50、top-k 10、min_score 0.1、hybrid 0.7/0.3、embedding `text-embedding-3-small` dim 1536。
2. **无 embedding → keyword-only 降级**，禁止静默重建索引。
3. **技能库配置 vs Agent 开关分离**：`skills_config.json` 全局只读，per-agent selection 另存。
4. **TokenBucket(tpm, timeout)** 做 provider 限流。
5. **权限三档**：`read-only` / `workspace-write` / `full-access`，可 per-session 覆盖。
6. **agent_max_context_tokens=50000, max_context_turns=20, max_steps=20** 作为个人助手默认上限。

### P1

7. **per-workspace config 注册表**（realpath key + RLock + double-checked locking），不要进程单例。
8. **技能 requires 检测**：`bins/anyBins/env/anyEnv`，缺依赖自动禁用；错误 key 仍启用由 LLM 兜底。
9. **MCP tool_retrieval**：按需选工具，避免全量注入。
10. **会话删除前 cancel 运行中任务**。
11. **滑动 TTL ExpiredDict** 做 session cache。
12. **微信客服 cursor_store** 模式：通道游标独立落盘，重启续传。

### P2

13. **自进化 + undo 工具 + backup**：空闲触发、隔离环境、可回滚。
14. **Knowledge base**：Markdown 主题页 + index + 交叉引用，Agent 自主蒸馏。
15. **Multi-agent 团队**：`team.json` + per-agent workspace + 可选共享 skills/knowledge。
16. **Project workspace**：session 绑定项目目录，文件操作隔离，记忆仍在默认 workspace。
17. **Desktop Electron 壳**：`desktop/` 完整 React + Electron，python-manager 托管后端。

---

## 12. 与 nanobot 的互补关系

| 维度 | nanobot | CowAgent |
|---|---|---|
| 记忆 | 文件 Markdown + Dream 整合 | SQLite 向量 + 关键词混合 + 日记忆 |
| 技能 | SKILL.md 合同 | SKILL.md + requires 检测 + Hub |
| 自进化 | Dream（记忆层面） | Evolution（技能/任务/知识层面） |
| 权限 | workspace 限制布尔 | 三档 per-session |
| 多 Agent | subagent 临时 | 团队持久 + 子代理临时 |

**openmate 建议：** 会话/崩溃恢复抄 nanobot；记忆/技能/权限抄 CowAgent。
