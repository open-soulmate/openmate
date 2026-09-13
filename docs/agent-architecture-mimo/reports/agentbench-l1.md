# THUDM/AgentBench — 架构深度研究报告（OpenClaw 级）

> 路径纠错: 用户指定 `OpenBMB/AgentBench`；`cdn.jsdelivr.net/gh/OpenBMB/AgentBench@main` 与 `@master` 均 **404**。  
> 实际成功拉取: **`THUDM/AgentBench@main/README.md`**（清华 THUDM，论文 arXiv:2308.03688）  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 LLM-as-Agent 多环境评测 / 容器化任务 / FC 版本 借鉴

---

## 0. 诚实性说明

- **路径纠错**: OpenBMB/AgentBench 不存在于 jsDelivr；实际仓为 **THUDM/AgentBench**
- 成功拉取: `README.md` 完整（FC 版本、8 环境、Quick Start、资源表）
- 未打开: `src/` 实现、`configs/` 细节
- Paper: arXiv:2308.03688
- 历史版本: v0.1 / v0.2 可 revert

---

## 1. 项目定位（README 实读）

**AgentBench**: 首个评测 **LLM-as-Agent** 的多环境 benchmark。

### 1.1 AgentBench FC（2025-10-10）

Function Calling 版本，集成 [AgentRL](https://github.com/THUDM/AgentRL)（端到端多任务多轮 Agent RL 框架）。

FC 容器化任务:
- `alfworld` (AF)
- `dbbench` (DB)
- `knowledgegraph` (KG)
- `os_interaction` (OS)
- `webshop` (WS)

### 1.2 原版 8 环境（v0.2）

新建 5:
- Operating System (OS)
- Database (DB)
- Knowledge Graph (KG)
- Digital Card Game (DCG)
- Lateral Thinking Puzzles (LTP)

改编 3:
- House-Holding (HH) ← ALFWorld
- Web Shopping (WS) ← WebShop
- Web Browsing (WB) ← Mind2Web

---

## 2. Docker Compose 一键栈（README 实读）

### 2.1 镜像准备

```shell
docker pull mysql:8
docker build -t local-os/default -f ./data/os_interaction/res/dockerfiles/default data/os_interaction/res/dockerfiles
docker build -t local-os/packages -f ./data/os_interaction/res/dockerfiles/packages data/os_interaction/res/dockerfiles
docker build -t local-os/ubuntu -f ./data/os_interaction/res/dockerfiles/ubuntu data/os_interaction/res/dockerfiles
```

KG freebase 数据: 下载 [Freebase-Setup](https://github.com/dki-lab/Freebase-Setup) 放到 `./virtuoso_db/virtuoso.db`。

### 2.2 启动服务

```shell
docker compose -f extra/docker-compose.yml up
```

启动的服务:
- AgentRL Controller
- alfworld task worker (x1+)
- dbbench task worker (x1+)
- knowledgegraph task worker (x1+)
- os_interaction task worker (x1+)
- webshop task worker (x1+)
- freebase server
- Redis（容器分配；本机已有 Redis 7+ 可省略）

### 2.3 资源警告（README WARNING 实读）

> webshop 需 **~16GB RAM** 启动；alfworld **泄漏内存和磁盘**直到 worker 重启。

---

## 3. 原版 Quick Start（README 实读）

### 3.1 环境

```bash
conda create -n agent-bench python=3.9
conda activate agent-bench
pip install -r requirements.txt
```

**Python 版本说明（README 实读）**: AgentBench pin 旧科学计算依赖（如 `numpy~=1.23.x`），**推荐 Python 3.9**。

### 3.2 配置 Agent

`configs/agents/openai-chat.yaml` 填 OpenAI key。

```bash
python -m src.client.agent_test --config configs/agents/api_agents.yaml --agent gpt-3.5-turbo-0613
```

### 3.3 启动任务服务器

```bash
python -m src.start_task -a
# 端口 5000-5015 需可用
# 约 1 分钟完成 setup；看到 ".... 200 OK"
```

Lite preset（低内存）:
```bash
python -m src.start_task -a --config configs/start_task_lite.yaml
```

### 3.4 启动 assigner

```bash
python -m src.assigner
# lite:
python -m src.assigner --config configs/assignments/lite.yaml
```

### 3.5 其余任务镜像

```
longinyu/agentbench-ltp
longinyu/agentbench-webshop
longinyu/agentbench-mind2web
longinyu/agentbench-card_game
longinyu/agentbench-alfworld
```

### 3.6 资源消耗表（README 表实读）

| Task | Start-up | Memory |
|------|----------|--------|
| webshop | ~3min | **~15G** |
| mind2web | ~5min | ~1G |
| db | ~20s | <500M |
| alfworld | ~10s | <500M |
| card_game | ~5s | <500M |
| ltp | ~5s | <500M |
| os | ~5s | <500M |
| kg | ~5s | <500M |

---

## 4. KG 本地部署（README 实读）

1. 下载 [freebase-setup](https://github.com/dki-lab/Freebase-Setup)
2. 改 `configs/tasks/kg.yaml`: `sparql_url: "http://164.107.116.56:3093/sparql"` → 本地 URL
3. **先启 KG 服务再启 agent tasks**

---

## 5. 数据集规模（README 实读）

- 每环境两 split: **Dev** 和 **Test**
- 多轮交互: Dev 约 **4k** 次 LLM 生成；Test 约 **13k** 次

---

## 6. 相关项目（README 实读）

| 项目 | 说明 |
|------|------|
| VisualAgentBench | 5 环境视觉 agent：VAB-OmniGibson, Minecraft, Mobile, WebArena-Lite, CSS；17 LMMs |
| TheAgentCompany | 更 consequential 任务（terminal + coding） |
| AgentRL | FC 版本的 RL 框架 |

---

## 7. 与 openmate 映射

| 需求 | AgentBench 机制 | 可复用度 |
|------|----------------|----------|
| 多环境统一评测 | 8 环境 + FC 5 环境 | **高** |
| 容器化 task worker | Docker per task | **高** |
| Controller + worker | AgentRL Controller | **高** |
| Redis 容器分配 | 可复用本机 Redis 7+ | **高** |
| Lite preset | 低内存 1 worker/task | **高** |
| 资源表公开 | 启动时间 + 内存 | **高** |
| 泄漏已知问题 | alfworld 泄漏；需重启 worker | **P0 警示** |
| Python pin | 3.9 + numpy~=1.23 | 高 |
| 端口范围声明 | 5000-5015 | 高 |
| sparql_url 可配 | KG 本地化 | 中 |
| Dev/Test 分裂 | 4k / 13k 生成 | 中 |
| agent_test 自检 | 配置验证命令 | **高** |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9（推荐） | README |
| numpy | ~=1.23.x pin | README |
| 端口 | 5000-5015 | README |
| Redis | 7+（可选本机） | README |
| webshop RAM | ~16GB 启动 / ~15G 运行 | README |
| mind2web | ~5min / ~1G | README |
| db/alfworld/card/ltp/os/kg | <500M | README |
| alfworld | **内存+磁盘泄漏** | README WARNING |
| Dev/Test 生成 | ~4k / ~13k | README |
| FC 任务 | AF, DB, KG, OS, WS | README |
| 原版任务 | OS,DB,KG,DCG,LTP,HH,WS,WB | README |
| 版本 | v0.1 / v0.2 / FC main | README |
| Paper | arXiv:2308.03688 | README |

---

## 9. 失败路径

```
OpenBMB/AgentBench
  → 404；实际 THUDM/AgentBench

Python != 3.9
  → numpy pin 冲突

端口 5000-5015 占用
  → start_task 失败（Mac 常见）

webshop RAM 不足
  → ~16GB 无法启动

alfworld 长跑
  → 内存/磁盘泄漏；需重启 worker

KG sparql_url 远程不稳
  → 本地部署 Freebase-Setup

KG 服务未先启动
  → agent task 失败

Redis 版本 <7 且未省略
  → 配置冲突

setup 未等 1 分钟
  → assigner 连不上

Freebase 数据未放 virtuoso_db/
  → KG worker 起不来
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **每任务独立 Docker worker** + Controller 编排
2. **资源消耗表公开**（启动时间 + 内存）供容量规划
3. **Lite preset** 低并发配置
4. **agent_test 自检命令**（配置验证先于评测）
5. **端口范围显式声明**（5000-5015）
6. **已知泄漏问题 WARNING**（alfworld）写进 README
7. **Dev/Test 生成量量化**（4k/13k）
8. **Python/numpy pin 原因说明**（科学计算依赖）
9. **可复用本机 Redis** 减少容器
10. **v0.1/v0.2/FC 版本可切换**（git tag/revert）

### P1

- freebase 本地化 sparql_url 配置
- VisualAgentBench 视觉扩展
- TheAgentCompany consequential 任务
- longinyu/* 预构建任务镜像

### P2

- AgentRL RL 训练集成
- Avalon 多 agent 合并

---

## 11. 应避免的坑

- 勿用 OpenBMB 路径（404）
- 勿用 Python 3.10+（numpy pin）
- 勿在低内存机跑 webshop
- alfworld 长跑必须监控泄漏
- KG 必须先于 agent task 启动
- Mac 端口 5000 冲突
- 勿发明 src/ 内部路径

---

## 12. 源码锚点速查

```
THUDM/AgentBench README.md
  FC version: AgentRL + AF/DB/KG/OS/WS
  Compose: extra/docker-compose.yml
  Redis: optional if local 7+
  Warning: webshop ~16GB, alfworld leaks
  Python: 3.9, numpy~=1.23
  Ports: 5000-5015
  start_task: python -m src.start_task -a
  lite: configs/start_task_lite.yaml
  assigner: python -m src.assigner
  agent_test: python -m src.client.agent_test
  Memory table: webshop 15G, mind2web 1G, others <500M
  Images: local-os/{default,packages,ubuntu}, longinyu/agentbench-*
  Freebase: ./virtuoso_db/virtuoso.db
  kg.yaml: sparql_url = http://164.107.116.56:3093/sparql
  Splits: Dev ~4k, Test ~13k generations
  8 envs v0.2: OS,DB,KG,DCG,LTP,HH,WS,WB
  Paper: arXiv:2308.03688
  OpenBMB/AgentBench: 404
```

**未本轮打开**: `src/`、`configs/` 细节。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | FC + 多环境 |
| 权限/安全边界 | 3 | Docker 隔离 |
| 容错与会话恢复 | 2 | alfworld 泄漏 |
| 上下文工程 | 3 | 环境观察各异 |
| 可扩展（技能/MCP） | 3 | Extension Guide |
| 可观测与可评测 | 5 | 专为评测而生 |
| 生产可用成熟度 | 3 | 容器化完整；资源重 |

**综合**: **LLM-as-Agent 多环境评测基础设施**。openmate 抄容器化 worker、资源表、lite preset、自检命令与泄漏警示。

---

## 14. 附录 A — openmate 评测 worker 最小规范（P0）

```
openmate-eval/
  docker-compose.yml
    controller
    redis (or external)
    workers: one per env
  configs/
    start_task_lite.yaml      # 1 worker/env
    assignments/lite.yaml
    agents/openai-chat.yaml
  scripts/
    agent_test                # 配置自检
    start_task -a
    assigner
  docs/
    RESOURCE_TABLE.md         # 启动时间 + 内存
    KNOWN_ISSUES.md           # 泄漏等
```

强制项:
- RESOURCE_TABLE 必填
- KNOWN_ISSUES 必填
- agent_test 必须先于 assigner

---

## 15. 附录 B — 资源规划表（README 实读）

| Task | 启动 | 内存 | openmate 并行建议 |
|------|------|------|-------------------|
| webshop | 3min | 15G | 串行 / 专用机 |
| mind2web | 5min | 1G | 1-2 |
| 其余 6 | 5-20s | <500M | 4-8 |

总最小内存（含 webshop）: **≥20G**；lite 模式（无 webshop）: **≥4G**。

---

## 16. 附录 C — 版本矩阵

| 版本 | 内容 | 如何切换 |
|------|------|----------|
| v0.1 | 早期 | git checkout v0.1 |
| v0.2 | 原版 8 环境 | git checkout v0.2 |
| main (FC) | FC + AgentRL + 5 容器任务 | 默认 |

openmate: 锁定 **FC main** 作默认；文档说明 v0.2 对照论文数字。

---

## 17. 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 实际仓 | THUDM/AgentBench | 成功抓取 |
| OpenBMB 路径 | 404 | 本轮 |
| Python | 3.9 | README |
| 端口 | 5000-5015 | README |
| webshop | ~16GB | README WARNING |
| alfworld | 泄漏 | README WARNING |
| Dev/Test | 4k / 13k | README |
| Paper | arXiv:2308.03688 | README |

---

## 18. 关键链接

- https://github.com/THUDM/AgentBench
- https://arxiv.org/abs/2308.03688
- https://github.com/THUDM/AgentRL
- https://github.com/THUDM/VisualAgentBench
- 相关: `reports/toolbench-l1.md`、`reports/mind2web-l1.md`、`reports/webarena-l1.md`

---

## 19. 附录 D — openmate 评测 worker 最小规范（P0）

```
openmate-eval/
  docker-compose.yml
    controller
    redis (or external)
    workers: one per env
  configs/
    start_task_lite.yaml      # 1 worker/env
    assignments/lite.yaml
    agents/openai-chat.yaml
  scripts/
    agent_test                # 配置自检
    start_task -a
    assigner
  docs/
    RESOURCE_TABLE.md         # 启动时间 + 内存
    KNOWN_ISSUES.md           # 泄漏等
```

强制项:
- RESOURCE_TABLE 必填
- KNOWN_ISSUES 必填
- agent_test 必须先于 assigner

---

## 20. 附录 E — 资源规划表（README 实读）

| Task | 启动 | 内存 | openmate 并行建议 |
|------|------|------|-------------------|
| webshop | 3min | 15G | 串行 / 专用机 |
| mind2web | 5min | 1G | 1-2 |
| 其余 6 | 5-20s | <500M | 4-8 |

总最小内存（含 webshop）: **≥20G**；lite 模式（无 webshop）: **≥4G**。

---

## 21. 附录 F — 版本矩阵

| 版本 | 内容 | 如何切换 |
|------|------|----------|
| v0.1 | 早期 | git checkout v0.1 |
| v0.2 | 原版 8 环境 | git checkout v0.2 |
| main (FC) | FC + AgentRL + 5 容器任务 | 默认 |

openmate: 锁定 **FC main** 作默认；文档说明 v0.2 对照论文数字。

---

## 22. 最终结论

路径纠错: OpenBMB/AgentBench 404 → 实际 **THUDM/AgentBench**。openmate 抄容器化 worker、资源表、lite preset、自检命令与 alfworld 泄漏警示。Python 3.9 pin 与端口 5000-5015 为部署硬约束。
