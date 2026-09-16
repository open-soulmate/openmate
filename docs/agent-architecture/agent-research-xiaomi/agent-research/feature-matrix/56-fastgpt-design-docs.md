# labring/FastGPT (#56, 29.7k★) — 设计文档级深读（.agents/design完整落地）

> 源码状态：⚠️ **网络受限**——git clone三度卡死（20文件/792s已杀）、codeload tarball 1500s截断34.9MB/1255文件。
> 但部分解压**意外获得完整`.agents/`目录**：AGENTS.md + 67份设计文档(design/) + 问题分析(issue/) + 技能库(skills/)——FastGPT的agent开发操作系统全部到手，引擎设计以此为准（标注"最后核对2026-07/08"的当前实现文档）。packages/源码顺延下轮。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Agent Loop provider协议**：唯一入口runAgentLoop；provider无关的Input/Runtime/Result/Event/Tool/Usage六协议；registry选provider（fastAgent默认/piAgent）；Result判别联合`done/paused/aborted/error`（error也保留已产生消息+requestId+usage） | 无 | cortex单体循环 | **完全没有** | **OpenSoul cortex重构的第二参照**（第一是DeerFlow middleware链）：循环协议与provider实现分离，暂停/中止/错误是Result的一等状态 |
| 2 | **系统工具五件套**：plan(计划创建/更新)/ask(暂停等用户)/sandbox(系统工具执行)/readFile(对话上传文档)/datasetSearch(知识库查询)——由Loop维护统一语义，Runtime显式注入启用 | 无 | 无（工具全平铺） | **完全没有** | "计划/提问/文件/知识库"升级为系统级工具而非业务工具——与claude-code Plan工具互证 |
| 3 | **ask暂停/恢复全链路**：ask事件→providerState(暂停点messages+callId+计划)持久化到chat item memories→用户回答→原tool call后追加response继续；**done/error/aborted都清memory防陈旧暂停点恢复** | 无 | 无 | **完全没有** | HITL第六方互证。"暂停状态存哪、何时清理"的完整答案 |
| 4 | **context_checkpoint压缩**：超阈值生成`<context_checkpoint>`（目标/约束/关键事实/工具结果/资源/下一步）；**active plan确定性结构拼接不许模型摘要改计划**；裁剪保留leading checkpoint；作为隐藏AI value持久化，恢复时重建 | 无 | hippo token_budget注入 | **完全没有** | 与claude-code PreCompact/PostCompact hook互证。OpenSoul上下文压缩缺"checkpoint结构+计划保护" |
| 5 | **`<system-reminder>`动态上下文**：每轮注入user message——已部署Skill名称/描述/SKILL.md路径、sandbox写入边界、本轮文件(id/name/type/URL)、可用知识库、**当前时间+sandbox工作目录** | 无 | 无 | **完全没有** | 10行注入函数；"模型必须先读完整SKILL.md不能凭描述推断"的约束写进reminder |
| 6 | **用户级Sandbox v2**：隔离边界=appId+userId（多chat共享物理sandbox，chatId只分sessions/<chatId>工作目录）；sandboxId=hash(appId-userId)；**9态生命周期状态机**(provisioning/legacyMigrating/running/stopping/stopped/archiving/archived/restoring/deleting)+operation heartbeat接管；双provider(OpenSandbox/Sealos Devbox) | 无 | mirror/sandbox.py目录级假沙箱 | **完全没有** | 沙箱状态机+heartbeat是"真沙箱"与"目录假沙箱"的分水岭，与E2B/Daytona互证 |
| 7 | **Skill平台工程闭环**：空白workspace+Agent辅助编辑（创建接口不生成默认内容）；`skills/<name>/SKILL.md`最小结构校验+路径逃逸校验；**不可变ZIP版本+storage key**；内置skill同步到sandbox HOME `.fastgpt/skills/`（**etag幂等**，不进用户导出包）；entrypoint.sh隔离执行限时限量 | OpenMate有skills UI | skills.py有存储 | **部分有** | 缺：版本不可变包/发布校验/内置与用户隔离/etag同步——skill生命周期四件套 |
| 8 | **辅助生成框架**（auxiliaryGeneration）：不走Workflow但复用Chat身份/SSE/计费/停止/Agent Loop的轻量生成；processor注入业务差异；**SSE断流续传统一mirror**；Redis停止key `agent_runtime_stopping:<sourceType>:<sourceId>:<chatId>`（运行期定时刷新+起止清理防污染） | 无 | 无 | **完全没有** | "任何AI生成都复用同一套流/计费/停止"的平台化设计——OpenSoul各处内联LLM调用应收敛到这种框架 |
| 9 | **Chat Agent Helper（NL→表单配置）**：ask_user暂停→providerState存memory→用户答→`generate_config` runtime tool（**Zod校验+全部资源ID必须在成员可访问集合内**→生成表单配置）；参数错误作为tool error回给模型自修（**不再调模型修JSON**） | 无 | 无 | **完全没有** | 售前场景直击：对话式生成工作流/表单配置。FastGPT的"工具参数错误=tool error让模型自己修"是防死循环的干净设计 |
| 10 | **usage单次上报协议**：provider/工具/压缩只经runtime.usagePush上报真实usage；application层收集同批不二次计费；父agent节点只汇总agentCall项，工具积分留在各自nodeResponse | 无 | gland/token_meter总量 | **部分有** | 多agent计费防重复的关键约定 |
| 11 | **知识库标签系统V2**：tagType四类型(string/number/datetime/array)创建时锁定；搜索filter 4类型×13操作符；ReDoS防护(safe-regex+长度上限)；v2表(teamId,datasetId,tag)唯一索引+E11000兜底；历史数据迁移向后兼容 | 无 | 知识库无标签过滤 | **完全没有** | 政企知识库管理刚需；13操作符过滤直接对应前端筛选UI |
| 12 | **运营三件套**：免登录分享窗口+iframe一键嵌入+**统一查阅对话记录并标注** | OpenMate有分享 | 无 | **部分有** | 对话标注（运营人员标记好坏）=评估闭环的数据入口 |
| 13 | **声明式Mongo索引管理**：defineIndex(schema,{key,options,deprecated})——废弃索引显式登记+测试覆盖清理行为+迁移检查纪律（写进AGENTS.md） | 无 | 无 | **完全没有** | 数据库schema演进的工程范式，OpenSoul表管理可学 |
| 14 | **`.agents/`仓库即agent工作区**（第三/四方互证定案）：design/67份设计文档（状态："当前实现"+最后核对日期）+issue/问题分析+skills/(SKILL.md+references/guides/scripts/**agents/openai.yaml每技能模型配置**)+code/(commands/syntax规范)；AGENTS.md索引全部 | OpenMate无 | 无 | **完全没有** | **行业信号升级**：goose+ChatDev2.0+FastGPT三家采`.agents/`；FastGPT走得最远——设计文档状态机化（"状态：当前实现/已实现"）+per-skill模型配置yaml |
| 15 | **双向MCP+RPA节点工作流**：对话工作流/插件工作流、Agent Skill编排、混合检索&重排、chunk级修改删除、QA拆分导入 | OpenMate画布12节点 | mcp/server生产消费 | **部分有** | 与Flowise/Langflow对照补全 |

## 源码亮点
- **设计文档即规范**：每份design文档都有"状态：当前实现/最后核对日期/验证范围"三要素+代码入口表——比README可靠得多，**OpenSoul应效仿此文档制度**（用户痛点"不知道在干嘛"的文档侧解法）
- agent-loop文档明确定义"不负责什么"（Workflow调度/SSE/权限/工具业务）——**边界声明与功能声明同等重要**
- Sandbox路径三拆分（workspaceRoot/runtimeSkillsRoot/sessionWorkDirectory）+声明"session目录不是硬安全边界"——诚实的威胁建模
- 辅助生成的扩展规则："新场景只新增processor，不扩展通用stream层理解业务配置"——开闭原则落到模块边界

## 可复用设计
1. **OpenSoul cortex/agent_loop协议**（P0参照）：Result四态判别联合+providerState暂停恢复+usagePush单次上报——与DeerFlow middleware链互补（一个是纵向协议一个是横向洋葱）
2. `<system-reminder>`每轮注入函数（skill列表/文件/知识库/时间/cwd五要素）——立即可做
3. context_checkpoint压缩结构（六要素+确定性计划拼接+leading保留）
4. Skill版本不可变ZIP+发布校验+etag内置同步——OpenSoul skill生命周期升级
5. Redis停止标记模式（起止清理+运行期刷新）——OpenSoul长任务停止的干净实现
6. design文档制度：状态/最后核对/验证范围/代码入口四要素
