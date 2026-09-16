# UI-TARS-desktop (#46, bytedance, 38.9k★) 功能研究

> 源码级：GUIAgent.ts(605行)/Model.ts(362行)/constants.ts/actionParser.ts(330行) 本地留存 ~/agent-research-src/uitars-src/
> 仓库结构：packages/ui-tars/{sdk,cli,operators,action-parser,shared,utio,visualizer,electron-ipc} + packages/agent-infra/{browser,browser-use,mcp-client,mcp-servers,mcp-http-server,search,logger,mcp-benchmark} + apps/ui-tars(Electron桌面)
> 定位：多模态GUI Agent技术栈双产品——Agent TARS（CLI+Web UI通用多模态agent）+ UI-TARS Desktop（本地/远程电脑与浏览器操作器）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **VLM驱动GUI循环**：while(true){screenshot→VLM→parse→execute}，模型输出Thought/Action直接驱动鼠标键盘 | 无 | 无（limb/RPA是预定义动作模板回放，非视觉驱动） | 完全没有 | OpenSoul limb升级为VLM循环：screenshot()→vision模型→actionParser→execute()，循环骨架抄GUIAgent.run() |
| 2 | **Operator可插拔抽象**：Operator接口仅screenshot()+execute()两方法；NutJS桌面/Web浏览器/Mobile/自定义operator多实现共用一个GUIAgent | 无 | limb只有固定ActionType枚举 | 完全没有 | 定义BaseOperator协议（与AgentScope 8沙箱后端、deepagents BaseSandbox同构）——GUI操作后端抽象第六方互证 |
| 3 | **Action Space动态注入system prompt**：per-operator MANUAL.ACTION_SPACES→模板替换{{action_spaces_holder}}，能力面随操作器变 | 无 | 无 | 完全没有 | prompt与工具面解耦的最小实现，50行 |
| 4 | **动作文本解析器actionParser**：Thought/Reflection/Action三段解析；click(start_box='[x1,y1,x2,y2]')坐标×factors归一化→物理像素；V1.5 smartResize（28因子对齐+长宽比约束+像素上下限）反算真实坐标；scaleFactor处理HiDPI | 无 | 无 | 完全没有 | 若做GUI agent线直接整体移植（330行纯函数） |
| 5 | **内部动作空间四态协议**：finished()/call_user(求助用户)/max_loop/error_env——模型可主动"求助"或"认输"，框架可主动"判超限" | 无 | cortex无max_loop概念 | 完全没有 | call_user=agent求助协议（与HITL六方互证新增第七方）；max_loop应进cortex循环守卫 |
| 6 | **滑动截图窗口+图片预压缩**：screenshots.slice(-5)只发最近5张；preprocessResizeImage按模型版本maxPixels压缩（V1.0/V1.5/DOUBAO三档） | 无 | 无 | 完全没有 | 多模态上下文预算治理的具体解法 |
| 7 | **Responses API有状态增量模式**：previous_response_id链式调用+滑窗删旧图(openai.responses.delete旧图片response)——**每轮只发增量，不重发全历史** | 无 | 调LLM全量重发历史 | 完全没有 | token成本优化利器；OpenSoul cortex对长会话可引入（依赖provider支持Responses API） |
| 8 | **pause()/resume()/stop()三级运行控制**：Promise挂起不销毁循环状态+AbortSignal+USER_STOPPED终态；finally里执行user_stop清理动作 | 无 | 无运行中暂停 | 完全没有 | ~20行Promise模式，可抄进cortex循环 |
| 9 | **三级分阶段重试策略**：screenshot/model/execute各自独立maxRetries+minTimeout+onRetry回调（async-retry）；截图失败不消耗loop额度(loopCnt-=1) | 无 | 无 | 完全没有 | "步骤类型化重试"——比全局retry精细 |
| 10 | **分级错误分类**：ErrorStatusEnum六类(MODEL_SERVICE/REACH_MAXLOOP/SCREENSHOT_RETRY/INVOKE_RETRY/EXECUTE_RETRY/ENVIRONMENT)+GUIAgentError栈捕获 | 无 | 异常扁平 | 部分 | 错误分类学直接对表，UI按类渲染引导 |
| 11 | **可分享执行轨迹格式GUIAgentData(ShareVersion.V1)**：systemPrompt+conversations(截图base64+尺寸+scaleFactor+timing+parsedPrediction)→visualizer回放+分享链接 | 无 | trajectory扁平事件表 | 完全没有 | "执行回放"=可观测痛点的另一种解法（agent干了什么逐屏回放） |
| 12 | **逐步timing/token核算**：每conversation条目start/end/cost+totalTokens/totalTime累计，最后日志汇总 | 无 | token_meter总量无逐步归因 | 部分 | trajectory逐步归因素材 |
| 13 | **X-Session-Id请求头+remote model headers透传** | 无 | 无 | 部分 | 小件 |
| 14 | **loopIntervalInMs循环节流** | 无 | 无 | 部分 | 小件 |
| 15 | **Remote Operator**：一键远程控制任意电脑/浏览器（零配置，v0.2.0） | 无 | 无 | 完全没有 | 售前演示/远程运维场景价值高 |
| 16 | **agent-infra MCP全家桶**：mcp-client/mcp-servers(内置)/mcp-http-server/mcp-shared/**mcp-benchmark(MCP性能基准)**/browser-use浏览器库/search聚合 | 无 | mcp有基础生产消费 | 部分 | mcp-benchmark是MCP工具质量评估的现成方案 |
| 17 | **AIO Sandbox集成**（agent-infra/sandbox）：隔离的all-in-one工具执行环境（CLI v0.3.0） | 无 | mirror/sandbox.py目录级假沙箱 | 完全没有 | 沙箱缺口再确认 |
| 18 | **Event Stream Viewer**：CLI数据流追踪调试视图+每工具调用/深度思考计时统计 | 无 | 无 | 完全没有 | "不知道在干嘛"的CLI侧解 |

