# open-webui (#16, 90k★) 功能研究

> 源码：~/agent-research-src/open-webui（Svelte前端 + Python FastAPI后端）
> 研究日期：2026-09-17 深夜轮
> 定位：自托管LLM平台。对OpenMate（前端）参考价值最大；对企业化部署（OpenSoul）参考价值同样大

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **消息级聊天fork**：message带parentId成树，fork时回溯分支+环检测，复制出新chat | utils/chat_fork.py build_fork_history | 没有 | 没有 | 完全没有 | P0。与pi的会话树同构（互证）——parentId方案是行业共识，直接抄 |
| 2 | **上下文压缩**：DEFAULT_CONTEXT_COMPACTION_PROMPT+压缩点配置，服务端把旧历史压出活跃上下文 | utils/context_compaction.py | 没有 | 部分（sessions_api.compacted标志） | 部分有 | P0 |
| 3 | **工具审批流**：tool call挂起→UI弹approve/reject/answer三态→resolve_tool_call_output回填，带超时timed_out | utils/tool_approval.py | 没有 | 没有（casbin只管用户RBAC） | 完全没有 | P0。四轮三证（codex/gemini×langchain×open-webui），最高优先级缺口 |
| 4 | **子agent系统**：lead agent派生subagent，独立token+独立chat+workspace全权+固定system prompt+任务范围约束 | utils/subagents.py | 部分（delegate_task思路类似） | 没有 | 部分有 | P1 |
| 5 | **自动化(rrule)**：AutomationModel+cron/rrule调度+next_run_ns+AutomationRun执行历史+频道/文件夹联动 | routers/automations.py、utils/automations.py | 没有 | 部分（will/dag_planner+hermes_cron桥） | 部分有 | P1。OpenSoul的dag_planner补rrule解析+run历史表 |
| 6 | **评估/排行榜**：Feedback模型+LeaderboardFeedbackData+ModelHistory——用户对比回答投票生成模型排行榜 | routers/evaluations.py | 没有 | 部分（benchmark/evaluator） | 部分有 | P1。"用户反馈即eval数据"思路值得抄 |
| 7 | **Skills+访问控制**：SkillModel带AccessGrants（public/group/user粒度），与groups联动 | routers/skills.py | 没有 | gene有skill无ACL | 部分有 | P1 |
| 8 | **记忆注入协议**：`<memory_context>`标签包裹注入system message，明确的开/闭标记 | utils/memory.py | 没有 | hippo有记忆无标准注入协议 | 部分有 | P0。一行成本，标准化记忆注入 |
| 9 | **RAG加载器矩阵**：mineru/paddleocr_vl/datalab_marker/mistral/youtube/tavily等9种文档加载器（含OCR管线） | retrieval/loaders/ | 没有 | 部分（WeKnora独立部署） | 部分有 | P2。paddleocr_vl/mineru是中文扫描件利器（对用户PDF痛点直接相关） |
| 10 | **向量库工厂**：15种后端（chroma/pgvector/qdrant/milvus/elastic/oracle23ai/s3vector/valkey...）+多租户变体 | retrieval/vector/dbs/ | 没有 | 部分 | 部分有 | P2 |
| 11 | **搜索提供商矩阵**：26个web搜索后端（searxng/serper/bocha(博查,中文)/sougou/exa...） | retrieval/web/ | 没有 | 部分 | 部分有 | P2。bocha+sougou中文搜索适配 |
| 12 | **终端代理**：admin配置终端服务器，反代WebSocket+HTTP，terminal context header注入 | routers/terminals.py、utils/terminals.py | 没有 | 没有 | 完全没有 | P1。OpenMate workspace接远程终端的标准方案 |
| 13 | **代码解释器**：外部code interpreter服务对接（aiohttp+websocket，stdout/stderr/结果三段） | utils/code_interpreter.py | 没有 | limb部分 | 部分有 | P2 |
| 14 | **通知系统**：事件目录(get_notification_event_catalog)+多target(webhook等)+前端NotificationToast | routers/notifications.py、utils/notifications.py | 部分（notification-center.tsx） | 部分（nest/diagnostics） | 部分有 | P1 |
| 15 | **频道(Channels)**：类Slack群聊频道+消息+文件+access grants | routers/channels.py | 没有（AI群组页面不改造） | 没有 | 完全没有 | P2。用户明确说过对话页/群组页不改——仅记录 |
| 16 | **日历**：CalendarEvent+attendees+与自动化/频道联动 | routers/calendar.py | 没有 | 没有 | 完全没有 | P3 |
| 17 | **任务模板套件**：title/tags/emoji/follow-up/autocomplete/query生成/image-prompt/voice-mode/MoA九种内置prompt任务 | routers/tasks.py | 部分（smart-prompt.tsx） | 没有 | 部分有 | P2 |
| 18 | **企业身份**：SCIM+OAuth+LDAP+审计(utils/audit.py) | routers/scim.py、utils/oauth.py、audit.py | 没有 | 部分（enterprise.py） | 部分有 | P2 |
| 19 | **Valves**：pipeline/工具参数暴露为用户可调阀门 | utils/valves.py | 没有 | 没有 | 完全没有 | P2。工具参数面板化 |
| 20 | **MCP客户端**：streamable_http+OAuth完整客户端，连接池session_pool | utils/mcp/client.py、session_pool.py | 没有 | mcp/有 | 部分有 | P1。核对OpenSoul mcp实现是否含OAuth流 |

## 源码亮点
- 事件总线(events.py publish_event)+EVENTS目录贯穿全部router——后端全域解耦。
- access_grants独立模型（public_read/public_write/group/user四粒度）复用到skills/channels/folders/calendar——一套ACL吃遍所有资源。
- chat_fork的环检测(seen set)防parentId数据损坏，工程防御到位。
- 前端AddTerminalServerModal/AddToolServerModal——连接外部能力用模态框+表单，UX模板。

## 可复用设计（Top-5）
1. **parentId消息树+fork**（#1）：与pi互证，OpenSoul会话表直接加列。
2. **tool_approval三态回填**（#3）：approve/reject/answer+超时，OpenSoul补工具审批的标准数据结构。
3. **memory_context标签协议**（#8）：最小改动让记忆注入可观测可裁剪。
4. **一套AccessGrants吃所有资源**（#18）：OpenSoul casbin补资源粒度。
5. **事件目录+多target通知**（#14）：用户"不知道系统在干嘛"痛点的后端基础。
