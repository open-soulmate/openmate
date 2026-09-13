# AstrBot 深度架构报告（openmate 参考级）

> 供 openmate 参考：多平台 IM 适配、插件（Star）生命周期、ToolLoop 常量、会话管理
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `AstrBotDevs/AstrBot@master`
> 版本锚点：`pyproject.toml` → `name = "AstrBot"`, `version = "4.28.0"`, `requires-python = ">=3.12"`, license AGPL-3.0-or-later

---

## 0. 验证状态

**实拉成功（OutFile 字节校验）：**

| 路径 | 字节 |
|---|---|
| `pyproject.toml` | 3252 |
| `astrbot/core/agent/runners/tool_loop_agent_runner.py` | 67394 |
| `astrbot/core/star/star_manager.py` | 88845 |
| `astrbot/core/platform/manager.py` | 14302 |
| `astrbot/core/provider/manager.py` | 41127 |
| `astrbot/core/conversation_mgr.py` | 17078 |
| `astrbot/core/core_lifecycle.py` | 18920 |
| `astrbot/core/db/__init__.py` | 28840 |
| `astrbot/core/db/sqlite.py` | 98839 |
| `astrbot/core/pipeline/process_stage/method/agent_sub_stages/internal.py` | 24093 |
| `astrbot/core/agent/mcp_client.py` | 31124 |
| `astrbot/core/provider/func_tool_manager.py` | 45352 |
| `astrbot/core/platform/astr_message_event.py` | 19767 |
| `astrbot/core/star/context.py` | 33700 |
| `astrbot/core/knowledge_base/kb_mgr.py` | 15039 |

---

## 1. 依赖与运行时（`pyproject.toml`）

关键依赖：

| 包 | 版本约束 | 用途 |
|---|---|---|
| `mcp` | `>=1.8.0,<2` | MCP 客户端 |
| `apscheduler` | `>=3.11.0` | 定时任务 |
| `filelock` | `>=3.18.0` | 文件锁 |
| `faiss-cpu` | `>=1.14.3` | 向量检索 |
| `rank-bm25` | `>=0.2.2` | 关键词检索 |
| `jieba` | `>=0.42.1` | 中文分词 |
| `tenacity` | `>=9.1.2` | 重试 |
| `sqlalchemy[asyncio]` + `sqlmodel` | `>=2.0.41` / `>=0.0.24` | ORM |
| `aiosqlite` | `>=0.21.0` | 异步 SQLite |
| `watchfiles` | `>=1.0.5` | 热重载 |
| `websockets` | `>=15.0.1` | WS |
| 平台 SDK | aiocqhttp, python-telegram-bot, py-cord, slack-sdk, lark-oapi, dingtalk-stream, wechatpy, qq-botpy | IM |

CLI 入口：`astrbot = "astrbot.cli.__main__:cli"`

构建：hatchling；`artifacts = ["astrbot/dashboard/dist/**"]` — **前端 dist 打进 wheel**（与 nanobot 同策略）。

Python ≥3.12，pyright `typeCheckingMode = "basic"`，ruff line-length 88。

---

## 2. ToolLoopAgentRunner 常量（`tool_loop_agent_runner.py`）— openmate 重点

```python
class ToolLoopAgentRunner(BaseAgentRunner[TContext]):
    TOOL_RESULT_MAX_ESTIMATED_TOKENS = 27_500
    TOOL_RESULT_PREVIEW_MAX_ESTIMATED_TOKENS = 7000
    EMPTY_OUTPUT_RETRY_WAIT_MAX_S = 4
```

| 常量 | 值 | 含义 |
|---|---|---|
| `TOOL_RESULT_MAX_ESTIMATED_TOKENS` | **27500** | 工具结果超此值 → 物化到文件 |
| `TOOL_RESULT_PREVIEW_MAX_ESTIMATED_TOKENS` | **7000** | 预览截断阈值 |
| `EMPTY_OUTPUT_RETRY_WAIT_MAX_S` | **4** | 空输出重试最大等待秒 |

相关类型：

- `_HandleFunctionToolsResult`：从 `MessageChain` / tool_call_result_blocks / cached_image 构造
- `FollowUpTicket`：跟进票据
- `_ToolExecutionInterrupted`：工具执行被中断异常
- `MAX_STEPS_REACHED_PROMPT`：达步数上限时注入的 prompt

其他：

- `enforce_max_turns` / `request_max_retries` 可配置
- `max_context_tokens` 从 `provider.provider_config.get("max_context_tokens", 0)`
- `_materialize_large_tool_result`：估算 token > 27500 时写溢出文件
- `_truncate_tool_result_preview`：> 7000 截断预览
- `_await_or_stop`：可停止等待

**openmate P0 直接抄：** 27500 / 7000 / 4 这组数字是工具结果治理的生产值。

---

## 3. 核心生命周期（`core_lifecycle.py`）

`AstrBotCoreLifecycle.initialize()` 顺序（L157-290）：

