# nanobot 深度架构报告（openmate 参考级）

> 供 openmate（个人助手 + 多通道 Agent）直接抄设计
> 调研日期：2026-09-13
> 资料来源：jsDelivr CDN 实拉 `HKUDS/nanobot@main` 源码（GitHub raw 超时，改用 `cdn.jsdelivr.net/gh/...`）
> 版本锚点：`pyproject.toml` → `name = "nanobot-ai"`, `version = "0.3.0"`, `requires-python = ">=3.11"`

---

## 0. 验证状态与元信息

| 项 | 值 | 验证 |
|---|---|---|
| 仓库 | HKUDS/nanobot | ✅ 列表 API + 多文件实拉 |
| 包名 | nanobot-ai | ✅ pyproject.toml L2 |
| 版本 | 0.3.0 | ✅ pyproject.toml L3 |
| License | MIT | ✅ pyproject.toml L8 |
| 构建 | hatchling | ✅ pyproject.toml L119 |
| CLI 入口 | `nanobot = nanobot.cli.entry:main` | ✅ pyproject.toml L110 |
| 依赖亮点 | typer, anthropic, pydantic≥2.12, websockets≥15, httpx[socks], ddgs, mcp≥1.26, filelock≥3.25.2, croniter, tiktoken, watchfiles | ✅ pyproject.toml L25-61 |
| coverage fail_under | 75 | ✅ pyproject.toml L187 |

**实拉成功的关键源文件（均经 jsDelivr OutFile 下载校验字节数）：**

- `nanobot/agent/loop.py` (104166 B) — AgentLoop 主循环
- `nanobot/session/manager.py` (79804 B) — 会话持久化 / FileLock / 迁移
- `nanobot/bus/queue.py` (5524 B) — MessageBus
- `nanobot/bus/events.py` (2541 B) — 事件类型
- `nanobot/config/schema.py` (33223 B) — Pydantic 配置与常量
- `nanobot/agent/memory.py` (48930 B) — MemoryStore / Dream
- `nanobot/agent/skills.py` (14749 B) — SkillsLoader
- `nanobot/agent/subagent.py` (22401 B) — SubagentManager
- `nanobot/channels/manager.py` (44477 B) — 通道重试
- `nanobot/cron/service.py` (35192 B) — 定时任务
- `nanobot/agent/tools/shell.py` (46464 B) — exec 工具
- `nanobot/agent/tools/base.py`, `registry.py`, `spawn.py`, `filesystem.py`, `mcp.py`
- `Dockerfile`, `docker-compose.yml`, `skills/memory/SKILL.md`

**未拉到（404）：** `heartbeat/service.py`、`providers/litellm_provider.py`（列表 API 显示存在，单文件 CDN 404，报告中不引用其内部细节）。

---

## 1. 系统架构（从源码反推）

### 1.1 进程与拓扑

```
IM/WebUI/TUI clients
        │  InboundMessage
        ▼
┌───────────────────────────────────────────┐
│  MessageBus (nanobot/bus/queue.py)        │
│   inbound:  asyncio.Queue[InboundMessage] │
│   outbound: asyncio.Queue[OutboundMessage]│
└───────────────┬───────────────────────────┘
                │ consume_inbound()
                ▼
┌───────────────────────────────────────────┐
│  AgentLoop (nanobot/agent/loop.py)        │
│   RESTORE → BUILD → LLM → tools → save   │
│   SessionManager + ContextBuilder         │
│   SubagentManager + CronTurnCoordinator   │
└───────────────┬───────────────────────────┘
                │ publish_outbound / publish_event
                ▼
┌───────────────────────────────────────────┐
│  ChannelManager (channels/manager.py)     │
│   按 channel 路由，指数退避重试            │
└───────────────────────────────────────────┘
```

### 1.2 MessageBus 设计（`nanobot/bus/queue.py`）

