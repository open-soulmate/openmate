# Cline

## 概述

Cline 是一个AI编程助手（VSCode）。

**仓库**: https://github.com/cline/cline | **语言**: Python

## 核心架构

> 研究日期：2026-09-13 | 仓库：https://github.com/cline/cline  
> 官网文档：https://docs.cline.bot | SDK：https://docs.cline.bot/cline-sdk/overview  
> 研究目的：为 openmate 稳定性重构借鉴 Plan/Act、MCP、checkpoints、人工审批、diff 编辑

1. **Plan / Act 双模式**（产品级心智模型）
   - **Plan**：只读探索、提问、出方案；**硬拦截**文件编辑类 shell（重定向、就地编辑器、变异 git 子命令、包安装）
   - **Act**：执行计划；文件编辑与终端命令默认需审批，可开 auto-approve
   - 4.1.4 起：**禁止模型自行 Plan→Act 切换**，切换权交给人（稳定性：防 agent 中途越权）
2. **Human-in-the-loop 审批**
   - 每次文件 diff / 命令执行 / MCP 调用可批
   - auto-approve 矩阵按工具粒度；命令 auto-approve 默认关闭
   - 4.1.8 移除装饰性 “Yolo Mode”，以 auto-approve 菜单为唯一真源
3. **Checkpoints**
   - 任意 tool 使用时自动 workspace snapshot
   - 可只恢复 task 状态 / 只恢复文件 / 两者
   - 恢复时若 checkpoint 之后有 commit → **拒绝恢复**（防止静默丢 commit）
   - diff 含 untracked 文件；git 半程初始化也能接上
4. **Diff 编辑**
   - 大文件用 search & replace 块，防止整文件覆盖误删
   - block anchor matching（≥3 行时用首尾行锚点）
   - 强调 auto-format 干扰：system prompt 要求以更新后文件内容为 SEARCH 参考
   - VS Code/JetBrains 内原生 diff 视图，可手改后接受或整块 Revert
5. **MCP**
   - 内置 McpHub；可从 marketplace 装；可让 Cline **现场生成**自定义 MCP server
   - stdio 初始化 30s 预算；远程 SSE/HTTP 10s 预算；`list_changed` 刷新
   - 企业可 `allowedMCPServers` 禁 marketplace
   - MCP 路由从随机 uid 改为按 server name（重启/列表变更仍稳定）
6. **Rules / Skills / Plugins**
   - `.clinerules`（项目）+ 全局 rules（含 `~/Cline/Rules` 适配 WSL）
   - Skills 可按需加载；插件用 SDK 注册 `createTool` + lifecycle hooks
7. **多端同源**
   - CLI headless（`--json` 给 CI）、Desktop、IDE 共用 SDK session
   - Hub 常驻：断线 replay、升级后 session 保活
8. **终端**
   - 在用户真实终端跑命令；长驻进程（dev server）可 “Proceed While Running”
   - Windows PowerShell 处理、失败 fail-fast、结构化命令保真

从 CHANGELOG 可直接提炼出大量“生产事故驱动”的稳定性实践，对 openmate 极有价值：

| 机制 | 事故/场景 | 修复思路 |
|---|---|---|
| **Hub 内存膨胀** | 每次 status 更新向所有 client 广播整份 transcript | snapshot 只带状态增量 |
| **Hub 重启保活** | 升级/重启丢 session | client replay missed events；防 live+replay 双投 |
| **双安装互杀** | 两个版本扩展互相 shutdown Hub | build identity 全序比较，单向退休 |
| **Hook 失败不拖垮主进程** | hook spawn 失败导致任务崩溃 | 隔离 hook 进程错误 |
| **Checkpoint 安全恢复** | checkpoint 后已有 commit 被静默踢掉 | 拒绝恢复并提示 |
| *

## 关键技术

1. **Plan / Act 双模式**（产品级心智模型）
   - **Plan**：只读探索、提问、出方案；**硬拦截**文件编辑类 shell（重定向、就地编辑器、变异 git 子命令、包安装）
   - **Act**：执行计划；文件编辑与终端命令默认需审批，可开 auto-approve
   - 4.1.4 起：**禁止模型自行 Plan→Act 切换**，切换权交给人（稳定性：防 agent 中途越权）
2. **Human-in-the-loop 审批**
   - 每次文件 diff / 命令执行 / MCP 调用可批
   - auto-approve 矩阵按工具粒度；命令 auto-approve 默认关闭
   - 4.1.8 移除装饰性 “Yolo Mode”，以 auto-approve 菜单为唯一真源
