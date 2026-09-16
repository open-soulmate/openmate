# Aider（Aider-AI/aider, #48, 38k★）功能研究 — 源码级深读（补源码）

> 源码：~/agent-research-src/aider（aider单包：coders/20+种编辑格式、repomap、linter、watch等）
> 定位：终端AI结对编程（此前仅有L1概览，本轮源码级补读）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **RepoMap代码地图**：tree-sitter提取全仓库Tag(文件/符号/行/种类)→构建引用图→**PageRank式排序**→按map_tokens预算截断生成"仓库地图"注入prompt；SQLite+diskcache双层tag缓存（cache_threshold=0.95增量刷新） | 无 | 无（tree_sitter/repomap零命中） | 完全没有 | **本项目最高价值单项**。OpenSoul无代码库感知；用户大量场景是代码仓库问答。grep_ast+tree_sitter可直接移植 |
| 2 | **20+种编辑输出格式**（editblock/udiff/whole/patch/func/fenced各变体），**按模型能力选择格式**（models.py 1338行含每模型的格式支持/价格/上下文窗口） | 无 | 无 | 完全没有 | "模型能力档案"与AutoGPT LLM目录互证；弱模型用whole、强模型用udiff的分级思想直接抄 |
| 3 | **Architect模式双模型分工**：规划模型只输出方案→编辑模型按方案产出diff；architect_prompts独立 | 无 | gland/router有多provider无分工 | 完全没有 | 与TradingAgents快慢双LLM/STORM五槽位LM三方互证 |
| 4 | **Lint自动回喂**：每次编辑后自动lint（Python compile+flake8+自定义linter per语言），错误带**tree_context行级上下文**回喂LLM自动修复；lint失败→再循环 | 无 | 无 | 完全没有 | 与OpenHands Critic迭代精化互证——"改完自检"自动化，用户手动要求"自检拼接路径"的机器化 |
| 5 | **watch文件监视**：watchfiles监听工作区，改动文件自动入聊天上下文（gitignore/.aider*/编辑器临时文件全过滤） | 无 | 无 | 完全没有 | "用户在外面改了文件agent不知道"的解法，与DeerFlow ReadBeforeWrite互补 |
| 6 | **CONVENTIONS.md约定文件**：仓库级编码约定自动加载为上下文 | 无 | gene/templates有模板非仓库级 | 部分有 | 与AGENTS.md/CLAUDE.md生态合流，OpenSoul可认领仓库内约定文件 |
| 7 | **auto dirty commits**：每次AI编辑前自动git commit（用户自己的未提交改动单独保留在dirty区），/undo一键回滚AI改动 | 无 | 无 | 完全没有 | 与opencode文件快照git对象库互证——**用户"改完撤回又恢复会更生气"痛点的直接解** |
| 8 | **voice语音输入** + **copypaste剪贴板轮询** + **scrape URL/图片→上下文** | 无 | 无 | 完全没有 | 低优先级 |
| 9 | **special.py重要文件过滤**：为repo map识别"重要文件"（README/配置等优先保留进map预算） | 无 | 无 | 完全没有 | map预算分配的小技巧 |
| 10 | **reasoning_tags剥离**：发送前剥离思考模型的推理标签块 | 无 | reflex有缓存无关 | 完全没有 | 小件，provider兼容层 |
| 11 | **analytics匿名使用统计**（可关）+ versioncheck | 无 | trajectory有事件无产品化统计 | 部分有 | 可观测参照 |

## 源码亮点

- **repomap.py的rank()**：把"文件引用关系"转图做排名，越被依赖的符号越优先出现在有限token预算里——用图论解决"1000文件仓库塞进1024 token"
- **coder格式即插件**：每种格式一个Coder子类+独立prompts文件，新格式=新文件，注册表选择
- **linter.tree_context()**：lint错误用grep_ast的TreeContext带出"错误所在函数体"而非裸行号——LLM看到的是结构化上下文

## 可复用设计

1. **RepoMap全套**（tree-sitter tags+引用图排名+token预算截断+缓存）——OpenSoul补"代码库大脑"的现成实现，与codegraph MCP工具方向一致
2. **Architect双模型**——规划/执行分离，与既有互证群合并为OpenSoul cortex分级推理的依据
3. **lint回喂循环**——写文件工具执行后自动lint+错误回喂，~200行
4. **auto dirty commit + undo**——工具写文件前快照，与opencode快照系统互证（OpenSoul vein内容寻址存储已有地基）
