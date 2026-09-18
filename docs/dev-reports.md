# OpenMate/OpenSoul 开发报告

## [2026-09-17 11:09] 输出侧护栏：Warp 20 API-key正则并入immune + LLM出网路径接线

**目标**：解决调研确认的P0差距——moderator"在位但没接线"：ContentModerator只有7个PII正则且只挂在/api/immune和/api/pipeline显式端点，LLM请求路径零防护，工具输出里的AWS key/API token会原样发给第三方provider（政企demo最容易翻车的点）。

**调研来源**：Warp secret_redaction crate（64-warp-source-supplement.md #1/#2/#4/#10，源码~/agent-research-src/warp-master/crates/secret_redaction/src/lib.rs 464行20正则）。SUMMARY.md第一阶段路线图第4项"输出侧安全：Warp 20正则并入immune+接线LLM请求路径（150行，立即可做）"。

**改动文件**：
- opensoul/src/immune/moderator.py
- opensoul/src/gland/router.py
- opensoul/tests/test_moderator.py（新增）

**改动内容**：
1. moderator.py：
   - PATTERNS新增17个API key/token正则（OpenAI/Anthropic/sk-通用/AWS Access ID/GitHub×5种/Slack App Token/Stripe/Google/Firebase/JWT/Fireworks/IPv6/MAC），与原有7个PII正则去重合并，共24个
   - 所有正则预编译存`_compiled`（调研#4：避免每次moderate重新compile）
   - 坏正则编译时跳过、其余照常武装（Warp"构造失败不换弹匣"fail-safe，调研#10）
   - `_redact`增加重叠区间合并（Warp merge_sorted_ranges模式，调研#9相关）：修复既有bug——OpenAI key同时命中sk-通用规则时按同一偏移替换两次会吃掉相邻文本；合并后取高风险类型
   - 新增`redact_messages(messages, min_risk)`：OpenAI风格消息列表批量脱敏，返回(新列表, 发现摘要)，摘要只含type/risk/label不含密钥原文（日志安全）
2. router.py：
   - `_call_chat`出网前调用redact_messages——Warp blocklist层做法：发给LLM的每个文本块先扫描脱敏，密钥不出机器
   - 懒加载单例+try/except fail-safe：脱敏模块故障不阻断LLM调用
   - `OUTBOUND_REDACT_MIN_RISK="critical"`：只拦API key/token/密码级，PII（手机号/邮箱）按部署需要降级开启

**验证结果**：
- tests/test_moderator.py 18 passed（各格式检出、脱敏后原文消失、输入消息不被修改、min_risk阈值、重叠区间不损坏尾部文本、坏正则不解除武装、findings摘要不含密钥原文）
- tests/test_immune.py 10 passed（live server集成）
- mock HTTP端到端验证：`_call_chat`发出的messages中key已替换为[REDACTED:openai_api_key]、尾部文本"then continue"完整、原messages列表未被修改
- 重启opensoul(:8090)后live API确认：/api/immune/health显示24 patterns；moderate("sk-...")返回risk=critical
- 既有tests/test_pipeline.py 4个upload超时为环境问题（外部embedding provider 30s ReadTimeout），stash对照确认与本改动无关（embed路径未触及）

**commit**：opensoul bca2b7e1

## [2026-09-17 14:30] cortex LLM重试策略：Retry-After三格式 + 5xx无条件重试 + 硬性次数上限

**目标**：解决调研确认的P0差距——cortex全库grep retry=0命中，LLM调用失败=直接报错。router.py改前对单个provider只有"一次调用失败→烧掉一次failure标记→切下一个provider"，3次瞬时抖动（429限流/503重启）就把健康provider关进60s cooldown，高峰期表现为"明明配了两个provider还是频繁报错"。

**调研来源**：kilocode retry.ts（179行，64号supplement #2源码级记录：Retry-After三格式"有头听头"、5xx无条件重试"transient server failures"、不可重试精确排除、limit参数防无限循环）。SUMMARY.md cortex清单P0项"LLM重试策略（Retry-After三格式+5xx重试+离线三态）"。

**改动文件**：
- opensoul/src/cortex/llm_retry.py（新增）
- opensoul/src/gland/router.py
- opensoul/tests/test_llm_retry.py（新增）

**改动内容**：
1. llm_retry.py（纯策略模块，~130行）：
   - `parse_retry_after`：三格式解析——retry-after-ms毫秒头→retry-after秒数（含float）→HTTP-date（email.utils解析−now）；无头/垃圾值返回None；全部cap 120s（kilocode cap i32上限，此处收紧：数小时的Retry-After应failover而不是冻结请求，偏差已在docstring注明）
   - `backoff_delay`：服务器hint优先；无头才指数退避2s×2^n封顶30s（kilocode原值）+半程jitter（50~100%，防同一限流点的羊群重试，langgraph RetryPolicy同理）
   - `is_retryable_status`：5xx无条件（含599）+408/425/429显式集合；400/401/403/404/409/422不重试
   - `retry_delay_for`：HTTPStatusError按状态码分类并携带response headers听头；httpx.TransportError（连接/超时/重置，与kilocode SessionNetwork同族errno）按无头退避重试；未知异常不重试
2. router.py（增量接线）：
   - 新增`_with_retry(provider, fn)`：单provider内重试环，RETRY_MAX_ATTEMPTS=3（kilocode limit参数语义），重试成功不烧failure标记；不可重试/次数耗尽立即raise走原有failover——跨provider链保留为第二道防线
   - chat()与embed()的出站调用改走`_with_retry`；lambda闭包捕获的api_key/model先绑定为str局部变量（Pyright窄化不跨闭包）
   - test_provider保持单发探测不动（健康检查语义就是一次）
