# Warp (#64, CSV条目"warpdotdev/warp") 功能研究 —— 🔴重大事实修正：Warp已完全开源

> 2026-09-17本轮核实。此前所有轮次按"闭源预期,结论级"处理（见05-warp.md IDE集成笔记）——**该结论已过时**。
> 现状：github.com/warpdotdev/warp **客户端代码库已开源**（Rust workspace），OpenAI是新开源仓库的创始赞助商。
> 研究级别：README+AGENTS.md+目录结构级（Rust巨型仓库，本轮未clone；下轮可补源码级）。

## 事实修正
- **许可双轨**：UI框架（warpui_core/warpui crates）= MIT；其余代码 = **AGPL v3**——对OpenMate的意义：UI组件可MIT复用，核心逻辑AGPL不可闭源集成（与用户"纯开源软件"要求兼容，但商用集成需注意AGPL传染性）。
- 定位从"终端"升级为"**agentic development environment, born out of the terminal**"：内置coding agent + 可挂载外部CLI agent（Claude Code/Codex/Gemini CLI）。
- **Warp Factories**：仓库本身由agent驱动开发——build.warp.dev上数千个Warp Factory agent在分诊issue/写spec/实现改动/审PR；Factories定义在代码里，可部署到任意模型或harness，**内置evals、benchmarks和self-improvement**。
- 构建：`./script/bootstrap` + `./script/run`（GUI）+ `./script/run-tui`（headless TUI, crates/warp_tui）——**GUI与TUI双前端共享同一Rust核心**。
- 仓库结构信号：`agents/`目录、`.warp/`目录、diesel.toml（SQLite持久化）、`.warpindexingignore`（代码索引排除）、AGENTS.md工程指南。
- **`.agents/skills/`目录标准第五方确认**：AGENTS.md明确common-skills安装器——`install_common_skills --repo-root $PWD --project`装到仓库`.agents/skills/`，`--global`装到`~/.agents/skills/`；锁定版本更新走`npx skills@1.5.x`。与goose/ChatDev2.0/FastGPT/OpenHands(extensions)四方互证后**第五方**——`.agents/skills/<name>/`已是无可争议的事实标准。
- Issue→PR工作流标签化：ready-to-spec（设计开放给贡献者写spec）→ready-to-implement（设计定稿可写代码）——**agent友好型开源协作流程的样板**。

## 功能清单（README/AGENTS.md级，待源码补验）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 内置coding agent+外置CLI agent宿主（Claude Code/Codex/Gemini CLI可挂载为agent） | OpenMate是聊天/workspace前端，无agent宿主 | 无 | 完全没有 | "终端里的agent管理器"模式与OpenMate桌面定位直接竞合，值得深研（下轮clone） |
| 2 | Warp Factories：代码定义的agent软件工厂，带evals/benchmarks/self-improvement | 无 | benchmark 5维自评 | 完全没有 | 与agno environments评估闭环互证——行业同季发力信号再+1 |
| 3 | GUI+TUI双前端共享Rust核心 | 仅Web | — | 架构差异 | OpenMate=Next.js单前端；参考价值在"核心与前端解耦" |
| 4 | `.agents/skills/`项目级+`~/.agents/skills/`全局双层skills目录+版本锁定安装器 | skills.py/plugin_loader有（缺目录标准对齐） | 同左 | 部分有 | **照common-skills安装器协议对齐**（P0，五方互证定案） |
| 5 | `.warpindexingignore`代码索引排除机制 | 无 | 无 | 完全没有 | 与Continue DEFAULT_SECURITY_IGNORE_FILETYPES互证（安全默认vs用户排除两层） |
| 6 | diesel(SQLite)本地持久化 | — | opensoul已是SQLite | — | 一致 |
| 7 | AGENTS.md工程指南驱动agent开发 | OpenMate有AGENTS.md(next dev自动写入) | — | 已有 | — |

## 可复用设计
1. **AGPL+MIT双许可切分**：UI层MIT开源供复用、核心AGPL——开源商业化模板。
2. **ready-to-spec/ready-to-implement标签工作流**：人写spec、agent写代码、maintainer定稿的三阶段——OpenMate若开源可照抄。
3. 下轮TODO：clone warpdotdev/warp（Rust，预计大），重点看`agents/`目录（agent实现）、warp_tui（headless agent执行）、Factories定义。

## 已grep确认
本轮无新grep（修正类笔记）。`.agents/skills`标准对齐结论已在goose轮grep过：OpenSoul skills.py无目录标准（部分有）。