## 源码亮点

- **GUIAgent.run()主循环605行是"视觉agent循环"的教科书**：状态机(INIT→RUNNING→PAUSE→END/ERROR/CALL_USER/USER_STOPPED)、暂停点在循环顶部（await resumePromise，状态自然落PAUSE事件流出去）、截图无效图重试不烧loop额度、模型返回空prediction直接continue
- **Model.ts Responses API滑窗删图**（~80行）：headImageContext记录首图messageIndex+responseIds队列，窗口滑动→shift+responses.delete——有状态API下做"图片窗口滑动"的巧妙实现
- **actionParser坐标数学**：模型输出0-1000归一化坐标×(物理宽/1000)×scaleFactor；V1.5还要先smartResizeForV15对齐模型实际看到的图尺寸再反算——HiDPI屏正确点击的完整公式
- **错误永不throw给调用方**：只经onError回调分发（"We only use OnError callback...not throw"）——UI层不会崩
- **user_stop清理**：finally里对USER_STOPPED执行一次operator.execute({action_type:'user_stop'})让操作器释放资源（如恢复被锁的键鼠）

## 可复用设计

1. **Operator两方法协议**（screenshot/execute）→ OpenSoul limb重构骨架，接PyAutoGUI/playwright/远程operator
2. **call_user()求助动作**：模型判断"干不了/需要人"→显式动作而非报错——HITL第七方互证
3. **pause/resume Promise模式**：~20行，cortex长任务"运行中暂停"立即可抄
4. **可分享执行轨迹ShareVersion.V1格式**：截图+动作+timing结构化——OpenMate做"执行回放播放器"的现成数据格式
5. **Responses API previous_response_id增量+删图**：长多模态会话token成本解法
6. **分级重试（截图不烧额度）**：步骤类型化重试策略

## 行业信号
- 字节双线押注：UI-TARS模型（权重开源）+desktop（执行器开源）——"专用GUI模型+通用执行框架"路线，与Anthropic computer-use(通用模型+通用工具)是两种范式
- agent-infra子包族（browser/mcp/search/sandbox）拆成独立npm包复用——基础设施包化
- Midscene（web-infra-dev）分工：浏览器内用Midscene，桌面用UI-TARS
