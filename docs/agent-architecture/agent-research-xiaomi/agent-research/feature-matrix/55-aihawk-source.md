# AIHawk (#55, 30.6k★, feder-cr/AIHawk) 功能研究
> 研究方式：web_extract读raw源码（agent.py全文25KB+README+mcp目录commit级细节）。2026-09-16 深夜轮4（cron）

## 定位
"反检测浏览器+网页浏览agent"：patched Firefox（invisible_playwright引擎+invisible_core指纹层）+ MCP server（`uvx aihawk`即给Claude Code/Codex/Gemini CLI用的浏览器工具）+ 独立Web UI（左对话右浏览器）。从批量投简历机器人转型为通用网页agent。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 反检测浏览器（seed→fingerprint→preferences/proxy/geolocation一条链；浏览器死了重建"comes back as the same person"——身份连续性） | ❌ | ❌（limb=RPA模板回放，无真实浏览器） | 完全没有 | 浏览器agent线（browser-use/UI-TARS后第三方）；政企自动化刚需 |
| MCP server分发形态（agent能力本身作为MCP工具给coding agent调用；双浏览器main+support模型） | ❌ | 部分（OpenSoul mcp/server.py是生产侧，非"把自己变成别人的工具"） | 中 | OpenSoul可把自己浏览器/文件能力MCP化给外部coding agent——**反向MCP** |
| SHOWN/SENT双预算（同一工具结果：watcher页面看1200字符、模型收8000字符；截断必须显式"[... N more characters, not shown]"） | ❌ | 部分（cortex上下文压缩无"观察者/模型"双面预算） | 大 | OpenMate工具结果展示直抄：**watcher被静默截断=审计时把部分页当全页** |
| system消息不落盘（said_only：保存transcript剔除system，恢复时用当前代码重建——"文件里的旧prompt会赢过代码"） | ❌ | 部分（OpenSoul session存全消息） | 中 | 会话恢复时重建系统提示，保证prompt升级到达存量会话 |
| 单一循环+叙述参数化（narration回调传入才有transcript；"被观察的loop有两种行为要测"） | - | 部分 | 低 | 工程原则可抄：cortex循环的可观测性做成参数而非模式 |
| 浏览器生命周期极简化（0.53.0删registry.py 367行七步declare/wake/rebuild，只剩browser_open唯一开启动作+Work.acting统一漏斗；未开=固定一句话提示） | - | - | - | 设计课：**把状态机删到最小**，错误消息教模型自救 |
| unknown_tool针对性回复（识别模型调用已删除的旧session工具，直接告知替代路径） | ❌ | ❌ | 低 | 10行可抄进MCP工具层 |
| MAX_TOKENS显式8192（防provider默认65536导致配额key直接402） | - | 部分（.env LLM_MAX_TOKENS） | 低 | 已有 |
| 变异测试+数字单点声明gate（每处测量数字只声明一次，测试gate防复制漂移；commit message即证据文档） | ❌ | ❌ | 中 | OpenSoul测试文化参照：常量+测试gate防prompt数字漂移 |
| 本地数据自治（sessions/profiles/screenshots全本地AIHAWK_HOME，不回传作者） | ✅符合用户"不上云"红线 | - | - | 行业信号：与用户文件不上传云端的红线同向 |

## 源码亮点
1. **agent.py注释体裁独一份**：每段⛔注释=一次真实测量事故的墓志铭（"emoji规则曾有条件例外，模型找到例外就满足规则——扁平禁止才有效"；"结束语曾禁止一切工具调用，导致support浏览器6/6次不关——把关闭动作写进结束句子里"）。**Prompt工程的失败证据链直接进源码**，OpenSoul cortex prompt迭代可效仿。
2. **两面预算哲学**："页面是工作的窗口，消息列表是后续每turn的代价——两个数字故意不同"。
3. 叙述即功能："90秒沉默后返回答案的是批处理；每步叙述的才是人能观察、打断、信任的东西"——正对用户"不知道在干嘛"痛点。
4. 0.53.0生命周期重构：删掉自动重建（action aimed at dead browser REBUILT it and ran again——"每个都是出错的地方，两处都出过错"）→ 死了就明说，让模型决定重开。

## 可复用设计
- **P1**：SHOWN/SENT双预算+显式截断标记 → OpenMate工具结果卡片直接抄（与FastGPT argsDelta/agno offload信封互证）
- **P1**：会话恢复重建system prompt（said_only）→ OpenSoul hippo/session恢复路径
- **P2**：反检测浏览器线（invisible_playwright可独立引入）——评估后再定，注意合规
- **P2**：OpenSoul能力MCP化反向输出
