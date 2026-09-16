# Lagent（InternLM, #85, 6k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/lagent（1.2MB，源码级深读）

学术轻量框架（PyTorch风格"层"类比），但有4个可直接借鉴的工程点。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. 持久IPython执行进程池（独立Process+in/out Queue，per-session InteractiveShell，timeout_decorator超时，FileLock防core损坏，reset按session） | 无 | 无（execute_code一次性） | 完全没有 | 会话级数据科学场景（变量跨cell存活）刚需；~220行可整体移植（ipython_manager.py） |
| 2. MCP客户端内置令牌桶限流（TokenBucket同步/FairAsyncTokenBucket公平排队+drain_waiters） | 无 | 无 | 完全没有 | MCP server自我保护，Fair版防饿死；~120行纯Python |
| 3. 多搜索源统一抽象（DuckDuckGo/Bing/Searxng/Brave/Google-serper/**TencentSearch**） | 无 | web_search单一后端 | 部分有 | BaseSearch+black_list+topk统一接口；腾讯搜索源对国内政企是差异化 |
| 4. pydantic模型→JSON格式few-shot模板（JSONParser递归提取Field注释生成带注释的示例JSON） | 无 | 无 | 完全没有 | 结构化输出提示词自动生成，比手写schema描述可靠 |
| 5. Hook=PyTorch风格4钩子+RemovableHandle可摘除句柄 | 无 | 无（cortex单体） | 完全没有 | before/after_agent+before/after_action；句柄模式比事件表灵活 |
| 6. ActionExecutor/AsyncActionExecutor双轨（dict式工具注册__setitem__/__delitem__） | 无 | limb/executor | 部分有 | 工具运行时动态增删 |
| 7. AgentMessage消息寻址（sender/receiver/stream_state字段） | 无 | multi_agent信箱模型 | 部分有 | 与Langroid @recipient互证（第4方） |
| 8. memory在__call__层自动进出（pre_hooks→add_memory→forward→add_memory→post_hooks） | 无 | 无 | 完全没有 | 记忆写入与推理分离的最小正确架构 |
| 9. Aggregator可插拔聚合器（DefaultAggregator/ToolAggregator，用户可注入few-shot） | 无 | 无 | 完全没有 | 上下文组装策略化 |
| 10. ray_serve/http_serve双部署（agent一键成服务） | 无 | FastAPI手写 | 部分有 | 分布式agent服务化 |
| 11. AgentMessage.state_dict()全状态序列化（可json.dump会话） | 无 | 无 | 完全没有 | 会话导出/调试 |
| 12. WebBrowser动作980行（Playwright+多搜索源+网页访问） | browser_exec | browser工具 | 已有 | 无差距 |

## 源码亮点
- **IPythonProcess.exec**：stdout重定向捕获+ANSI高亮正则剥离+`Out[N]:`前缀清理+TimeoutError统一文案——输出清洗三件套可抄进OpenSoul execute_code
- **FairAsyncTokenBucket**：容量与速率分离+Condition变量drain_waiters公平唤醒，MCP多客户端场景的标准答案
- **InternLMActionProcessor**：把纯字符串action自动封装成工具调用（兼容不支持function-calling的模型）——小模型适配的务实做法

## 可复用设计
1. ipython_manager.py（220行）→ OpenSoul mirror/ipython_pool.py：会话级持久内核
2. TokenBucket三实现 → OpenSoul mcp/client限流层
3. JSONParser的pydantic→注释JSON模板 → OpenSoul cortex结构化输出提示词生成器
4. Hook+RemovableHandle → cortex middleware化时的hook API设计参照
