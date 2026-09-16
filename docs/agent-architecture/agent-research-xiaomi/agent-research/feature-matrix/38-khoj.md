# khoj 功能研究（第38轮，深度源码）

> 仓库：khoj-ai/khoj（~37k星，Python/Django+FastAPI，自托管"第二大脑"）
> 源码：shallow clone，252个py文件；核心=routers(8877行)+processor(51文件)+database(127文件多为迁移)
> 定位与OpenMate/OpenSoul最接近的Python产品：文档索引+对话+定时任务+多通道

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **用户级Automations**：自然语言→`schedule_query`由LLM生成cron表达式+主题；每个automation绑定**独立会话**；CRUD+手动触发+时区(cron_descriptor人类可读校验) | 无UI | 部分有：`api/hermes_cron.py`仅包装`hermes cron`CLI（create/health），无NL→cron生成、无独立会话、无编辑/手动触发API | 部分有 | will/加automation层：NL→cron用小模型生成（khoj的schedule_query prompt可抄），execution结果回写独立会话。2-3天 |
| 2 | **should_notify LLM门控**：定时任务跑完后，LLM评估"结果是否值得打扰用户"（helpers.py:2470 format_automation_response→should_notify），不值得就静默 | 无 | 无 | **完全没有** | 半天：scheduled任务收尾加一次小模型调用，输出notify/skip+理由。避免cron轰炸用户，直接命中"可观测但不打扰" |
| 3 | **Research深度研究模式**（research.py 706行）：多轮迭代ResearchIteration+**并行**execute_tool+跨迭代查询去重(previous_inferred_queries)+显式终止条件 | 无 | 部分有：cortex有任务分析但无多轮并行研究循环 | 部分有 | 参考23轮deer-flow已有研究；khoj的迭代结构体(ResearchIteration/ToolExecutionResult)可直接抄 |
| 4 | **研究中打断/追加指令**：cancellation_event(asyncio.Event)+interrupt_queue(asyncio.Queue)双通道，用户可在30分钟研究中途取消或注入新指令 | 无 | cancel_execution是34轮确认的bug（只改标志没cancel Task） | **完全没有** | 1-2天：与Flowise AbortControllerPool方案(37轮)合并落地，interrupt_queue是新增量——研究任务必须能中途纠偏 |
| 5 | **Operator电脑使用**（processor/operator/，实验性）：Docker容器化computer+browser双环境，VLM grounding agent四种实现（Anthropic/OpenAI/UI-TARS/二值动作），可跑30+分钟视觉任务 | 无 | 部分有：limb_rpa(桌面RPA)+vision/(仅图表生成)，**无容器化视觉grounding** | 部分有 | 战略项：先抄架构（environment抽象+grounding agent接口），Docker挂socket隔离执行。与32轮E2B沙箱结论汇合 |
| 6 | **Excalidraw结构化图表生成**：两步管线（先LLM"优化图表描述"→再产excalidraw JSON），另有mermaid同款两步 | 部分有：mermaid-diagram.tsx仅渲染 | 部分有：vision/chart_generator+dag_visualizer+mindmap | 部分有 | 可立即抄"两步生成"模式（better_diagram_description）：先让LLM想清楚结构再生成，成功率显著提升。半天 |
| 7 | **记忆自动抽取**：extract_facts_from_query→ai_update_memories(MemoryUpdates pydantic)+记忆CRUD API(带归属校验) | 无 | 无（28/33轮已印证） | **完全没有** | 与33轮mem0结论合并：对话→事实抽取prompt全套可抄，落hippo/。1-2天 |
| 8 | **检索过滤DSL**：`dt>"yesterday"`自然语言日期过滤（dateparser，8种日期格式regex预编译+LRU缓存+entry-id倒排集合）+`file:`+词频过滤 | 无 | 无（api/search.py无过滤语法） | **完全没有** | 1-2天：date_filter.py基本可原样移植；"去年的合同"这类中文时间表达直接命中用户场景 |
| 9 | **分级限流家族**：ApiUserRateLimiter(订阅者配额>免费)+图片数/体积限流+WebSocket连接管理器(含僵尸连接清理)+**命令级限流**(每个ConversationCommand独立配额)+索引数据量上限 | 无 | 部分有：immune/rate_limiter多层滑动窗口，但无订阅分级/命令级/WebSocket管理 | 部分有 | 命令级限流是新点：重命令(research/operator)单独配额。1天 |
| 10 | Stripe订阅计费+PriceTier | 无 | 无 | 完全没有 | 自托管可缓；若OpenSoulMate做企业版再抄（37轮Flowise也有同款，双印证） |
| 11 | 多模态通道：Twilio WhatsApp/电话(OTP验证绑定手机)+TTS+STT+图像生成 | 无 | 部分有：voice/tts_engine+sense/asr已有；**无WhatsApp/电话通道** | 部分有 | 国内场景换企微/钉钉通道（36轮LobeChat已有平台适配器方案），不必抄Twilio |
| 12 | MCP客户端：stdio+SSE双传输，server存DB按用户挂载，挂进research工具循环，返回Text/Audio/Image三态结果 | 已有：openmate/mcp-client独立服务(8094) | — | 已有 | 对比增量：khoj把MCP工具**动态注入research循环**而非只列表调用；Audio/Image结果分支处理可抄 |
| 13 | 内容摄取族：docx/github仓库/images/markdown/**Notion同步**/org-mode/pdf/plaintext，Notion/GitHub为一等数据源（notion.py独立路由） | 无 | 部分有：本地文件摄取有，无Notion/GitHub源 | 部分有 | Notion同步(轮询diff+增量索引)模式可抄到任意企业文档源。2-3天 |
| 14 | Agent人格系统：persona+**privacy_level**+input_tools/output_modes白名单+icon/color+admin托管agent+slug公开分享+MRU排序展示 | 无 | 部分有：gene/templates | 部分有 | privacy_level(私有/受限/公开)和input_tools白名单是新维度，半天可加 |
| 15 | **公开persona安全审核**：acheck_if_safe_prompt——创建公开agent时LLM审核system prompt防注入/越狱 | 无 | 无（25轮NeMo印证immune无prompt级防护） | **完全没有** | 与25轮rails方案合并：先加"发布前prompt审核"一个检查点。半天 |
| 16 | 多worker调度器leader选举：wakeup_scheduler进程锁，非leader暂停scheduler定期唤醒抢锁 | 无 | 单机 | 完全没有 | 单机可缓；多实例部署时抄 |
| 17 | 图像生成+两步prompt优化（better_image_prompt） | 无 | 无明确 | 完全没有 | 中低优先 |
| 18 | 网页理解：infer_webpage_urls(从对话中推断要读的URL)+generate_online_subqueries(搜索子查询展开) | 无 | 部分有：sense/有搜索 | 部分有 | 子查询展开可立即抄，半天 |
| 19 | 会话管理：自动标题生成(标题用小模型从历史/查询生成)+消息删除+显式反馈API(FeedbackData) | 部分有 | — | 部分有 | 反馈数据是36轮表情回应RLHF信号的同族，合并落地 |
| 20 | 后台家务job：内容索引定期重建+遥测上传+**过期请求清理**(delete_old_user_requests) | 无 | 部分有：marrow/backup | 部分有 | 数据保留策略(TTL清理)是企业合规点。半天 |

