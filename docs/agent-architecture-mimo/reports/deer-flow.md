# DeerFlow 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/bytedance/deer-flow  
> 抓取通道: cdn.jsdelivr.net/gh/bytedance/deer-flow@main  
> 版本快照: main @ 2026-09-13（DeerFlow 2.0 ground-up rewrite）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 super agent harness、中间件链、沙箱、子代理、记忆与调度借鉴

---

## 0. 诚实性说明 — 关键发现

**DeerFlow 2.0 是 ground-up rewrite，与 v1 无共享代码。**

- README 明确：*"DeerFlow 2.0 is a ground-up rewrite. It shares no code with v1."*
- 原 Deep Research 框架维护在 **`main-1.x` 分支**（`tree/main-1.x`）。
- 旧路径 `src/graph/builder.py`、`src/graph/nodes.py` 等 **在 main 分支不存在**（CDN 404）。
- jsDelivr `data.jsdelivr.com` 的 flat listing 仍是 v1 陈旧索引——**不能信任**。
- **已实读**：
  - `README.md`（148932 bytes，DeerFlow 2.0 全量）
  - `backend/README.md`（26803 bytes，架构 + 项目结构）
  - `config.example.yaml`（145864 bytes，配置全量）
  - `backend/packages/harness/deerflow/sandbox/sandbox.py`（9177 bytes）
  - `backend/packages/harness/deerflow/subagents/executor.py`（95128 bytes）

---

## 1. 项目定位（README 实读）

DeerFlow 2.0：**super agent harness**

> *"an open-source super agent harness that orchestrates sub-agents, memory, and sandboxes to do almost anything — powered by extensible skills."*

核心能力：

- 子代理委托
- 持久记忆
- 沙箱执行（Local / Docker / K8s）
- 可扩展 Skills
- MCP 集成
- IM 通道（Feishu / Slack / Telegram / Discord）
- 定时任务
- TUI 终端工作台
- LangSmith / Langfuse / Monocle 追踪

---

## 2. 系统架构（backend/README.md 实读）

```
┌──────────────────────────────────────┐
│          Nginx (Port 2026)           │
│      Unified reverse proxy           │
└───────┬──────────────────┬───────────┘
        │                  │
  /api/langgraph/*    /api/* (other)
  rewritten to /api/* │
        ▼
┌────────────────────────────────────────┐
│        Gateway API (8001)              │
│        FastAPI REST + agent runtime    │
│                                        │
│ Models, MCP, Skills, Memory, Uploads,  │
│ Artifacts, Threads, Runs, Streaming    │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Lead Agent                         │ │
│ │ Middleware Chain, Tools, Subagents │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**端口**：

| 组件 | 端口 |
|------|------|
| Nginx 统一入口 | **2026** |
| Gateway API | **8001** |
| Frontend (Next.js) | 3000（内部） |

---

## 3. Lead Agent 中间件链（backend/README.md 实读）

9 个中间件，**严格顺序**：

| # | Middleware | 职责 |
|---|-----------|------|
| 1 | **ThreadDataMiddleware** | 创建 per-thread 隔离目录（workspace, uploads, outputs） |
| 2 | **UploadsMiddleware** | 注入新上传文件到对话上下文 |
| 3 | **SandboxMiddleware** | 获取沙箱环境用于代码执行 |
| 4 | **SummarizationMiddleware** | 接近 token 上限时压缩上下文（可选） |
| 5 | **TodoListMiddleware** | plan 模式下跟踪多步任务（可选） |
| 6 | **TitleMiddleware** | 首次交换后自动生成会话标题 |
| 7 | **MemoryMiddleware** | 异步记忆提取排队 |
| 8 | **ViewImageMiddleware** | 为视觉模型注入图片数据（条件） |
| 9 | **ClarificationMiddleware** | 拦截澄清请求并中断执行（**必须最后**） |

**Loop 检测**（`loop_detection.enabled`）：

- 检查重复 tool-call 集合 + 单工具频率
- 警告不跳过批次其余部分
- 硬限制优先，停止整批
- 警告级批次完整计数，下次模型请求收到瞬时提示

---

## 4. 沙箱系统（sandbox.py 实读）

### 4.1 抽象接口

```python
class Sandbox(ABC):
    def execute_command(self, command, env=None, timeout: float | None = None, ...): ...
    def execute_command_in_scope(self, command, env=None, timeout=None, ...): ...
    def release_command_scope(self, scope_id: str) -> None: ...
    def read_file(self, path: str) -> str: ...
    def download_file(self, path: str) -> bytes: ...
    def list_dir(self, path: str, max_depth=2) -> list[str]: ...
    def write_file(self, path: str, content: str, append: bool = False) -> None: ...
    def glob(self, path, pattern, *, include_dirs=False, max_results=200) -> tuple[list[str], bool]: ...
    def grep(self, ...): ...
    def update_file(self, path: str, content: bytes) -> None: ...
