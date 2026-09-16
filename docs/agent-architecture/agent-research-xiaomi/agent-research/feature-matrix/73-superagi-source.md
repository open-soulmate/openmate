# SuperAGI（#73, 16k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/superagi（7.8MB，源码级深读）

全栈自主agent平台（FastAPI+Celery+PostgreSQL+React GUI）。DB持久化工作流+APM分析+市场是三大支柱。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. DB持久化步骤工作流（AgentWorkflowStep图：工具步/WAIT_FOR_PERMISSION步/WAIT定时步/TASK_QUEUE步，边带YES/NO/COMPLETE标签条件分支，步骤可回跳形成循环） | xyflow画布仅前端 | will/ DAG骨架无运行时 | 部分有 | 把OpenMate画布落库+OpenSoul will/实现step状态机；工作流种子269行是完整参考（workflow_seed.py含销售/招聘2个模板） |
| 2. WAIT_FOR_PERMISSION步骤（ExecutionPermission表：status/question/user_feedback/assistant_reply，agent暂停等用户批） | acp_approval_request事件 | 无 | 部分有 | HITL四/五方互证新增第5方（SuperAGI）；表结构44行可直接抄 |
| 3. WAIT定时步（wait_begin_time+WAIT_STEP状态，由调度器唤醒） | 无 | cron | 部分有 | 工作流内嵌"等2分钟再读邮件"式步骤，cron做不到流程内等待 |
| 4. TASK_QUEUE步骤（Redis任务队列：add/complete/get_first/status，工作流步骤消费队列直到empty再COMPLETE） | 无 | 无 | 完全没有 | "批量处理数组元素"的流程原语；配合sales工作流看=对每个lead循环执行后续步骤 |
| 5. APM分析模块（apm/：运行完成指标、agent运行分布、活跃运行、**工具使用率统计tool_usage**、按模型的token消耗call_log） | 无 | trajectory扁平事件表 | 完全没有 | 用户"不知道在干嘛"痛点：工具使用率/token按模型归因是最低成本起步 |
| 6. 市场双侧（agent模板+toolkit市场，marketplace_stats下载/点赞统计，一键安装） | marketplace已有 | api/marketplace.py skill sources | 已有/部分有 | 补下载统计即可 |
| 7. Webhook出站（webhooks表：url+headers+filters JSON，事件触发外部通知） | 无 | link/connector有webhook_in/out | 部分有 | OpenSoul已有Connector框架，补agent事件→webhook映射 |
| 8. Budget表（budget+cycle周期，per-agent预算） | 无 | gland/token_meter有总量 | 部分有 | 补cycle维度（日/月重置） |
| 9. Agent调度执行器（scheduling_executor：celery beat按AgentSchedule拉起定时agent运行） | cron | 无 | 部分有 | OpenMate已有cron，语义等价 |
| 10. 工具响应二次查询（tool_response_query_manager：工具历史结果可被后续查询复用） | 无 | reflex/cache | 部分有 | 工具结果库概念 |
| 11. Resource Manager（per-agent-execution文件空间+S3写入+llama_index文档摘要/向量工厂） | workspace | 无 | 部分有 | agent产物管理+S3兼容对象存储 |
| 12. 多向量库抽象（vector_dbs/vector_db_configs/vector_db_indices表：pinecone/qdrant/weaviate等注册制） | 无 | hippo单一存储 | 完全没有 | 向量库provider注册表，政企可换国产向量库 |
| 13. OAuth令牌托管（oauth_tokens表+google/twitter OAuth控制器） | 无 | 无 | 完全没有 | 与Composio授权托管互证（第2方） |
| 14. 22个内置toolkit（jira/slack/github/email/calendar/apollo/instagram/twitter/serp等） | 多但不同 | MCP生态 | 已有 | 通过MCP接入即可 |
| 15. local-llm集成（本地vLLM部署目录） | 无 | 无 | 部分有 | OpenSoul可走OpenAI兼容本地endpoint |

## 源码亮点
- **工作流即DB图**：AgentWorkflowStep.add_next_workflow_step(session, from, to, "NO")——分支标签让"用户拒绝后回上一步"一行代码；execution.current_step_id指针推进，进程崩溃后可恢复（比内存DAG强）
- **APM全部是SQL聚合**：tool_usage统计=对agent_execution_feeds按工具名GROUP BY，无新基础设施——OpenSoul用现有trajectory表就能出
- Celery worker分离（DockerfileCelery）：agent长任务不阻塞API进程

## 可复用设计
1. agent_execution_permissions表（44行）→ OpenSoul will/permission.py：HITL审批最小表结构
2. workflow_seed.py → OpenMate画布"销售线索跟进"模板的后端实现参照
3. apm/tools_handler.py → OpenSoul trajectory上加tool_usage聚合API（180行）
4. TASK_QUEUE步骤语义 → will/任务树的"foreach数组"节点