```python
class MessageBus:
    def __init__(self):
        self.inbound: asyncio.Queue[InboundMessage] = asyncio.Queue()   # 无界
        self.outbound: asyncio.Queue[OutboundMessage] = asyncio.Queue() # 无界
        self._handlers: list[EventHandler] = []
        self._pending: set[asyncio.Task[None]] = set()
```

关键契约（源码注释原话级）：

- **本地状态转换不等待网络发送**：`publish` 只 await 本地 handlers；`publish_event` 才入 outbound 队列。
- `publish` 按注册顺序 await handlers，单个 handler 异常被 `logger.exception` 吞掉，不中断后续。
- `publish_nowait` 用 `loop.create_task` 调度，task 挂在 `_pending` 直到完成；**没有全局事件 FIFO**，多次 publication 可交错。
- `drain()` 在生产者停止后、断开前 `asyncio.gather(*self._pending, return_exceptions=True)`。
- 无 running loop 时 `publish_nowait` 直接 drop 并 debug 日志。

**openmate 启示：** 无界 Queue + 本地/投递分离是个人助手正确形态。不要在 bus 层做网络 I/O。

### 1.3 TurnContext 阶段机（`loop.py` L132-194）

`TurnContext` 是 dataclass，字段覆盖整轮生命周期：

| 字段 | 含义 |
|---|---|
| `kind: TurnKind` | `USER` / `SYSTEM` |
| `delivery: TurnDelivery` | 投递控制 |
| `session / history / provider_state` | RESTORE 产物 |
| `request_context / runtime_context_blocks` | BUILD 产物 |
| `final_content / all_messages / stop_reason` | LLM 产物 |
| `failure_error_kind` | 失败分类 |
| `streamed_content` | 是否已流式输出 |
| `input_persisted_early / save_skip` | 持久化控制 |
| `suppress_response` | 静默模式 |
| `pending_queue: asyncio.Queue[InboundMessage]` | 轮中消息注入 |
| `pending_summary / summary_checkpoint` | 压缩检查点 |
| `ephemeral` | 临时聊天不进历史/记忆 |
| `turn_wall_started_at / turn_latency_ms / usage` | 观测 |

`require_runtime()` / `require_session()` 在阶段乱序时 `raise RuntimeError`——**强制 RESTORE 先于 BUILD**。

### 1.4 AgentLoop 关键常量

| 常量 | 值 | 出处 |
|---|---|---|
| `_SUBAGENT_TERMINAL_WAIT_SECONDS` | `300.0` | loop.py L124 |
| `_PROVIDER_STATE_CHECKPOINT_VERSION` | `"v1"` | loop.py L261 |
| `_RUNTIME_CHECKPOINT_KEY` | `"runtime_checkpoint"` | loop.py L258 |
| `_PENDING_USER_TURN_KEY` | `"pending_user_turn"` | loop.py L259 |
| `SESSION_CACHE_MAX_SIZE` | `128` | session/manager.py L44 |
| `_SESSION_MIGRATION_LOCK_TIMEOUT_SECONDS` | `30` | session/manager.py L74 |
| `_COPY_CHUNK_SIZE` | `1024 * 1024` (1 MiB) | session/manager.py L76 |
| `_SESSION_PREVIEW_MAX_CHARS` | `120` | session/manager.py L48 |
| `_SESSION_LIST_PREVIEW_MAX_RECORDS` | `200` | session/manager.py L49 |
| `_SESSION_LIST_PREVIEW_MAX_CHARS` | `1_000_000` | session/manager.py L50 |

---

## 2. 会话持久化与并发写（CRITICAL for openmate）

### 2.1 Session 数据模型（`session/manager.py` L275-301）

```python
@dataclass
class Session:
    key: str                      # "channel:chat_id"
    messages: list[dict[str, Any]]
    created_at / updated_at: datetime
    metadata: dict[str, Any]
    last_consolidated: int = 0    # Memory archive watermark
    provider_state: ProviderConversationState | None
    policy: SessionPolicy         # persist / log_content / disabled_tools
```

