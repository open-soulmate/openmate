# Warp 第三次补验：secret_redaction crate + isolation_platform + ai/index增量索引

研究时间：2026-09-17 深夜轮8（cron）
源码：~/agent-research-src/warp3（部分解压）+ 本轮从warp3.tar.gz补解压crates/secret_redaction、crates/isolation_platform、app/src/ai/blocklist/block/secret_redaction.rs
前序：64-warp-source.md（文档级）、64-warp-source-deep.md（12项：specs/skills锁/diff_validation/编排审批等）。本文件即supplement（此前无supplement文件）
本轮专攻：crates/secret_redaction/src/lib.rs（464行全文）、crates/isolation_platform/src/lib.rs（218行全文）、crates/ai/src/index/（mod.rs+file_outline 731行+full_source_code_embedding/sync_client 600行）

## 功能清单

| # | 功能 | 源码依据 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **出网前秘密信息脱敏（blocklist层）** | app/src/ai/blocklist/block/secret_redaction.rs：AI blocklist（发给LLM的消息块）逐块扫描脱敏；另有telemetry侧secret_redaction.rs独立一份 | 没有 | immune/moderator.py有redact但**只挂在/api/immune和/api/pipeline显式端点，不在LLM请求路径**（grep确认） | 完全没有（在位但没接线） | P0。OpenSoul已有moderator，缺的是接到cortex每次LLM调用前+工具结果进上下文前 |
| 2 | **20个内置API key正则** | secret_redaction/lib.rs regexes模块：IPv4/IPv6/电话/MAC/Google/AWS/Slack/GitHub×5种/Stripe/Firebase/JWT/OpenAI/Anthropic/Generic-sk/Fireworks/Warp——每个带name | — | moderator只有7个PII类（CN手机号/身份证/邮箱/IP/银行卡/password=/URL带凭证），**零API key格式** | 部分有 | 立即可抄：把20个正则并进moderator.PATTERNS（注意OpenSoul已有IP/电话/邮箱，去重合并） |
| 3 | **企业/用户双层规则** | SecretLevel::Enterprise/User+priority()：enterprise正则先注册（pattern_id<count判定层级），用户自定义去重后追加；重叠区间merge时保高优先级 | — | moderator支持custom_patterns但无分层 | 部分有 | 政企场景：企业合规规则不可被用户配置稀释——两层dict+优先级，~30行 |
| 4 | **多模式DFA一次扫描** | regex_automata::meta::Regex::new_many全部正则编译成一个引擎+RegexDFAs——20个模式单次遍历，非逐正则循环 | — | moderator逐pattern循环re.search | 部分有（Python无DFA库，但可预编译re+单次遍历重构） | Python版：所有pattern预编译存列表，一次finditer轮询；量小不急 |
| 5 | **隔离平台探测+workload token签发** | isolation_platform/lib.rs：detect()探测Docker/DockerSandbox/K8s/Namespace四型（env显式>Namespace>K8s>Docker启发式，OnceLock进程级memoize）；issue_workload_token按平台签发身份token+平台无关fallback(WARP_WORKLOAD_TOKEN) | 没有 | mirror/sandbox.py有容器执行，无"我在哪种隔离里"自探测 | 完全没有 | agent自报运行环境（本地/容器/K8s）→权限策略联动（容器内可放宽）；detect逻辑30行可抄 |
| 6 | **Merkle树增量嵌入同步** | full_source_code_embedding/sync_client.rs 600行：仓库内容hash建Merkle树→只对变化fragment重算嵌入→SyncQueue三型任务（GenerateEmbeddings/UpdateIntermediateNodes/SyncMerkleTree）+500节点/4MB批量上限+600请求/分限流 | 没有 | 没有（merkle零命中） | 完全没有 | 代码库索引的增量更新标准解（与aider SQLite缓存互补）；OpenSoul知识库文件变更检测可用同型 |
| 7 | **tree-sitter文件outline** | file_outline/731行：全仓符号提取（Outline/Symbol）+gitignore尊重+to_file_symbols(partial_path_segments)按路径片段过滤输出——"repo map"的Warp实现 | 没有 | 没有（tree_sitter零命中，轮5已确认） | 完全没有 | 与aider RepoMap（PageRank）二选一或互补：outline=全量符号表，RepoMap=重要性排序注入 |
| 8 | **索引线程池限流** | mod.rs native：rayon线池num_threads=(available_parallelism/2).clamp(1,2)——索引最多吃一半核且绝对≤2线程 | — | — | 没有（工程细节） | 用户关心资源占用：任何后台索引/嵌入任务照抄"≤2线程"上限 |
| 9 | **字节→字符区间映射** | find_secrets_in_text：byte_to_char_index表把regex字节区间翻成字符区间（中文场景必须），输出StringRange双区间 | — | moderator用re.sub无区间概念 | 部分有 | 需要"脱敏位置高亮"（OpenMate前端标红）时必须有字符区间 |
| 10 | **编译失败fail-safe** | set_user_and_enterprise_secret_regexes：新正则编译失败→保留旧正则继续工作（"构造失败不换弹匣"） | — | — | 没有（工程细节） | 热更新规则库的正确姿势 |

## 源码亮点

- **secret_redaction是独立crate被两个消费方复用**（blocklist出网前+telemetry上报前）——"脱敏"是一等基础设施不是功能附加
- 正则全部注明来源URL（stackoverflow/regex101/GitHub blog）——规则库可审计可溯源，政企交付加分
- 注释明示"所有正则必须同步加到服务端logic/ai/util.go"——**客户端服务端双端脱敏一致性靠注释+code review维持**，教训可反推：OpenSoul脱敏要单点定义
- detect()的OnceLock+env显式优先级设计："服务端告诉我>我探测到>没有"——自探测逻辑的可信度分层
- isolation_platform错误类型齐全（CommandUnavailable/CommandFailed带ExitStatus）——基础设施层错误处理范本

## 可复用设计

1. **20个API key正则**（#2）：立即并入OpenSoul immune/moderator.py PATTERNS——当前moderator对"工具输出里的AWS key"零防护，这是政企demo最容易翻车的点
2. **脱敏接线**（#1）：moderator已在，缺接线——cortex每次LLM请求前+工具结果写入context前各调一次，工程量小价值大
3. **workload token自探测**（#5）：OpenSoul部署形态感知（本地Docker/客户K8s）→vital运维面板显示
4. **Merkle增量索引**（#6）：OpenSoul知识库watcher的变更检测升级方向