## 源码亮点

1. **Automation元数据存在APScheduler Job.name的JSON里**（json.dumps塞进job name，取回时clean_json解析）——零迁移成本的巧思，但可读性差；我们要持久化就直接建表（34轮结论）。
2. **每个automation一个专属会话**：结果追加进同一会话，用户点开automation能看到全部历史运行——回看历史是刚需，UI上值得抄。
3. **研究循环的interrupt_queue设计**：`asyncio.Queue`收集用户中途消息，下一次迭代注入——比"取消重来"体验好得多，30分钟长任务必须有。
4. **DateFilter的8种自然语言日期regex预编译+dateparser**：中文时间过滤("上个月的xx")是文档场景刚需，且实现是纯Python无依赖服务。
5. **限流器全部带subscribed双配额**：同一限流器免费/订阅两档，`subscribed_requests`参数化——商业化预留的最小设计。
6. **should_notify**：定时任务不是"跑完就推"，而是LLM先判断结果价值——避免通知疲劳的关键设计，实现仅一次小模型调用。

## 可复用设计

按性价比排序：
1. **should_notify门控**（半天）——任何定时/后台任务的推送前置判断
2. **两步图表生成**（半天）——better_description→generate，提升所有图表工具成功率
3. **NL→cron生成+automation独立会话**（2-3天）——补齐hermes_cron包装层的用户级产品体验
4. **研究打断/注入双通道**（1-2天）——与34/37轮cancel修复合并
5. **日期过滤DSL**（1-2天）——中文文档检索刚需
6. **记忆自动抽取**（1-2天）——与33轮mem0方案合并，prompt可抄
7. **公开persona审核**（半天）——与25轮安全rails合并
8. Operator容器化视觉执行——战略项，与E2B沙箱路线合流，暂不自建
