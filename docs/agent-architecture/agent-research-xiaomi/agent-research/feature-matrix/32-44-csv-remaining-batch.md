# CSV剩余清账批：#32 gpt-engineer / #33 chrome-devtools-mcp / #34 cursor / #35 gpt_academic / #40 agent-browser / #44 AstrBot

研究时间：2026-09-17 深夜轮6（cron）
研究方式：web_extract raw README（6仓库）+chrome-devtools-mcp/agent-browser README全文（99k/79k字符缓存）；#34 cursor仓库页验证
说明：本轮nanobot(#37)/CowAgent(#38)另有源码级专档（37-nanobot-source.md/38-CowAgent-source.md）。#36 huginn已有36-huginn-source-deep.md、#39 LibreChat已有39-librechat-source-deep.md、#41 BettaFish已有41-bettafish.md、#42 agno已有42-agno-source.md、#43 langgraph已覆盖——CSV 32-44行至此全部销账。

---

## #32 gpt-engineer（AntonOsika, 55k★, Python）— README级
- **结论：项目半停滞**。README自述"precursor to gptengineer.app（商业托管版）"，并主动把hackable CLI需求导流给aider——开源版定位已降为实验平台。研究价值低，被aider/OpenHands覆盖。
- 遗产功能：**`bench`二进制**——把自己的agent实现对APPS/MBPP公开基准打分（gpte-bench-template模板仓库）→ 评估工程化又一方（agno environments/Flowise evaluation/langfuse experiments/win_rate）。OpenSoul benchmark/evaluator缺"对公开基准跑分"通道。
- **preprompts身份覆盖**（--use-custom-preprompts）："编辑preprompts是让agent跨项目记住东西的方式"——人格即文件夹，与nanobot SOUL.md同思想早三年。
- vision输入：--image_directory喂UX/架构图给视觉模型。

## #33 chrome-devtools-mcp（ChromeDevTools官方, 52k★, TypeScript）— README级
- 定位：给coding agent（Antigravity/Claude/Cursor/Copilot）控制和检查**实时Chrome**的MCP server+CLI。
- **性能分析是差异点**：录制trace→提取可行动的性能洞察；CrUX真实用户数据+实验室数据合并呈现（--no-performance-crux可关）。
- source-mapped console堆栈追踪（编译后的报错映射回源码）。
- **--slim模式**：只给基础浏览器工具集，减token——工具面按场景分档（与GPT-Researcher MCPToolSelector/claude-code tool_search同方向：工具不是越多越好）。
- 自动等待动作结果的reliable automation（puppeteer）；--isolated/持久user data dir/连接已有Chrome实例/Android调试。
- **官方点名"browser subagent参考实现"=Gemini CLI browser agent**——浏览器能力被打包成可嵌入产品的子agent，OpenMate browser_exec可参考该打包形态。
- ⚠️遥测默认开启（Google收集工具调用成功率/延迟），CI环境自动禁用——政企部署需--no-usage-statistics。

## #34 cursor（getcursor, CSV标50k★）— 结论级：**闭源**
- 仓库实为forum/issue收集页（33k★，README只有下载链接+安全邮箱），无源码。CSV星级50000失实（实际33012）。第三次CSV数据失实（84 cursor-cli仓库不存在/96 dotnet仓库404/34星级失实）。
- 行为对标材料用：Continue NextEdit（已研究）、cursor-cli（#84已记闭源）。

## #35 gpt_academic（binary-husky, 50k★, Python）— README级
- **虚空终端插件**：自然语言直接调度本项目其他插件——"插件的插件"，NL→插件调用分发器。与OpenSoul intent路由+skill调度直接相关。
- 插件热更新（crazy_functions/目录函数插件热重载，2.2版本就有）。
- **实时语音对话输入插件**：异步监听音频+自动断句+**自动寻找回答时机**（何时插话是卖点）——OpenSoul voice只有TTS输出（多轮确认无语音输入）。
- arxiv精细翻译管线（LaTeX全文翻译/校对出对照PDF/Doc2x）——学术文书流水线，与用户售前场景弱相关但翻译管线设计可参考。
- 多模型同时问询+多api-key负载均衡（输入区临时改API_KEY即生效——会话级provider切换的糙快实现）。
- **自译解报告**：一键让GPT重新生成项目自我解析文档（self_analysis.md，逐文件功能说明）——"项目自剖析"工具化，与OpenSoul sense方向相通。
- 新GUI前端测试中（2026.1）；整体处于维护态非进化态。

## #40 agent-browser（vercel-labs, 42k★, Rust）— README全文级（99k字符）
- **Rust原生CLI浏览器自动化**，daemon不要Playwright/Node；npm/brew/cargo三渠道装，Chrome for Testing自动下载。
- **accessibility tree snapshot+refs**（`agent-browser snapshot`→`click @e2`）——a11y树做元素寻址是给AI用的首选（"best for AI"），比CSS selector稳。与OpenMate browser_exec的AX tree路径同构，但ref寻址+命令面更完整。
- **截图token经济学三件套**：`--annotate`（编号标注元素）、`--if-changed`（**没变化就不发图**）、`--threshold 0.01`（≤1%像素变化忽略）——多模态agent截图token成本的工程化解法，OpenMate完全没有，**立即可抄**。
- **点击遮挡早失败**：目标click point被别的元素盖住（cookie横幅/弹窗）→直接失败并报出covering element，"dismiss后重拍snapshot再试原ref"——防盲点。
- **WebMCP**（实验）：页面主动advertise工具目录，agent只收name+描述+origin摘要，**schema按需拉取（"never included proactively"）**，目录变化才推，compaction后用`webmcp list`恢复上下文——"页面即工具提供者"+增量摘要协议，与MCP Apps互补。
- 云端browser provider抽象：Kernel（profile持久化cookies回写）/AWS AgentCore（SigV4+profile持久化）——同一CLI本地/云无缝切。
- `chat`命令：自然语言控制浏览器的内置单发/REPL模式。
- headless截图隐藏滚动条保证一致输出；`keyboard inserttext`无键事件输入。

## #44 AstrBot（AstrBotDevs, 40k★, Python）— README级
- IM全平台Agent聊天平台（QQ/企微/飞书/钉钉/公众号/Telegram/Slack），对标OpenClaw自称"openclaw alternative"。
- **Agent Sandbox**：隔离安全执行代码/shell+**session级资源复用**（docs专项页）——国内IM bot里少见的沙箱意识；与FastGPT用户级sandbox v2/AstrBot两家互证。
- 1000+插件市场一键装（动态badge显示插件数）；集成Dify/百炼/Coze外部agent平台（"自己不当agent只当代聊网关"也是产品位）。
- WebUI+Web ChatUI（内置沙箱和web搜索）；自动上下文压缩；i18n。

---

## 已grep确认OpenMate/OpenSoul（本轮关键词）
- NONE：injection_queue/drain_inject/finish_reason length恢复/SOUL.md|USER.md人格文件/self运行时自检工具/provider自动探测链/session_prefs/tombstone/model_catalog/parent_id(subagent归属)/team寻址@mention/idle进化触发/进化推送/webmcp/if-changed截图/annotate截图/CrUX/trace性能分析(实质义)/虚空终端/插件热更新
- 部分：OpenMate settings已有全局三档（fileAccess full/restricted/readonly+shellWhitelist+networkAccess）——CowAgent缺的是per-session+arg-level解析+诚实声明；OpenSoul heredity/self_evolution.py(181行)有趋势/失败模式/反馈分析——CowAgent/nanobot补的是触发器+动作+蒸馏管线+推送；OpenSoul hippo有dedup/merge/decay consolidation——缺对话历史→Dream蒸馏入口；skills.py/plugins_api有——缺三源安装+NL建skill；voice=tts输出——缺语音输入（gpt_academic插件三方确认方向）

## CSV数据质量备注
- 失实累计3条：#84 cursor-cli（仓库不存在）、#96 agent-framework-dotnet（404，实为microsoft/agent-framework的dotnet/目录）、#34 cursor星级（50000 vs 实际33012）
- #32 gpt-engineer CSV full_name=AntonOsika/gpt-engineer（可跳转，README徽章指向gpt-engineer-org/gpt-engineer，两org并存）
