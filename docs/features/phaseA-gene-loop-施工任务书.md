# Phase A 施工任务书 —— gene-loop 插件（Heredity 学习回流管道）

> **依据**：架构v2.1提案 §3、§7（opensoul commit d3b22245，用户已拍板"开始吧"）
> **格式**：按task-graph设计的PRD结构书写（以身作则——我们要求evo做的第一件事，任务书自己先做到）
> **日期**：2026-09-21 ｜ 状态：待用户确认施工主体后执行
> **治理**：分步开发，每步测试通过再下一步，git跟踪；出口push走Hermes审核门禁

---

## PRD

### problem（问题）
`evo_feedback.json` 是被动记录：Hermes审核驳回的教训积累在文件里，evo planner下轮只以"最近5条反馈"的文本形式被提醒——**教训不会结构性地变成下轮自动生效的规范**。纲领核心闭环 `Hippo→Gene→Heredity→Evo` 的 Heredity 环节中空，这是"无法实现自我进化"的结构性原因。

### goal（目标）
gene-loop 插件端到端跑通一轮**真实**提案：`产生→审核→promote进Gene→下轮evo可见`。不是demo数据——第一轮提案必须来自真实的evo反馈/审计日志。

### acceptance（验收标准，逐条可验证）
| # | 标准 | 验证方式 |
|---|---|---|
| 1 | `plugins/gene-loop/`符合13-Plugin规范结构 | plugin.json schema校验脚本通过 |
| 2 | 提案落库（SQLite表`gene_proposals`）+4条不变量强制 | pytest：每条不变量正反用例，违反触发拒绝 |
| 3 | Propose工具能从`evo_feedback.json`+`audit_log.jsonl`生成提案 | 生成≥1条真实提案（内容来源可溯源） |
| 4 | Review接线：提案进入独立审核文件`data/gene_proposal_queue.json`（**不污染**evo代码审核队列） | 文件存在+条目格式正确+Hermes cron消费可见 |
| 5 | Promote：approved提案写入Gene | TemplateEngine(category=dev_norm)可查到 + /skill/recommend可检索 |
| 6 | 下轮注入可见：`evo_feedback.json`追加promoted条目且格式兼容`_load_recent_feedback`现有解析（只用verdict/reason字段，新字段不破坏） | 单测：现有解析函数读扩展格式不报错 |
| 7 | 前端面板：提案流水实时可见（nav"进化回流"） | 打开面板见真实数据流 |
| 8 | schema不变量4：`actor=evo/soulmate`提案直接置promoted→**数据层拒绝** | pytest触发器用例 |

### risks（风险与对策）
| 风险 | 对策 |
|---|---|
| 并发写json：evo cron(2h)×Hermes cron(30min)×gene-loop同时读写feedback/queue文件 | atomic write（tmp+rename）+fcntl文件锁——学ai-memory bounded serialization |
| **插件加载机制未实证**：13规范描述了plugin_manager，但`plugin-templates/`目录实际不存在，规范与实现有gap | S0前置勘察项，见下 |
| Gene TemplateEngine存储后端未知（templates.py 1162行未读） | S0先读确认；promote写入走现有API（create_template），不直写底层存储 |
| feedback文件格式演化破坏现有planner解析 | 扩展只加字段不改字段；兼容性单测守门 |

### out_of_scope（本期不做）
- task-graph插件（Phase B）；改`evolution_pipeline.py`（IMMUTABLE_FILES，Phase C单独立项且需用户确认）；全Agent开放调用（Phase D）；Gene之外的器官改动

---

## 施工主体（⚠️ 需用户确认）

**勘察发现**：evo管线（evolution_pipeline.py，718行实测）是**failure-driven**——`run_pipeline(failure_batch)`输入是故障批次，Locate阶段诊断故障root_cause。管线没有"建设新功能"的任务摄入口，**技术上无法执行"建一个插件"这类建设任务**（这正是Phase B task-graph要补的能力）。

**建议**：Phase A由**Hermes施工**（分步测试+git跟踪+出口审核门禁全部保留，治理精神不变）；Phase C之后evo在建成的基础设施上自主迭代试运行（v2.1 §7交付物"evo循环试运行1轮出真实提案"照常执行）。**待用户拍板：同意Hermes施工 / 坚持evo施工（则需先做管线扩展，工期+）**

---

## 分步计划（每步测试通过再下一步）