3. tests/test_llm_retry.py：26个测试，无live server依赖（httpx.MockTransport）

**验证结果**：
- tests/test_llm_retry.py 26 passed（三格式解析含HTTP-date/过期日期钳0/cap、退避曲线2s→4s→8s→封顶30s、jitter半程区间50次采样、可重试分类、端到端：429带retry-after-ms重试2次成功且consecutive_failures归零、500恰3次不无限、401零重试立即切provider-b、embedding 502重试、ConnectError恢复）
- tests/test_moderator.py 18 passed（回归）
- acp-proxy集成测试 run_integration_tests score=1.0（三服务健康+语法+WS协议对齐+WS收发全过，include_build=False本轮无前端改动）
- 重启opensoul(:8090)后live确认：/api/system/health ok，/api/gland/providers正常列出openai/ollama两provider consecutive_failures=0

**commit**：opensoul 8dad4d5b

## [2026-09-17 15:37] trajectory三层观测模型：langfuse Trace→Observation→Score

**目标**：解决调研确认的P0差距——"我都不知道他们在干嘛"的后端数据前提缺失。OpenSoul trajectory是扁平事件表：事件无结束语义（duration靠调用方随手填，各写各的时钟）、parent_event_id有雏形但无任何嵌套查询（前端只能拿扁平列表）、质量评分零存储（"有没有变好"无处可查，P0-5评估闭环连数据层都没有）。

**调研来源**：langfuse三层模型（SUMMARY.md P0-4：Trace→Observation嵌套span→Score挂载）；Warp subtree rollup（每节点子树事件/token/duration汇总）；deepseek"溢写失败绝不能把成功调用变错"（end_event对坏created_at不fail）；SUMMARY.md行业信号5（OTel GenAI semconv被官方收编→trajectory字段应对齐gen_ai标准）。

**改动文件**：
- opensoul/src/trajectory/store.py
- opensoul/src/api/trajectory.py
- opensoul/tests/test_trajectory_spans.py（新增）
- opensoul/tests/test_trajectory_store.py（4处mock调用计数更新）

**改动内容**：
1. store.py：
   - TrajectoryEvent新增end_at字段；SQLite迁移ALTER TABLE（无IF NOT EXISTS，重复列错误按消息匹配安全吞掉，其他异常照常raise）
   - end_event()：span关闭语义——end_at盖章、duration_ms由created_at→now单一时钟推导（不信调用方）、token_usage增量回填session总量；created_at解析失败时长记0不抛错
   - get_trace_tree()：parent_event_id→父子边构建嵌套观测树，每节点depth+subtree_events/subtree_tokens/subtree_duration_ms rollup；悬空parent提升root、环状血缘seen-set遍历切断（损坏数据不能挂死读取方）
   - TrajectoryScore数据类+trajectory_scores表（langfuse Score镜像：name/value/string_value/data_type/source/trace_id/comment），SCORE_SOURCES=api/llm_judge/code_eval/human
   - add_score五项校验、get_scores按session/name/source过滤、get_score_summary按name聚合（count/avg/min/max/裁判数/人工数="有没有变好"一条SQL）
   - delete_session级联清理scores；EventType新增SPAN（通用嵌套span类型）
   - gen_ai_attributes()：OTel GenAI semconv属性构造（gen_ai.system/request.model/usage.input_tokens/output_tokens/response.finish_reasons）
2. trajectory.py新增端点：POST /events/{id}/end（span关闭）、GET /sessions/{id}/trace（嵌套树）、POST/GET /sessions/{id}/scores、GET /sessions/{id}/scores/summary

**验证结果**：
- tests/test_trajectory_spans.py 13 passed（真实/tmp SQLite隔离库：end_event持久化+token回填、迁移幂等连跑两次、树嵌套+rollup+深度、悬空parent提升、2-环不挂死、score增查过滤聚合、delete级联、校验5种、gen_ai属性）
- 既有trajectory四套测试65 passed（含4处mock调用计数随DDL同步）
- acp-proxy集成测试 run_integration_tests score=1.0（三服务健康+语法+WS协议对齐全过，include_build=False无前端改动）
- 重启opensoul(:8090)后live确认：/api/trajectory/health ok、新端点全部注册、trajectory_sessions表当前0会话无测试数据污染

**commit**：opensoul b6c06130

## [2026-09-17 17:46] cortex上下文压缩引擎：goose 9段式摘要+kilocode预算化切分+三级降级

**目标**：解决调研确认的P0差距——OpenSoul完全没有上下文压缩能力，长对话直接溢出context window导致完全失败。SUMMARY.md第一阶段路线图第3项"上下文压缩引擎：goose 9段式+kilocode切分策略合抄进cortex"。

**调研来源**：
- goose structured.rs（~/agent-research-src/goose/crates/goose-context-management/src/structured.rs 484行）：9段式JSON摘要格式(user_intent/technical_concepts/files/errors_and_fixes/problem_solving/user_messages/pending_tasks/current_work/next_step)，每列表按重要性排序"消费方可从尾部截断"，宽容反序列化(对象/数字转字符串而非失败)，多候选JSON提取(</analysis>后的json fence优先，last first)，brace-balanced extraction处理字符串值内的特殊字符。
- kilocode compaction-chunks.ts（~/agent-research-src/kilocode/packages/opencode/src/kilocode/session/compaction-chunks.ts 406行）：预算化切分(60% of context, min 1000 tokens)，消息粒度二分切分(单条超预算时切两半)，并发chunk摘要(concurrency=3)，二叉归约合并(depth limit=3)，三级降级(LLM失败→跳过chunk→返回compact信号→fatal error返回stop)。

