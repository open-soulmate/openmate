# AutoGPT Platform (#5, 187k stars) 功能研究

研究时间：2026-09-16（源码级深读）
源码：~/agent-research-src/AutoGPT/autogpt_platform（354MB；backend FastAPI + Prisma/pgvector + RabbitMQ + Redis，frontend Next.js）
定位：可视化工作流平台（agent graph = JSON 工作流 + blocks 积木 + 商业化市场）

## 架构核心

- **Agent Graph**：工作流定义存 JSON，带**版本控制**（AgentGraph 多版本共存）
- **Block 体系**：几百个积木（每个是 Pydantic schema 类），Block SDK + ProviderBuilder + 成本类型（FIXED/SECOND/ITEMS/COST_USD）
- **执行引擎**：RabbitMQ 异步队列 + batch_executor 批量图执行 + executor manager + activity 事件流（SSE）
- **商业化闭环**：credit 计费 → preflight 预估扣费 → 事后对账（防 TOCTOU 双花）→ 发票/退款/低余额告警 → 市场分成

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **LLM 目录即代码 + 模型退役**：`catalog.py` 就是模型数据库（改文件=改数据库，catalog-only PR 可走 hotfix 分支直达生产，事故级换路由/杀模型）；`retire.py --replacement` 自动迁移存量工作流节点（默认 dry-run 可回滚）；导入期完整性校验，坏目录**启动即崩** | 无（gland 模型路由有 UI） | 部分（heredity/version_registry 有 DRAFT/ACTIVE/DEPRECATED/RETIRED 状态机+迁移计划，但未落到 LLM 目录） | **部分有** | 把 version_registry 接到 gland 的模型目录上，加 retire CLI 迁移存量引用——**这是运维事故速度的差距** |
| 2 | **信用计费闭环**：preflight 按历史均值预扣（bounding 账单泄漏面）→ 事后对账补差额；低余额告警/发票/退款/并发防双花（Redis pipeline 原子化）；每个 block 声明成本类型 | 无 | 无（只有 token 统计） | **完全缺** | 若做对外服务/内部成本分摊必需；单机自用可只做"每会话成本归集"简化版 |
| 3 | **凭证租约 CredentialLease**：执行器借出用户凭证（Redis 锁 + 心跳续租 + checkpoint 回调 + 删除回调），OAuth2 类型自动心跳；另有 managed/auto credentials 自动填充 | 无 | 无（link 是连接器但无租约语义） | **完全缺** | 比"把 API key 写进环境"高一级：凭证不落执行器、过期自动回收；用户"不得上传云端"下仅本地 Redis 实现 |
| 4 | **Block 预执行成本估价**：管理员拉聚合均值提交 JSON 快照，动态计费 block 先按均值收非零预付，事后只结算小差额 | 无 | 无 | **完全缺** | 与 #2 配套；思想可复用到 token 预算（"这任务预计花多少"先告诉用户） |
| 5 | **LLM 干跑模拟器**（simulator.py）：`dry_run=True` 时用 LLM **角色扮演 block 的执行**（依据：block 名+描述+输入输出 JSON schema+run() 源码+真实输入），无真实副作用；Orchestrator/子图执行器有专门特例 | 无 | 无 | **完全缺（很有意思）** | 工作流上线前免费试跑、生成演示数据、回归测试；与 http-recorder 互补 |
| 6 | **批量执行器 batch_executor**：整图批量节点执行，减少调度开销 | 无 | 无 | **完全缺** | 配合 OpenMate graph-engine 使用 |
| 7 | **集群锁 cluster_lock**：多实例执行器互斥（Redis） | 无 | 无 | **完全缺** | 多副本部署前必备 |
| 8 | **Activity 事件流**：执行过程 SSE 推送（`data:` 行对齐 Zod schema + `: comment` 心跳行），activity_status_generator 生成人类可读状态 | 部分（有事件流页面） | 部分（有 events/traces 页面） | **部分有** | 补 SSE 心跳协议细节（防代理超时断连） |
| 9 | **每日简报 briefing**：周期性 digest（briefing_period + briefing_runner），用户收汇总 | 部分（有 daily-digest 插件） | 部分（daily-digest 插件） | **基本已有** | 补"周期定义+runner"结构化 |
| 10 | **市场/分成**：StoreListing + 安装数 + 评价 + 收益分成 | 部分（marketplace 路由存在，未核实成熟度） | 有 /api/marketplace（插件市场） | **部分有** | 分成/计费依赖 #2 |
| 11 | **上传病毒扫描**：ClamAV 集成，文件上传前扫毒 | 无 | 无 | **完全缺** | 接收外部文件的场景（投标、邮件附件）值得加 |
| 12 | **Block 成本分析**：block_cost_analytics，哪些积木最烧钱 | 无 | 部分（benchmark 页） | **几乎完全缺** | 与可观测性诉求同源 |
| 13 | **工作流版本控制**：AgentGraph 多版本，存量执行引用旧版本 | 部分（graph-engine 有 state 无版本） | 无 | **完全缺** | 改工作流不该影响在跑的执行 |
| 14 | **专家内容 expert_posts**：市场内专家文章/教程 | 无 | 无 | 低优先级 | — |
| 15 | **Autopilot**：自动编排/自我改进（autopilot.py + codex 集成 + 权限测试） | 无 | 无 | 需再深读 | 下轮补 |
| 16 | **MCPToolBlock**：MCP 工具作为图节点积木 | 有 MCP | 有 mcp | 基本已有 | — |

## 源码亮点

1. **目录即代码的运维哲学**：模型元数据/成本/路由全在一个 `catalog.py`，文件本身就是数据库，坏数据启动即崩（fail-hard），CI 测试在部署前拦住。事故时 `hotfix/*` 分支直达 master 秒级杀模型。**退役不删数据**：`retire --replacement` 迁移存量节点，默认 dry-run。

2. **计费的 TOCTOU 纪律**：代码规范明文写"避免 check-then-act"，credit 扣费用 Redis pipeline 原子化；动态计费先预扣再对账，把泄漏面收敛到小差额。

3. **模拟器的 grounding 方式**：`inspect.getsource(block.run)` 把**实现源码**喂给 LLM 去角色扮演输出——比只给 schema 描述准得多。

4. **工程纪律可抄**：文件≤300行、函数≤40行、禁 linter suppressor、TDD 先写 xfail 测试、错误路径 `os.path.basename()` 防目录泄漏、debug 日志用 `%s` 延迟插值。

5. **凭证租约的心跳设计**：只对 oauth2 类型起心跳任务；checkpoint 回调让租约中途可续存状态。

## 可复用设计（落地排序）

**P0**
1. LLM 目录即代码 + retire 迁移（#1）——OpenSoul/version_registry 已有半套，接上 gland 即成
2. 每会话/每工具成本归集 + 预估告知（#2/#4 简化版）——用户关心资源占用

**P1**
3. 干跑模拟器（#5）——工作流上线前试跑，OpenMate graph-engine 直接受益
4. 工作流版本控制（#13）——graph-engine 补版本号
5. 集群锁（#7）——多副本前必备

**P2**
6. 凭证租约（#3）、病毒扫描（#11）、批量执行（#6）、成本分析（#12）

## 与其他研究的交叉印证

- 与 dsh 的"能力接缝"对照：AutoGPT 用 Block schema 类做积木接口，思路一致但粒度更粗（图节点级）。
- 与 opencode 的 preflight：AutoGPT 的预扣费和 opencode 的快照都是"先留证据再动作"的同一哲学。