- `last_archived` 是 `last_consolidated` 的 property 别名（兼容迁移）。
- `__post_init__` 会把 **out-of-range 的 last_consolidated 重置为 0**（corrupt metadata 时避免隐藏全部历史）。
- `SessionPolicy` 是 frozen dataclass，**不进持久化**（runtime-only）。

### 2.2 FileLock 使用

`session/manager.py` L21: `from filelock import FileLock`

迁移锁超时 `_SESSION_MIGRATION_LOCK_TIMEOUT_SECONDS = 30`，文件锁名 `.session-files.lock`。

`cron/service.py` L16-186 同样用 FileLock：

```python
self._lock = FileLock(str(self._action_path.parent) + ".lock")
```

### 2.3 崩溃恢复协议

`loop.py` L89-97 导入 `nanobot.session.recovery`：

| 符号 | 用途 |
|---|---|
| `PENDING_FOLLOWUP_ID_KEY` | 待确认的用户 follow-up ID |
| `RECOVERY_INBOUND_METADATA_KEY` | 恢复入站消息元数据 |
| `RecoveryAdmission` | 重启后准入 |
| `acknowledge_pending_followups` | 确认 follow-up 已处理 |
| `record_pending_followup` | 落盘 pending follow-up |
| `restore_pending_interruption` | 恢复被打断的轮次 |
| `restore_runtime_checkpoint` | 从 `runtime_checkpoint` 还原 |

流程（从调用点推断）：

1. 轮开始：`_mark_pending_user_turn(session)` + `record_pending_followup`
2. 处理成功：`acknowledge_pending_followups(session, [followup_id])`
3. 崩溃重启：`restore_runtime_checkpoint` + `restore_pending_interruption`
4. checkpoint 版本字段：`provider_state_checkpoint_version = "v1"`

**openmate P0 必抄：** 这套 pending_user_turn + acknowledge + checkpoint 版本号是个人助手崩溃恢复的最小完备集。

### 2.4 历史压缩检查点

`Session.commit_summary_checkpoint()` (L323-342)：

```python
self.messages.insert(boundary, {
    "role": "user",
    "content": SUMMARY_CONTINUATION_TEXT,
    HIDDEN_HISTORY_META: True,   # 隐藏历史元数据
    "timestamp": datetime.now().isoformat(),
})
self.metadata["_last_summary"] = {"text": summary, "last_active": ...}
self.last_archived = boundary
```

在 **隐藏边界** 插入 continuation 消息，保留 transcript 完整性，同时把 replay 起点前移。

### 2.5 会话迁移

`_migrate_legacy_exec_session_records`：把旧 `write_stdin` 工具名迁到 `exec_session`，并重写 `chars→input`、`timeout_ms` 等参数。TODO 注释：`TODO(0.3.2): Remove the write_stdin replay migration after 0.3.1.`

---

## 3. 配置 Schema 真实常量（`config/schema.py`）

### 3.1 AgentDefaults（L116-157）

| 字段 | 默认值 | 约束 |
|---|---|---|
| `workspace` | `~/.nanobot/workspace` | |
| `model` | `anthropic/claude-opus-4-5` | |
| `provider` | `"auto"` | |
| `max_tokens` | `8192` | |
| `context_window_tokens` | `200_000` | |
| `temperature` | `0.1` | |
| `max_tool_iterations` | `200` | |
| `max_concurrent_subagents` | `4` | ge=1 |
| `max_tool_result_chars` | `16_000` | |
| `provider_retry_mode` | `"standard"` | `"standard"\|"persistent"` |
| `tool_hint_max_length` | `40` | ge=20, le=500 |
| `session_ttl_minutes` | `15` | ge=0；0=禁用 idle compact |
| `idle_compact_check_interval_seconds` | `60` | ge=0 |
| `unified_session` | `False` | 跨通道共享一会话 |
| `timezone` / `timezone_mode` | `"UTC"` / `"auto"` | ZoneInfo 校验 |

