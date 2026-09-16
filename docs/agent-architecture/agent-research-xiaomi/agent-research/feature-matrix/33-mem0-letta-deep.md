# mem0 + Letta 功能深度研究（第2阶段 #33）

研究时间：2026-09-16（cron第28轮）
源码版本：mem0ai/mem0 main（zip 2026-09-16，mem0/memory/main.py 3868行）；letta-ai/letta main（已清空，仅README）→ 实际源码在 **letta-ai/letta-code**（v0.32.10，TypeScript/Bun，38MB）
验证方式：逐模块读源码 + grep /home/climbing/opensoul/src 和 /home/climbing/openmate/src 确认

## ⚠️ 重大战略发现：Letta已彻底转型
letta-ai/letta 仓库 main 分支只剩9个根文件，README声明：V1 Python API server已退役（archive分支），**当前产品是 letta-code = TypeScript终端agent harness**（`npm i -g @letta-ai/letta-code`），含：交互TUI、App Server、channels（Slack/Telegram/Discord）、桌面/网页App、Letta Cloud跨机同步记忆。
含义：**"记忆公司"做着做着变成了Claude Code竞品**，记忆成为harness的一个子系统（MemFS）。对OpenMate/OpenSoul的启示：记忆不该是独立API，而应内嵌进agent运行时循环（后台反思子代理自动维护）。

---

## 一、mem0 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **LLM事实抽取管线**（对话→facts JSON，只从user+assistant消息抽取，多话题分别抽、few-shot示例、同语言记录） | 无 | 部分有：无自动抽取，记忆靠上游显式调用store() | 完全没有 | hippo/extraction.py：接cortex统一LLM入口，单prompt即可，**1天** |
| 2 | **V3 Additive批量管线**（8阶段：会话上下文→检索已有记忆→单次LLM抽取→批量embed→MD5去重→批量入库→批量历史→批量实体链接） | 无 | 无 | 完全没有 | 管线骨架照抄Phase划分，值得抄的是"单次LLM调用+批量embed+失败逐条fallback"模式 |
| 3 | **语义向量检索**（embedding+向量库，30种vector store provider） | 无 | **无**：FTS5+LIKE（CJK退化）+Jaccard词面相似度 | 完全没有 | 本地bge-small-zh embedding + sqlite-vec/FAISS；中文场景价值极高（当前LIKE %query%根本无法语义召回） |
| 4 | **实体索引+检索加权**（独立entity store：抽取实体→0.95相似度合并→linked_memory_ids反查→查询时entity boost最高+0.5） | 无 | 无（GraphRAG是正则NER+图查询，与记忆无关） | 完全没有 | 中价值：实体表(embedding, linked_memory_ids)，search时查询实体→boost。mem0线程池并发检索top_k=500 |
| 5 | **记忆链接**（新记忆linked_memory_ids指向已有UUID，同一实体的新事件仍抽取、只链不断） | 无 | 无 | 完全没有 | 抽取prompt里带已有记忆列表即可，字段级改动，**半天** |
| 6 | **记忆历史/审计**（SQLite表：memory_id/old/new/event ADD-UPDATE-DELETE/is_deleted，history()接口，批量写） | 无 | 无：hippo无任何audit表 | 完全没有 | 一张表+触发写入，用户"记忆被改了什么"可观测，**半天** |
| 7 | **TTL过期**（expiration_date元数据，查询/列表时过滤过期payload） | 无 | 无（decay是重要度衰减，非硬过期） | 完全没有 | 与decay互补："护照12月过期"类记忆需要硬TTL，**2小时** |
| 8 | **程序性记忆**（多轮执行历史→LLM压缩为带编号步骤+verbatim输出的结构化summary，供长任务续跑） | 无 | 无 | 完全没有 | 直接抄PROCEDURAL_MEMORY_SYSTEM_PROMPT（468行，含完整模板），对接delegate_task长任务 |
| 9 | **重排序reranker**（5 provider：Cohere/HF/SentenceTransformer/LLM-based/ZeroEntropy，search(rerank=True)可选） | 无 | 无 | 完全没有 | 本地bge-reranker-base，此前#45/#71已给方案，与本发现互相印证 |
| 10 | **高级元数据过滤**（eq/ne/gt/gte/lt/lte/in/nin/contains/icontains + $and/$or/$not嵌套） | 无 | 部分：hippo search只有session_id/tags/min_retention相等过滤 | 部分有 | 过滤算子翻译层，中等工作量 |
| 11 | **explain评分**（search(explain=True)返回score_details：各信号分项） | 无 | 无 | 完全没有 | 命中用户可观测性痛点："为什么召回这条记忆" |
| 12 | **hash去重**（MD5全文hash，入库前查existing_hashes+批内seen_hashes双层去重） | 无 | 部分有：consolidate()用content前100字符hash，入库不去重 | 部分有 | 把consolidate的粗hash改为全文MD5并在store()时即查，**2小时** |
| 13 | **BM25词形预处理**（text_lemmatized入payload，供混合检索） | 无 | 无 | 完全没有 | 混合检索（向量+BM25）前置件 |
| 14 | **会话scope+最近消息**（_build_session_scope + get_last_messages(10)进抽取prompt消解指代） | 无 | 部分：session.py有会话但不参与记忆抽取 | 部分有 | 抽取时带上最近10条，消解"它/那个"，**半天** |
| 15 | **记忆作用域三维**（user_id/agent_id/run_id正交过滤 + agent-scoped时追加AGENT_CONTEXT_SUFFIX） | 无 | 部分：tenant_id/agent_id有，无run_id（任务级记忆） | 部分有 | run_id=任务级记忆，OpenSoul的trajectory可对接 |
| 16 | **OpenAI兼容记忆代理**（proxy/main.py：/v1/chat/completions拦截→后台异步add→检索相关记忆注入query，186行） | 无 | 无 | 完全没有 | **立即可做**：acp-proxy加一个middleware，对任何OpenAI客户端透明注入记忆 |
| 17 | **自定义指令/类别**（custom_instructions、includes/excludes话题过滤、feedback_str反馈修正抽取） | 无 | 无 | 完全没有 | prompt参数化，低成本 |
| 18 | **时间锚定**（Observation Date vs Current Date分离，"last week"→具体日期，避免记忆6个月后失效） | 无 | 无 | 完全没有 | **低成本高价值**，直接抄prompt段落 |
| 19 | **attributed_to归因**（记忆标注来自user还是assistant推荐，多说话人分别抽取） | 无 | 无 | 完全没有 | prompt字段级 |
| 20 | **自托管Server**（FastAPI+JWT/API-key双认证+bcrypt+Postgres+Neo4j docker-compose+Next.js dashboard） | 部分：OpenMate有hippo页面 | 部分：api/hippo.py已有CRUD REST | 部分有 | OpenSoul已有REST；缺的是JWT/API-key认证（现在应无认证或弱认证） |
| 21 | **chat()记忆问答**（MEMORY_ANSWER_PROMPT：基于记忆作答，没找到也不说"没找到"） | 无 | 无 | 完全没有 | 小prompt，可挂到hippo API |
| 22 | **24 LLM/15 embedding/30向量库/4图库 provider插件体系** | 部分 | 部分：OpenSoul有自家provider层 | 部分有 | 不必抄数量，抄"base抽象类+config模型+factory注册"一致性 |

