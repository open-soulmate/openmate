# gpt-engineer 架构深度分析

> 仓库：[gpt-engineer-org/gpt-engineer](https://github.com/AntonOsika/gpt-engineer)（原 AntonOsika/gpt-engineer，55k+ Stars）
> 定位：CLI 代码生成实验平台，"用自然语言描述软件，AI 自动编写并执行代码"
> 语言：Python | 框架：LangChain + Typer CLI

---

## 1. 整体架构分层

gpt-engineer 采用经典的三层架构，职责清晰：

```
┌─────────────────────────────────────────────┐
│  applications/cli/   — CLI 入口 + 用户交互   │
│    main.py (Typer)  → CliAgent              │
│    file_selector.py → 文件选择器             │
│    collect.py       → 遥测/反馈收集          │
├─────────────────────────────────────────────┤
│  core/               — 核心抽象层            │
│    BaseAgent        → 抽象 Agent 接口        │
│    AI               → LLM 调用封装           │
│    FilesDict        → 代码文件容器           │
│    chat_to_files    → 聊天→代码解析器        │
│    diff             → Diff 处理引擎          │
│    preprompts_holder→ 提示词管理             │
│    Prompt           → 多模态提示封装         │
├─────────────────────────────────────────────┤
│  core/default/       — 默认实现层            │
│    SimpleAgent      → 简单 Agent 实现        │
│    CliAgent         → CLI 专用 Agent         │
│    DiskMemory       → 文件系统 KV 存储       │
│    DiskExecutionEnv → 本地执行环境           │
│    steps.py         → 代码生成/改进流水线     │
├─────────────────────────────────────────────┤
│  preprompts/         — 系统提示词模板         │
│  tools/              — 自定义步骤工具         │
└─────────────────────────────────────────────┘
```

**设计哲学**：面向接口编程（ABC 抽象基类），核心层定义抽象，default 层提供默认实现，applications 层组装完整应用。这种分层使得替换 LLM 后端、存储方式、执行环境都非常容易。

---

## 2. Agent 设计模式

### 2.1 BaseAgent 抽象接口

```python
class BaseAgent(ABC):
    @abstractmethod
    def init(self, prompt: Prompt) -> FilesDict:
        """从自然语言提示生成完整代码"""
        pass

    @abstractmethod
    def improve(self, files_dict: FilesDict, prompt: Prompt) -> FilesDict:
        """根据提示改进已有代码"""
        pass
```

接口极其精简——只有 `init` 和 `improve` 两个方法。这是 gpt-engineer 的核心抽象：**所有 Agent 变体都只需实现"从零生成"和"增量改进"两个能力**。

### 2.2 三层 Agent 实现

| 实现类 | 职责 | 特点 |
|--------|------|------|
| `SimpleAgent` | 最简实现 | 硬编码 gen_code → gen_entrypoint 流程 |
| `CliAgent` | CLI 增强版 | 可注入 code_gen_fn、improve_fn、process_code_fn |
| `LeanAgent`（曾存在） | 轻量版 | 后续版本移除 |

`CliAgent` 的关键设计是**策略注入**——通过构造函数参数注入不同步骤函数，实现了 Agent 行为的运行时可配置：

```python
class CliAgent(BaseAgent):
    def __init__(self, memory, execution_env, ai=None,
                 code_gen_fn=gen_code,      # 可替换的代码生成策略
                 improve_fn=improve_fn,      # 可替换的代码改进策略
                 process_code_fn=execute_entrypoint,  # 可替换的执行策略
                 preprompts_holder=None):
```

---

## 3. AI 调用层（LLM 抽象）

`AI` 类是与 LLM 交互的唯一入口，基于 LangChain 的 `BaseChatModel`：

```python
class AI:
    def __init__(self, model_name="gpt-4o", temperature=0.1, ...):
        self.llm = ChatOpenAI(...)  # 或 ChatAnthropic、AzureChatOpenAI

    def start(self, system, user, step_name) -> List[Message]:
        """开启对话：system + user 消息"""

    def next(self, messages, prompt, step_name) -> List[Message]:
        """继续对话：追加用户消息，获取 AI 回复"""
```

**关键设计决策**：
- **LangChain 统一接口**：通过 LangChain 抽象，支持 OpenAI、Anthropic Claude、Azure OpenAI、本地模型等多种后端
- **指数退避重试**：使用 `backoff` 库处理 API 速率限制
- **Token 用量追踪**：`TokenUsageLog` 记录每步的 token 消耗，支持成本分析
- **流式输出**：通过 `StreamingStdOutCallbackHandler` 实现实时输出

---

## 4. 代码生成流水线（Steps）

这是 gpt-engineer 的核心流程，定义在 `steps.py` 中：

### 4.1 Init 模式（从零生成）

```
用户 prompt
    ↓
gen_code()         → AI 生成完整代码 → FilesDict
    ↓
gen_entrypoint()   → AI 生成 run.sh 启动脚本
    ↓
execute_entrypoint() → 用户确认后执行 run.sh
```

**gen_code 细节**：
1. 从 `preprompts/` 加载系统提示（roadmap + generate + philosophy + file_format）
2. 调用 `ai.start(system_prompt, user_prompt)` 获取 AI 回复
3. 用正则 `r"(\S+)\n\s*```[^\n]*\n(.+?)```"` 从回复中提取文件路径和代码
4. 返回 `FilesDict`（文件名→内容的字典）

**gen_entrypoint 细节**：
1. 将已生成的代码通过 `files_dict.to_chat()` 序列化为带行号的文本
2. 要求 AI 生成 `run.sh`（安装依赖 + 运行代码）
3. 从回复中提取 bash 代码块

### 4.2 Improve 模式（增量改进）

```
已有代码 + 改进 prompt
    ↓
improve_fn()
    ├─ 构造消息序列：system_prompt + 现有代码 + 用户请求
    ├─ AI 生成 unified diff 格式的修改
    ├─ parse_diffs() 解析 diff
    ├─ validate_and_correct() 校验/修正 hunk
    └─ apply_diffs() 应用到 FilesDict
    ↓
如果有解析错误 → 追加错误信息要求 AI 重试（最多 MAX_EDIT_REFINEMENT_STEPS 次）
```

**这是最精妙的部分**——gpt-engineer 不是让 AI 重新生成全部代码，而是使用 **unified git diff 格式**进行增量修改，并内置了 diff 校验和自动修正机制。

---

## 5. Diff 引擎

`diff.py` 实现了完整的 unified diff 解析和应用引擎：

### 5.1 数据模型

```python
class Hunk:
    """单个修改块"""
    lines: List[Tuple[str, str]]  # (RETAIN|ADD|REMOVE, line_content)
    start_line_pre_edit: int      # 原文件起始行
    start_line_post_edit: int     # 修改后起始行

class Diff:
    """单个文件的完整修改"""
    hunks: List[Hunk]
    filename_pre: str   # 修改前文件名
    filename_post: str  # 修改后文件名
```

### 5.2 校验与修正

`Diff.validate_and_correct()` 是 gpt-engineer 的关键容错机制：

- 将 AI 生成的 diff hunk 与原始文件内容逐行对比
- 如果 RETAIN 行与原文不匹配，尝试模糊匹配（`is_similar()`，阈值 0.6）
- 如果匹配失败，尝试在附近搜索（forward_block_len=10 行范围内）
- 修正行号偏移，确保 diff 能正确应用

这使得 gpt-engineer 能够**容忍 LLM 输出的不精确 diff**，大幅提高了代码改进的成功率。

---

## 6. 存储架构

### 6.1 DiskMemory（KV 文件存储）

```python
class DiskMemory(BaseMemory):
    """文件系统 KV 存储：key=文件名，value=文件内容"""
    def __init__(self, path):
        self.path = Path(path).absolute()
        self.path.mkdir(parents=True, exist_ok=True)
```

- 以目录为存储单元，文件名为 key，文件内容为 value
- 支持 `.gpteng/memory/` 子目录存储元数据
- 自动创建目录结构，零配置

### 6.2 DiskExecutionEnv（执行环境）

```python
class DiskExecutionEnv(BaseExecutionEnv):
    def upload(self, files: FilesDict) -> self:   # 写入磁盘
    def download(self) -> FilesDict:              # 从磁盘读取
    def run(self, command, timeout) -> (stdout, stderr, exitcode):  # subprocess 执行
    def popen(self, command) -> Popen:            # 后台进程
```

执行环境通过 `subprocess.Popen` 运行代码，支持超时控制和 stdout/stderr 实时捕获。

---

## 7. Preprompts 系统（提示词工程）

gpt-engineer 的提示词策略是其核心竞争力之一，存储在 `preprompts/` 目录下：

| 文件 | 作用 |
|------|------|
| `roadmap` | 总体指令："你会收到代码编写指令，写出非常长的回答" |
| `generate` | 代码生成提示：先列出核心类/函数，然后逐文件实现 |
| `improve` | 代码改进提示：使用 unified diff 格式修改 |
| `philosophy` | 编码哲学：不同类放不同文件、遵循最佳实践 |
| `file_format` | 文件输出格式：FILENAME + ```CODE``` |
| `file_format_diff` | Diff 输出格式：unified git diff |
| `entrypoint` | 生成 run.sh 的提示 |

**提示词组装逻辑**：

```python
# 代码生成
system_prompt = roadmap + generate(FILE_FORMAT=file_format) + "Useful to know:" + philosophy

# 代码改进
system_prompt = roadmap + improve(FILE_FORMAT=file_format_diff) + "Useful to know:" + philosophy
```

**可定制性**：用户可通过 `--use-custom-preprompts` 参数覆盖默认提示词，实现个性化 Agent 行为。这是 gpt-engineer 的"记忆"机制——通过修改 preprompts 让 Agent 在不同项目间保持一致的行为模式。

---

## 8. FilesDict——代码容器

```python
class FilesDict(dict):
    """类型安全的代码文件容器"""
    def __setitem__(self, key, value):
        # 强制 key 为 str/Path，value 为 str
    def to_chat(self):
        """转为带行号的聊天格式（供 AI 阅读）"""
    def to_log(self):
        """转为日志格式"""
```

`FilesDict` 是贯穿整个系统的数据载体。它：
- 强制类型检查，防止非字符串值混入
- `to_chat()` 方法将文件转为 `File: path\n行号 内容` 格式，带行号是为了让 AI 在改进模式下能精确定位代码行
- 实现了 `to_log()` 用于调试日志

---

## 9. CLI 入口与交互设计

`main.py` 使用 Typer 构建 CLI，核心流程：

```
gpte <project_dir> [-i] [--use-custom-preprompts] [--image_directory ...]
    ↓
load_env_if_needed()          # 加载 API Key
    ↓
FileSelector.ask_for_files()  # 改进模式下选择要修改的文件
    ↓
load_prompt()                 # 从 prompt 文件加载用户指令
    ↓
SimpleAgent / CliAgent        # 创建 Agent
    ↓
agent.init(prompt)            # 生成模式
agent.improve(files, prompt)  # 改进模式（-i 标志）
    ↓
stage_uncommitted_to_git()    # 自动 git stage
collect_and_send_human_review() # 收集用户反馈（可选遥测）
```

**FileSelector** 交互设计：
- 生成 `file_selection.toml` 文件，用户通过编辑 TOML 选择要包含的文件
- 支持 `.gitignore` 过滤
- 自动排除 `node_modules`、`venv`、`__pycache__` 等目录

---

## 10. 自愈机制（Self-Healing）

`tools/custom_steps.py` 中的 `self_heal()` 是 gpt-engineer 最具前瞻性的特性：

```python
def self_heal(ai, execution_env, files_dict, ...):
    """执行代码 → 如果失败 → 将错误反馈给 AI → 修复 → 重试"""
    MAX_SELF_HEAL_ATTEMPTS = 10
    while attempts < MAX_SELF_HEAL_ATTEMPTS:
        execution_env.upload(files_dict)
        stdout, stderr, returncode = execution_env.run(f"bash {ENTRYPOINT_FILE}")
        if returncode == 0:
            break  # 成功
        # 将错误输出反馈给 AI 要求修复
        files_dict = improve_fn(ai, error_prompt, files_dict, memory, preprompts_holder)
```

这是一个**闭环反馈循环**：执行 → 检测错误 → AI 修复 → 重新执行，最多重试 10 次。这体现了 gpt-engineer 的设计哲学——不仅生成代码，还要确保代码能运行。

---

## 架构总结与启示

### 设计亮点

1. **极简接口**：BaseAgent 仅 2 个方法（init/improve），降低了扩展门槛
2. **策略模式**：CliAgent 通过依赖注入支持运行时替换代码生成/改进/执行策略
3. **Diff 容错引擎**：内置校验+修正机制，容忍 LLM 输出的不精确 diff
4. **提示词即配置**：preprompts 文件系统化，支持用户自定义 Agent 行为
5. **自愈闭环**：执行→报错→修复的自动循环，提高了代码可用率

### 局限性

1. **单轮对话**：init 模式是一次性生成，缺乏多轮交互式迭代
2. **无工具调用**：纯文本生成，不支持函数调用/工具使用
3. **无并行**：代码文件串行生成，无法利用并行加速
4. **Diff 解析脆弱**：虽然有容错，但 AI 生成的 diff 仍可能无法解析
5. **缺乏状态管理**：没有真正的 Agent 记忆系统，每次会话独立

### 对 OpenMate 的启发

- **策略注入模式**值得借鉴：Agent 的核心步骤应该是可替换的
- **Diff 引擎**的容错设计可以复用：AI 生成的代码修改需要校验机制
- **preprompts 文件化**是好的实践：提示词应该版本化管理
- **自愈机制**是 Agent 必备能力：代码生成后必须验证可执行性
- **FilesDict 模式**（带行号的代码序列化）对 AI 理解代码结构非常有效
