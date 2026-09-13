# Aider 架构研究报告

> 研究日期：2026-09-13 | 仓库：https://github.com/Aider-AI/aider | 文档：https://aider.chat/docs/  
> 研究目的：为 openmate 稳定性重构借鉴 repo map、edit formats、git 集成、lint/test 闭环

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 项目名 | Aider |
| 定位 | 终端 AI 结对编程（CLI pair programmer） |
| 主语言 | Python |
| 许可 | Apache 2.0 |
| 安装 | `pip install aider-install` → `aider-install` |
| 规模 | PyPI 6.8M+ 安装；约 15B tokens/周；OpenRouter Top20 应用 |
| 自举指标 | **Singularity 88%**：最近一版新代码由 Aider 自己写成 |
| 模型 | Claude / DeepSeek / OpenAI / Gemini / Groq / Ollama / LM Studio / OpenRouter / Bedrock / Vertex 等（litellm） |
| 语言支持 | 100+ 编程语言（tree-sitter） |

### 核心模块（`aider/` 包）

| 模块 | 职责 |
|---|---|
| `aider/coders/base_coder.py` | `Coder` 主循环、上下文组装、反射重试、git commit、成本统计 |
| `aider/coders/editblock_coder.py` | `diff` 格式（SEARCH/REPLACE） |
| `aider/coders/udiff_coder.py` | unified diff 格式 |
| `aider/coders/wholefile_coder.py` | 整文件格式 |
| `aider/coders/ask_coder.py` | 只问不改 |
| `aider/repomap.py` | RepoMap：tree-sitter tags + PageRank |
| `aider/repo.py` | GitRepo：自动 commit / undo |
| `aider/linter.py` | 内置 lint + tree-sitter 语法 + flake8 fatal |
| `aider/history.py` | ChatSummary 上下文压缩 |
| `aider/commands.py` | `/add` `/drop` `/run` `/test` `/undo` 等 |
| `aider/io.py` | 终端 IO、确认组 |
| `aider/models.py` | 模型能力与 edit_format 默认 |

---

## 2. 架构

### 2.1 总体

```
用户终端
   │
   ▼
Coder.run()  ←—— InputOutput (io.py)
   │
   ├── preproc_user_input
   │     ├── slash commands
   │     ├── file mentions（文件名启发式）
   │     └── URL 检测 → 可选拉网页
   │
   ├── 组装 messages
   │     ├── repo_map 消息（user + assistant 占位）
   │     ├── read-only 文件
   │     ├── chat 文件全文（或 no-files-with-repomap 提示）
   │     ├── 图片/PDF（模型支持时）
   │     └── 历史 + ChatSummary
   │
   ├── send_message → litellm 流式
   │
   ├── get_edits（按 edit_format 解析）
   ├── prepare_to_edit（allowed_to_edit 门控）
   ├── apply_edits
   ├── lint / test 反射
   ├── auto_commit (git)
   └── 成本与 token 报告
```

### 2.2 关键设计点

1. **单一进程 CLI，无 server**：稳定性靠“少即是多”。不引入远程 runtime 复杂度。
2. **edit_format 多态**：同一 `Coder.create(edit_format=...)` 工厂切换 diff/udiff/whole/architect/ask；切换时用 summarizer 重写历史，避免旧格式污染新 LLM。
3. **RepoMap = 带预算的代码地图**
   - tree-sitter 抽 def/ref tags（SCM query）
   - networkx MultiDiGraph + **PageRank**（personalization：chat 文件、mentioned 文件/标识符加权）
   - snake/camel/kebab 标识符权重 ×10；下划线 ×0.1；定义过散 ×0.1
   - 二分搜索裁剪到 `--map-tokens`（默认 1k）预算
   - diskcache SQLite 缓存 tags（mtime 失效）；SQLite 坏了降级 dict
4. **Fence 选择**：扫描聊天文件内容，选不会与代码块冲突的围栏（```、````、<source>…），防 LLM 输出被 fence 截断。
5. **Git 一等公民**
   - 自动 commit + 由弱模型生成 commit message
   - dirty commit：改脏文件前先提交，保证 `/undo`
   - `aider_commit_hashes` 记录 AI 提交，与人手写提交分离
6. **Architect 模式**：主模型出方案，editor 模型 + 另一 edit_format 落地；可 auto_accept。
7. **只读文件**：`/read` 进上下文但不进可编辑集，禁止默认写入。

---

## 3. Loop 与工具

### 3.1 主循环（`Coder.run` / `run_one`）

```
while True:
    user_message = get_input()
    run_one(message):
        init_before_message()          # 重置反射/lint/test 计数
        preproc_user_input()
        while message:
            num_reflections = 0
            send_message(message)      # 流式
            apply_updates()            # 解析 edits + dry_run + write
            run_shell_commands()       # 建议执行的 shell（需确认）
            lint_and_test()            # auto_lint / auto_test
            if reflected_message:      # lint/edit 失败注入修正
                message = reflected_message
                num_reflections += 1
                if num_reflections >= max_reflections(3): stop
        auto_commit(edited)
