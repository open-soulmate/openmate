# Open Interpreter (#29, 58k★) 功能研究

源码：`~/agent-research-src/open-interpreter`
研究时间：2026-09-17 03:20（源码级深读第 27 个）

## ⚠️ 首要发现：仓库已被彻底重写

**Open Interpreter 的 Python `interpreter` 包已从仓库中消失。** 整个仓库现在是
**OpenAI Codex（codex-rs）的 Rust 分发 fork**，127 个 crate，含 `FORK_BRANDING.md`。

- 新定位：**"A coding agent optimized for low-cost models"**（为低成本模型优化的编码 agent）
- 主打：在 Rust 里重实现了 provider 推荐的 **Kimi Code harness**，让 Kimi K3 达到最大性能，
  界面保持 Codex-like
- 嵌入的上游 Codex 版本：`OPEN_INTERPRETER_CODEX_COMPATIBILITY_VERSION = "0.154.0"`
- 安装：`curl -fsSL https://www.openinterpreter.com/install | sh`，命令名 `interpreter`

> 这是本次 100 agent 调研中**最重大的行业信号之一**：一个 58k★、5 年历史的 Python agent 项目，
> 完全放弃 Python 代码库，转而 fork Rust 的 Codex。与 #11 openai/codex 的研究结论互相印证——
> **Rust harness + 低成本模型调优**正在成为终端 coding agent 的收敛方向。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|------|------|------|------|
| 1 | **分发品牌机制**（`codex-rs/product-info/src/lib.rs`）：`enum Product { Codex, OpenInterpreter }` + `Product::current()` 按 env var / argv0 / 安装路径判定身份；所有用户可见文案、URL、安装命令、文档链接全部从该模块取，**禁止全局替换 codex 字符串** | 无 | 无（OpenSoul 无多品牌分发概念） | **完全没有** | **P1**。对用户极有价值：同一套 OpenSoul 内核可分发为"东华版/客户版/开源版"，branding 集中在一个模块。设计纪律：身份**绝不**依赖可执行文件名，只依赖打包时写入的标记 |
| 2 | **嵌入版本与产品版本分离**：产品自身版本号 ≠ 内嵌的上游兼容版本号，后端兼容性检查用后者 | 无 | 无 | 完全没有 | P2。fork/复用上游代码时必备 |
| 3 | **Agent Roles 目录**（`codex-rs/agent-roles/`）：递归扫描目录下所有 `.toml` 作为角色定义；每个角色 = `name` + `description`（spawn 工具引导用）+ **`nickname_candidates`**（给生成的子 agent 起名的候选池）+ `#[serde(flatten)] config`（**角色本身就是一层 ConfigToml 配置覆盖**） | 无 | 部分（gene/templates.py 有模板但非 TOML 配置层） | **部分有** | **P0**。"角色 = 配置层"的建模极优雅：子 agent 不是新代码路径，只是配置叠加。OpenSoul 落 `gene/roles/`，直接复用现有 config 层叠机制 |
| 4 | **nickname_candidates**：为自动 spawn 的子 agent 提供候选昵称，避免 "agent-1/agent-2" | 无 | 无 | 完全没有 | 低。低成本高体验 |
| 5 | **Connectors 目录与工具策略**（`codex-rs/connectors/`）：第三方 app 目录（`directory_cache` + `metadata_store` + `snapshot`）+ **`AppToolPolicyEvaluator`**（按 app 维度评估工具策略：是否启用/可用范围）+ `filter` / `merge` / `runtime_projection` | 无 | 部分（api/marketplace.py 有 skill sources 同步） | **部分有** | P1。OpenSoul marketplace 升级方向：从"skill 同步"到"第三方 app 目录 + 逐 app 工具策略评估" |
| 6 | **App branding / review 元数据**（`app_info.rs`）：`AppBranding` + `AppReview` + `AppScreenshot` + `AppMetadata` — 工具市场里每个 app 有品牌、评价、截图 | 无 | 无 | 完全没有 | P2。OpenMate 工具市场 UI 需要 |
| 7 | **cloud-tasks 独立 crate**：云端任务提交 + `env_detect`（环境探测）+ **`scrollable_diff`**（可滚动 diff 组件，带测试） | 无 | 无 | 完全没有 | P2 |
| 8 | **collaboration-mode-templates**：协作模式模板 | 无 | 无 | 完全没有 | P2 |
| 9 | **chat-wire-compat**：聊天协议线上兼容层 | 无 | 无 | 完全没有 | P2 |
| 10 | **code-mode 三件套**（`code-mode` / `code-mode-host` / `code-mode-protocol` / `code-mode-runtime`）：受限代码执行 | 无 | 无 | 完全没有 | 已在 #04 opencode 轮记录，Codex 同源 |
| 11 | **agent-graph-store**：父子线程拓扑 | 无 | 无 | 完全没有 | 已在 #11 codex 轮记录 |
| 12 | **execpolicy（+ execpolicy-legacy 双版本共存）**：Starlark 命令策略引擎 | 无 | 无 | 完全没有 | 已在 #11 codex 轮记录。注意**新旧双版本并存 + 迁移期**的做法 |
| 13 | **attachment-store**：附件内容寻址存储 | 无 | 部分（vein 有内容寻址） | 部分有 | 已记录 |
| 14 | **app-server-daemon + app-server-transport + app-server-client + noop-macros**：app-server 拆成 4 个 crate，noop 宏用于无操作桩 | 无 | 无 | 完全没有 | P2。工程纪律值得学：协议层可被完全替换为 no-op |
| 15 | **aws-auth / backend-client / cloud-config**：云后端接入独立 crate | 无 | 部分 | 部分有 | P2 |
| 16 | **diagnostics crate**：独立诊断包 | 无 | 部分（vital/） | 部分有 | P2 |
| 17 | **Bazel + Cargo 双构建系统**（`BUILD.bazel` / `MODULE.bazel.lock` / `defs.bzl` / `rbe.bzl` 远程执行） | 无 | 无 | 完全没有 | P3。规模不到不用抄 |
| 18 | **AGENTS.md 里的工程红线**：Rust 模块 <500 LoC（不含测试）、文件 >800 LoC 必须拆新模块、`#[tracing::instrument]` 打在函数定义而非调用点、测试比较整个对象而非逐字段、不为静态值写测试 | 无 | 无 | 部分有（OpenSoul 无强制） | **P1**。可直接抄进 OpenMate/OpenSoul 的 AGENTS.md |

