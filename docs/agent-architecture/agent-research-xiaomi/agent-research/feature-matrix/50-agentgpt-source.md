# AgentGPT (#50, 36.3k★, reworkd/AgentGPT) 功能研究（结论级）
> 研究方式：web_extract目录级+raw关键文件（taskStore.ts/stream-utils.ts/README）。2026-09-16 深夜轮4（cron）

## ⚠️ 仓库状态：2026-01-28已归档（archived）
公司pivot（reworkd.ai转向Sageman），代码冻结，最后有效agent开发2023年。**研究价值与gpt-pilot同级：架构遗产已被覆盖**。输出结论级笔记，不做深读。

## 遗产盘点（对OpenMate/OpenSoul有参照价值的仅3项）
| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|---|---|---|---|---|
| 浏览器内自主goal agent（命名agent→定目标→任务列表UI实时更新→自动执行） | 部分（聊天UI有任务展示） | 部分（cortex循环） | 低 | 2023年形态，现被OpenHands/AgentScope等覆盖 |
| SSE流式中断（stream-utils.ts shouldClose()回调reader.cancel()早期断流） | ✅已有 | ✅已有 | 无 | 双方均已实现 |
| 任务store四态（taskStore：add/update/delete+EXECUTING/COMPLETED） | ✅ | 部分 | 低 | 无新意 |

## 行业教训（比功能本身有价值）
1. **纯前端agent loop的天花板**：AgentGPT把agent循环放在Next.js客户端+FastAPI只做工具代理（AWS Lambda/Pinecone/tokenizer），架构上无法做服务端记忆/长任务/安全——两年内被服务端harness路线（OpenHands/claude-code）淘汰。**印证OpenMate(前端)+OpenSoul(后端)分离架构方向正确**。
2. **36k星≠存活**：与Continue停运（36k）、gpt-pilot被废弃（29k）同列——**浏览器demo型agent产品没有护城河**；OpenMate定位应是本地资产+私有部署，不做SaaS。
3. 研究归档：本条目从"待研究"清单销账，不再回访。
