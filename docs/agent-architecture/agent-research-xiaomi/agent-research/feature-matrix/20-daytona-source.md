# Daytona (#20, 72k★) 功能研究 — 源码级深读

研究时间：2026-09-17 02:00
源码：~/agent-research-src/daytona-v0190（v0.190.0，最后开源版本129MB，Go+Nx monorepo）
重要背景：**2026年6月起Daytona核心已闭源**，公开仓库只剩README。本研究基于最后一个开源tag v0.190.0。
结构：apps/{cli,api(NestJS),daemon,runner,proxy,ssh-gateway,snapshot-manager,dashboard,otel-collector} + libs/{sdk×5语言, computer-use, runner-proto, opencode-plugin, pi-extension}

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Runner容器沙箱编排**：docker create/exec/inspect/container_commit/backup，per-sandbox资源与生命周期 | 无 | mirror/sandbox.py是**目录级**沙箱(变量+快照+pause/resume)，非容器 | **部分有** | P1。用户本地可用podman/docker把mirror沙箱升级为真容器 |
| 2 | **沙箱网络规则(netrules/netleash eBPF)**：按沙箱控制出网策略 | 无 | 无 | **完全没有** | P2。容器级先用docker network隔离近似 |
| 3 | **Sandbox Toolbox（沙箱内工具箱daemon）**：fs/git/gitprovider/lsp/process/terminal/port/config/docs/computeruse全套HTTP API | 无 | 无（工具在宿主进程内跑） | **完全没有** | P1。OpenSoul要"执行不可信代码"时的标配架构：沙箱内跑toolbox，宿主只调API |
| 4 | **会话录制+回放dashboard**：recording包(start/stop/list/get)+recordingdashboard——把agent在沙箱里的操作录下来事后回放 | 无 | trajectory/已有事件轨迹存取(TrajectoryStore)，但无终端级录制回放 | **部分有** | P1。用户"我都不知道他们在干嘛"痛点的终极解法；先给终端工具加script/asciinema录制 |
| 5 | **端口探测+Preview**：portsDetector自动发现容器内监听端口，提供预览代理 | openmate有port字样(agent-detector) | 无 | **部分有** | P2。用户跑web服务时需要 |
| 6 | **SSH网关**：ssh-gateway app，沙箱可SSH直连，daemon内置ssh/config | 无 | 用户已有宿主机SSH(3333)但非沙箱级 | **完全没有** | P3 |
| 7 | **快照管理器**：snapshot-manager独立服务，容器快照/恢复 | 无 | marrow/backup.py有备份；mirror沙箱有snapshot() | **部分有** | P2 |
| 8 | **多语言SDK×5**：Go/TS/Python/Ruby/Java全有+4个API client变体(toolbox/runner/analytics/billing) | 无 | typescript目录+acp | **部分有** | P3。OpenSoul有python+ts够用 |
| 9 | **Agent IDE集成插件**：libs/opencode-plugin、libs/pi-extension（Daytona作为这些agent的执行后端） | 无 | acp-proxy可类比 | **部分有** | 思路可借鉴：让OpenSoul成为其他agent的执行后端 |
| 10 | **Computer Use库**：libs/computer-use（Go实现的计算机操作能力） | 无 | sense/vision有感知，无控制 | **完全没有** | P3 |
| 11 | **OTel遥测**：apps/otel-collector/exporter+runner/pkg/telemetry | 无 | metrics_middleware基础HTTP指标 | **部分有** | P2 |
| 12 | **Billing API client**：独立billing-api-client（沙箱用量计费） | 无 | gland/token_meter管token不管沙箱 | **完全没有** | P3 |
| 13 | **ADB支持**：docker/adb.go（安卓沙箱调试） | 无 | 无 | **完全没有** | P3，极小众 |

## 源码亮点
- **Runner/daemon分离**：runner在宿主侧编排容器（docker操作+netrules+cache+storage），daemon跑在沙箱内部（toolbox+ssh+recording）。信任边界清晰：宿主永不执行沙箱代码，只通过daemon HTTP API交互。
- 沙箱API粒度极细：fs读写、git操作、LSP诊断、进程管理、端口探测都是独立toolbox模块，agent按需调用。
- recording是first-class功能（不是日志而是可回放的录制），配独立回放dashboard。
- 闭源事件本身是信号：沙箱执行基础设施商业化价值高，开源替代（OpenHands runtime、E2B）要盯住。

## 可复用设计
1. Runner/daemon双层架构（宿主编排+沙箱内toolbox）→ OpenSoul执行层蓝图
2. 会话录制回放 → trajectory/升级方向
3. 端口探测预览 → OpenMate workspace
4. toolbox模块划分(fs/git/lsp/process/terminal) → OpenSoul工具接口设计参考
