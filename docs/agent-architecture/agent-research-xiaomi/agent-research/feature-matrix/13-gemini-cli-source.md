# Gemini CLI (#13, 107k stars, TypeScript) 功能研究 — 源码级

源码：~/agent-research-src/gemini-cli（packages/: cli / core / a2a-server / sdk / devtools / vscode-ide-companion / test-utils）
研究时间：2026-09-16 深夜轮

## 功能清单（20项，源码确认）

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **A2A Server**：把自身agent暴露为Google A2A协议服务（http/持久化/executor/task事件驱动，含race-condition防护） | packages/a2a-server/src/ | ❌ | ❌ | 完全没有 | P1。已有a2a-protocol-integration skill可直接落地；OpenSoul加/organs对外A2A端点 |
| 2 | **双模子agent系统**：local-invocation(同进程) / remote-invocation(远程) / local-session-invocation / remote-session-invocation四套invoker + A2A client-manager + agent-scheduler调度 + registry注册（含acknowledgedAgents确认机制） | core/src/agents/ | ⚠️部分（delegate_task单向无registry） | ⚠️部分 | **部分有** | P0。delegate_task升级为registry+scheduler模型；agent可注册能力被发现 |
| 3 | 内置专家子代理：codebase-investigator（代码库调查）、skill-extraction-agent（**自动从对话中提取skill**）、cli-help-agent、generalist-agent、browser子代理 | core/src/agents/ | ❌ | ❌ | 完全没有 | **P0亮点**：skill-extraction-agent对应用户的"沉淀为skill"需求，让agent自动提炼可复用流程 |
| 4 | **JIT上下文**：read_file/write/replace等"高意图"工具访问路径时，动态发现并加载该子目录的GEMINI.md | core/src/tools/jit-context.ts | ❌ | ❌ | 完全没有 | **P1高价值**：OpenMate工作区每个子目录可有自己的AGENTS.md，读文件时自动注入 |
| 5 | confirmation-bus + PolicyEngine：消息总线统一工具确认流（MessageBusType、ToolConfirmationRequest/Response、PolicyDecision） | core/src/confirmation-bus/ + policy/ | ❌ | ⚠️部分（casbin管用户不管工具确认流） | 部分有 | P0。与codex execpolicy同方向，统一为"工具审批总线" |
| 6 | 异步确认调度：scheduler/confirmation.ts——工具确认可排队异步resolve，不阻塞整个会话 | core/src/scheduler/ | ❌ | ❌ | 完全没有 | P1。长任务中多个审批排队场景需要 |
| 7 | 模型fallback链：fallback/handler.ts统一降级处理（配model_retry） | core/src/fallback/ | ❌ | ⚠️部分（acp-proxy有超时重试无模型降级链） | 部分有 | P1。LangChain同款middleware，两边印证 |
| 8 | enter-plan-mode / exit-plan-mode **工具化**（不是UI模式而是tool call） | core/src/tools/enter-plan-mode.ts | ⚠️死字符串（之前调研确认只有i18n） | ❌ | 完全没有 | P1。计划模式做成工具，模型可自主进出 |
| 9 | ask-user工具 + Question结构化提问 | core/src/tools/ask-user.ts | ⚠️部分 | ❌ | 部分有 | P2 |
| 10 | complete-task工具（显式任务完成信号） | core/src/tools/complete-task.ts | ❌ | ❌ | 完全没有 | P2。比"模型自然结束"更可靠的终止信号 |
| 11 | activate-skill工具（运行时激活技能注入上下文） | core/src/tools/activate-skill.ts | ⚠️部分（Hermes skill_view） | ❌ | 部分有 | P2 |
| 12 | get-internal-docs工具（agent查询自己的内部文档） | core/src/tools/get-internal-docs.ts | ❌ | ❌ | 完全没有 | P2。自举文档，OpenSoul可做/organs自省文档 |
| 13 | at-reference解析（@file引用自动解析挂载） | core/src/tools/at-reference-resolution*.ts | ⚠️部分（OpenMate有文件预览） | ❌ | 部分有 | P2 |
| 14 | list-mcp-resources工具 + resources模块（MCP资源不只是工具） | core/src/tools/list-mcp-resources.ts + resources/ | ❌ | ❌ | 完全没有 | P1。MCP的resources能力被普遍忽略，OpenSoul native-mcp可补 |
| 15 | **billing/availability模块**：成本与可用性独立模块化（配telemetry） | core/src/billing/ availability/ | ❌ | ⚠️部分（acp-proxy管成本） | 部分有 | P1。用户重视可观测性，成本面板必备 |
| 16 | code_assist + routing：代码辅助后端协议与智能路由 | core/src/code_assist/ routing/ | ❌ | ❌ | 完全没有 | P2 |
| 17 | vscode-ide-companion包：IDE双向集成独立包（诊断、选区、diff回传） | packages/vscode-ide-companion/ | ❌ | ❌ | 完全没有 | P1。OpenMate定位是AI操作系统，IDE companion是"感知"延伸 |
| 18 | voice模块（core内置，配sdk） | core/src/voice/ | ❌ | ❌ | 完全没有 | P2 |
| 19 | safety独立模块 + sandbox（含macos-seatbelt等平台实现） | core/src/safety/ sandbox/ | ❌ | ⚠️部分（immune无代码沙箱） | 部分有 | P0（与codex沙箱同结论） |
| 20 | hooks + telemetry（OpenTelemetry）+ ide诊断通道 | core/src/hooks/ telemetry/ ide/ | ❌ | ❌ | 完全没有 | P1 |

## 源码亮点

1. **测试即文档**：每个.ts必有.test.ts，连race-condition都有专门测试文件。功能清单从测试文件名就能读出来。
2. **agents/目录四种invocation矩阵**（local/remote × 一次性/session化）——子agent的完整产品化形态，Hermes的delegate_task只有local一次性。
3. **skill-extraction-agent是杀手锏**：对话结束后自动提炼流程沉淀为skill，正对应用户"一直没有进化"的痛点。
4. **JIT上下文**解决"上下文文件放哪"的工程问题：根目录GEMINI.md + 子目录按需加载。
5. **confirmation-bus**把确认流从各工具散落实现抽象成总线+策略引擎。

## 可复用设计

1. **skill-extraction-agent**（P0，1周）：会话结束hook触发，LLM提炼"这次哪些流程可复用"→ 生成SKILL.md草稿→用户确认入库。直接缓解用户"没有进化"的抱怨。
2. **JIT上下文**（P1，2-3天）：OpenMate workspace读取子目录文件时自动发现并注入该目录的context.md。
3. **子agent registry+scheduler**（P0，1周）：delegate_task升级：agent注册能力表，调度器按任务选agent。
4. **confirmation-bus**（P0，3天）：统一工具审批，与codex execpolicy合并设计（策略引擎+总线+异步排队）。
5. **MCP resources支持**（P1，2天）。
6. **complete-task显式终止**（P2，1天）：delegate_task子代理输出契约加done信号。