```

### 3.2 “工具”实为编辑格式 + 命令，而非 function-calling 工具箱

| 能力 | 实现 |
|---|---|
| 读文件 | 加入 `abs_fnames` 全文注入 prompt |
| 写文件 | 解析模型输出中的 SEARCH/REPLACE 或 whole file 或 udiff |
| 执行命令 | 模型输出 bash 块 → 确认后 `run_cmd`；`/run` |
| 测试 | `/test` 或 `--auto-test` + `--test-cmd` |
| Lint | 内置 + `--lint-cmd` / per-language |
| Web | `/run` 外可 detect URL → `cmd_web` |
| Git | 自动 commit、`/undo`、diff 展示 |

**openmate 启示**：Aider 证明“轻 function-calling、重结构化编辑输出 + 反射”也能很高稳；若 openmate 工具面过大，可保留一条 **edit-block 快速路径** 作为主写盘通道。

### 3.3 Edit Formats 详解

#### diff（EditBlockCoder）— 默认主力
```
path/to/file.py
<<<<<<< SEARCH
exact original lines
=======
replacement
>>>>>>> REPLACE
```
应用策略（容错梯度）：
1. 完全精确匹配
2. 忽略 leading whitespace 的匹配
3. 处理 `...` 省略块
4. （代码中仍保留 closest-edit-distance 模糊，当前主路径更保守）
5. 失败时：`SearchReplaceNoExactMatch` + `Did you mean` 相似行 + “其他块已成功勿重发” → 抛 ValueError 触发 reflection

#### udiff
- 解析 ```diff 围栏中的 unified diff
- `SearchTextNotUnique` / `NoMatch` 专用错误文案
- partial hunk：丢弃前后 context 逐步重试
- 极小 context 且全文多次出现 → 拒绝应用（防误替换）

#### whole
- 整文件重写；filename 来源优先级 block > saw > chat
- 流式时做 live diff 预览

#### ask
- 纯问答，无写盘

#### architect
- 两阶段：plan 模型 + editor 模型

---

## 4. 稳定性 / HA 设计

Aider 没有分布式 HA，但 **单机长会话稳定性** 设计非常扎实：

| 机制 | 说明 |
|---|---|
| **反射重试上限** | `max_reflections=3`，防 lint/edit 死循环 |
| **malformed 响应计数** | `num_malformed_responses`；edit 格式错误注入结构化反馈 |
| **context 窗口耗尽** | `num_exhausted_context_windows`；ChatSummary 异步压缩 `done_messages` |
| **弱模型摘要** | summarizer 用 weak_model，主模型仅在必要时 |
| **Cache warming** | `cache_prompts` + 后台线程 ping，稳定 prefix cache |
| **成本与 token 守护** | 每消息/每会话成本；warn 文件过多（>4 文件或 >20k tokens） |
| **Fence 冲突避免** | 动态选围栏，防解析失败 |
| **Edit 权限门** | `allowed_to_edit`：未加入 chat 的文件需确认；gitignored 拒绝；新文件创建需确认 |
| **dirty commit** | 写前提交，保证 `/undo` 可回退 AI 修改 |
| **dry_run** | 编辑预演 |
| **stdin 二次 ^C** | 第一次警告，短时间内再按退出；恢复 cursor |
| **大仓库防护** | `--subtree-only` + `.aiderignore`；map_tokens 过大警告；RecursionError 时禁用 repo map |
| **SQLite 缓存容错** | tags cache 损坏 → 重建 → 再降级内存 dict |
| **URL 拒绝记忆** | rejected_urls 集合，避免反复询问 |
| **Python lint 三级** | basic tree-sitter 语法 + compile() + flake8 fatal codes（E9,F821…） |
| **测试命令** | 非零退出即注入修复；可 `--test-cmd "build && test"` |
| **Windows 路径** | relpath ValueError 回退绝对路径 |

**HA 评价**：适合“开发者本机结对”场景；不解决多租户/沙箱逃逸。openmate 若目标是服务端稳定性，需叠加 OpenHands 式 Workspace 与 Cline 式审批，但 **edit 反射与 git undo** 应原样吸收。

---

## 5. 自我进化