### 3.2 DreamConfig（L53-80）

| 字段 | 默认 |
|---|---|
| `enabled` | `True` |
| `interval_h` | `2`（每 2 小时） |
| `_HOUR_MS` | `3_600_000` |
| `cron` | `None`（legacy 覆盖） |
| `model_override` | `None` |

`build_schedule()`：有 cron 用 cron，否则 `every_ms = interval_h * 3_600_000`。

### 3.3 ChannelsConfig（L23-40）

| 字段 | 默认 |
|---|---|
| `send_progress` | `True` |
| `send_tool_hints` | `True` |
| `show_reasoning` | `True` |
| `send_max_retries` | `3`（ge=0, le=10，含首投） |

### 3.4 TranscriptionConfig

| 字段 | 默认 | 约束 |
|---|---|---|
| `max_duration_sec` | `120` | ge=1, le=600 |
| `max_upload_mb` | `25` | ge=1, le=100 |

### 3.5 ModelPresetConfig

`max_tokens=8192`, `context_window_tokens=200_000`, `temperature=0.1`, `provider="auto"`。

---

## 4. 工具执行与失败路径

### 4.1 ExecTool（`agent/tools/shell.py`）

```python
class ExecToolConfig(Base):
    timeout: int = Field(default=60, ge=0)  # Hard timeout (s); 0 = no limit
```

工具 schema 注释：`"Hard timeout in seconds (default 60, max 600)."` → `_MAX_TIMEOUT = 600`。

| 常量 | 值 |
|---|---|
| 默认 timeout | 60s |
| 最大 timeout | 600s |
| 默认输出 | `DEFAULT_MAX_OUTPUT_CHARS`（schema 注释 default 10000） |
| 最大输出 | `MAX_OUTPUT_CHARS`（schema 注释 max 50000） |
| yield | `DEFAULT_YIELD_MS` / `MAX_YIELD_MS` |

失败路径：

- `_reap_pid`：子进程结束后 best-effort `os.waitpid(pid, WNOHANG)` 防僵尸；`ProcessLookupError` / `ChildProcessError` / `OSError` 全部吞掉。
- Windows 用 `_PROCESS_TREE_OWNER_ATTR` 进程树 owner：`assign_and_resume` / `release` / `terminate`。
- sandbox：`wrap_command` 包裹，`sandbox_ro_binds` / `sandbox_rw_binds` / `allow_patterns` / `deny_patterns` / `allowed_env_keys`。

### 4.2 通道发送重试（`channels/manager.py`）

```python
_SEND_RETRY_DELAYS = (1, 2, 4)   # 指数退避秒
ORIGIN_REPLY_FINGERPRINTS_MAX_SIZE = 1000
```

`_send_with_retry`：

- `max_attempts = max(config.channels.send_max_retries, 1)`（默认 3）
- `channel.should_retry_send_error(e)` 判定是否可重试
- delay = `_SEND_RETRY_DELAYS[min(attempt-1, len-1)]` → 最后一档固定 4s
- 有 deadline 时按 monotonic 时间重试而非次数

**openmate P0：** 通道重试必须区分可重试/不可重试错误，且退避表有界。

### 4.3 Subagent

- `_SUBAGENT_TERMINAL_WAIT_SECONDS = 300.0`（终态等待 5 分钟）
- `SubagentStatus.phase`: `queued | initializing | awaiting_tools | tools_completed | final_response | done | error`
- `_SubagentHook.before_execute_tools` 打 debug 日志（tool name + JSON args）
- `max_concurrent_subagents` 默认 4

---

## 5. 记忆体系（`agent/memory.py`）

### 5.1 MemoryStore 文件布局

```python
_DEFAULT_MAX_HISTORY = 1000
_DREAM_CONTENT_PATHS = ("SOUL.md", "USER.md", "memory/MEMORY.md")
```

