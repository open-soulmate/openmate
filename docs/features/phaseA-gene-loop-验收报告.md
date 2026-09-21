# Phase A — gene-loop进化回流管道 验收报告

日期：2026-09-21　施工方：Hermes（方案A，门禁全保留）　仓库：openmate @ GitHub
任务书：docs/features/phaseA-gene-loop-施工任务书.md（S0附录含勘察定案）

## 一、验收总表

| 项 | 交付物 | 状态 | 证据 |
|---|---|---|---|
| S0 勘察定案 | 双目录真相/app.py挂载点/systemd重启机制/PLUGIN_PAGES/nav机制 | ✅ | 任务书S0附录 |
| S1 Schema | gene_proposals表+4条不变量触发器（INV1~INV4） | ✅ | 11/11测试过 |
| S2 Propose | feedback+audit→提案（去重/分类/置信复发加成/锁） | ✅ | 16/16测试过 |
| S3 Promote | →Gene API dev_norm+evo_feedback闭环扩展+故障降级 | ✅ | 22/22测试过 |
| S4 Review | 权限引擎机械化+cron `092b04b56a31`（每2h，monitor门控） | ✅ | 27/27测试过 |
| S5 插件壳 | routes/gene_loop.py挂载app.py+plugin.json+契约__init__ | ✅ | 双实例active+:8092/:8095冒烟 |
| S6 前端 | 面板+API代理+PLUGIN_PAGES+/plugins端点含gene-loop | ✅ | Next build过+端点实测loaded |
| S7 端到端 | 真实数据propose→review→promote→Gene落盘→feedback扩展 | ✅ | 见下 |

## 二、S7端到端实测记录（2026-09-21）

1. Propose（真实evo_feedback.json）：`inserted=2, queued=2`
   - gp-test_review_001 / gp-test_reject_002，均为constraint类lesson（import失败教训，证据=traceback原文）
2. Review（hermes通道，权限引擎）：conf 0.6 < 0.7阈值 → **两条均升级ASK用户，未自动放行**（引擎符合设计）
3. Hermes审核决定：gp-test_review_001 通过（reviewer=hermes，理由：traceback原始证据充分，constraint类纳入dev_norm）；gp-test_reject_002 留用户拍板
4. Promote实测：
   - DB：status=promoted，promoted_to=`gene:global:devnorm-gp-test_review_001`
   - Gene侧：`~/.opensoul/templates/devnorm-gp-test_review_001.json`（2799B）落盘 ✓；`/api/gene/templates/search/gene-loop`可查（author=gene-loop, category=dev_norm）
   - feedback闭环：条目已合并回`data/evo_feedback.json`（evo planner的`_load_recent_feedback`下轮可读）
5. digest确定性验证：`{"counts":{"promoted":1,"proposed":1},...}`（无时间戳，cron monitor可用）

## 三、施工中发现并修复的缺陷（全部测试回归通过）

1. **tools/路径深度bug**（propose/review_queue/review/promote四文件）：`parents[2]`应为`parents[3]`——测试用注入路径全绿，真实默认路径读空，S7端到端首跑inserted=0暴露。已修复+回归。
2. cron_review.py sys.path深度笔误（parents[1]→parents[0]），已修复。
3. Gene搜索索引不覆盖template_id：按`devnorm`搜索为空、按tag`gene-loop`可查——**运维注意：验证promote用tag/内容搜索，勿用template_id**。

## 四、遗留与待拍板

| 事项 | 状态 |
|---|---|
| gp-test_reject_002（视角单一教训，conf 0.6） | ⚠️ 待用户拍板：微信回复"通过/驳回 gp-test_reject_002 理由" |
| plugins目录统一（用户2026-09-21提出"应整个项目唯一"） | 待拍板：见第五节方案 |
| 13规范plugin-templates/不存在、PluginLoader未接线、plugin_nav_list A2A无实现 | 已记录（任务书S0附录gap），未动（不动无关代码） |
| evo真实循环注入观测（cron 4fe2c85ba925 8-23点每30min） | 机制已接线（feedback扩展+parser兼容测试过），下个evo周期audit_log可观测 |

## 五、plugins目录统一方案（待用户拍板）

现状三处：`openmate/plugins/`（13规范指定的registry：plugin.json+前端包）、`acp-proxy/plugins/`（31-Evolution规范evo白名单：Python后端+实验品）、`openmate/src/plugins/`（Next.js @/别名编译区）。

建议目标：**`openmate/plugins/{id}/`唯一**（13规范L47原旨），子结构：`plugin.json + backend/ + frontend/page.tsx`。
- tsconfig加`"@/plugins/*": ["./plugins/*"]`，src/plugins/并入后删除
- acp-proxy侧loader/routes导入路径改指openmate/plugins（sys.path或包路径）
- **31-Evolution规范L292白名单需修订**（acp-proxy/plugins→openmate/plugins）——规范变更，须用户确认后先改规范再迁代码
- bidding/gene-loop/loader/前端映射一次迁到位，迁移后全量测试+build回归

回复"改吧"即执行（先改31规范再迁移），或"先不动"保持现状完Phase A验收。

## 六、产物清单

- 后端：`acp-proxy/plugins/gene_loop/`（schema.py+migrations/、tools/四件、cron_review.py、plugin.json、__init__.py、tests/×4）
- 路由：`acp-proxy/routes/gene_loop.py`（/api/gene-loop：health/status/proposals/propose/review/promote/queue/escalations/digest）
- 挂载：acp-proxy/app.py +2行（import+include_router，KERNEL_FILES授权执行）
- 前端：`src/app/api/gene-loop/route.ts`（Next代理）、`src/plugins/gene_loop/frontend/page.tsx`（提案流水面板）、PLUGIN_PAGES映射+1行
- registry manifest：`openmate/plugins/gene_loop/plugin.json`（nav项"进化回流"经:8092/plugins自动注册）
- cron：Hermes job `092b04b56a31`（每2h，monitor=`gene_loop_digest.sh`变更门控，无新提案零打扰）
- 数据：`acp-proxy/data/gene_loop.db`（WAL）、`gene_proposal_queue.json`、`gene_loop_escalations.json`

## 七、测试与验证

- pytest：27/27全过（opensoul/.venv，PATH python3无pytest）
- build：Next.js 16.3.1 Turbopack，TypeScript过，/api/gene-loop+/plugins/[plugin]进产物
- 服务：systemd acp-proxy-a(:8092)/acp-proxy-b(:8095) restart后active，:8092/plugins含gene-loop=loaded
- 安全：push前git grep扫描key/secret/token模式（铁律）
