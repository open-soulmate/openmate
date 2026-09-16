# Khoj (#38, 31k★) 功能研究 — 源码级

更新：2026-09-17 06:00
源码：~/agent-research-src/khoj（codeload tarball, 84MB, master）
结构：src/khoj/{routers 14个API/processor{content,conversation,operator,tools,speech,image}/search_filter/search_type/database} + src/interface/{web,desktop,obsidian,emacs,android} + src/telemetry

Khoj = 自托管"第二大脑"：个人知识库 + 研究模式 + **自带电脑的Operator**。与OpenMate定位最接近的**个人agent产品**。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Research模式迭代循环**（MAX_ITERATIONS=5环境变量可调；每轮LLM选工具→并行执行→聚合进iteration_history；构造plan_function_execution prompt） | routers/research.py:476-706 | 无 | 无 | 完全没有 | P0。研究循环骨架清晰可抄 |
| 2 | **中断注入interrupt_queue**（研究跑着跑着用户发新指令→从queue取出→**拼进研究历史、重置query、继续跑**；abort_message=END_EVENT即取消） | research.py:518-535 | 无 | 无 | 完全没有 | **P0，最有价值单项**：长任务中途改方向。OpenMate前端加"插话"输入框即可 |
| 3 | **cancellation_event协作式取消**（每轮循环开头检查asyncio.Event，客户端断连即优雅停止） | research.py:512 | 无 | 无 | 完全没有 | P0，实现成本极低 |
| 4 | **重复工具组合检测**（previous_tool_query_combinations={(tool,args tuple)}，命中→warning注入prompt"你已经调过这个，换一个"） | research.py:447-466 | 无 | 无 | 完全没有 | 与deepseek循环guard/anything-llm loop-detect互证。P0 |
| 5 | **ResearchIteration结构化迭代记录**（query=ToolCall/context/results/warning/raw_response，construct_iteration_history把所有轮次变成可回放历史；**支持从部分研究继续**） | processor/conversation/utils.py + research.py:504 | 无 | trajectory/有事件表 | 部分有 | "接着上次的研究继续"。P1 |
| 6 | **Operator：agent专属电脑**（Docker容器 + 挂载docker.sock让主进程管理容器；computer env(截图/点击/键鼠) + browser env；4种VLM agent：anthropic/openai/uitars(995行)/binary(405行)） | processor/operator/ 11文件2900行 | 无 | mirror/sandbox.py目录级假沙箱 | 完全没有 | P1（重）。与E2B调研结论互证：OpenSoul无真执行环境 |
| 7 | **自然语言搜索过滤器三件套**（DateFilter：`dt>="yesterday" dt<"tomorrow"`正则+dateparser+**12种日期格式预编译正则**+LRU缓存；FileFilter：`file:"/path/**"`；WordFilter：`-"word" +"word"`） | search_filter/ 3个文件 | 无 | database/meilisearch有created_at过滤 | 部分有 | **知识库必备**：用户说"上周的XX"要能落到检索层。P1 |
| 8 | **自定义Agent（可创建/隐藏/更新）**（personality/模型/工具白名单/MCP绑定；hidden agent供系统内部用；get_agent_by_conversation会话↔agent绑定） | routers/api_agents.py (510行) | 无 | gene/templates.py有agent模板 | 部分有 | OpenSoul有模板无CRUD API。P1 |
| 9 | **Automations定时任务**（APScheduler CronTrigger + **cron_descriptor把cron翻译成人话给用户确认** + timezone参数 + 手动触发trigger_manual_job + 分钟级禁止） | routers/api_automation.py | 无 | will/models.py有CRON枚举 | 部分有 | cron_descriptor即时可读描述=低级但有效的防错。P2 |
| 10 | **run_code双沙箱**（Terrarium本地 / **E2B云沙箱**：文件base64上传→run_code(60s超时→diff前后文件列表→自动下载新产出文件；沙箱上下文提示按沙箱类型切换） | processor/tools/run_code.py (348行) | 无 | 无代码执行 | 完全没有 | P0（安全关键）。E2B已调研，集成路径清晰 |
| 11 | **网页/文档摄取处理器族**（docx/pdf/markdown/org_mode/plaintext/**github**/**notion**/images 统一text_to_entries管线） | processor/content/ | 无 | 无文档摄取 | 完全没有 | 知识库入口。OpenSoul只有会话记忆无文档摄取。P1 |
| 12 | **多端客户端全家桶**（web/desktop/**obsidian插件**/**emacs包**/android） | src/interface/ | Next.js web | 无 | 部分有 | obsidian/emacs对知识工作者是高价值入口。P2 |
| 13 | **电话/短信接入**（twilio.py + api_phone.py：打电话问AI、AI回短信） | routers/ | 无 | 无 | 完全没有 | 国内场景可换微信/电话。P2 |
| 14 | **订阅计费**（api_subscription.py + stripe集成，托管版商业化） | routers/api_subscription.py | 无 | 无 | 完全没有 | 商业化才需要。P3 |
| 15 | **独立telemetry服务**（src/telemetry独立Dockerfile部署，v1_telemetry批量接收） | src/telemetry/ | 无 | vital/有运维指标 | 部分有 | 独立部署的遥测服务，防主服务被打扰。P3 |
| 16 | **搜索类型单一化但深**（text_search.py：倒排+向量混合，配合上面三过滤器） | search_type/text_search.py | 无 | hippo有FTS5+向量 | 部分有 | — |
| 17 | **记忆CRUD API**（api_memories.py：列出/更新/删除UserMemory，研究时relevant_memories注入） | routers/api_memories.py | 无 | hippo/有记忆但无用户可见CRUD | 部分有 | **用户能看到/改AI对自己的记忆**——信任设计。P1 |
| 18 | **工具清单**（SemanticSearchFiles/OnlineSearch/ReadWebpage/RunCode/Operator/MCP/GrepFiles/ListFiles/ViewFile 9种，tools_for_research_llm统一描述） | research.py:25-45 | 无 | limb/executor是RPA动作 | 完全没有 | 研究工具箱标准配置。P1 |
| 19 | **截断治理**（truncate_code_context：代码结果按token预算截断后才进上下文） | utils/helpers.py | 无 | 无 | 完全没有 | 小而实用。P1 |
| 20 | **image生成 + TTS**（processor/image/generate.py、processor/speech/text_to_speech.py） | processor/ | 无 | voice/tts_engine.py已有edge-tts | 已有(TTS) | — |

## 源码亮点
- **研究中断注入是全场最佳设计**：不是"取消重来"，而是"把你的话插进研究历史、重置当前query、保留已完成迭代"——语义上是**研究的rebase**。实现只有~15行（queue.get+history重组）。
- **重复组合检测用`dict_to_tuple(args)`做可哈希签名**——比文本相似度便宜且零误报。
- **Operator的Docker-in-Docker挂docker.sock**：主进程控制容器生命周期，agent在容器里瞎搞也不影响宿主。
- **cron_descriptor**：创建定时任务时把cron表达式翻译成"每5分钟"显示给用户——人机校验的低成本方案。
- **run_code的文件diff下载**：执行前后`files.list`做集合差，只下载新增文件——不浪费带宽传已有文件。

## 可复用设计
1. **interrupt_queue + cancellation_event** → OpenSoul acp/或event_stream加两个原语，OpenMate聊天框在任务运行时变"插话框"。**性价比最高**
2. **重复工具组合检测** → 5行代码，防agent原地打转
3. **DateFilter/FileFilter/WordFilter** → OpenSoul hippo检索层加过滤器，"上周的笔记"直接命中
4. **记忆CRUD API** → hippo已有存储，加4个REST端点+前端列表，用户可删AI记错的东西
5. **ResearchIteration可回放历史** → trajectory/已有事件表，加construct_iteration_history等价物
6. **自定义Agent CRUD** → gene/templates升级为用户可编辑

## 与OpenMate/OpenSoul的定位对照
Khoj = OpenMate想成为的形态（个人知识+研究+多端），且已经给出了：
- 研究循环的最小正确实现（5迭代+并行工具+中断+重复检测）
- 知识库检索的过滤器标准（date/file/word）
- agent电脑的安全形态（容器化Operator）
OpenSoul缺的不是agent框架而是这三件套。
