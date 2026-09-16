# nanobot (#37, HKUDS, 48k★) 功能研究 — 源码级（web_extract raw）

研究时间：2026-09-17 深夜轮6（cron）
研究方式：git clone卡死（112K停滞）→ web_extract代理读raw源码：README(79k字符)+docs/architecture.md+docs/concepts.md+nanobot/agent/memory.py+agent/runner.py+agent/tools/self.py（大文件自动落盘分页）
定位：**与OpenMate/OpenSoul最接近的竞品**——超轻量Python个人AI agent：WebUI/终端/聊天app、工具、长期记忆、MCP、模型路由、多agent委派、定时自动化、OpenAI兼容API，一个小而可读的核心。HKUDS（港大数据智能实验室，GraphRAG同门）。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|---|
| 1 | **AgentLoop/AgentRunner双层分离**：loop.py管channel侧turn（session/workspace作用域、上下文构建、hooks、outbound发布），runner.py管model侧循环（provider调用、流式、工具执行、迭代上限）——调试问题先判断"channel路由还是provider循环" | 无对应分层 | cortex单体函数 | 完全没有 | cortex重构时按此切两层；架构文档明写"哪个问题看哪个文件" |
| 2 | **运行中消息注入队列**：`_drain_injections`+`_MAX_INJECTIONS_PER_TURN`上限——用户在agent跑的时候发新消息，规范化为user message注入当前turn，超上限丢弃并记日志 | 聊天框无插话语义 | 无 | 完全没有 | 与Khoj interrupt_queue（15行）互证升级为两方；OpenMate聊天框变"插话框" |
| 3 | **finish_reason=length自动恢复**：`_MAX_LENGTH_RECOVERIES`+length_recovery_parts——输出被max_tokens截断时有专门恢复路径而非把半截回复给用户 | 无 | 无 | 完全没有 | runner循环内检查finish_reason=="length"→恢复策略（压缩续写） |
| 4 | **Dream记忆蒸馏管线**（memory.py源码级）：history.jsonl日志（cursor自增+时间戳）→dream template批量拼`[ts] content`（条目1000字截断）→**LLM通过调用archive工具来确认记忆检查点**（consolidator_archive："Memory archive provider returned tool call(s); requesting checkpoint"）——记忆固化是模型显式动作而非后台启发式 | 无 | hippo有dedup/merge/decay consolidation（DB级） | 部分有 | OpenSoul缺"对话历史→Dream蒸馏"管线；archive-as-tool-call设计可直接抄 |
| 5 | **历史日志防污染三件套**：strip_think清洗思考链；oversize条目截断+只警告一次（防日志刷屏）；**strip后为空的条目照样持久化空内容防"template leak再次污染Dream输入"**——每个防御都有注释解释攻击场景 | 无 | 无 | 完全没有 | 工程注释体裁可抄；空条目防复发设计很聪明 |
| 6 | **三文件人格体系**：SOUL.md（agent人格）/USER.md（用户画像）/MEMORY.md（长期事实）+AGENTS.md（项目指令）——全部是agent可读写的markdown文件 | 无md人格文件 | mind/gene在DB | 完全没有 | 用户"文件只存一份"哲学的天然形态；OpenSoul可加md导出/编辑面 |
| 7 | **agent workspace vs project workspace分离**：WebUI聊天可选project workspace干仓库活——AGENTS.md取自project（**不回退**agent workspace），SOUL/USER/MEMORY/skills永远归agent workspace，相对路径/shell cwd归project | workspace单一 | 无 | 完全没有 | "身份不动，干活目录可换"；与nanobot多项目并行直接相关 |
| 8 | **checkpoint_callback**：每轮结束持久化回调（runner统一出口） | 无 | trajectory事件流 | 部分有 | 事件流≠可恢复checkpoint，对齐agno快照续跑方向 |
| 9 | **self.py运行时自检工具**：agent可查询自身运行时状态——scalar repr、Mapping小则展开大则只给keys做dot-path导航（"教模型怎么导航自己的状态"） | 无 | 无 | 完全没有 | 与OpenSoul sense/intelligence结合：给cortex一个self工具 |
| 10 | **provider自动选择链**：registry keywords→API key前缀→apiBase hints→local fallback→gateway fallback；专门化路径只有Anthropic/Azure/Bedrock/Codex/Copilot，其余全走OpenAI兼容 | OpenMate无 | OpenSoul llm多provider但选择靠配置 | 部分有 | autodetect思路与Continue 81 provider探测互证 |
| 11 | **Agent Plugins + CLI Apps catalog**：workspace/plugins/ v1包从Apps启用；CLI Apps由installer管executable生命周期并写"skills-only Agent Plugin" | plugins_api存在 | skills.py/plugin_loader | 部分有 | 缺"installer拥有可执行文件生命周期"形态 |
| 12 | **session外置jsonl**：`<config-dir>/sessions/<workspace-id>/*.jsonl`，opaque ID跟随workspace移动（搬家不失忆） | 无 | sessions在DB | 部分有 | 语义可借鉴：workspace移动时ID不变 |
| 13 | **gateway系统任务**：Dream+heartbeat作为系统job随gateway启动；cron是workspace-scoped | cron已有 | 无 | 部分有 | OpenSoul缺heartbeat/Dream系统任务化 |
| 14 | **OpenAI兼容API+Python SDK**对外暴露 | 无 | mcp/server.py | 部分有 | OpenSoul有MCP无OpenAI兼容API（Hermes生态对接常见需求） |
| 15 | **reasoning块提取**：extract_reasoning分离reasoning_content/thinking_blocks与content | 思考展示有 | 无显式分离 | 部分有 | |

## 源码亮点

- **架构文档即产品**：docs/architecture.md逐文件列"哪个行为在哪个源文件"，加"Change→Minimum useful verification"测试矩阵（provider改动→unit test或mock路径、channel改动→gateway启动路径、WebUI改动→bun test+浏览器验证）——**新人PR验收标准写进文档**，OpenMate/OpenSoul的docs缺这一层。
- **工具行为=model contract**："Keep user-visible tool names, schemas, and error messages stable unless a change is intentional"——工具名/schema/报错文本都是对模型的承诺，改了就是破坏兼容。这句话应刻进OpenSoul MCP层。
- runner.py注释级细节：injection回调返回None/空串安全、`_has_injection_content`对str/list/其他三种content形态的判断、最后一条assistant消息去重合并（`_append_final_message`防同内容双写）。

## 可复用设计

1. **注入队列+上限**（runner.py `_drain_injections`）：~30行，OpenSoul cortex循环加一个pending_injections消费点即可
2. **Dream管线骨架**：journal(jsonl+cursor)→batch→template→archive-tool-call确认——OpenSoul hippo缺的"对话→记忆"入口
3. **length恢复**：finish_reason检查+恢复预算，runner循环20行
4. **威胁/边界诚实声明体裁**：与CowAgent policy.py互证（下一份报告），"能做的/不能做的/要硬边界请用容器"三段式写进OpenSoul immune文档

## 行业信号
- 48k★的"ultra-lightweight"框架与OpenMate/OpenSoul正面对位：同为Python核心+WebUI+多渠道+记忆+MCP+子agent。**nanobot把架构文档写到"逐文件"级是其社区扩张快的重要原因**。
- HKUDS学术团队产品化路径（GraphRAG→nanobot）值得关注：记忆用文件+jsonl而非向量库起步，向量是可选backend（vector_backend.py）。
