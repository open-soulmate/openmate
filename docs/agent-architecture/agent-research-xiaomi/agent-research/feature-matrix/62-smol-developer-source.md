# smol-developer (#62, 12.2k★, smol-ai/developer) 功能研究（结论级）
> 研究方式：web_extract README级（仓库2023年形态，实质停止演化）。2026-09-16 深夜轮4（cron）

## 定位与状态
"Human-centric & Coherent Whole Program Synthesis"——2023年最早的一波"整个代码库一次生成"实验（与gpt-engineer同期）。仓库停留在早期形态，实质由smol.ai团队转向其他产品。**结论级覆盖，不深读源码**。

## 独特设计（仍有一项可参照）
| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|---|---|---|---|---|
| 整库生成（spec→prompts.md→先生成文件清单再逐文件生成+错误回喂loop） | - | 部分（ai_engine任务分解） | 低 | 已被aider/cursor/opencode增量编辑路线全面取代——**"整库一次性生成"被行业证伪，增量+diff是胜者** |
| 人机prompt共修loop（人把运行报错直接贴回prompt，像file GitHub issue；debugger.py读全库给修改建议） | 部分 | 部分 | 低 | 与aider lint回喂同源 |
| "engineering with prompts"（scaffolding prompt本身是迭代产物，非一次性写好） | - | - | - | 理念性遗产 |
| embeddable（作为库嵌入宿主app的"junior developer"） | - | - | - | 早于OpenHands SDK/software-agent-sdk的先声 |

## 行业教训
- 整库合成（whole-program synthesis）赛道2023年喧嚣后无一存活为主流——**增量编辑（diff/search-replace块）+lint回喂+git快照才是行业收敛点**（aider/opencode/claude-code三方已互证）。OpenSoul limb若做代码能力，直接走增量路线，勿回头做整库生成。
- smol-ai系列（developer/ai）最终价值沉淀为prompt工程社区资产而非产品——再次印证工具型项目的社区>代码。