### mem0 源码亮点
- **反幻觉ID映射**：把已有记忆UUID映射为"0".."9"整数给LLM，输出后再映射回UUID——防止LLM编造UUID。
- **失败可见**：LLM抽取失败raise LLMError而非静默返回[]（注释明说原来静默导致上游无法区分"不可用"和"无事实"）。
- **批量+逐条fallback双层**：insert/embed/history全部批量优先、失败逐条重试。
- **实体语义合并阈值0.95**：exact match(归一化文本) OR 语义match(≥0.95)才合并，防误并。
- notices.py：远程拉取公告配置（TTL 1小时缓存）——产品化运营细节，不必抄。

### mem0 可复用设计（OpenSoul落地优先级）
1. **事实抽取prompt全套**（FACT_RETRIEVAL + ADDITIVE_EXTRACTION 1062行，12个few-shot例子覆盖：多话题/助手推荐/去重/时间解析/结构化数据/多说话人）——直接翻译进hippo，**1-2天，价值最高**。
2. OpenAI兼容记忆代理（186行）→ acp-proxy middleware。
3. 记忆历史审计表 + explain评分 → 直接命中"我都不知道他们在干嘛"。
4. 时间锚定 + TTL + 全文MD5去重 → 各2小时级小改动。
5. 语义向量检索替换LIKE（本地embedding + sqlite-vec），中文检索质量质变。

---