**改动文件**：
- opensoul/src/cortex/context_compression.py（新建，517行）
- opensoul/src/cortex/__init__.py

**改动内容**：
1. context_compression.py（新建）：
   - `StructuredSummary` dataclass：9字段+extra，`parse()`方法实现多候选提取（</analysis>后的json fence优先，last first，brace-balanced extraction处理字符串内特殊字符）+宽容反序列化(对象/数字/null转字符串，wrap scalars为单元素列表)+空白条目剔除+`_is_empty()`判空(全空则返回None触发raw text fallback)
   - `render()`方法：markdown格式渲染，9段式section headers(User Intent/Technical Concepts/Files/Errors+Fixes/Problem Solving/User Messages/Pending Tasks/Current Work/Next Step)，code fence自动计算backtick长度避免嵌套
   - `ContextCompressor`类：`compress(messages, context_limit, preserve_last_user=True)`主入口
     - `_budget()`：60% of context, min 1000 tokens (kilocode公式)
     - `_split()`：从后向前累积token估算，超预算时二分切分单条消息(remaining chars逻辑，kilocode select()的Python移植)
     - `_summarize_chunk()`：单chunk摘要，优先structured summary，fallback raw text
     - `_reduce_summaries()`：二叉归约(depth limit=3)，空响应时递归二分重试(kilocode reduce()逻辑)
     - preserve_last_user：提取最近text-only用户消息，摘要后重附加(agent仍能"听到"用户最后的话，goose逻辑)
   - `_json_candidates()`：goose json_candidates()的Python移植——terminator列表，fenced blocks，leading object，dedupe
   - `_leading_object()`：brace-balanced extraction，处理string/escape/nested object
   - `_stringify()`：goose stringify_lenient()的Python移植——dict→"k: v; k: v"，list→"a; b; c"，其他→str()
2. __init__.py：
   - 新增`from src.cortex.context_compression import ContextCompressor, StructuredSummary`
   - `__all__`列表追加`"ContextCompressor", "StructuredSummary"`

**验证结果**：
- Test 1: StructuredSummary解析goose格式JSON通过（user_intent==['Fix parser bug']，files[0].path=='src/parser.rs'）
- Test 2: 宽容反序列化通过（对象→字符串，数字→字符串，null→剔除，scalar→单元素列表）
- Test 3: Markdown渲染通过（'# Conversation Summary'，'## User Intent'，'### src/parser.rs'）
- Test 4: 无JSON时raw text fallback通过（返回None）
- Test 5: 空summary({})拒绝通过（返回None）
- python3语法检查通过
- cortex模块导入成功（ContextCompressor, StructuredSummary）

**commit**：f094e452

**解决痛点**：长时间任务context溢出，为后续评估闭环提供数据基础。

## [2026-09-17 19:30] cortex循环/重复检测guard：5源合抄防agent死循环
**目标**：解决调研确认的P0差距——agent可无限重复相同工具调用或生成重复文本，无任何检测或干预，烧token和时间无止境。SUMMARY.md cortex清单P0项"循环/重复检测guard | anything-llm Jaccard 0.85+Khoj组合签名"。

**调研来源**：
- ag2 LoopDetector（65号报告#3）：EventWatch+sliding deque(maxlen=10)+连续3次相同(name,args)→ObserverAlert+_flagged去重，75行
- goose RepetitionInspector（63号supplement#9）：tool_monitor.rs 135行，连续相同(name+args)超max_repetitions→Deny
- Khoj重复组合检测（38号报告#4）：{(tool,args tuple)}集合，命中→warning注入prompt"你已经调过这个，换一个"，5行核心
- anything-llm loop-detect（PROGRESS.md轮9）：3-gram shingle+Jaccard≥0.85，文本重复≥8次/工具签名重复≥4次/连续15轮无工具调用→报警，60s冷却
- DeerFlow LoopDetectionMiddleware（23号报告#2）：三级渐进响应——warn注入警告/intervene剥离tool_calls/force_stop

**改动文件**：
- opensoul/src/cortex/loop_guard.py（新建，~470行）
- opensoul/src/cortex/__init__.py（增量更新导出）
- opensoul/tests/test_loop_guard.py（新建，25个测试）

**改动内容**：
1. loop_guard.py：
   - `ToolCallSignature`：name+args_hash（sha256前12位），args canonical化（sorted keys, no whitespace variance）
   - `LoopGuard`类：主guard，组合4种检测策略
     - `_check_tool_repetition`：滑窗连续计数，≥warn(3)→WARN，≥intervene(5)→INTERVENE
     - `_check_repeated_combination`：Khoj集合检测，非连续重复→WARN（跳过连续重复，由tool repetition负责）
     - `_check_text_similarity`：3-gram Jaccard≥0.85，重复≥8次→FORCE_STOP
     - `_check_no_tool_calls`：预留接口，≥15轮无工具调用→报警
   - `LoopSeverity`：ok/warn/intervene/force_stop四级渐进（DeerFlow模式）
   - `DetectionType`：tool_repetition/text_similarity/repeated_combination/no_tool_calls
   - 冷却机制：alarm后60s内抑制后续alarm（anything-llm模式）
   - stats属性：round/window_size/unique_combinations/flagged_count/recent_texts