| 步 | 内容 | 产出 | 测试 |
|---|---|---|---|
| **S0** | 前置勘察：①找openmate插件加载器真实实现（plugin_manager在哪个进程/文件加载plugins/，bidding插件当前如何被加载）②读`opensoul/src/gene/templates.py`确认存储后端与create_template行为 | 勘察笔记（补进本文件S0附录） | 加载机制结论有代码行号佐证 |
| **S1** | proposal schema：SQLite建表`gene_proposals`（v2.1 §3.3字段）+4条不变量触发器 | migration脚本+模型层 | pytest×8（4不变量×正反） |
| **S2** | Propose工具：读feedback+audit_log生成提案（confidence/evidence自动填充，无证据不立案） | tools/propose.py | 真实数据生成≥1条提案 |
| **S3** | Promote工具：approved→Gene TemplateEngine(category=dev_norm)+feedback文件扩展追加（atomic+锁） | tools/promote.py | 验收#5#6用例 |
| **S4** | Review接线：`data/gene_proposal_queue.json`读写+Hermes审核cron脚本扩展消费（hermes侧配置，非evo IMMUTABLE范围） | queue工具+cron script更新 | 手工注入一条proposal→cron下轮消费 |
| **S5** | 插件壳：plugin.json（v2.1 §3.5草案）+router.py+__init__.py按S0结论的加载方式接线 | plugins/gene-loop/ | 验收#1 schema校验+加载成功 |
| **S6** | 前端面板：frontend/page.tsx提案流水（proposed/approved/rejected/promoted四态+证据引用展开） | 面板上线 | 验收#7 |
| **S7** | 端到端试运行：evo下一轮cron真实提案→审核→promote→注入可见；观察Measure | 试运行报告 | v2.1 §7期A全部验收项 |

## 监控（可观测性铁律）
- S6面板上线前：每步status查询 `sqlite3 gene_proposals表` + `ls ~/openmate/plugins/gene-loop/` + `curl :8090/gene/health`
- S6后面板实时：OpenMate导航"进化回流"
- Hermes cron审核消费日志：hermes cron执行记录
- evo侧学习痕迹：`evo_feedback.json` promoted条目 + audit_log.jsonl

## S0附录（勘察结论，2026-09-21完成）

### 路径定案（覆盖任务书正文的相对路径假设）
- **后端**：`acp-proxy/plugins/gene-loop/`（数据/Hermes cron同生态；31规范白名单兼容；Gene写入走HTTP :8090/api/gene/templates与位置无关）
- **前端**：`src/plugins/gene-loop/frontend/page.tsx`（`@/*→./src/*`）+ plugins/[plugin]/page.tsx的PLUGIN_PAGES映射加一行 + nav走已实现的plugin-nav机制（bottom-nav.tsx:18 fetchPluginNavItems ✓ 真实存在）

### 插件加载机制（实测）
- 框架：`acp-proxy/plugin/`（loader.py 390行：importlib模块路径加载→get_manifest()/MANIFEST解析→check_permissions对照KNOWN_PERMISSIONS→register_hooks→load_with_app调register_routes(app)→状态机INSTALLED→ENABLED→DISABLED→UNINSTALLED，reload=卸载+清sys.modules+重载）
- 插件契约（bidding/__init__.py为参照）：`get_manifest()→dict`（读plugin.json）、`register_routes(app)`（include_router前缀/{id}）、`register_tools(tool_gateway)`（tool_gateway.register_tool(name,description,parameters,handler,plugin_id)）、`on_enable/on_disable/on_uninstall`
- **⚠️ 框架未接线**：app.py/main.py零处调用plugin_loader——现有PluginLoader是休眠框架
- **⚠️ gene-loop加载决策**：不依赖休眠的PluginLoader；路由放`acp-proxy/routes/gene_loop.py`模式（31白名单acp-proxy/routes/，现有活路由同款），挂载需app.py一行include_router=**KERNEL_FILES门，S5时需用户人工确认**

### Gene存储后端（实测）
- TemplateEngine：`~/.opensoul/templates/{template_id}.json`文件存储（每模板一json），threading.Lock，create_template(data)→Template（templates.py:955），builtin 22个/user 0
- API前缀：`/api/gene`（src/main.py:554挂载），:8090在跑，health实测ok（22 templates）
- 注入接口现成：`/api/gene/skill/recommend`+`/api/gene/skill/{id}/context`（get_context_prompt prompt注入）
- gene_proposals表（S1新建）=管道自有运营数据（SQLite），与Gene模板库（promote目的地，json文件）分离

### 发现的既有问题（记录在案，Phase A不动——"不动无关代码"铁律）
1. 两份规范目录未对齐：13号L47"统一放项目根plugins/" vs 31号L292白名单acp-proxy/plugins/——建议Phase B时提规范修订案
2. PluginLoader框架存在但从未接线（app.py/main.py无调用）——13规范"plugin_manager全自动加载"当前是空头支票
3. bidding链路存疑：前端+proxy(:8092/api/bidding/*)在，acp-proxy内无bidding路由注册实证——疑似未接线，建议用户空闲时验证
4. plugin-templates/目录不存在（13规范§1.2承诺的模板库缺失）——gene-loop可作首个模板沉淀（Phase B顺带项）