1. `db.initialize()`
2. `sp.initialize()`（存储路径/状态）
3. `html_renderer.initialize()`
4. `umop_config_router.initialize()`
5. `astrbot_config_mgr.initialize()`
6. `persona_mgr.initialize()`
7. `provider_manager.initialize()`
8. `kb_manager.initialize()`
9. `start_time = int(time.time())`
10. `platform_manager.initialize()`
11. `_load()` → 启动 `cron_manager.start(star_context)`

未设默认 chat provider 时 `_warn_about_unset_default_chat_provider` 打警告并选用 startup fallback。

`restart_process` 导入自 `astrbot.core.process_restart` — 支持进程重启。

---

## 4. 会话管理（`conversation_mgr.py`）

`ConversationManager`：

| 方法 | 作用 |
|---|---|
| `register_on_session_deleted` | 注册删除回调 |
| `_trigger_session_deleted(unified_msg_origin)` | 触发回调 |
| `_convert_conv_from_v2_to_v1(include_history=True)` | v2→v1 迁移；`include_history=False` 时 history 序列化为 `"[]"` |
| `new_conversation` / `switch_conversation` / `delete_conversation` | 生命周期 |
| `delete_conversations_by_user_id` | 按用户清 |
| `get_curr_conversation_id` | 当前会话 ID |
| `get_conversations` / `get_filtered_conversations` | 列表；`include_history` 控制是否加载全文 |

**openmate 启示：** 列表接口默认可不带 history（`include_history=False`），避免列表接口拉爆内存。

---

## 5. 插件系统（`star/star_manager.py` 88845 B）

Star = AstrBot 插件单元。文件体量说明含完整加载/热重载/依赖解析。

配套：

- `star/context.py` 33700 B：插件上下文
- `star/register/star_handler.py` 20058 B：handler 注册
- `star/command_management.py` 18099 B：命令管理
- `star_tools.py` 10847 B：插件可用工具

平台层：

- `platform/manager.py`：平台管理
- `astr_message_event.py`：统一消息事件
- 适配器：aiocqhttp, telegram, discord, slack, feishu, dingtalk, qqofficial, satori, misskey, wecom, wecom_ai_bot, weixin_official_account, lark

---

## 6. Provider 与工具

- `provider/manager.py` 41127 B：多 LLM provider
- `func_tool_manager.py` 45352 B：函数工具管理
- `agent/mcp_client.py` 31124 B：MCP 客户端
- Runner 多态：`tool_loop_agent_runner`, `coze/coze_agent_runner`, `dashscope/...`, `dify/...`

Pipeline：

```
process_stage/method/agent_sub_stages/internal.py  (24093)
result_decorate/stage.py                           (17492)
respond/stage.py                                   (11042)
```

---

## 7. 知识库

- `knowledge_base/kb_mgr.py` 15039 B
- `kb_helper.py` 22666 B
- `kb_db_sqlite.py` 10993 B
- `db/vec_db/faiss_impl/document_storage.py` 13234 B

FAISS + BM25（rank-bm25）+ jieba 中文分词。

---

## 8. 失败路径汇总

| 场景 | 行为 | 出处 |
|---|---|---|
| 工具结果过大 | 估算 >27500 tokens → 写溢出文件 | tool_loop L111, L369-427 |
| 工具结果预览过长 | >7000 tokens 截断 | tool_loop L112, L442-453 |
| 空输出 | 最多重试等待 4s | tool_loop L115 |
| 工具执行中断 | `_ToolExecutionInterrupted` 异常 | tool_loop L102 |
| 达 max steps | 注入 `MAX_STEPS_REACHED_PROMPT` | tool_loop L125 |
| 无默认 provider | 警告 + startup fallback | core_lifecycle L117-139 |
| 会话列表含全史 | `include_history` 开关，默认可关 | conversation_mgr L246 |
| v2→v1 迁移 | include_history=False 时 history 写 `"[]"` | conversation_mgr L84 |
| 需要进程重启 | `restart_process` | core_lifecycle L32 |
| 插件/工具加载 | star_manager 大文件含热重载 | star_manager.py |

---

## 8b. MCP 客户端细节（`func_tool_manager.py` + `mcp_client.py`）

### 超时常量

```python
MAX_MCP_TIMEOUT_SECONDS = 300.0
```

`_resolve_timeout`：若配置 timeout > 300，**钳制到 300** 并警告（中文提示：避免长时间等待）。

### 异常层次

```python
class MCPInitError(Exception): ...
class MCPInitTimeoutError(asyncio.TimeoutError, MCPInitError): ...
class MCPAllServicesFailedError(MCPInitError): ...
class MCPShutdownTimeoutError(asyncio.TimeoutError): ...
```

- `MCPInitSummary`：初始化汇总
- `_MCPServerRuntime`：单 server 运行时
- `_MCPClientDictView(Mapping)`：只读 dict 视图

### 连接模型

```python
# Each connection runs in its own task so that anyio cancel scopes
self._connection_task: asyncio.Task | None = None
self._old_connection_tasks: list[asyncio.Task] = []
```

