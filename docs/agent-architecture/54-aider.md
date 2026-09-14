# Aider 架构分析

> **项目**: [Aider-AI/aider](https://github.com/Aider-AI/aider)
> **定位**: AI 结对编程终端工具，让用户在终端中与 LLM 配对编程
> **语言**: Python | **许可**: Apache 2.0
> **星标**: 30K+ | **每周 Token 消耗**: 15B+

---

## 1. 核心定位与设计哲学

Aider 的核心设计理念是**"AI 结对编程"**——不是让 AI 替你写代码，而是让 AI 像一个坐在你旁边的同事一样，理解你的代码库，帮你做精确的代码修改。它专注于**已有代码库的增量修改**，而非从零生成项目。

与 Cursor/Copilot 等 IDE 集成工具不同，Aider 是一个纯终端工具，通过命令行交互完成所有工作。这带来了几个关键设计决策：
- **无 GUI 依赖**：完全在终端运行，支持 SSH 远程开发
- **Git 原生集成**：每次 AI 修改都自动 commit，可随时 undo
- **编辑格式抽象**：不同 LLM 有不同的最佳编辑方式，Aider 通过策略模式适配

---

## 2. 目录结构与模块划分

```
aider/
├── coders/              # 核心：编辑格式策略（Strategy Pattern）
│   ├── base_coder.py    # 基类 Coder，约 2000+ 行，核心引擎
│   ├── editblock_coder.py     # SEARCH/REPLACE 块编辑
│   ├── wholefile_coder.py     # 整文件替换
│   ├── udiff_coder.py         # Unified diff 编辑
│   ├── patch_coder.py         # Patch 格式编辑
│   ├── architect_coder.py     # 架构师模式（双模型）
│   ├── ask_coder.py           # 只读问答模式
│   ├── context_coder.py       # 上下文识别模式
│   └── *_prompts.py           # 各格式对应的 prompt 模板
├── queries/             # Tree-sitter 查询文件
├── resources/           # 模型配置、默认设置
├── website/             # 文档站源码
├── models.py            # 模型管理：别名、设置、token 计算
├── repo.py              # Git 仓库操作封装
├── repomap.py           # 代码库地图生成（tree-sitter）
├── commands.py          # 斜杠命令系统（/add, /drop, /undo 等）
├── io.py                # 终端 I/O 抽象
├── main.py              # 入口点
├── sendchat.py          # LLM API 调用
├── linter.py            # Lint 检查集成
├── voice.py             # 语音输入
├── watch.py             # 文件监控（IDE 集成）
└── scrape.py            # 网页抓取
```

---

## 3. 编辑格式策略（Edit Format Strategy）

这是 Aider 最核心的架构设计。不同 LLM 擅长不同的代码编辑方式，Aider 用**策略模式**抽象了这一差异：

| 编辑格式 | 实现类 | 适用场景 | 工作方式 |
|---------|--------|---------|---------|
| `whole` | `WholeFileCoder` | 早期模型 | 输出完整文件内容 |
| `edit` | `EditBlockCoder` | Claude/GPT-4o 主力格式 | SEARCH/REPLACE 块精确替换 |
| `udiff` | `UnifiedDiffCoder` | 擅长 diff 的模型 | Unified diff 格式 |
| `patch` | `PatchCoder` | 高级模型 | 标准 patch 格式 |
| `architect` | `ArchitectCoder` | 双模型协作 | 架构师设计 + 编辑器执行 |
| `ask` | `AskCoder` | 纯问答 | 不修改代码 |
| `context` | `ContextCoder` | 上下文识别 | 自动识别需要编辑的文件 |

所有编辑格式继承自 `base_coder.py` 中的 `Coder` 基类。`Coder.create()` 工厂方法根据 `edit_format` 参数动态选择对应的子类。

---

## 4. Coder 基类引擎（base_coder.py）

`Coder` 类是整个系统的引擎，约 2000+ 行，承担以下职责：

**会话管理**：
- `done_messages` / `cur_messages`：已完成和当前的消息历史
- `format_messages()`：将代码文件、repo map、对话历史组装成 LLM 消息
- `send_message()`：发送消息给 LLM，处理流式响应和重试

**文件管理**：
- `abs_fnames` / `abs_read_only_fnames`：聊天中的文件（可编辑/只读）
- 文件内容自动注入到 system prompt 或 user message

**Git 集成**：
- `auto_commits` / `dirty_commits`：自动提交策略
- `aider_commit_hashes`：追踪 AI 做出的 commit

**质量保障**：
- `auto_lint` / `auto_test`：修改后自动 lint/test
- `max_reflections = 3`：LLM 最多自我修正 3 次

**Token 管理**：
- `check_tokens()`：检查消息是否超过上下文窗口
- `warm_cache()`：预热 prompt cache（后台线程）

---

## 5. 模型管理（models.py）

`Model` 类封装了 LLM 的所有元信息：

```python
@dataclass
class ModelSettings:
    name: str
    edit_format: str = "whole"          # 默认编辑格式
    weak_model_name: Optional[str]      # 弱模型（用于摘要等）
    use_repo_map: bool = False          # 是否使用代码库地图
    send_undo_reply: bool = False       # 是否发送 undo 提示
    lazy: bool = False                  # 是否懒惰模式
    reminder: str = "user"              # 提醒方式
    cache_control: bool = False         # 是否支持 cache control
    reasoning_tag: Optional[str]        # 推理标签格式
    editor_model_name: Optional[str]    # 编辑器模型（architect 模式）
```

模型信息来源三层：
1. **本地 YAML 配置** (`resources/model-settings.yml`)：预定义的模型设置
2. **LiteLLM 元数据库**：在线获取的模型价格和上下文窗口
3. **OpenRouter API**：OpenRouter 路由的模型信息

支持 100+ 模型别名，如 `sonnet` → `claude-sonnet-4-6`，`deepseek` → `deepseek/deepseek-chat`。

---

## 6. 代码库地图（RepoMap）

`repomap.py` 是 Aider 的"杀手级"特性——用 Tree-sitter 解析整个代码库，生成**语义级别的仓库地图**：

**工作流程**：
1. 用 Tree-sitter 解析所有源文件，提取函数/类定义和引用关系
2. 构建**定义-引用图**（哪些文件定义了什么，哪些文件引用了什么
3. 根据当前聊天中的文件，计算**相关性排名**
4. 生成精简的 repo map 注入到 LLM prompt

**关键设计**：
- 使用 `tags.scm` 查询文件提取符号定义
- 基于 PageRank 思想的**相关性排序**：被更多文件引用的定义更重要
- Token 预算控制：`map_tokens` 参数限制 map 大小
- 支持 100+ 编程语言（通过 Tree-sitter 语言包）

这让 Aider 在修改文件 A 时，能自动感知文件 B、C、D 中的相关代码，大幅提升大项目中的编辑质量。

---

## 7. Git 集成（repo.py）

`GitRepo` 类封装了所有 Git 操作：

**自动 Commit**：
- AI 修改文件后自动 commit，commit message 由 LLM 生成
- 支持 `attribute-author`（标记为 `User (aider)`）
- 支持 `co-authored-by` trailer（标注 AI 参与）
- `aider_commit_hashes` 追踪 AI commit，支持 `/undo` 回滚

**智能 Diff**：
- `get_diffs()` 生成变更差异，用于 commit message 生成
- 支持 staged 和 unstaged 文件

**文件过滤**：
- `.aiderignore` 文件（类似 `.gitignore`）排除不需要的文件
- `subtree_only` 限制只操作当前子目录

---

## 8. 命令系统（commands.py）

斜杠命令系统提供丰富的交互控制：

| 命令 | 功能 |
|------|------|
| `/add <file>` | 添加文件到聊天 |
| `/drop <file>` | 从聊天移除文件 |
| `/undo` | 撤销上一次 AI commit |
| `/diff` | 查看当前变更 |
| `/run <cmd>` | 运行 shell 命令 |
| `/lint` | 运行 linter |
| `/test` | 运行测试 |
| `/map` | 显示仓库地图 |
| `/model` | 切换模型 |
| `/format` | 切换编辑格式 |
| `/web <url>` | 抓取网页内容 |
| `/voice` | 语音输入 |
| `/commit` | 手动 commit |
| `/copy` | 复制最后的回复 |

命令以 `/` 开头，shell 命令以 `!` 开头。

---

## 9. Architect 模式（双模型协作）

Architect 模式是 Aider 的高级特性，使用两个模型协作：

1. **Architect 模型**（强模型）：分析需求，设计修改方案，输出编辑指令
2. **Editor 模型**（快模型）：执行具体的代码编辑

工作流程：
```
用户请求 → Architect 设计方案 → Editor 执行编辑 → 结果返回
```

这种分离让昂贵的强模型专注于设计，便宜的快模型处理细节，**既保证质量又控制成本**。

---

## 10. 质量保障与扩展机制

**Lint/Test 集成**：
- 修改后自动运行 linter，失败时让 LLM 自动修复
- 支持自定义 `test_cmd`，修改后自动跑测试
- `max_reflections = 3`：最多自我修正 3 轮

**文件监控（Watch 模式）**：
- 监控文件变化，IDE 中添加注释触发 AI 修改
- 支持 `# aider: ADD` / `# aider: DROP` 指令

**语音输入**：
- 集成语音识别（Whisper），支持语音描述需求

**网页抓取**：
- `/web <url>` 命令抓取网页内容，用 Playwright 渲染 JS 页面

**Prompt Cache 优化**：
- 后台线程预热 prompt cache，减少重复 token 计费
- 支持 Anthropic/OpenAI 的 cache control header

**上下文压缩**：
- `ChatSummary` 类压缩长对话历史，避免超出上下文窗口
- 编辑格式切换时自动摘要旧对话

---

## 架构总结

```
┌─────────────────────────────────────────────┐
│                  用户输入                     │
│         (终端 / 语音 / 文件监控)              │
├─────────────────────────────────────────────┤
│              Commands 命令层                  │
│    /add /drop /undo /model /format ...       │
├──────────┬──────────────┬───────────────────┤
│  Coder   │   Model      │   Repo            │
│  编辑策略 │   模型管理    │   Git 操作        │
│          │              │                   │
│ ┌──────┐ │ ┌──────────┐ │ ┌───────────────┐ │
│ │edit  │ │ │别名解析   │ │ │自动commit     │ │
│ │whole │ │ │token计算  │ │ │diff生成       │ │
│ │udiff │ │ │cache管理  │ │ │.aiderignore   │ │
│ │patch │ │ │元数据获取  │ │ │归因管理       │ │
│ │architect│ │          │ │ │               │ │
│ └──────┘ │ └──────────┘ │ └───────────────┘ │
├──────────┴──────────────┴───────────────────┤
│              RepoMap 代码地图                  │
│     Tree-sitter 解析 → 定义引用图 → 相关性排名  │
├─────────────────────────────────────────────┤
│              LLM API (LiteLLM)               │
│    OpenAI / Anthropic / DeepSeek / 本地模型    │
└─────────────────────────────────────────────┘
```

Aider 的架构精髓在于：**编辑格式抽象 + 代码库地图 + Git 原生集成**。编辑格式策略让它适配各种 LLM，RepoMap 让它理解大项目，Git 集成让它安全可靠。这三个支柱共同支撑起"终端结对编程"这一体验。