```

### 4.2 关键常量与失败路径

```python
def _validate_extra_env(extra_env: dict[str, str] | None) -> None:
    ...
    raise ValueError(
        f"extra_env key {key!r} is not a valid POSIX environment variable name "
        f"(must match ^[A-Za-z_][A-Za-z0-9_]*$). This protects shell-using sandbox "
        f"implementations from command injection via the key."
    )
```

**命令注入防护**：extra_env 键必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`。

```python
# glob 默认
max_results=200

# list_dir 默认
max_depth=2
```

### 4.3 虚拟路径

- `/mnt/user-data/{workspace,uploads,outputs}` → 线程物理目录
- `/mnt/skills` → `deer-flow/skills/`
- 递归发现 `skills/{public,custom}` 下嵌套 `SKILL.md`

### 4.4 提供者

- `LocalSandboxProvider`：本地文件系统（bash 默认禁用）
- `AioSandboxProvider`：Docker（community/）
- K8s：provisioner 模式

### 4.5 文件写安全

- `str_replace` 按 `(sandbox.id, path)` 串行化 read-modify-write
- 隔离沙箱保持并发，即使虚拟路径相同

---

## 5. 子代理系统（executor.py 实读）

### 5.1 关键常量

```python
MAX_CONCURRENT_SUBAGENTS = 3
_BASH_EVIDENCE_MAX_ENTRIES = 20
# 15-minute timeout（README）
```

### 5.2 状态机

```python
class SubagentStatus(Enum):
    ...
    def is_terminal(self) -> bool: ...
```

```python
@dataclass
class SubagentResult:
    ...
    def try_set_terminal(self, ...):
        # Background timeout/cancellation and the execution worker can race
        raise ValueError(f"Status {status} is not terminal")
```

### 5.3 执行路径

```python
class SubagentExecutor:
    def execute(self, task, result_holder=None) -> SubagentResult: ...
    def execute_async(self, task, task_id=None) -> str: ...
    
    async def _aexecute(self, task, result_holder=None) -> SubagentResult: ...
    async def _aexecute_admitted(...) -> SubagentResult: ...
    
    def _execute_in_isolated_loop(self, task, result_holder=None) -> SubagentResult:
        ...
        return future.result(timeout=self.config.timeout_seconds)
```

**隔离事件循环**：

```python
def _run_isolated_subagent_loop(...): ...
def _shutdown_isolated_subagent_loop() -> None:
    thread.join(timeout=1)
    # Skipping close if shutdown did not complete within timeout
def _get_isolated_subagent_loop() -> asyncio.AbstractEventLoop:
    if not started_event.wait(timeout=5):
        raise RuntimeError("Timed out starting isolated subagent event loop")
```

### 5.4 超时与递归限制

```python
# run_config
"recursion_limit": self.config.max_turns

# async 执行
async def run_with_timeout():
    try:
        ... timeout=self.config.timeout_seconds
    except ...:
        error=f"Execution timed out after {self.config.timeout_seconds} seconds"
```

### 5.5 Bash 证据收割

```python
_BASH_EVIDENCE_MAX_ENTRIES = 20
# Exit-status markers in bash *output text*: a nonzero exit does not raise
def _bash_evidence_status(content: str, meta_status: str) -> tuple[str, str | None]: ...
def _harvest_bash_executions(...):
    return executions[-_BASH_EVIDENCE_MAX_ENTRIES:]
```

**设计要点**：bash 非零退出 **不抛异常**，而是在输出文本中解析 exit-status 标记；证据保留最近 20 条。

### 5.6 递归限制中断恢复

```python
# (#3875 Phase 2): when recursion_limit aborts the run mid-flight,
# final_state holds the last chunk streamed before the limit fired
```

---

## 6. 配置体系（config.example.yaml 实读）

### 6.1 版本与递归

```yaml
config_version: 42
max_recursion_limit: 1000
```

客户端提供的 `recursion_limit` 超过 `max_recursion_limit` 会被钳制；无效/非正回退到服务器默认 **100**。

### 6.2 Token 预算

```yaml
token_budget:
  enabled: false
  max_tokens: 200000
  max_input_tokens: null
  max_output_tokens: null
  warn_threshold: 0.8      # 80% 警告
  hard_stop_threshold: 1.0 # 100% 强制停止
```

超 `hard_stop_threshold` 时：**剥离 tool_calls，强制立即产出最终答案**。

### 6.3 记忆

```yaml
memory:
  # enabled, storage, debounce, facts limits
```

- 异步提取
- 范围安全写入（scope/confidence 门控）
- 原子替换（矛盾移除仅在替换通过门控后执行）
- 5 秒异步注入截止
- strict/fail_closed 读失败会停轮

### 6.4 调度器