**每连接独立 asyncio.Task**，anyio cancel scope 隔离。

### stdio 安全

- `_get_stdio_command_allowlist()`：stdio 命令白名单
- `_validate_stdio_args(command_name, args)`：参数校验
- `validate_mcp_stdio_config(config)`：配置校验
- `_normalize_stdio_command_name`：命令名规范化
- `_prepare_stdio_env` / `_merge_environment_variables`：环境变量合并

### 快速连通测试

```python
async def _quick_test_mcp_connection(config) -> tuple[bool, str]:
    timeout = cfg.get("timeout", 10)
    ...
    except asyncio.TimeoutError:
        return False, f"Connection timeout: {timeout} seconds"
```

默认快速测试超时 **10s**。

### 权限守卫工具

```python
class _PermissionGuardedTool(FunctionTool):
    async def call(self, context, **kwargs):
        ...
```

FunctionToolManager 持有 `mcp_client_dict` 只读视图。

---

## 8c. 平台适配器矩阵（列表 API 字节级）

| 适配器 | 字节 |
|---|---|
| feishu | 70146 |
| wecom_bot | 60600 |
| misskey | 35905+29403 |
| telegram | 31688 |
| weixin | 31268 |
| qq | 28231 |
| satori | 28142 |
| wechat_kf | 25881 |
| discord | 20832 |
| slack | 21553 |
| dingtalk | 42632 |
| aiocqhttp | 18612 |
| wecom | 15608 |
| wechatmp | 18453 |
| wecom_ai_bot | 18394 |
| qqofficial | 13682 |
| lark | 13734 |
| terminal | 12948 |
| web | 240063 |

统一事件基类：`astr_message_event.py` 15450 B。

---

## 8d. DB 层（`db/sqlite.py` 98839 B + `db/__init__.py` 18555 B）

- SQLAlchemy async + sqlmodel
- 迁移：`db/migration/migra_3_to_4.py` 15354 B, `sqlite_v3.py` 15084 B
- `db/po.py` 13786 B：持久化对象

---

## 9. openmate 设计抄袭清单

### P0

1. **工具结果 token 三档**：
   - 预览上限 **7000**
   - 物化阈值 **27500**
   - 空输出重试等待 ≤ **4s**
2. **`include_history` 列表开关**：列表 API 默认不加载全文 history。
3. **文件锁依赖显式化**：`filelock>=3.18.0`。
4. **前端 dist 作 hatch artifact** 打进 wheel（单包分发）。

### P1

5. **初始化顺序固定**：db → sp → renderer → config → persona → provider → kb → platform → cron。
6. **无默认 provider 时显式 fallback + 警告**，不静默失败。
7. **FAISS + BM25 + jieba** 混合中文检索。
8. **MCP 客户端独立模块**（`mcp_client.py` 31k）。
9. **多 runner 抽象**：ToolLoop / Coze / DashScope / Dify 同接口。
10. **统一消息事件** `astr_message_event.py` 跨平台。

### P2

11. Star 插件热重载（watchfiles）。
12. 进程级 restart_process。
13. 平台适配器矩阵（13+ IM）。
14. Pipeline 阶段机：process → result_decorate → respond。
15. Dashboard FastAPI + Vue。

---

## 10. 与 nanobot / CowAgent 对比

| 维度 | AstrBot | nanobot | CowAgent |
|---|---|---|---|
| 定位 | 多平台聊天机器人框架 | 个人 Agent | 个人 Agent + 团队 |
| 工具结果治理 | **27500/7000 tokens 显式常量** | 16000 chars | 无同等显式 |
| 插件 | Star 体系 | Skills + tools entry-points | Skills |
| 向量 | FAISS+BM25 | 文件记忆 | SQLite 向量+关键词 |
| 平台数 | 13+ | 10 | 12+ |
| Python | ≥3.12 | ≥3.11 | 未在 pyproject 锁死 |

## 10b. openmate 合成建议（终版）

把 AstrBot 当「多 IM 适配层参考」，不要当 Agent 内核参考：

| 抄什么 | 具体值 |
|---|---|
| 工具结果预览上限 | 7000 tokens |
| 工具结果物化阈值 | 27500 tokens |
| 空输出重试等待 | ≤4s |
| MCP 最大超时 | 300s（超则钳制） |
| MCP 快速连通测试 | 10s |
| 每 MCP 连接 | 独立 asyncio.Task（anyio cancel scope） |
| stdio 命令 | 白名单 + 参数校验 |
| 会话列表 | include_history 默认可关 |
| 无默认 provider | 显式警告 + startup fallback |
| 初始化顺序 | db → sp → renderer → config → persona → provider → kb → platform → cron |

**不要抄：** 13+ 平台适配器的全部实现细节（openmate 先做 2-3 个通道即可）；Dashboard Vue 全套。

**与 nanobot 互补：** nanobot 有崩溃恢复（pending_user_turn/checkpoint），AstrBot 没有同等机制——openmate 必须两者都抄。
