# kilocode 第四补验：session/compaction.ts 压缩引擎全文（742行）

轮次：深夜轮11（cron）。本地clone ~/agent-research-src/kilocode，全文精读 packages/opencode/src/session/compaction.ts（此前轮8只到常量表级：20k/40k/2000字符/preserve 25% clamp 2k-8k已记于kilocode-source-supplement.md，本轮是引擎机制清偿）。

grep确认（opensoul/src）：prune命中=learn/experience.py记忆老化清理（无关）；replay命中=trajectory轨迹回放API（无关）；compact/auto-continue零命中——**OpenSoul确认无上下文压缩引擎**（轮8"sessions compacted=0标志位"结论不变）。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **预算化尾部选择（select+splitTurn）**：tail_turns=2默认，从最近turn倒序累加token估算，超预算时在turn内部二分找切分起点——"保留最近N轮"精确到token预算而非轮数 | ❌ | ❌ | 完全没有 | 压缩引擎核心算法，~60行纯函数可移植 |
| 2 | **prune三层触发**：normal（显式opt-in）/post-compaction（压缩后自动顺手折叠）/payload-limit——"压缩已使provider缓存失效，折叠旧工具输出零额外成本" | ❌ | ❌ | 完全没有 | 工具输出清零不删数据（part.state.time.compacted时间戳标记），PRUNE_PROTECT 40k保护最近+PRUNE_MINIMUM 20k才值得做+skill工具豁免 |
| 3 | **replay重放机制**：压缩时找最近一个"无进展"的user消息重放（progress检测=有finish/tool调用/非空text才算进展）；媒体附件在provider overflow后降级为`[Attached mime: filename]`文本；PromptQueue.retarget使重放对排队消息scope可见 | ❌ | ❌ | 完全没有 | "用户最后说的话不能被摘要吞掉"——压缩保真关键 |
| 4 | **auto-continue合成消息**：压缩成功后自动注入"Continue if you have next steps, or stop and ask for clarification"，metadata.compaction_continue=true标记（provider插件可区分人工/自动）+overflow场景附加"附件过大已移除"说明文案 | ❌ | ❌ | 完全没有 | 压缩后防空转/防呆滞，~20行 |
| 5 | **三级降级链**：单次压缩→KiloCompactionChunks分块压缩→超限ContextOverflowError显式stop（两种错误文案区分"replay历史太大"vs"剥离媒体后仍超限"） | ❌ | ❌ | 完全没有 | 压缩死循环的出口设计（轮8已记尝试上限，本轮补齐失败语义） |
| 6 | **SessionExport.compaction自包含导出**：输入快照（modelMessages/selectedContext/previousSummary/prompt/tailStartId）+输出（summary/durationMs/usage tokens）落盘——每次压缩可回放可调试 | ❌ | ❌ | 完全没有 | "压缩质量看不见"的解：压缩是黑盒最易劣化，导出快照即可diff回归 |
| 7 | **completedCompactions链式摘要**：历史中每对(compaction user, summary assistant)从可用历史隐藏，previousSummary传入下轮压缩prompt——多次压缩累积不丢主线 | ❌ | ❌ | 完全没有 | 摘要链设计~30行 |
| 8 | **插件三钩子**：experimental.session.compacting（注入context/替换prompt）/experimental.compaction.autocontinue（可禁用）/experimental.chat.messages.transform | ❌ | ❌ | 没有 | 压缩可被插件干预 |
| 9 | **压缩输入侧剥离**：stripMedia（去图片）+toolOutputMaxChars=2000（工具输出截2000字符）——喂给摘要LLM的输入本身先瘦身 | ❌ | ❌ | 没有 | 摘要调用省钱 |
| 10 | **compaction专用agent/model**：agents.get("compaction")可配独立便宜模型，缺省继承当前会话模型 | ❌ | ❌ | 没有 | 压缩不必用主模型 |

## 源码亮点

- **estimate=Token.estimate(JSON.stringify(modelMessages))**——字节级兜底估算与provider真实计数并用（与prompt.ts 1.25MB payload剪枝同哲学）。
- **splitTurn二分**：单个turn超剩余预算时，从turn内第2条消息起逐个试切点，找到第一个fit的Tail——精确到消息粒度的保留边界。
- **压缩消息是特殊assistant（mode:"compaction", summary:true, cost:0）**+user侧compaction part做锚点，重放时按parentID重建——压缩在消息模型里是一等公民，不是隐藏操作。
- **自动压缩与PromptQueue协同**：create()时retarget到新建compaction user消息，排队消息scope()自然隐身——压缩期间用户输入不丢不乱序。

## 可复用设计（OpenSoul cortex对照）

OpenSoul当前：hippo token_budget=记忆注入预算（非上下文prune），sessions compacted=0标志位，无压缩引擎。建议实现顺序：
1. **预算化select+splitTurn**（#1）——先有正确的切分算法
2. **摘要链+replay**（#3/#7）——压缩语义正确
3. **auto-continue+显式失败**（#4/#5）——闭环不呆滞
4. **prune post-compaction**（#2）——顺手优化
5. **压缩快照导出进trajectory**（#6）——可观测（用户极度重视可观测性，压缩黑盒必配快照）

与goose structured.rs 9段式JSON摘要（63-goose-source-supplement3.md）互补：goose解决"摘要长什么样"，kilocode解决"切哪里/失败怎么办/如何不丢用户最后的话"。两份合读=压缩子系统完整参照。