2. 关键设计决策（踩坑修复）：
   - 分离`_flagged_repeat`和`_flagged_combo`两个去重集合——共用一个集合时Khoj在第2次调用就fire并污染tool repetition的flagged集
   - Khoj检查跳过连续重复——连续场景由tool repetition负责，两者职责分离
   - 窗口在检查前更新——否则WARN提前返回导致窗口不增长，INTERVENE阈值永远达不到
   - seen_combinations在Khoj检查后更新——否则首次调用被误判为重复

3. __init__.py：新增LoopGuard/LoopDetectionResult/LoopSeverity/DetectionType导出

**验证结果**：
- tests/test_loop_guard.py 25 passed（签名canonical化、连续WARN/INTERVENE、Khoj非连续去重、文本相似度Jaccard精确计算、冷却抑制、统计观测、OpenAI格式解析、reset清空）
- tests/test_moderator.py 18 passed（回归）
- tests/test_llm_retry.py 26 passed（回归）
- acp-proxy集成测试 score=1.0（三服务健康+语法+WS协议对齐+WS收发全过，include_build=False无前端改动）

**commit**：opensoul 10d0b290

**解决痛点**：agent卡死循环烧token/time，为后续ACP proxy集成提供安全底座。

## [2026-09-18 06:30] hippo三因子记忆检索：recency+importance+relevance等权归一
**目标**：解决调研确认的P0-6差距——OpenSoul hippocampus检索评分完全缺失recency时间衰减因子。现有retrieve()只有jaccard*0.5+importance*0.3+access_count*0.2，不含任何时间感知，旧记忆与新记忆同等权重，无法反映"最近聊过的话题更相关"这一人类记忆特性。
**调研来源**：generative-agents（斯坦福论文）retrieve.py（~/agent-research-src/gen-agents/reverie/backend_server/persona/cognitive_modules/retrieve.py，new_retrieve lines 199-271）。SUMMARY.md P0-6："三因子检索（generative-agents，40行可移植）：recency(0.99^i)+importance(poignancy 1-10)+relevance(cos_sim)等权归一——hippo只有时间衰减"。
**改动文件**：
- opensoul/src/hippo/long_term_memory.py（新增three_factor_retrieve()方法+_normalize_dict_floats()辅助函数，get_context_prompt()更新为默认使用三因子检索）
- opensoul/src/hippo/__init__.py（导出_normalize_dict_floats）
- opensoul/tests/test_memory_three_factor.py（新增，25个测试）
**改动内容**：
1. long_term_memory.py：
   - `_normalize_dict_floats(d, target_min, target_max)`：从generative-agents retrieve.py移植的归一化函数，将dict中所有float值缩放到[target_min, target_max]，range=0时全部映射到中点
   - `three_factor_retrieve()`：三因子检索主方法——Phase 1候选搜索（LIKE-based与现有retrieve()相同）、Phase 2计算三因子原始分数（recency=decay^idle_hours, importance=存储值, relevance=Jaccard token相似度）、Phase 3各因子归一化到[0,1]、Phase 4加权组合。支持自定义recency_decay/recency_weight/relevance_weight/importance_weight参数。返回结果包含three_factor_score/recency_raw/relevance_raw诊断字段
   - `get_context_prompt()`：新增use_three_factor=True参数，默认使用三因子检索，False时回退到旧retrieve()
2. __init__.py：导出_normalize_dict_floats
3. tests/test_memory_three_factor.py：25个测试覆盖归一化函数（7个：基本/同值中点/空/单值/自定义范围/负值/保序）和三因子检索（18个：基本检索/空结果/recency偏新/importance偏高/relevance偏匹配/分数归一化/recency_raw时间反映/权重recency主导/权重importance主导/与旧方法差异/memory_type过滤/min_importance过滤/access_count更新/limit遵守/context_prompt三因子/context_prompt回退/中文内容/自定义衰减率）
**验证结果**：
- tests/test_memory_three_factor.py 25 passed（0.20s）
- tests/test_hippo.py 5 passed（回归）
- 模块导入验证通过
- acp-proxy集成测试 run_integration_tests score=1.0（include_build=False无前端改动）
**commit**：opensoul 00a17838

## [2026-09-18 09:20] hippo长期记忆CRUD + mem0审计表：Khoj信任设计 + 全程可追溯

**目标**：解决调研确认的P0-6差距——OpenSoul hippocampus长期记忆完全没有CRUD能力（无法查看/修改/删除），且任何记忆变更无审计记录不可追溯。用户对AI记忆是黑箱状态，不知道AI记了什么、无法纠错、无法行使"被遗忘权"。

**调研来源**：
- Khoj记忆CRUD API（SUMMARY.md P0-6）："Khoj DateFilter/FileFilter/WordFilter自然语言检索过滤+记忆CRUD API（用户可看/改/删AI对自己的记忆——信任设计）"
- mem0记忆审计表（evolution-engine-patterns.md §1.2）："SQLite表字段 = memory_id / old / new / event(ADD-UPDATE-DELETE) / is_deleted，配 history() 查询接口 + 批量写。基因/skill每次被修改都写审计记录，全程可追溯。半天可实现。"

**改动文件**：
- opensoul/src/hippo/long_term_memory.py（新增MemoryAuditEntry dataclass + memory_audit表 + 6个新方法）
- opensoul/src/hippo/__init__.py（导出MemoryAuditEntry）
- opensoul/src/api/hippo.py（新增6个REST端点）
- opensoul/tests/test_memory_crud.py（新增，29个测试）

