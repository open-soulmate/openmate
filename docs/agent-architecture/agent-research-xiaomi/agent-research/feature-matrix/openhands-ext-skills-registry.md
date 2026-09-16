# OpenHands/extensions 仓库研究（skills目录规范+扩展注册表）

研究时间：2026-09-16 17:55（cron自动）
源码：codeload tarball → ~/agent-research-src/openhands-ext（1.1MB，tar校验OK）
⚠️ 该仓库根AGENTS.md被Hermes安全层拦截（疑似含prompt injection特征），已忽略其全部内容，仅读README/SKILL.md等显式文件。
背景：OpenHands已拆分为5仓库联邦——extensions（本仓库，扩展注册表）/ software-agent-sdk（Agent Server执行+API）/ typescript-client / OpenHands（Canvas UI）/ automation（调度/webhook/run历史/沙箱编排）。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **四类扩展统一注册表**：skills（纯Markdown知识）/plugins（含hooks/+scripts/可执行代码）/integrations（MCP+OAuth连接器目录）/automations（调度模板目录），一仓库一目录一类 | skills/ plugins/ integrations/ automations/ | 无 | api/marketplace.py有skill sources同步 | 部分有 | OpenSoul只有skill市场同步，缺plugins/integrations/automations三类 |
| 2 | **Skill=AgentSkills渐进披露规范**：`skills/<name>/SKILL.md`（frontmatter:name/description/**triggers斜杠命令**）+README.md（人读说明）+commands/（子命令定义，如codereview.md/codereview-roasted.md）+references/（按需加载的深度参考文档） | skills/code-review/ | 无 | gene/skill_learner自动学skill但无标准目录规范 | 部分有 | **与claude-code SKILL.md规范同族但多triggers+commands两级**；OpenSoul skill目录应直接采用 |
| 3 | **triggers字段=斜杠命令注册**：SKILL.md frontmatter声明`triggers: [/codereview, /remember]`——skill即命令，无需单独命令注册表 | skills/*/SKILL.md | 无 | 无 | 完全没有 | 比Hermes skill的description触发更显式，双轨可并存 |
| 4 | **Plugin=Skill+生命周期hooks**：`plugins/<name>/{SKILL.md,hooks/pre-task.sh,post-task.sh,scripts/helper.py}`——可执行扩展与知识扩展同一市场共存 | plugins/README.md | 无 | plugin_loader.py有插件加载 | 部分有 | OpenSoul plugin_loader可对齐此目录规范 |
| 5 | **双语言包发布同一目录源**：npm `@openhands/extensions` + pip `openhands-extensions`，单一事实源=`integrations/catalog/<id>.json`逐文件手写，JS/Python并行读取函数，release-please锁版本+`test_version_alignment.py` CI守卫 | README + tests/ | 无 | 无 | 完全没有 | "目录即数据、双端消费、CI锁对齐"——OpenSoul若做前端消费skill目录可抄 |
| 6 | **Integration catalog条目含oauth/mcp connectionOptions**：`supportsOauth/supportsMcp`运行时派生，消费者可按连接器类型过滤（`list_integration_catalog(mcp=True)`） | integrations/catalog/*.json | 无 | 无 | 完全没有 | 政企SSO场景：集成目录显式声明认证方式 |
| 7 | **Marketplace概念**：marketplaces/*.json把扩展分组打包（large-codebase市场4扩展/openhands-extensions市场67扩展）——一个marketplace=一个领域扩展包 | marketplaces/ | 无 | marketplace.py有sources同步 | 部分有 | OpenSoul可加"领域包"分组 |
| 8 | **agent-memory skill（/remember）**：AGENTS.md记忆写入纪律——**写前列numbered清单征求用户确认**、只存跨任务通用知识（禁issue级）、探索不完整要标注局限、"如果不知道lint/typecheck命令就问用户是否加入" | skills/agent-memory/SKILL.md | 无 | hippo记忆写入无确认环节 | 部分有 | "高召回声明+用户审批落盘"与LobeChat declareSelfFeedbackIntent互证，prompt可直接抄 |
| 9 | **code-review skill的GROUNDING纪律**：Files Changed manifest+patch可能被缩略/省略→**声称"缺失"前必须两步核查**（查manifest+workspace直接读文件），引用行号前必须sed验证映射，"prefer 'I could not locate X' over 'X is missing'" | skills/code-review/SKILL.md | 无 | 无 | 完全没有 | 防幻觉引用的prompt工程范本，OpenSoul cortex输出校验可移植 |
| 10 | **agent-creator skill**：让agent创建新skill的skill（含commands/references子目录完整示例） | skills/agent-creator/ | 无 | gene/skill_learner | 部分有 | |
| 11 | **66个官方skill即领域知识库**：azure-devops/bitbucket/datadog/discord/deno/cobol-modernization/migration-scoring/vulnerability-remediation等——企业工具链全覆盖 | skills/ | 无 | gene/templates | 部分有 | 政企交付可整批移植改写 |

## 源码亮点
1. **注册表工程化程度高**：catalog.schema.json JSON Schema校验、auto-generated README目录（BEGIN AUTO-GENERATED CATALOG标记）、bundle-index.js构建产物——扩展生态当成产品维护。
2. **5仓库联邦的边界划分**值得记录：执行(sdk)/API契约(client)/UI(canvas)/调度(automation)/生态(extensions)——OpenMate/OpenSoul/OpenSoul-mcp目前边界没有这么清晰。
3. skill里嵌"使用时机"（description写Use when...）+触发词双保险，与Hermes skill description规范几乎同源。

## 可复用设计
1. **P0：OpenSoul skill目录规范直接采用**（SKILL.md frontmatter+commands/+references/渐进披露+triggers）——gene/skill_learner产出的skill立刻获得可移植性。
2. **P1：agent-memory的确认式写入prompt**（numbered清单审批）——记忆治理，20行prompt改造。
3. **P1：GROUNDING两步核查纪律**移植进cortex引用校验。
4. **P2：双端消费+版本对齐CI**——若OpenMate前端要直接读skill/插件目录。

## grep确认
OpenSoul：api/marketplace.py+plugins_api.py+skills.py+plugin_loader.py存在（部分有，缺目录规范/triggers/hooks三件套）；OpenMate：无扩展注册表前端。