3. **Checkpoints**
   - 任意 tool 使用时自动 workspace snapshot
   - 可只恢复 task 状态 / 只恢复文件 / 两者
   - 恢复时若 checkpoint 之后有 commit → **拒绝恢复**（防止静默丢 commit）
   - diff 含 untracked 文件；git 半程初始化也能接上
4. **Diff 编辑**
   - 大文件用 search & replace 块，防止整文件覆盖误删
   - block anchor matching（≥3 行时用首尾行锚点）
   - 强调 auto-format 干扰：system prompt 要求以更新后文件内容为 SEARCH 参考
   - VS Code/JetBrains 内原生 diff 视图，可手改后接受或整块 Revert
5. **MCP**
   - 内置 McpHub；可从 marketplace 装；可让 Cline **现场生成**自定义 MCP server
   - stdio 初始化 30s 预算；远程 SSE/HTTP 10s 预算；`list_changed` 刷新
   - 企业可 `allowedMCPServers` 禁 marketplace
   - MCP 路由从随机 uid 改为按 server name（重启/列表变更仍稳定）
6. **Rules / Skills / Plugins**
   - `.clinerules`（项目）+ 全局 rules（含 `~/Cline/Rules` 适配 WSL）
   - Skills 可按需加载；插件用 SDK 注册 `createTool` + lifecycle hooks
7. **多端同源**
   - CLI headless（`--json` 给 CI）、Desktop、IDE 共用 SDK session
   - Hub 常驻：断线 replay、升级后 session 保活
8. **终端**
   - 在用户真实终端跑命令；长驻进程（dev server）可 “Proceed While Running”
   - Windows PowerShell 处理、失败 fail-fast、结构化命令保真

| 工具 | 说明 |
|---|---|
| read_file / write_to_file / apply_patch | 文件读写与补丁 |
| search_files / codebase search | regex / 结构搜索 |
| list_files_* / view_source_code_definitions | 工程结构与符号 |
| run_commands / execute_command | 终端；结构化 argv 优先 |
| browser（Computer Use / inspect_site） | 截图、console、点击输入 |
| MCP tools | 动态注册 |
| web_fetch / web_search | 可选 |
| teams / subagents | 协调者拆任务，状态跨会话持久 |

从 CHANGELOG 可直接提炼出大量“生产事故驱动”的稳定性实践，对 openmate 极有价值：

| 机制 | 事故/场景 | 修复思路 |
|---|---|---|
| **Hub 内存膨胀** | 每次 status 更新向所有 client 广播整份 transcript | snapshot 只带状态增量 |
| **Hub 重启保活** | 升级/重启丢 session | client replay missed events；防 live+replay 双投 |
| **

## 对openmate的启示

**必须借鉴（高优先级）**

1. **Plan/Act 二态 + 硬拦截**：Plan 模式不能只靠 prompt，要对 mutating shell/文件写做工具层拒绝；模式切换权归人。
2. **审批矩阵**：工具级 auto-approve；命令默认不自动批；把装饰性开关（Yolo）删掉。
3. **Checkpoint 安全语义**：snapshot 可恢复文件与 task；**有后续 commit 则拒绝文件恢复**。openmate 做稳定性重构必须有等价“时间机器”。
4. **MCP 生命周期预算**：stdio 30s / remote 10s，防一个坏 server 拖死整会话。
5. **Abort 传播**：取消主任务必须取消子代理与排队 turn。
6. **上下文 compact + 单次 retry**：显式恢复路径，而不是裸抛。
7. **结果截断预算**：工具输出、bash、file-read 设上限，保护 provider prefix cache。
8. **diff-first 编辑**：search/replace + anchor，避免 whole-file 误删；提供 Revert Block。
9. **Hub/session 耐重启**：断线 replay + 防重复投递。

**可选借鉴**

- @file/@url/@pr

| 维度 | 分 | 说明 |
|---|---|---|
| 人机协同（审批/Plan-Act） | **9.5** | 业界标杆；硬拦截 + 矩阵审批 |
| Checkpoint / 可回滚 | **9.0** | 快照粒度与安全恢复语义成熟 |
| MCP 生态与生命周期 | **8.5** | 市场 + 动态生成 + 超时预算 |
| 稳定性事故响应密度 | **9.0** | CHANGELOG 显示大量真实故障修复 |
| 架构一致性 | **7.0** | SDK 迁移中，legacy/next 双包、Hub 复杂 |
| 长任务/多 agent | **8.0** | teams + cron + 连接器 |
| 自我进化（rules/skills/plugins） | **8.0** | 完整但偏 IDE 场景 |
| 对 openmate 可移植性 | **8.5** | 审批、checkpoint、abort、compact 可直接产品化 |
| **综合** | **8.5** | “人控稳定性”的最佳参考实现 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（55-cline.md）
- 豆包（038_cline.md）
- MiMo报告（cline.md）