| 文件 | 路径 |
|---|---|
| 长期记忆 | `workspace/memory/MEMORY.md` |
| 会话历史 | `workspace/memory/history.jsonl` |
| 遗留历史 | `workspace/memory/HISTORY.md`（一次性迁移） |
| 人格 | `workspace/SOUL.md` |
| 用户画像 | `workspace/USER.md` |
| 游标 | `memory/.cursor` |
| Dream 游标 | `memory/.dream_cursor` |

### 5.2 并发与失败

- `self._append_lock = threading.Lock()`：串行化 **cursor 分配 + append**（L85）
- `_corruption_logged` / `_malformed_entry_logged` / `_oversize_logged` / `_dream_prompt_oversize_logged`：**限流告警**，不刷屏
- GitStore 追踪 `SOUL.md, USER.md, memory/MEMORY.md, memory/.dream_cursor`
- Dream 提交信息刻意排除 `.dream_cursor`（进度账本不是 durable-memory 编辑）
- 遗留 HISTORY.md → history.jsonl 迁移是 best-effort，优先保内容

### 5.3 Skills（`agent/skills.py`）

```python
_SKILL_NAME = re.compile(r"^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
_SKILL_REFERENCE = re.compile(r"(?<![\w$])\$([A-Za-z0-9_-]+)")
```

身份契约（`valid_skill_metadata`）：

- `metadata.name == 目录名`
- name ≤ 64 且匹配 `_SKILL_NAME`
- description 为 str 且 `1 ≤ len(strip) ≤ 1024`

加载优先级：workspace > plugin > builtin（`skip_names` 去重）。

---

## 6. Cron（`cron/service.py`）

| 常量 | 值 |
|---|---|
| `_MAX_RUN_HISTORY` | `20` |
| `max_sleep_ms` | `300_000`（5 分钟 tick 上限） |
| FileLock | 同目录 `.lock` |

调度类型：`at`（绝对 ms）/ `every`（间隔 ms）/ `cron`（croniter + ZoneInfo）。

失败路径：

- 无效 cron 表达式 / 未知时区 → `ValueError`（add 时拒绝）
- tick 写盘失败 → **保留内存态，下次 tick 重试**（L573-578 注释）
- `run_history` 截断到最近 20 条

---

## 7. 通道矩阵（文件大小级）

| 通道 | 文件 | 字节 |
|---|---|---|
| mochat | `channels/mochat.py` | 36264 |
| telegram | `channels/telegram.py` | 17760 |
| feishu | `channels/feishu.py` | 19303 |
| email | `channels/email.py` | 14162 |
| discord | `channels/discord.py` | 10828 |
| slack | `channels/slack.py` | 9122 |
| dingtalk | `channels/dingtalk.py` | 9081 |
| whatsapp | `channels/whatsapp.py` | 5457 |
| qq | `channels/qq.py` | 4250 |
| manager | `channels/manager.py` | 8272 |
| base | `channels/base.py` | 3612 |

Bridge（WhatsApp）：`bridge/src/server.ts` 3685 B, `whatsapp.ts` 5088 B。

---

## 8. Docker / 部署

`Dockerfile` 3333 B，`docker-compose.yml` 1408 B。WebUI dist 作为 hatch artifact 打进 wheel（`nanobot/web/dist/**/*`，git-ignored 但发布时构建）。

Optional extras：`api` (aiohttp), `azure`, `bedrock`, `langfuse`, `olostep`（仅 py<3.14）。

---

## 9. 失败路径汇总（openmate 对照表）