```yaml
scheduler:
  enabled: ...
  recursion_limit: 1000
  multi_instance: false
  max_concurrent_runs: ...
  queue_timeout_seconds: ...
```

- 单实例默认；多 Pod 需 Postgres + heartbeat + db events
- 任务在 `queued/launching/running` 时定义冻结

### 6.5 Checkpoint

```yaml
database:
  checkpoint_channel_mode: ...
  checkpoint_delta:
    snapshot_frequency: 10  # 默认
checkpoint_cache:
  type: memory  # 或 redis
  max_entries: 0  # 0 禁用
```

`snapshot_frequency=10` 与 `checkpoint_channel_mode` 在首次构建 agent 时冻结，需进程重启。

### 6.6 流桥

```yaml
stream_bridge:
  type: redis  # 多 worker 必需
  heartbeat_interval_seconds: 15
  stream_ttl_seconds: ...
```

SSE `gap` 事件：可重连游标被裁剪或订阅者落后时发出，而非静默部分重放。

---

## 7. 模型配置（config.example.yaml 实读）

支持的 Provider（`use` 类路径）：

| Provider | use 路径 |
|----------|----------|
| OpenAI | `langchain_openai:ChatOpenAI` |
| Anthropic | `langchain_anthropic:ChatAnthropic` |
| DeepSeek | `deerflow.models.patched_deepseek:PatchedChatDeepSeek` |
| MiniMax | `deerflow.models.patched_minimax:PatchedChatMiniMax` |
| Ollama | `langchain_ollama:ChatOllama`（**原生**，非 OpenAI 兼容） |
| vLLM | `deerflow.models.vllm_provider:VllmChatModel` |
| Codex CLI | `deerflow.models.openai_codex_provider:CodexChatModel` |
| Claude Code | `deerflow.models.claude_provider:ClaudeChatModel` |
| MiMo | `deerflow.models.patched_mimo:PatchedChatMiMo` |
| StepFun | `deerflow.models.patched_stepfun:PatchedChatStepFun` |
| MindIE | `deerflow.models.mindie_provider:MindIEChatModel` |

**关键设计**：

- `supports_thinking` / `supports_vision` / `supports_reasoning_effort` 显式声明
- `when_thinking_enabled` / `when_thinking_disabled` 条件 extra_body
- `context_window` 驱动「% context used」指示器与 fraction 触发的 summarization
- 混合货币禁用成本汇总（防无效加总）

---

## 8. 工具生态（backend/README.md + config）

| 类别 | 工具 |
|------|------|
| Sandbox | `bash`, `ls`, `read_file`, `write_file`, `str_replace` |
| Built-in | `present_files`, `ask_clarification`, `view_image`, `task`（subagent） |
| Community | Tavily, Jina, Crawl4AI, Firecrawl, fastCRW, DuckDuckGo |
| MCP | stdio / SSE / HTTP；OAuth `client_credentials` / `refresh_token` |
| Skills | 系统提示注入 |

MCP 工具名默认前缀 `<server_name>_`；`tool_name_prefix: false` 可关。

---

## 9. 失败路径汇总

| 场景 | 处理 |
|------|------|
| extra_env 键非法 | `ValueError`（命令注入防护） |
| 沙箱容器死亡 | acquire 落到 create；health-check 失败视为 unknown 而非 dead |
| 子代理超时 | `timeout_seconds`（默认 15 分钟） |
| 子代理并发 > 3 | `MAX_CONCURRENT_SUBAGENTS = 3` |
| 隔离循环启动超时 | `RuntimeError`（5s wait） |
| 隔离循环关闭超时 | 跳过 close，记日志 |
| Token 预算 hard_stop | 剥离 tool_calls，强制最终答案 |
| 记忆读失败 strict | 停轮 |
| 记忆注入 5s 截止 | fail-open 继续 |
| recursion_limit 触发 | final_state 保留 limit 前最后 chunk |
| bash 非零退出 | 不抛；解析 exit-status 标记 |
| Checkpoint 配置变更 | 冻结，需进程重启 |
| Gateway 非健康 | `make up` 非零退出 + 打印日志 |
| SSE 游标被裁剪 | 发 `gap` 事件 |
| 任务定义在 queued/running 时 | 冻结，拒绝静默变更 |

---

## 10. 对 openmate 的借鉴

### 10.1 直接可抄（P0）

1. **9 中间件严格顺序**，Clarification 必须最后。
2. **`MAX_CONCURRENT_SUBAGENTS = 3`** + 15 分钟超时。
3. **Token 预算**：warn 0.8 / hard_stop 1.0，超限剥离 tool_calls。
4. **`max_recursion_limit: 1000`** + 客户端值钳制 + 无效回退 100。
5. **extra_env 键白名单** `^[A-Za-z_][A-Za-z0-9_]*$`（命令注入防护）。
6. **bash 非零退出不抛**，解析 exit-status 标记。
7. **`_BASH_EVIDENCE_MAX_ENTRIES = 20`**。
8. **隔离子代理事件循环** + 超时启动/关闭。
9. **记忆 5s 注入截止** + strict/fail_closed 选项。
10. **checkpoint `snapshot_frequency: 10`** 默认。
11. **SSE `gap` 事件**（而非静默部分重放）。
12. **任务定义在 queued/running 时冻结**。

