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
