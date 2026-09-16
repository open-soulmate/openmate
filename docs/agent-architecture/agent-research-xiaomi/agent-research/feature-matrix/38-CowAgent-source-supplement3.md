# CowAgent 第三补验：admin.py + registry.py + protocol/目录（轮7/11遗留清偿）

研究时间：2026-09-17 深夜轮12（cron）
源码方式：web_extract raw全文（admin.py 36.6K字符/registry.py 17.5K字符，本地缓存可read_file续读）+ protocol/目录页（commit message即规格书）。本地无clone。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **五文件人格体系**：AGENT.md(人格)/USER.md(用户事实)/RULE.md(规则)/MEMORY.md(记忆)/BOOTSTRAP.md(引导)——比nanobot三文件(SOUL/USER/MEMORY)多出RULE与BOOTSTRAP分离；**五文件=完整workspace身份**，每个Agent一个目录 | grep AGENT.md\|BOOTSTRAP.md\|RULE.md=0 | 无 | 完全没有 | OpenSoul persona散在配置里；五文件目录制与nanobot/.agents三方互证"文件即人格" |
| 2 | 🔴 **Agent克隆=只复制行为不复制知识**：CLONED_FILES=(AGENT/USER/RULE/BOOTSTRAP)，**MEMORY.md显式排除**（"是源Agent学到的关于用户的东西"）+.env/会话库/共享资产目录排除（防凭证分叉/防对话外泄/防技能库N份漂移）——克隆语义注释即规格 | 没有 | 没有 | 完全没有 | "复制人格不复制记忆"是多agent创建的正确默认；OpenSoul若做多persona直接抄此名单 |
| 3 | 🔴 **乐观并发双层revision**：core文件sha256 revision（写回时校验，不一致抛StaleAgentFileError"refresh before saving"）+**roster scoped revision**（只hash agent拥有的键——其他设置页的保存不使Agents页失效，但两个并发roster编辑仍冲突） | 没有 | 没有（grep optimistic\|If-Match=0） | 完全没有 | 多控制台并发编辑防丢失更新；scoped revision"按拥有的键算冲突域"是通用范式 |
| 4 | **配置键所有权围栏**：_commit对每个update键检查"in ROSTER_KEYS"，不是自己的键直接拒写（"belongs to another console page and is never written from here"） | 没有 | 没有 | 完全没有 | 多模块共享一个config时的写隔离，~10行 |
| 5 | **共享资产按目录存在即退出**：有skills/或knowledge/目录=退出共享用自有，**没有=用共享**；_bootstrap_workspace故意不建这两个目录（"建空目录会切断新Agent与全部共享技能"）——opt-out by presence语义 | 没有 | 没有 | 完全没有 | 与privateGPT skills只读卷/goose互证的"目录即策略"另一形态 |
| 6 | **_seed_name写名进AGENT.md**：正则替换模板占位符（只替换占位，已有名字的克隆人格不动）；注释："认不出自己名字的Agent被点名时不应答" | 没有 | 没有 | 完全没有 | 20行小件但直接影响多agent可用性 |
| 7 | **USER.md=操作者事实随克隆携带**：新Agent（无模板克隆时）从默认workspace复制USER.md——"USER.md是跑实例的人的事实，不是persona的" | 没有 | 没有 | 完全没有 | |
| 8 | **AgentProfile三态资产选择**：skills/knowledge字段None=全用共享，[]=有意为空，[...]=挑选——**absent与empty语义分离**（注释即教材："empty tuple is a real answer that differs from None"） | 没有 | 没有 | 完全没有 | 配置schema通用原则：缺失≠空 |
| 9 | **workspace独占校验**：两个Agent禁止共享同一workspace（registry构造时抛错）+default agent继承instance root（兼容单agent存量安装）+其余落agents/<id>/ | 没有 | 没有 | 完全没有 | |
| 10 | 🔴 **按部署形态分级的错误策略**：COW_DESKTOP=1时坏agents配置→**回落default单agent保启动**（"桌面用户没有UI就修不了配置"）；源码部署→照常炸（开发者立刻看到）——同一个错误两种处置 | 没有 | 没有 | 完全没有 | "产品保可用、开发保诚实"分级策略直接可抄OpenSoul config加载 |
| 11 | **registry按config签名缓存**：(team.stamp, workspace)签名变了才重建+set_agent_registry可pin（admin变更/测试用）——热路径解析workspace但配置可变的正确缓存 | 没有 | 没有 | 完全没有 | |
| 12 | 🔴 **chat fallback有序链**（protocol/agent_stream.py，commit即规格）：单备胎→**有序链[{provider,model}]，走完环绕第二遍**（"瞬时限流已恢复不该废掉整个turn"）；每link只给一次尝试（防长链睡过web SSE idle超时）；链耗尽时报错**列出所有试过的模型**；限流有备胎立即切换、没备胎干等 | 没有 | grep fallback_chain\|max_switches=0（唯一命中=插件下载无关） | 完全没有 | OpenSoul cortex模型调用失败处理直接照此链式化；68个测试覆盖迁移/走链/限流快路 |
| 13 | **文件就地编辑+mtime乐观锁**（protocol/artifact.py）：预览面板加编辑器（html/md/csv/code/text五类）；**保存按mtime锁，agent中途重写→冲突让用户裁决而非静默clobber**；后端独立复核（拒不可编辑类型/超大/非UTF-8——"有损往返会不可逆毁掉原始字节"，不信客户端声明）；所有拆除编辑器的路径（关面板/换文件/换会话/新对话/重绑项目）都先结算未保存内容 | 没有 | 没有 | 完全没有 | 与warp was_edited_by_user互证"agent-用户并发编辑"问题升两方 |
| 14 | **protocol/独立目录**：agent_stream/cancel/context/message_utils/models/result/steer/task/artifact——**协议层与实现层分离**（数据结构+流转协议独立于agent引擎） | 部分 | 部分 | 部分有 | OpenSoul可参照：把cortex/hippo等的消息与结果协议抽到protocol/ |
| 15 | /compact与/clear统一上下文管理（message_utils.py）；cancel.py用户取消in-flight run；steer.py active-turn steering | 没有 | 没有 | 完全没有 | steer与goose ops_steer/LibreChat/CowAgent/Khoj四方互证已定案 |

## 源码亮点
- admin.py注释质量全库顶级：CLONED_FILES排除理由、_bootstrap_workspace"故意不建目录"、_seed_name"认不出名字就不应答"、write_core_file防有损往返——每处非常规设计都有为什么。
- registry.py的COW_DESKTOP分级容错是"面向产品的错误策略"少见样本。
- 写文件一律mkstemp+fsync+os.replace原子替换+失败清理残文件。
- utf-8-sig容忍BOM（Windows记事本/PowerShell编辑配置的现实坑，注释点名场景）。

## 可复用设计
1. 五文件人格目录 + CLONED_FILES克隆名单（复制行为不复制知识）≈OpenSoul persona模块的完整设计。
2. scoped revision + 键所有权围栏 ≈50行，多UI并发编辑防丢失更新。
3. fallback链：[{provider,model}]+环绕+一次尝试+报错列全部≈100行，cortex直接可抄。
4. COW_DESKTOP分级错误策略一行env判断。