### 10.2 应避免的坑

- **不要在 main 分支找 v1 路径**：2.0 重写后 `src/graph/*` 已不存在。
- **jsDelivr flat listing 可能是陈旧索引**：对重写仓库必须以 README/CDN 直取为准。
- 多 worker 需 Postgres + Redis + heartbeat + db events 四件套，缺一不可。
- 调度器多实例是 startup-only，改 ConfigMap 不生效。

### 10.3 重构优先级

- **P0**：中间件链（ThreadData → Sandbox → Memory → Clarification）
- **P0**：子代理并发/超时/隔离循环
- **P0**：Token 预算 + recursion_limit 钳制
- **P0**：沙箱 extra_env 键校验 + bash exit-status 解析
- **P1**：记忆范围安全写入 + 5s 截止
- **P1**：checkpoint snapshot_frequency + 配置冻结边界
- **P1**：SSE gap 事件
- **P2**：完整调度器 MVP
- **P2**：IM 通道（Feishu/Slack/TG/Discord）

---

## 11. 源码锚点速查

```
README.md (main, DeerFlow 2.0)
  ground-up rewrite; v1 在 main-1.x
  super agent harness: sub-agents + memory + sandboxes + skills
  Nginx :2026, Gateway :8001
  make setup / make doctor / make support-bundle
  GATEWAY_WORKERS=1 默认
  安全: 默认 127.0.0.1; admin ≡ code execution

backend/README.md
  9 中间件严格顺序（Clarification 最后）
  loop_detection: 重复 tool-call 集 + 单工具频率
  沙箱: LocalSandboxProvider / AioSandboxProvider
  虚拟路径: /mnt/user-data/{workspace,uploads,outputs}; /mnt/skills
  str_replace 按 (sandbox.id, path) 串行
  子代理: max 3, 15 分钟
  记忆: 异步提取; scope-safe; 5s 截止
  alembic bootstrap_schema 自动迁移
  IM: Feishu 流式; Slack/TG wait(); Discord 独立 event loop

config.example.yaml
  config_version: 42
  max_recursion_limit: 1000
  token_budget.warn_threshold: 0.8
  token_budget.hard_stop_threshold: 1.0
  checkpoint_delta.snapshot_frequency: 10 (默认)
  stream_bridge.heartbeat_interval_seconds: 15
  scheduler.recursion_limit: 1000
  Ollama 必须用 langchain_ollama:ChatOllama（非 OpenAI 兼容）

backend/packages/harness/deerflow/sandbox/sandbox.py
  extra_env 键: ^[A-Za-z_][A-Za-z0-9_]*$ → ValueError
  glob max_results=200
  list_dir max_depth=2
  write_file(append=False)

backend/packages/harness/deerflow/subagents/executor.py
  MAX_CONCURRENT_SUBAGENTS = 3
  _BASH_EVIDENCE_MAX_ENTRIES = 20
  bash 非零退出不抛，解析 exit-status 标记
  隔离 asyncio loop; started_event.wait(timeout=5)
  recursion_limit = config.max_turns
  (#3875) recursion_limit 中断时 final_state 保留最后 chunk

License: MIT
```

**本轮未打开**：lead_agent factory 全文、memory 提取实现、MCP 适配器、前端。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | 沙箱 + MCP + skills + 工具组 |
| 权限/安全边界 | 5 | extra_env 校验 + admin≡RCE 警示 + 默认 loopback |
| 容错与会话恢复 | 5 | checkpoint + gap 事件 + 任务冻结 |
| 上下文工程 | 5 | 9 中间件 + summarization + token 预算 |
| 可扩展（技能/MCP） | 5 | skills + MCP + community tools |
| 可观测与可评测 | 4 | LangSmith/Langfuse/Monocle 双/三追踪 |
| 生产可用成熟度 | 4 | 2.0 新但工程密度极高 |

**综合**：**super agent harness 的工程化密度标杆**。openmate 必抄中间件链、子代理隔离、Token 预算、沙箱注入防护与 checkpoint 冻结边界。

---

## 13. 关键链接

- 仓库：https://github.com/bytedance/deer-flow  
- v1 分支：https://github.com/bytedance/deer-flow/tree/main-1.x  
- 官网：https://deerflow.tech  
- 相关报告：`reports/ui-tars.md`、`reports/langgraph.md`、`reports/openclaw.md`
