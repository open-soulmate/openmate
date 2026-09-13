# Aider

## 概述

Aider 是一个AI编程助手。

**仓库**: https://github.com/Aider-AI/aider | **语言**: Python

## 核心架构

> 研究日期：2026-09-13 | 仓库：https://github.com/Aider-AI/aider | 文档：https://aider.chat/docs/  
> 研究目的：为 openmate 稳定性重构借鉴 repo map、edit formats、git 集成、lint/test 闭环

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

1. **单一进程 CLI，无 server**：稳定性靠“少即是多”。不引入远程 runtime 复杂度。
2. **edit_format 多态**：同一 `Coder.create(edit_format=...)` 工厂切换 diff/udiff/whole/architect/ask；切换时用 summarizer 重写历史，避免旧格式污染新 LLM。
3. **RepoMap = 带预算的代码地图**
   - tree-sitter 抽 def/ref tags（SCM query）
   - networkx MultiDiGraph + **PageRank**（personalization：chat 文件、mentioned 文件/标识符加权）
   - snake/camel/kebab 标识符权重 ×10；下划线 ×0.1；定义过散 ×0.1
   - 二分搜索裁剪到 `--map-tokens`（默认 1k）预算
   - diskcache SQLite 缓存 tags（mtime 失效）；SQLite 坏了降级 dict
4. **Fence 选择**：扫描聊天文件内容，选不会与代码块冲突的围栏（```、````、…），防 LLM 输出被 fence 截断。
5. **Git 一等公民**
   - 自动 commit + 由弱模型生成 commit message
   - dirty commit：改脏文件前先提交，保证 `/undo`
   - `aider_commit_hashes` 记录 AI 提交，与人手写提交分离
6. **Architect 模式**：主模型出方案，editor 模型 + 另一 edit_format 落地；可 auto_accept。
7. **只读文件**：`/read` 进上下文但不进可编辑集，禁止默认写入。

Aider 没有分布式 HA，但 **单机长会话稳定性** 设计非常扎实：

| 机制 | 说明 |
|---|---|
| **反射重试上限** | `max_reflections=3`，防 lint/edit 死循环 |
| **malformed 响应计数** | `num_malformed_responses`；edit 格式错误注入结构化反馈 |
| **context 窗口耗尽** | `num_exhausted_context_windows`；ChatSummary 异步压缩 `done_messages` |
| **弱模型摘要** | summarizer 用 weak_model，主模型仅在必要时 |
| **Cache warming** | `cache_prompts` + 后台线程 ping，稳定 prefix ca

## 关键技术

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

1. **单一进程 CLI，无 server**：稳定性靠“少即是多”。不引入远程 runtime 复杂度。
2. **edit_format 多态**：同一 `Coder.create(edit_format=...)` 工厂切换 diff/udiff/whole/architect/ask；切换时用 summarizer 重写历史，避免旧格式污染新 LLM。
3. **RepoMap = 带预算的代码地图**
   - tree-sitter 抽 def/ref tags（SCM query）
   - networkx MultiDiGraph + **PageRank**（personalization：chat 文件、mentioned 文件/标识符加权）
   - snake/camel/kebab 标识符权重 ×10；下划线 ×0.1；定义过散 ×0.1
   - 二分搜索裁剪到 `--map-tokens`（默认 1k）预算
   - diskcache SQLite 缓存 tags（mtime 失效）；SQLite 坏了降级 dict
4. **Fence 选择**：扫描聊天文件内容，选不会与代码块冲突的围栏（[详见源码]
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

docs

## 对openmate的启示

**必须借鉴（高优先级）**

1. **RepoMap 算法**：tree-sitter tags + PageRank + token 预算 + 提及文件 personalization。这是 Aider 在大仓库仍准的根因。openmate 稳定重构的“上下文选择”层可直接复刻。
2. **Edit format 可插拔**：diff / udiff / whole / architect；按模型能力选默认；切换时重写历史。
3. **SEARCH/REPLACE 容错梯度 + 结构化失败反馈**：精确 → 缩进 → `...` → 相似行建议；失败信息教 LLM 如何改。
4. **反射上限**：`max_reflections=3`，防修复循环。
5. **Git dirty-commit + AI commit 集合**：`/undo` 语义清晰；openmate 重构任务必须可回退。
6. **Lint/Test 自动闭环**：编辑后跑，失败注入；`--lint-cmd/--test-cmd` 可配置。
7. **Fence 自适应**：防代码块嵌套解析事故。
8. **成本/token 护栏**：文件过多警告、map token 上限警告。
9. **Singularity 式自举指标**：openmate 可定义“重构补丁中 agent 自写比例”作为进化 KPI

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

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 我们（54-aider.md）
- MiMo报告（aider.md）