| 维度 | 机制 |
|---|---|
| **Singularity 88%** | 官方用 Aider 写 Aider；有公开自举度量 |
| **Lint/Test 闭环** | 每次编辑后自动质检 → 反射修正 |
| **Leaderboards** | 编辑榜 / 重构榜；按版本发布回归 |
| **conventions** | `/add CONVENTIONS.md` 或约定文件注入 |
| **Chat history 持久化** | markdown 可导出，可 `--restore-chat-history` |
| **模型弱/强分离** | weak model 做 commit message / 摘要，主模型专注编辑 |
| **无插件市场** | 靠 prompt 与 format 演进，而非生态插件 |
| **watch 模式** | IDE 注释触发，半自动进化工作流 |
| **analytics（可选）** | 匿名事件，用于产品决策 |

---

## 6. 对 openmate 借鉴

**必须借鉴（高优先级）**

1. **RepoMap 算法**：tree-sitter tags + PageRank + token 预算 + 提及文件 personalization。这是 Aider 在大仓库仍准的根因。openmate 稳定重构的“上下文选择”层可直接复刻。
2. **Edit format 可插拔**：diff / udiff / whole / architect；按模型能力选默认；切换时重写历史。
3. **SEARCH/REPLACE 容错梯度 + 结构化失败反馈**：精确 → 缩进 → `...` → 相似行建议；失败信息教 LLM 如何改。
4. **反射上限**：`max_reflections=3`，防修复循环。
5. **Git dirty-commit + AI commit 集合**：`/undo` 语义清晰；openmate 重构任务必须可回退。
6. **Lint/Test 自动闭环**：编辑后跑，失败注入；`--lint-cmd/--test-cmd` 可配置。
7. **Fence 自适应**：防代码块嵌套解析事故。
8. **成本/token 护栏**：文件过多警告、map token 上限警告。
9. **Singularity 式自举指标**：openmate 可定义“重构补丁中 agent 自写比例”作为进化 KPI。

**谨慎借鉴**

- 无 sandbox：本地直写文件系统，不适合多租户服务。
- 工具面窄：没有浏览器/MCP 原生深度集成（可外挂）。
- 单线程 CLI：无并发会话管理。

---

## 7. 关键源码路径

```
aider/
  README.md
  HISTORY.md                     # 版本自举/变更
  main.py
  coders/
    base_coder.py                # Coder.run / send_message / apply_updates / auto_commit
    editblock_coder.py           # SEARCH/REPLACE
    udiff_coder.py               # unified diff
    wholefile_coder.py
    architect_coder.py
    ask_coder.py
    editblock_prompts.py  udiff_prompts.py  wholefile_prompts.py
    search_replace.py
  repomap.py                     # RepoMap + PageRank + tags cache
  repo.py                        # GitRepo
  linter.py                      # Linter / basic_lint / flake8
  history.py                     # ChatSummary
  commands.py                    # slash commands
  io.py
  models.py
  prompts.py
  run_cmd.py
  analytics.py
  special.py                     # filter_important_files

docs/
  repomap.html
  usage/lint-test.html
  git.html
  languages.html
  more/edit-formats.html
  config/options.html
```

核心类锚点：
- `aider.coders.base_coder.Coder`
- `aider.coders.editblock_coder.EditBlockCoder.edit_format = "diff"`
- `aider.coders.udiff_coder.UnifiedDiffCoder.edit_format = "udiff"`
- `aider.repomap.RepoMap.get_ranked_tags`
- `aider.linter.Linter.py_lint`

---

## 8. 评分（面向 openmate 稳定性重构价值，10 分制）

| 维度 | 分 | 说明 |
|---|---|---|
| 大仓库上下文（RepoMap） | **9.5** | PageRank + 预算裁剪，业界独一份 |
| 编辑可靠性（edit formats） | **9.5** | 多格式 + 容错梯度 + 结构化反馈 |
| Git 集成与可回退 | **9.0** | auto-commit / undo / dirty commit |
| Lint/Test 反射闭环 | **9.0** | 简单但极有效 |
| 架构简洁性 | **9.0** | 单进程、职责清、可维护 |
| 服务端/多租户 HA | **4.5** | 几乎没有；需外部叠加 |
| 工具生态（MCP/browser） | **5.0** | 非重点 |
| 自我进化度量 | **8.0** | Singularity 是独特 KPI |
| 对 openmate 可移植性 | **9.0** | RepoMap、edit、git undo、lint loop 可直接搬 |
| **综合** | **8.5** | “写盘正确性”的最佳参考实现 |

---

## 9. 一句话结论

Aider 把稳定性押在**上下文选对、编辑写对、git 能退、lint/test 能闭环**四件事上。openmate 做稳定性重构时，RepoMap 与 SEARCH/REPLACE 反射应视为核心资产，而不是边缘功能；服务端能力则另找 OpenHands/Cline 补齐。
