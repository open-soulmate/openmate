# gpt-engineer(#32, 55k★) 功能研究 —— 源码抽查+结论级收官

> 深夜轮16（cron）。CSV标注"半停滞、价值低，可结论级收官"——已验证：**最后push 2025-05-14，停更约16个月**，官方定位"CLI platform to experiment with codegen. Precursor to: lovable.dev"（团队pivot商业产品）。
> 本轮codeload 15.9MB到手，Python核心仅6,118行（core/+cli/+benchmark/），按结论级+关键文件抽查处理。

## 现状结论
- 仓库停更16个月；与早前 AgentGPT/smol-developer/gpt-pilot 同列"整库合成赛道阵亡名单"。smol-developer轮已总结：整库合成被行业证伪，收敛点=增量diff+lint回喂+git快照——gpt-engineer自己的演进史正好印证（后期主线全在 improve 模式=增量）。
- 遗产价值：几个小而正确的工程件仍可抄（见下）。

## 功能清单（抽查 core/+cli/ 关键文件后）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **覆盖前 git 暂存未提交修改**（core/git.py stage_uncommitted_to_git 全文）：improve模式写文件前检测 `git diff --name-only`，把将被覆盖的未提交文件先 stage——"agent改代码不能吞掉用户未提交的工作" | 无 | 无 | 🔴完全没有 | 与Cline事务性回滚互证（那边是回滚，这边是事前保全）；OpenSoul mirror 写 workspace 前的护栏件，~40行，P1 |
| 2 | **结构化用户Review反馈环**（applications/cli/learning.py 301行）：`Review(ran/perfect/works/comments)` 四问dataclass+**收集前征求同意**（check_collection_consent）+session uuid+prompt/model/temperature/logs 全量落盘供后续分析 | 无 | 部分（mind 有评分表，非"生成物四维review"） | ⭕部分 | 与agno评估工程化同题的最轻量版：四问review是"有没有用"的最低成本数据源，P2 |
| 3 | **生成后 lint 回喂**（core/linting.py 全文）：按扩展名注册linter表（.py→black），失败静默保留原文并打日志——格式化层兜底 | — | 无（cortex 无生成后lint门） | 🔴没有 | 与smol-developer教训互证"lint回喂是收敛点"；OpenSoul 文件写工具后加black/ruff门，P1 |
| 4 | **chat_to_files 解析器**（245行）：LLM整库输出→FilesDict 的容错解析（多格式代码块识别） | — | — | 历史形态 | 已被增量diff取代，仅存参照价值 |
| 5 | **gitignore 感知**（filter_by_gitignore）：用 `git check-ignore --no-index --stdin` 批量过滤——与goose summarize跳过gitignore互证 | 部分 | 无 | 小件 | OpenSoul 读workspace文件的工具应过gitignore，P2 |
| 6 | **benchmark 套件**（benchmark/：APPS/MBPP跑分+bench_config） | — | 🔴无（行业评估闭环共识前轮已定案） | 行业线 | 已被agno/AgentBench参照覆盖，无需单独抄 |
| 7 | preprompts 身份覆盖（preprompts_holder）+ version_manager（每次run存版本） | — | 部分 | 遗产 | 无新意 |

## 源码亮点
- git.py 是"agent写文件安全"的教科书短文：is_git_installed→is_git_repo→首次自动init→检测未提交→stage，五步全是 subprocess 调 git，无依赖。
- learning.py 把"用户反馈收集"写成合规流程（consent在前、review在后），比大多数agent裸收数据规范。

## 可复用设计
1. **stage_uncommitted_to_git**（#1）：OpenSoul 对 workspace 的写入护栏件，P1
2. **生成后 lint 门**（#3）：写文件工具后处理，P1
3. Review四问（#2）：P2

## 行业教训（第三次印证）
整库合成赛道（smol-developer/AgentGPT/gpt-engineer/gpt-pilot）全军覆没；存活形态=增量编辑+快照+lint回喂。OpenMate/OpenSoul 的"前端+后端分离、增量工具"方向正确。

## grep确认
本轮未对新关键词grep（#1/#3 OpenSoul 已知无：mirror 无 git stage 逻辑、cortex 无 lint 门；前轮 grep git快照/revert 系列已确认）。