## 二、Letta (letta-code v0.32.10) 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **MemFS：git版本化记忆文件系统**（记忆=markdown文件树，git commit=记忆变更，多设备同步，git hooks校验） | 无 | 无：hippo是SQLite行 | 完全没有 | 高价值：用户NAS+git天然适配；"记忆可diff可回滚" |
| 2 | **MEMORY.md根索引**（v2布局强制要求根索引文件，agent每次注入） | 无 | 无 | 完全没有 | 与Hermes自身MEMORY.md范式一致 |
| 3 | **frontmatter校验+read_only保护**（git pre-commit hook内嵌校验源码：格式/受保护字段不可改） | 无 | 无 | 完全没有 | 记忆防篡改，免疫系统(immune)可对接 |
| 4 | **记忆字符预算**（maxDepth/maxFileCharacters/maxCoreMemoryCharacters/按pattern限额，流式计数防大文件缓冲） | 无 | 无：hippo无大小约束 | 完全没有 | **立即可做**：防记忆膨胀撑爆上下文，半天 |
| 5 | **后台反思子代理**（reflection.md：对话后后台启动，只给Bash+Edit工具，自动更新记忆文件+维护skills；明确规则"一次性事务入memory，可复用流程才入skills"） | 无 | 部分：mirror/metacognition只记决策日志，不写记忆 | 完全没有 | **架构级差异**：记忆维护是后台agent行为不是API行为。OpenSoul可在对话结束后spawn反思任务（limb执行+hippo写入） |
| 6 | **记忆沙箱隔离**（memory-confinement：内核级sandbox，子代理可读宿主、可写自己的记忆、**不能读写其他agent记忆**，fail-closed——无sandbox直接报错不降级） | 无 | 无 | 完全没有 | 多agent安全关键；OpenSoul Docker沙箱（#32方案）加记忆挂载策略 |
| 7 | **内置子代理库**（fork/general-purpose/history-analyzer/init/memory/recall/reflection，各带md prompt模板+launchProfile） | 部分：delegate_task有leaf/orchestrator | 无 | 部分有 | history-analyzer（会话考古）和recall值得抄 |
| 8 | **反射阈值反馈**（telemetry/reflection-threshold-feedback.ts：反思触发的遥测闭环） | 无 | 无 | 完全没有 | 跟vital可观测性一起做 |
| 9 | **channels多平台网关**（Slack/Telegram/Discord/custom + access-control + credential-store + rich-draft-streamer + control-request协调 + 命令运行时） | 部分：Hermes有gateway | 无 | 部分有 | 已有Hermes，无需重做；rich-draft-streamer（草稿流式预览）可参考 |
| 10 | **会话上下文提醒注入**（reminders/=系统提醒目录catalog+按会话状态注入`<system-reminder>`，非定时提醒；含memory-git同步状态提醒） | 无 | 无：will/proactive.py是文件/日志观察者循环，方向不同 | 完全没有 | 按会话状态（新会话/技能变更/记忆同步失败）注入提醒，中价值 |
| 11 | **入站turn队列**（queue/turn-queue-runtime：user消息/task_notification/cron_prompt三类入站排队，逐turn串行送入agent，支持合并） | 无 | 无：echo/dispatcher是**出站**多渠道推送队列，方向相反 | 完全没有 | 多渠道同时来消息时的串行化，Hermes gateway已有类似，OpenSoul缺per-agent入站队列 |
| 12 | **approval恢复**（approval-recovery：中断后审批状态恢复；turn-recovery-policy） | 无 | 无 | 完全没有 | 长任务可靠性 |
| 13 | **系统提示词版本化**（system-prompt-versioning + size监控） | 无 | 无 | 完全没有 | 配合gene模板 |
| 14 | **附带仓库git同步**（attached-repository-git-sync：agent管理的repo自动同步） | 无 | 无 | 完全没有 | 中价值 |
| 15 | **MCP OAuth**（mcp-oauth.ts：MCP server授权流） | 无 | 部分：mcp/server.py无OAuth | 完全没有 | 与#31 Composio发现汇合：认证编排是共性缺口 |
| 16 | **沙箱后端探测**（sandbox/availability：有无内核sandbox检测，无则显式失败） | 无 | 无 | 完全没有 | 与#32 E2B方案一致 |
| 17 | **agent标签/预设/实验**（agent-tags、agent-presets、experiments/） | 无 | 部分：gene模板 | 部分有 | 低优先 |

### letta-code 源码亮点
- **工程规范本身值得抄**（AGENTS.md 46K字）：禁`../`相对导入全用`@/`别名（grep可发现性）、kebab-case文件名、禁default export、禁循环依赖(madge=0)、**源文件<1000行硬限制**+存量基线只减不增、分层导入检查脚本——全部"为agent协作而设计"的repo规范。
- 系统提醒用`role:"user"`+`<system-reminder>`标签而非system角色（Anthropic对system插入的兼容性坑）——我们ACP推送同款坑。
- reflection子代理prompt的操作规程极其精确（先wc -c再决定全读/定点读、Windows PowerShell兼容、Edit只用于改已有文件）。

### letta-code 可复用设计
1. **反思子代理范式**（最高价值）：对话结束→后台agent读transcript→Edit记忆文件→git commit。OpenSoul版：cortex调度一个"记忆管家"任务，输入=会话transcript，输出=hippo store/update调用+可选skill生成。
2. 记忆字符预算/frontmatter校验——防膨胀，立即可做。
3. git版本化记忆——配合用户NAS，记忆可diff/回滚/多机同步。
4. repo工程规范——OpenMate/OpenSoul的AGENTS.md可直接引入文件行数上限和导入规则。

---

## 三、本轮结论（跨mem0+letta）

**记忆系统三层差距**：
1. **抽取层**：OpenSoul完全没有"对话→自动事实抽取"（mem0全套prompt可1-2天移植）
2. **检索层**：无语义向量（LIKE+Jaccard对中文基本失效）、无rerank、无实体加权、无explain
3. **维护层**：无后台反思agent（letta范式）、无审计历史、无TTL、无字符预算、无git版本化

**最大小坑提醒**：letta-ai/letta 仓库已空壳，未来调研任何mem0-era letta资料需去 archive分支 或 letta-ai/letta-code。

**网络备忘**：本机访问github.com时好时坏；`https://ghfast.top/https://github.com/<org>/<repo>/archive/refs/heads/main.zip` 可用（mem0 20MB、letta-code 38MB成功）；GitHub API未认证已限流；letta空壳仓库曾被误判为下载截断。
