# Devika (#68, 20k★) 功能研究

研究时间：2026-09-16 17:25（cron自动）
源码：git clone → ~/agent-research-src/devika（16MB，源码级深读）
状态判断：**原型级项目**，全部Python仅3,490行，大量占位空文件（sandbox/firejail.py、documenter/graphwiz.py、memory/rag.py均为空），最近提交2025-09基本停滞。研究价值在产品思路而非工程质量。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Internal Monologue一等公民**：每个执行步先跑独立"内心独白"agent（专属jinja2 prompt），独白文本通过socket实时推给前端展示——用户看到的是agent的思考过程而非黑盒 | agents/internal_monologue/ | 聊天流式展示 | 无独白概念 | 部分有 | OpenMate可把cortex推理轨迹渲染为"思考中"卡片；比chain-of-thought暴露更产品化 |
| 2 | **决策-续跑双阶段**：make_decision(prompt)先产出决策→subsequent_execute按决策分支执行——"先想清楚做什么再做" | agent.py:128,179 | 无 | intelligence/intent.py有意图识别 | 部分有 | intent是入口分流；devika是任务中途决策，粒度不同 |
| 3 | **contextual keywords动态上下文词**：每步从句子提取更新上下文关键词表，喂给搜索agent——搜索query带任务演进上下文 | agent.py:118 | 无 | 无 | 完全没有 | 与gpt-researcher query演化互证；实现极简（词表+LLM抽取） |
| 4 | **Runner + Rerunner循环**：run_code执行→错误→render_rerunner(带错误信息)→自动修复重跑，两套prompt模板 | agents/runner/runner.py 221行 | 无 | 无 | 完全没有 | 与aider lint回喂互证；P1 |
| 5 | **浏览器会话即agent状态**：agent state里持久化browser_session{url, screenshot}+terminal_session{command,output,title}——UI直接渲染agent当前看到的页面和终端 | state.py | 无 | 无 | 完全没有 | 直击"不知道在干嘛"；OpenMate workspace可加"agent视角"面板 |
| 6 | **状态栈持久化+socket广播**：AgentState per-project存sqlite state_stack_json，每次变更emit_agent广播——前端实时同步agent内部状态机 | state.py + socket_instance | 无 | trajectory事件表（无实时UI广播） | 部分有 | trajectory已有事件流，缺的是推送到OpenMate的实时通道（WS已有acp通道可复用） |
| 7 | **DOM hash_tree处理**：crawl()构建可交互元素hash树+clickable标记+属性提取——给LLM的精简页面表示 | browser/interaction.py 547行 | 无 | limb/browser? | 部分有 | 与browser-use DOM表示互证，OpenSoul浏览器工具应统一此表示 |
| 8 | **领域Experts提示词包**：chemistry/game-dev/math/medical/physics/stackoverflow/web-design七领域专家prompt，__UNIMPLEMENTED__显式标注未完成 | experts/ | 无 | gene/templates有模板 | 部分有 | gene模板库可按领域扩展；"未完成显式标注"的诚实做法值得学 |
| 9 | **Patcher agent专职修错**：独立patcher子agent接收错误+代码产出补丁 | agents/patcher/ 138行 | 无 | 无 | 完全没有 | 与Runner/Rerunner同族 |
| 10 | **Netlify一键部署**：services/netlify.py——写完代码直接部署预览 | services/ | 无 | 无 | 完全没有 | 产品化闭环最后一公里；政企可换成内网预览环境 |
| 11 | **GitHub仓库列表集成** | services/github.py | 无 | 无 | 完全没有 | 低优先级 |
| 12 | **Bert本地句子嵌入**（sentence.py）用于RAG（rag.py为空占位） | bert/ | 无 | hippo有embedding | 部分有 | |

## 源码亮点
- **状态即UI**：state.py的new_state()定义的字典结构（internal_monologue/browser_session/terminal_session/step/token_usage/timestamp）就是前端要渲染的全部字段——agent状态schema从第一天就为可观测设计。
- 诚实的半成品：firejail沙箱、UML/PDF文档生成、RAG全是空文件但目录占位，README/ROADMAP不夸大。

## 可复用设计
1. **P1：agent状态schema+实时广播**（独白/浏览器截图/终端输出三通道）——OpenSoul trajectory→WS→OpenMate面板，约200行，直击可观测痛点。
2. **P2：contextual keywords**——搜索上下文词表，极简实现。
3. **P2：Netlify式一键预览部署**——交付闭环。

## 整体评价
Devika无一项功能在工程上超越OpenClaw/claude-code等前列项目，但**"agent视角可视化"（独白+浏览器截图+终端三联屏）**的产品形态最贴近用户"我都不知道他们在干嘛"的痛点，作为UI参考比作为代码参考价值高。

## grep确认
internal_monologue/rerunner/netlify/state_stack => OpenMate/OpenSoul均NONE；terminal_session概念OpenMate workspace有终端但无agent输出绑定。