## 源码亮点

1. **"角色 = 一层配置"**（agent-roles）。`AgentRoleConfig` 里 `#[serde(flatten)] config: ConfigToml`
   —— 角色不是独立对象，而是叠加在主配置上的一层 TOML。子 agent 的差异全部用配置表达，
   代码路径只有一条。**这是子 agent 建模的最优解之一。**

2. **品牌身份的单一事实源**。127 个 crate 里所有用户可见字符串都从 `product-info` 取。
   FORK_BRANDING.md 明确警告"不要全局替换 codex"。这解决了 fork 项目最常见的腐烂方式。

3. **身份判定不信任文件名**：`Product::current()` 注释写明"打包内的二进制无条件是 OI，
   argv0/env 检查只用于 cargo target 目录里跑的开发构建"。

4. **协议层可整体替换**（app-server-protocol + noop-macros）：用宏生成空实现，
   让上层在不需要协议时零成本。

5. **execpolicy 新旧双版本共存**（`execpolicy` + `execpolicy-legacy`）：迁移期不删旧代码，
   给调用方留窗口。

## 可复用设计

| 设计 | 直接复用到 | 难度 | 价值 |
|------|-----------|------|------|
| Agent role = TOML 配置层 + nickname_candidates | OpenSoul `gene/roles/` | **低** | **高** |
| Product 单一品牌事实源（多分发） | OpenSoul 品牌/租户配置 | 低 | 高（政企多客户场景） |
| 产品版本 ≠ 内嵌兼容版本 | OpenSoul fork 上游代码时 | 低 | 中 |
| 第三方 app 目录 + AppToolPolicyEvaluator | OpenSoul marketplace 升级 | 中 | 高 |
| 工程红线写进 AGENTS.md（500/800 LoC、instrument 位置、整对象断言） | OpenMate/OpenSoul AGENTS.md | **极低** | 中 |
| 协议层 noop 宏（可整体替换） | OpenSoul acp/a2a | 中 | 中 |

## 与前几轮的交叉印证

- **#11 openai/codex**：本仓库 127 crate 与 codex 同源，前轮记录的 execpolicy / 两阶段记忆 /
  Guardian / 多平台沙箱 / agent-graph-store 全部适用，**本文件不重复展开**。
- **#03/#04 deepseek-harness / opencode**：code-mode 受限代码执行三方印证。
- **新结论**：低成本模型 harness 调优 + Rust 化，是终端 coding agent 的收敛方向；
  OpenSoul 若保持 Python，需在 **harness 质量**（而非语言）上竞争——agent-roles 这类
  配置驱动设计正是 Python 也能低成本拿到的部分。