**改动内容**：
1. long_term_memory.py：
   - `MemoryAuditEntry` dataclass：audit_id/memory_id/event/old_value/new_value/is_deleted/reason/created_at
   - `_init_db()`新增`memory_audit`表 + 两个索引（idx_audit_memory按memory_id+created_at、idx_audit_event按event+created_at）
   - `store()`：写入后自动写ADD审计记录（content摘要+memory_type+importance作为new_value）
   - `_write_audit()`：统一审计写入helper，audit_id用sha256前12位
   - `update_memory()`：稀疏编辑模式——只UPDATE显式提供的字段，old/new快照写入UPDATE审计；FTS索引同步（content或tags变化时delete+reinsert）
   - `delete_memory()`：软删（default，consolidated=1）/硬删（hard_delete=True），删除前取快照写DELETE审计
   - `list_memories()`：按类型过滤、分页（limit+offset）、include_deleted开关，tags/metadata自动JSON解析
   - `get_history()`：按memory_id/event过滤，DESC时间排序
   - `consolidate()`：合并去重时写MERGE审计记录（old=被合并方importance/access_count, new=merged_into目标ID）
   - `get_audit_stats()`：审计统计（总数/按事件类型/删除数/最近5条操作）
2. api/hippo.py新增端点：
   - GET /ltm/list — 列出所有长期记忆
   - GET /ltm/audit/history — 审计轨迹查询
   - GET /ltm/audit/stats — 审计统计
   - GET /ltm/{memory_id} — 获取单条记忆
   - PATCH /ltm/{memory_id} — 更新记忆（带审计）
   - DELETE /ltm/{memory_id} — 删除记忆（带审计）
   - FastAPI路由顺序：/ltm/audit/*和/ltm/list在/ltm/{memory_id}之前注册，防止"audit"/"list"被路径参数捕获

**验证结果**：
- tests/test_memory_crud.py 29 passed（store写ADD审计、稀疏编辑、FTS同步、软删/硬删、删除后不进检索、分页无重叠、审计old/new快照、consolidate写MERGE、审计统计聚合、全生命周期审计轨迹ADD→UPDATE→DELETE）
- tests/test_hippo.py 5 passed（回归）
- tests/test_memory_three_factor.py 25 passed（回归）
- acp-proxy集成测试 run_integration_tests score=1.0（三服务健康+WS协议对齐+WS收发全过，include_build=False无前端改动）
- Python语法检查4文件全部通过

**commit**：opensoul a25efb53

## [2026-09-18 12:30] acp-proxy工具结果溢出处理：goose落盘+deepagents分段读回+AIHawk显式标记
**目标**：解决调研确认的P0-2差距——engine.py的_agent_loop将完整tool_result直接加入context（零大小检查），tool_output_handler不存在导致任何大工具输出都能撑爆context window。SUMMARY.md P0-2："工具结果外置/溢出处理（7方互证）——OpenSoul：零"。
**调研来源**：
- goose large_response_handler.rs（~/agent-research-src/goose/crates/goose/src/agents/large_response_handler.rs 265行）：>200k字符→写临时文件→stub引用路径+文件权限0o600
- deepagents #3双策略外置（59-deepagents-source.md）：proactive超阈值即外置 + reactive溢出裁尾 + stub教模型read_file_segment分段读回
- AIHawk SHOWN/SENT双预算：截断必须显式标记[TRUNCATED]
- kilocode Truncate：字符数+行数双限
**改动文件**：
- acp-proxy/agent/tool_output_handler.py（新建，~270行）
- acp-proxy/engine.py（增量修改5处）
- acp-proxy/tests/test_tool_output_handler.py（新建，17个测试）
**改动内容**：
1. tool_output_handler.py：
   - ToolOutputHandler类：双限判断(50K字符/2000行)→落盘+head/tail预览stub
   - read_segment(): 按行范围分段读回，路径安全验证（必须在spill_dir内防路径穿越）
   - SpillResult dataclass: spilled/spill_path/original_size/shown_size/spill_id
   - 溢出文件权限0o600保护敏感数据（goose unix permission模式）
   - get_stats(): 统计溢出次数和总大小
2. engine.py（增量edit）：
   - import ToolOutputHandler, __init__中实例化output_handler
   - _agent_loop: tool_result加入context前经过output_handler.process()
   - _tool_read_file: 替换原有粗糙50K截断为handler处理（外置+stub引用）
   - _tool_read_file_segment: 新工具实现，分段读回溢出文件
   - _get_tool_definitions: 新增read_file_segment工具定义
3. tests/test_tool_output_handler.py：17个测试覆盖：小输出透传/超字符溢出/超行数溢出/head+tail预览/教模型分段读回/分段读回基础/续读/到达末尾/超出范围报错/路径安全防护/文件不存在/权限验证/唯一路径/统计/空结果/恰好阈值不溢出/超1字符即溢出
**验证结果**：
- tests/test_tool_output_handler.py 17/17 passed
- acp-proxy integration_test score=1.0（5项全过：health×3+WS协议对齐+WS收发）
- python3 ast.parse语法检查通过（engine.py + tool_output_handler.py）
**commit**：openmate 9710f690

## [2026-09-18 17:00] benchmark评估闭环：agno/langfuse式数据集+LLM裁判+实验基线diff
**目标**：解决调研确认的P0-5差距——"但是一直没有进化啊"的度量解法完全缺失。现有benchmark/evaluator.py正是SUMMARY.md点名的"5维自评非裁判"：评分由调用方POST（EvaluateRequest五个0.5默认值），没有数据集、没有独立裁判、没有基线对比、没有环境指纹——"agent有没有变好"无从回答。SUMMARY.md第一阶段路线图第2项"评估闭环：LLM-as-Judge+数据集+实验对比"。
**调研来源**：
- agno environments（42-agno-source.md，evolution-engine-patterns.md §2.1）：scorer三件套+run_rollouts K次全隔离+env/policy指纹分离+baseline diff+learning_zone（"有成有败"=SFT候选）+错误风暴熔断（前N次attempt同错即停）
- langfuse（SUMMARY.md P0-5）：LLM-as-Judge+Dataset+Experiment+确定性采样
- CAMEL verifiers（§2.4）："能程序化验证的绝不靠LLM"——CodeScorer排在JudgeScorer之前
- deepagents RubricMiddleware（§2.2）：完成=独立裁判对照rubric评分，非模型自说自话
- agno JudgeScorer：judge prompt fence防注入+裁判身份digest哈希（回归能定位裁判是否换过）
**改动文件**：
- opensoul/src/benchmark/eval_loop.py（新建，~650行）
- opensoul/src/benchmark/__init__.py（增量导出）
- opensoul/src/api/benchmark.py（增量：9个/eval/*端点）
- opensoul/tests/test_eval_loop.py（新建，41个测试）
**改动内容**：
1. eval_loop.py：
   - EvalStore：eval_datasets/eval_cases/eval_experiments三表SQLite持久化；list_cases(seed=)确定性采样（同seed同样本，实验可比）；env_fingerprint=sha256(sorted用例指纹+scorer digest列表+k)——环境指纹，数据集/scorer/k任一变化即变
   - CodeScorer：contains/not_contains/regex/equals/自定义case_fn五种程序化校验，用例无expected时显式abstain（不冒充裁判）
   - JudgeScorer：LLM-as-Judge——候选输出包在<candidate_output>标签内并在system prompt声明UNTRUSTED DATA（judge prompt注入防线）；verdict宽容解析（fenced JSON→裸JSON→regex fallback "score: 7/10"）；解析失败/judge异常=abstain绝不编分；model_identity digest随diff报告
   - ExperimentRunner：每用例k次尝试；pass_rate分母只算scored attempt（agno"超时≠答错"，错误attempt记unscored不记fail）；错误风暴熔断——任意连续storm_window次同类型错误即中止实验（agno原版只看前N次，此处泛化：provider可能中途死）；learning_zone=0<pass<scored的用例；policy_fingerprint=sha256(policy_name+policy_meta)与env指纹分离；实验结果可镜像写trajectory Score层（source=code_eval/llm_judge）
   - diff_against_baseline：env指纹不匹配raise EnvMismatchError（跨环境对比无效，agno MismatchError）；输出policy_changed+improved/regressed/unchanged/unscored/new_cases
   - make_router_runner/make_router_judge：gland router生产接线（agent-under-test与裁判都走ModelRouter，自动享受重试/failover/出网脱敏）
2. api/benchmark.py：POST/GET /eval/datasets、POST/GET /eval/datasets/{id}/cases、POST /eval/experiments/run（scorer=auto|code|judge；auto=CodeScorer优先+JudgeScorer兜底）、GET /eval/experiments、GET /eval/experiments/{id}、GET /eval/experiments/{id}/diff?baseline_id=（409 on env mismatch）、GET /eval/learning-zone/{id}
**验证结果**：
- tests/test_eval_loop.py 41 passed（数据集CRUD/确定性采样/env指纹敏感性、CodeScorer五模式+abstain+digest、JudgeScorer JSON/fenced/regex fallback/unparseable abstain/judge错误abstain/UNTRUSTED fence内容/分数钳位/身份digest、ExperimentRunner pass_rate/unscored不进分母/熔断触发/异构错误不误熔断/learning_zone/baseline diff improved+policy_changed/env不匹配raise/结果持久化、scorer链code先judge后且judge只被调一次、trajectory分数写入断言、独立diff函数new_case+unscored桶）
- 既有test_benchmark+test_trajectory_spans+test_moderator 43 passed（回归）
- acp-proxy集成测试 run_integration_tests score=1.0
- 重启opensoul(:8090, systemd user service)后live端到端验证：
  * 真实LLM实验（scorer=code）：数据集"smoke-eval"2用例，seed=42确定性采样生效（['cap','arith']），2/2 passed，CodeScorer contains check落判
  * 真实裁判实验（scorer=judge）：JudgeScorer返回解析后verdict+真实评语（"Candidate output is 'Paris', which exactly matches the rubric..."），2/2 passed
  * baseline diff：同环境不同policy的实验diff返回policy_changed=true+unchanged=[cap,arith]
  * 环境守卫：scorer从code换成judge后对旧基线run实验被409拒绝（env_fingerprint 083be... vs 38f78...）
  * trajectory落库确认：sqlite查询trajectory_scores表命中evalsmoke_arith/cap两条，source=llm_judge、trace_id=实验id（GET API 404是因为session级读端点要求会话存在，写路径已验证成功）
**commit**：opensoul 26b54a4e

## [2026-09-18 09:08 CST] P0-3 工具级权限引擎 — AgentScope PermissionEngine移植 + 5模式/三层规则/真人审批全链路接线
**目标**：解决SUMMARY.md P0-3差距——immune只有用户级RBAC，无工具/路径级权限引擎；且acp-proxy既有PermissionManager从未被调用（"写了≠接线了"）、其"session/request_permission事件"协议前端根本无处理器，与ACP v1.0标准协议不兼容
**调研来源**：AgentScope PermissionEngine 848行源码全文精读（~/agent-research-src/agentscope/src/agentscope/permission/ _engine.py/_types.py/_decision.py/_rule.py/_context.py + 3个permission测试文件）；kilocode三层规则叠加（base/approved×wildcard findLast + session per-approval）与"敏感权限必须真人交互——机器审批静默拒绝留pending"；open-webui tool_approval三态（拒绝=合成错误工具结果，loop不断）；goose permission_judge缓存（防审批弹窗疲劳）；AIHawk"截断/阻断必须显式标记"；54-agentscope-source.md差距表标注权限层P0安全
**改动文件**：
- opensoul：src/immune/permission_engine.py（新~700行）、src/immune/__init__.py、src/api/immune.py（+9端点）、tests/test_permission_engine.py（新49测试）
- openmate：acp-proxy/agent/permission_gate.py（新296行）、acp-proxy/agent/soulmate_agent.py（+95行）、acp-proxy/tests/test_permission_gate.py（新18测试）、src/app/(app)/chat/chat-client.tsx（+53行）、src/components/acp-approval-modal.tsx（TOOL_LABELS补齐）
**改动内容**：
- opensoul canonical引擎：5模式（default/accept_edits/explore/bypass/dont_ask）；评估顺序=hard deny硬否决（8条builtin灾难规则，bypass也不可覆盖）→findLast统一扫描（kilocode三层：session>user>builtin，同优先级seq降序最后匹配胜出，跨allow/ask/deny行为类）→只读快路径→EXPLORE拒绝写入（用户allow规则不可授予写权限，AgentScope保证）→ACCEPT_EDITS工作目录内自动放行→模式fallback（dont_ask永不返回ask、转deny保留建议；bypass除deny/ask规则外全放）
- 规则匹配：Bash子串/prefix wildcard（"git:*"）、Write/Read glob+basename+~/.ssh关键目录、其余工具generic参数子串；BUILTIN基线37条（8 hard deny + 29 ask：sudo/systemctl/dd、.env/.pem/.key/~/.ssh、/dev/sd*整盘写入等），引擎脱离store时自动补上（fail-closed）
- PermissionStore：SQLite规则存储（三层provenance+seq+软删审计）+模式存储+决策审计表+人工审批outcome记录（approved/denied+comment）
- acp-proxy执行侧gate：每个tool_call执行前调opensoul /api/immune/permission/check；deny→合成阻断工具结果（含provenance"为什么被拦"+建议规则"怎么放行"+"勿重复调用同样参数"指引）；ask→ACP v1.0标准session/request_permission真人审批（经acp官方库Client.request_permission，响应{"outcome":{"outcome":"selected","optionId":"allow_once"}}/cancelled；无人值守=静默拒绝留审计）；opensoul不可达→本地降级（只读放行+灾难命令本地硬否决+fail-open不锁死工作流，用户曾差点被锁在门外）；同session同参数审批结果缓存10分钟
- 前端：chat-client.tsx实现ACP v1.0 session/request_permission请求-响应协议（approvalRpcRef暂存JSON-RPC id/ws/optionId，sendApproval以result答复），复用既有AcpApprovalModal弹窗，旧human.approval.required流程保持兼容
- API：opensoul /api/immune/permission/* 9端点（check/mode/rules CRUD/audit/audit outcome/stats），服务已重启加载
**验证结果**：opensoul pytest 49/49通过（5模式矩阵、findLast分层、explore下allow不可授予写、dont_ask永不ask、审计provenance、outcome校验）；回归test_immune+test_moderator+test_permission 33/33通过；acp-proxy gate测试18/18（审批三态/超时/缓存/降级），test_tool_output_handler 17/17回归（test_safety_1000的7个ERROR为既有fixture缺陷`fixture 'c' not found`，与本次无关）；npm run build通过且前端:3000已重启、served build确认含session/request_permission处理器；acp-proxy integration_test score=1.0（7项全过）；真实opensoul端到端：read_file→allow、rm -rf /→deny、无人值守ask→deny带provenance，opensoul审计记录全部决策（stats: 37 active规则/8 hard）
**commit**：opensoul a37b7b26 + openmate 398d4e2a
## [2026-09-18 21:40] P0-7 自进化闭环：LobeChat声明式意图+审批落盘+护栏+回滚+记账
**目标**：解决SUMMARY.md P0-7差距——"但是一直没有进化啊"的机制化解法。OpenSoul heredity/self_evolution.py（182行）只有分析：analyze_and_evolve()把发现写进evolution_log日志表后即结束，无提案、无触发器、无审批、无护栏、无回滚、无记账——进化发现无人审批也无处落地，等于没有进化。第一阶段路线图4项P0中最后一项未实现的机制缺口。
**调研来源**：
- LobeChat declareSelfFeedbackIntent（SUMMARY.md P0-7"本轮单设计价值最高"）：agent只"声明改进意图"+confidence+evidenceRefs稳定id，绝不动手；reviewer负责去重/审批/落盘——"高召回声明+严格审批"解掉不敢改/乱改两个死法
- claude-code ProposeSkills：提议必须给evidence+完整内容，用户审阅后才保存；无证据直接拒绝（但拒绝必须可见，mem0"失败不静默"）
- agno（evolution-engine-patterns.md §1.4/§5.6）：错误风暴熔断（连续同类型错误≥N即停，"别把系统性故障记成N条独立失败"）+ run_continuation_blocked"审批人≠发起人"
- CowAgent（SUMMARY.md P0-7）：idle进化触发器（idle≥N∧context>0.8∧budget）+_WorkspaceWriteGuard硬护栏+内置skills保护+无效结果回滚+预算上限
- kilocode防记忆回声（P0-6，15行）：同样的证据不重复产生同一条进化
- agent-zero（§4.4）：_agent_editor确定性稀疏编辑（只改锚点片段防覆盖写）+_time_travel快照/revert
- mem0（§1.2）：审计表old/new/event全程可追溯
- Letta（§4.2）：保护区READ_ONLY fail-closed，进化产出分可改区/保护区
**改动文件**：
- opensoul/src/heredity/evolution_loop.py（新建，~640行）
- opensoul/src/heredity/__init__.py（增量导出）
- opensoul/src/api/heredity.py（+5个Pydantic schema + 9个/evolution/*端点 + /health与/stats并入evolution统计）
- opensoul/src/api/brain.py（/evolve增量改造：分析结果接入提案管线）
- opensoul/tests/test_evolution_loop.py（新建，46个测试）
**改动内容**：
1. evolution_loop.py：
   - `EvolutionEngine.declare_intent()`：LobeChat声明范式——只建pending提案+写DECLARED账本，绝不碰文件。校验链：kind白名单/ confidence∈[0,1] / 无evidence→rejected(evidence_required，拒绝也入账本) / 目标命中PROTECTED_TARGET_MARKERS→rejected(protected_target) / 同digest已applied→rejected(memory_echo, duplicate_of指向原提案)（kilocode防回声）/ 同digest pending→返回既有提案(duplicate=True去重) / pending积压≥max_pending=20→rejected(budget_exceeded)（MetaGPT预算/CowAgent budget）
   - `review()`：decision∈approve/reject；提案必须pending；**reviewer==proposer直接raise**（agno"审批人≠发起人"）；APPROVED/REJECTED写账本old/new
   - `apply()`：仅approved可落盘；保护区二次校验（即使DB被篡改为approved也拦——fail-closed实测：篡改status后apply仍返回protected_target拒绝）；稀疏锚点替换（anchor_old必须在文件中，找不到→apply_failed且文件不动，agent-zero"绝不整文件重写"）；**改动前先写快照**到snapshots/<id>.snap
   - `rollback()`：仅applied可回滚；快照缺失→raise不瞎写；恢复原文件+账本ROLLED_BACK
   - `evaluate_triggers()`：CowAgent idle触发（idle≥60s∧context_pressure≥0.8∧budget>0三条件合取）+error_pattern触发（有错但未达熔断线）+agno错误风暴熔断（尾部连续同类型错误≥3→开熔断只记一条error_storm_breaker事件，同错再来→suppressed不再记；错误类型变化→熔断解除且响应反映解除后状态）+auto_propose（触发器自动声明pending提案，proposer=auto_trigger，evidence=trigger:<id>，触发器行回链提案id）
   - `get_stats()`：提案状态分布/pending预算余量/账本事件计数/触发器数/熔断状态——一条SQL看清进化管线全貌（可观测性）
   - `EvolutionStore`：SQLite四表（proposals/ledger/triggers/breaker）；账本=mem0审计模式（proposal_id/event/actor/old/new/reason）
2. api/heredity.py：POST /evolution/intents、GET /evolution/proposals[?status]、GET /evolution/proposals/{id}（提案+完整审计轨迹）、POST .../review、POST .../apply、POST .../rollback、POST /evolution/triggers/evaluate、GET /evolution/ledger、GET /evolution/stats；/api/heredity/health与/stats响应并入evolution统计（既有monitoring页探测health即可看到进化管线状态，不新建页面）
3. api/brain.py /evolve接线（"写了≠接线了"）：SelfEvolution分析结果不再只写日志——每条发现映射kind（failure_avoidance→failure_avoidance、strategy_adjustment→policy_adjustment、style_adjustment→prompt_strategy）后走declare_intent进入审批管线，evidence_refs=evolution_log:<type>；分析层异常（如experiences表缺失）不阻断，响应始终返回declared_proposals+pipeline统计
**验证结果**：
- tests/test_evolution_loop.py 46/46 passed（37单测：声明校验链7种/审批6种/落盘7种含DB篡改fail-closed实测/回滚3种/触发器+熔断8种/统计2种 + 9个live API测试：health并入统计/审批人≠发起人400/apply+rollback文件内容断言/evidence_required/400校验/熔断suppressed/brain/evolve返回管线/ledger/stats端点）
- 回归113 passed（test_heredity 7 + test_eval_loop 41 + test_memory_crud 29 + test_memory_three_factor 25 + test_trajectory_spans 13）
- acp-proxy integration_test score=1.0（5项全过：三服务健康+WS协议对齐+WS收发），include_build=False无前端改动
- live端到端11项全过（:8090真实服务）：①declare pending ②无evidence→rejected可见 ③同proposer审批→400 ④异人审批→approved ⑤apply→文件稀疏替换+快照存在+其余行原样 ⑥同digest再声明→memory_echo指向原提案 ⑦rollback→文件恢复逐字节一致 ⑧账本轨迹[DECLARED,APPROVED,APPLIED,ROLLED_BACK] ⑨保护区API层拒绝 ⑩brain/evolve返回declared_proposals+pipeline ⑪stats全量统计正确
- Python语法检查5文件全过；opensoul(:8090)重启后/system/health ok
**已知数据层缺口**（如实标注）：brain/evolve上游SelfEvolution.analyze_and_evolve()查询的experiences/user_feedback表在当前SQLite库不存在（analysis_error="no such table: experiences"），是改动前就存在的数据层缺口——分析产出为0时管线返回空declared_proposals属正确行为，非本轮接线缺陷；experiences数据积累属后续hippo/learn数据层工作
**commit**：opensoul d94858c1