| 场景 | nanobot 行为 | 源码位置 |
|---|---|---|
| 通道发送失败 | 指数退避 1s/2s/4s，默认最多 3 次；不可重试错误直接放弃 | channels/manager.py L59-60, L998-1050 |
| 事件 handler 抛异常 | logger.exception，继续下一 handler | bus/queue.py L125-126 |
| 无 running loop 的 nowait | drop + debug 日志 | bus/queue.py L136-139 |
| shell 超时 | 硬超时默认 60s，上限 600s；进程树 terminate | tools/shell.py |
| shell 僵尸进程 | `_reap_pid` waitpid WNOHANG | tools/shell.py L60-80 |
| 会话元数据损坏 | last_consolidated 越界 → 重置 0 | session/manager.py L294-301 |
| 会话迁移竞态 | FileLock 30s 超时 | session/manager.py L74 |
| 历史游标损坏 | 限流 warning，不中断 | memory.py L81-83 |
| cron 写盘失败 | 保内存态，下次 tick 重试 | cron/service.py L573-578 |
| 轮中崩溃 | pending_user_turn + runtime_checkpoint(v1) + acknowledge | loop.py + session/recovery |
| 阶段乱序 | require_runtime/require_session 抛 RuntimeError | loop.py L183-193 |
| Subagent 卡死 | 终态等待 300s | loop.py L124 |

---

## 10. openmate 设计抄袭清单

### P0（第 1 周必须有）

1. **MessageBus 双队列**：`inbound` / `outbound` 均为无界 `asyncio.Queue`；本地 publish 与通道投递分离。抄 `bus/queue.py` 全文结构。
2. **Session 持久化 + FileLock**：`channel:chat_id` 作 key；`.lock` 文件锁；`last_consolidated` 水位线；损坏时重置而非炸。
3. **崩溃恢复三件套**：`pending_user_turn` 落盘 → 处理完 `acknowledge` → 崩溃后 `restore_runtime_checkpoint`。checkpoint 带版本号 `"v1"`。
4. **通道重试表**：`(1, 2, 4)` 秒 + `send_max_retries=3` + `should_retry_send_error` 分类。
5. **Exec 默认 timeout 60s / max 600s**，输出截断 default 10k / max 50k。
6. **会话 cache LRU 128**（`SESSION_CACHE_MAX_SIZE`）。

### P1（第 2-3 周）

7. **Dream 记忆整合**：每 2h（`interval_h=2`），独立 model preset，GitStore 审计 `SOUL.md/USER.md/MEMORY.md`，排除 `.dream_cursor`。
8. **Summary checkpoint**：隐藏边界插入 `SUMMARY_CONTINUATION_TEXT`，`_last_summary` 元数据，`last_archived` 前移。
9. **Skills 合同**：name ≤64 + regex；description 1..1024；workspace > plugin > builtin 去重。
10. **Subagent 相位机**：`queued→initializing→awaiting_tools→tools_completed→final_response→done|error`，终态等待 300s，默认并发 4。
11. **Cron**：`at|every|cron` 三型；run_history 截断 20；写盘失败不丢内存态。
12. **session_ttl_minutes=15** idle compact + 60s 扫描间隔。
13. **unified_session** 开关：单用户多设备共享一个会话。

### P2（后续）

14. Model presets（named model+generation 切换）+ fallback_models。
15. `provider_retry_mode: standard|persistent`。
16. 临时聊天 `ephemeral=True` 不进历史/记忆。
17. 轮中 `pending_queue` 注入用户消息。
18. tool_hint_max_length=40 通道工具提示截断。
19. 告警限流标志位（`_corruption_logged` 等四个 bool）避免日志洪水。
20. Hatch 把前端 dist 作为 artifact 打进 wheel（单包分发 WebUI）。

---

## 11. 与 openmate 的差异提醒

- nanobot **单用户**定位：无多租户、无 RBAC。openmate 若做多用户需在外层加 tenant_id。
- MessageBus **无界队列**：个人助手够用；若 openmate 要防内存打爆，P2 再加 `maxsize` + 背压。
- 记忆是 **文件 + Markdown**，不是向量库。openmate 若要语义检索需另接 embedding 层（参考 CowAgent 报告）。
- 无 approval / human-in-the-loop 协议。LibreChat 报告有 resumable streams + approvals 可参考。
