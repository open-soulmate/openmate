# OpenMate/OpenSoul 开发报告

## [2026-09-17 11:09] 输出侧护栏：Warp 20 API-key正则并入immune + LLM出网路径接线

**目标**：解决调研确认的P0差距——moderator"在位但没接线"：ContentModerator只有7个PII正则且只挂在/api/immune和/api/pipeline显式端点，LLM请求路径零防护，工具输出里的AWS key/API token会原样发给第三方provider（政企demo最容易翻车的点）。

**调研来源**：Warp secret_redaction crate（64-warp-source-supplement.md #1/#2/#4/#10，源码~/agent-research-src/warp-master/crates/secret_redaction/src/lib.rs 464行20正则）。SUMMARY.md第一阶段路线图第4项"输出侧安全：Warp 20正则并入immune+接线LLM请求路径（150行，立即可做）"。

**改动文件**：
- opensoul/src/immune/moderator.py
- opensoul/src/gland/router.py
- opensoul/tests/test_moderator.py（新增）

**改动内容**：
1. moderator.py：
   - PATTERNS新增17个API key/token正则（OpenAI/Anthropic/sk-通用/AWS Access ID/GitHub×5种/Slack App Token/Stripe/Google/Firebase/JWT/Fireworks/IPv6/MAC），与原有7个PII正则去重合并，共24个
   - 所有正则预编译存`_compiled`（调研#4：避免每次moderate重新compile）
   - 坏正则编译时跳过、其余照常武装（Warp"构造失败不换弹匣"fail-safe，调研#10）
   - `_redact`增加重叠区间合并（Warp merge_sorted_ranges模式，调研#9相关）：修复既有bug——OpenAI key同时命中sk-通用规则时按同一偏移替换两次会吃掉相邻文本；合并后取高风险类型
   - 新增`redact_messages(messages, min_risk)`：OpenAI风格消息列表批量脱敏，返回(新列表, 发现摘要)，摘要只含type/risk/label不含密钥原文（日志安全）
2. router.py：
   - `_call_chat`出网前调用redact_messages——Warp blocklist层做法：发给LLM的每个文本块先扫描脱敏，密钥不出机器
   - 懒加载单例+try/except fail-safe：脱敏模块故障不阻断LLM调用
   - `OUTBOUND_REDACT_MIN_RISK="critical"`：只拦API key/token/密码级，PII（手机号/邮箱）按部署需要降级开启

**验证结果**：
- tests/test_moderator.py 18 passed（各格式检出、脱敏后原文消失、输入消息不被修改、min_risk阈值、重叠区间不损坏尾部文本、坏正则不解除武装、findings摘要不含密钥原文）
- tests/test_immune.py 10 passed（live server集成）
- mock HTTP端到端验证：`_call_chat`发出的messages中key已替换为[REDACTED:openai_api_key]、尾部文本"then continue"完整、原messages列表未被修改
- 重启opensoul(:8090)后live API确认：/api/immune/health显示24 patterns；moderate("sk-...")返回risk=critical
- 既有tests/test_pipeline.py 4个upload超时为环境问题（外部embedding provider 30s ReadTimeout），stash对照确认与本改动无关（embed路径未触及）

**commit**：opensoul bca2b7e1
