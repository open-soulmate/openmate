# joonspk-research/generative-agents — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/joonspk-research/generative-agents  
> 实际成功路径: `joonspk-research/generative_agents`（**下划线**，非连字符）  
> 抓取通道: cdn.jsdelivr.net/gh/joonspk-research/generative_agents@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供记忆流 / 双服务器仿真 / fork 恢复 / 历史加载 借鉴

---

## 0. 诚实性说明

- **路径纠错**: `joonspk-research/generative-agents`（连字符）404；实际为 **`generative_agents`（下划线）**
- 成功拉取: `README.md` 完整（环境搭建、运行、回放、定制）
- 未打开: `reverie/backend_server/` 记忆/计划实现
- Paper: arXiv:2304.03442（UIST '23）
- Python 测试版本: **3.9.12**

---

## 1. 项目定位（README 实读）

**Generative Agents: Interactive Simulacra of Human Behavior**

计算 agent 模拟可信人类行为 + 游戏环境（Smallville）。

作者: Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, Michael S. Bernstein

---

## 2. 环境配置（README 源码实读）

### 2.1 utils.py 必须自建

位置: `reverie/backend_server/utils.py`（与 `reverie.py` 同目录）

```python
openai_api_key = "<Your OpenAI API>"
key_owner = "<Name>"

maze_assets_loc = "../../environment/frontend_server/static_dirs/assets"
env_matrix = f"{maze_assets_loc}/the_ville/matrix"
env_visuals = f"{maze_assets_loc}/the_ville/visuals"

fs_storage = "../../environment/frontend_server/storage"
fs_temp_storage = "../../environment/frontend_server/temp_storage"

collision_block_id = "32125"

debug = True
```

**真实常量**:
- `collision_block_id = "32125"`
- 路径全部相对 `reverie/backend_server`
- storage / temp_storage 分离

### 2.2 依赖

`requirements.txt`；建议 virtualenv；Python **3.9.12** 测试。

---

## 3. 双服务器架构（README 实读）

```
environment/frontend_server  → Django :8000  （地图/可视化）
reverie/backend_server       → reverie.py    （agent 仿真）
```

必须**同时运行**。

### 3.1 Environment Server

```bash
cd environment/frontend_server
python manage.py runserver
# http://localhost:8000/
# 看到 "Your environment server is up and running"
```

浏览器推荐: **Chrome 或 Safari**（Firefox 可能前端 glitch，不影响仿真）。

### 3.2 Simulation Server

```bash
cd reverie/backend_server
python reverie.py
```

交互提示:
```
Enter the name of the forked simulation:
  base_the_ville_isabella_maria_klaus
Enter the name of the new simulation:
  test-simulation
Enter option:
```

### 3.3 运行步骤

浏览器: `http://localhost:8000/simulator_home`

```
run <step-count>    # 1 step = 游戏内 10 秒
exit                # 不保存退出
fin                 # 保存并退出
```

**Fork 语义**: 已保存仿真名可作为下次的 forked simulation → **从中断处继续**。

### 3.4 回放

```
http://localhost:8000/replay/<simulation-name>/<starting-time-step>
```

示例:
```
http://localhost:8000/replay/July1_the_ville_isabella_maria_klaus-step-3-20/1/
```

回放 sprite 相同（调试用，不优化体积/视觉）。

### 3.5 Demo

需先压缩:
- 编辑 `reverie/compress_sim_storage.py`
- 执行 `compress` 函数，输入仿真名

```
http://localhost:8000/demo/<simulation-name>/<starting-time-step>/<simulation-speed>
```

`simulation-speed`: **1（最慢）– 5（最快）**

示例:
```
http://localhost:8000/demo/July1_the_ville_isabella_maria_klaus-step-3-20/1/3/
```

---

## 4. 存储位置（README 实读）

| 类型 | 路径 |
|------|------|
| 已保存仿真 | `environment/frontend_server/storage` |
| 压缩 demo | `environment/frontend_server/compressed_storage` |
| 资产 | `environment/frontend_server/static_dirs/assets` |
| matrix | `.../assets/the_ville/matrix` |
| visuals | `.../assets/the_ville/visuals` |
| temp | `environment/frontend_server/temp_storage` |

---

## 5. 定制（README 实读）

### 5.1 基础仿真

| 名称 | Agent 数 |
|------|----------|
| `base_the_ville_n25` | **25** |
| `base_the_ville_isabella_maria_klaus` | **3** |

### 5.2 加载 Agent 历史

```
Enter option:
  call -- load history the_ville/<history_file_name>.csv
```

示例历史文件:
- `agent_history_init_n25.csv` → n25
- `agent_history_init_n3.csv` → 3 agents

**格式**: 分号分隔的 memory records 列表 → **插入 agents 的 memory stream**。

自定义历史放: `environment/frontend_server/static_dirs/assets/the_ville`（列格式需匹配示例）。

### 5.3 新 base simulation

- 复制已有 base 文件夹改名编辑
- 改 agent 名或扩容需用 [Tiled](https://www.mapeditor.org/) 编辑地图

---

## 6. 已知失败路径（README Tips 实读）

```
OpenAI API 触达小时限流
  → API hang；可能需重启仿真
  → 建议频繁保存（fin）

多 agent 成本
  → 2023 初就较贵；agent 越多越贵

Firefox
  → 前端 glitch；仿真本身不受影响

utils.py 未建
  → 无法启动

环境服务器未保持运行
  → 仿真/回放失败

回放 sprite 相同
  → 调试用途；demo 需先 compress

fork 名错误
  → 找不到已存仿真
```

---

## 7. 架构模式（README + 论文常识，标注）

### 7.1 Fork-based 恢复

```
base_the_ville_*  →  run N steps  →  fin 保存
       ↑                                 ↓
  下次 fork 同名  ←──────────────────────┘
```

对 openmate: **显式 fork 父仿真名 + 新仿真名** 的恢复语义。

### 7.2 Memory Stream 注入

```
CSV (semicolon-separated memory records)
  → call -- load history
  → 插入各 agent memory stream
```

对 openmate: **历史可文件化预载**，不只能对话中累积。

### 7.3 双进程分离

- Django 只管前端/地图/存储
- reverie.py 只管 agent 步进

对 openmate: **UI 与推理进程分离**，可独立重启。

### 7.4 仿真步进

- CLI: `run <step-count>`
- 1 step = 10 游戏秒
- fin/exit 二选一

对 openmate: **步数显式 + 明确时间换算**。

---

## 8. 与 openmate 映射

| 需求 | Generative Agents 机制 | 可复用度 |
|------|------------------------|----------|
| Fork 恢复 | forked simulation 名 + fin | **高** |
| 历史 CSV 预载 | call -- load history | **高** |
| 双服务器分离 | Django + reverie | **高** |
| 步进 CLI | run N / exit / fin | **高** |
| 时间换算 | 1 step = 10s | 中 |
| replay vs demo | 调试回放 vs 压缩演示 | **高** |
| storage 分离 | storage / compressed / temp | **高** |
| utils.py 集中配置 | key + 路径 + collision_id | 高 |
| 基础仿真模板 | n25 / n3 | 中 |
| Tiled 地图编辑 | 扩容 agent | 低 |
| API 限流 hang | 勤保存 | **P0 警示** |

---

## 9. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9.12（测试） | README |
| Environment 端口 | 8000 | README |
| collision_block_id | "32125" | utils.py 模板 |
| 基础仿真 | n25, isabella_maria_klaus(n3) | README |
| 历史文件 | agent_history_init_n25.csv, _n3.csv | README |
| step 时间 | 10 游戏秒 | README |
| demo speed | 1–5 | README |
| 浏览器 | Chrome/Safari 推荐 | README |
| 历史分隔符 | 分号 | README |
| Paper | arXiv:2304.03442 UIST'23 | README |

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **Fork 语义**: 已存状态名作 fork 源，新名作当前 → 可续跑
2. **fin vs exit** 显式保存/丢弃
3. **历史 CSV 预载**插入 memory stream
4. **双服务器**: UI/存储 与 推理分离
5. **run N 步进** + step↔真实时间换算
6. **replay（调试）与 demo（压缩演示）分离**
7. **storage / compressed_storage / temp_storage 三分**
8. **utils.py 集中** key+路径+碰撞 id
9. **API 限流 hang 的勤保存建议**
10. **基础仿真模板**（小/大两档）

### P1

- Tiled 地图编辑扩展
- demo speed 参数
- collision_block_id 常量

### P2

- 25 agent 大仿真
- 艺术资产授权说明

---

## 11. 应避免的坑

- 仓库名是 `generative_agents` 下划线
- utils.py 必须手建
- 双服务器必须同时跑
- Firefox 前端 glitch
- API hang 需重启 → 勤 fin
- 回放不等于 demo（需 compress）
- 勿发明 reverie 内部实现路径

---

## 12. 源码锚点速查

```
joonspk-research/generative_agents README.md
  utils.py @ reverie/backend_server/
    openai_api_key, key_owner
    maze_assets_loc = ../../environment/frontend_server/static_dirs/assets
    env_matrix, env_visuals under the_ville/
    fs_storage, fs_temp_storage
    collision_block_id = "32125"
    debug = True
  Django: environment/frontend_server manage.py runserver :8000
  Sim: reverie/backend_server reverie.py
  Base sims: base_the_ville_n25, base_the_ville_isabella_maria_klaus
  CLI: run <steps> | exit | fin
  History: call -- load history the_ville/<file>.csv (semicolon-separated)
  History files: agent_history_init_n25.csv, agent_history_init_n3.csv
  Replay: /replay/<sim>/<step>
  Demo: compress_sim_storage.py then /demo/<sim>/<step>/<speed 1-5>
  Storage: frontend_server/storage, compressed_storage, temp_storage
  1 step = 10s
  Python 3.9.12
  Paper: arXiv:2304.03442 UIST'23
```

**未本轮打开**: `reverie/backend_server/` 记忆/反思/计划实现。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 2 | 非工具型仿真 |
| 权限/安全边界 | 2 | 本地 Django |
| 容错与会话恢复 | 5 | fork + fin |
| 上下文工程 | 4 | memory stream + 历史预载 |
| 可扩展（技能/MCP） | 2 | 研究代码 |
| 可观测与可评测 | 4 | replay + demo |
| 生产可用成熟度 | 2 | 研究原型；API hang |

**综合**: **记忆流 + fork 恢复的仿真黄金参考**。openmate 抄 fork 语义、历史预载、双服务器与 replay/demo 分离。

---

## 14. 关键链接

- https://github.com/joonspk-research/generative_agents
- https://arxiv.org/abs/2304.03442
- 相关: `reports/agentverse-l1.md`、`reports/camel-l1.md`、`reports/mem0.md`

---

## 15. 附录 A — Fork 语义 openmate 规范（P0）

```
仿真状态目录:
  environment/frontend_server/storage/<sim-name>/

CLI:
  forked:  base_the_ville_isabella_maria_klaus   # 已存在
  new:     test-simulation                        # 新建
  run N
  fin      # 保存并退出
  exit     # 丢弃退出

恢复:
  下次 forked = 上次 new 名
```

openmate:
- `session fork --from <name> --to <new>`
- `session save` / `session discard` 对齐 fin/exit
- 存储: `.openmate/sessions/<name>/`

失败路径:
```
fork 源不存在 → 拒绝并列出可用名
new 名冲突 → 要求 --force 或新名
fin 时磁盘满 → 保留 temp_storage 可恢复
API hang → 提示勤 save；自动 checkpoint 可选
```

---

## 16. 附录 B — 历史 CSV 预载格式

```
call -- load history the_ville/<file>.csv
```

- 分隔符: **分号**
- 每行: 一条 memory record
- 目标: 插入各 agent 的 **memory stream**
- 位置: `static_dirs/assets/the_ville/`
- 示例: `agent_history_init_n25.csv`, `agent_history_init_n3.csv`

openmate:
```
openmate memory load --agent <id> --file history.csv --sep ';'
```

校验: 列格式匹配示例；不匹配拒绝。

---

## 17. 附录 C — 双服务器进程模型

| 进程 | 职责 | 端口 | 重启影响 |
|------|------|------|----------|
| Django frontend_server | 地图/可视化/存储 | 8000 | 仿真可继续（若 backend 活） |
| reverie backend_server | agent 步进 | CLI | 中断需从 fork 恢复 |

openmate:
- UI 进程与推理进程分离
- 推理挂掉可从 checkpoint 恢复
- UI 重载不杀推理

---

## 18. 附录 D — replay vs demo

| 模式 | URL | 压缩 | sprite | 用途 |
|------|-----|------|--------|------|
| replay | /replay/<sim>/<step> | 否 | 相同 | 调试 |
| demo | /demo/<sim>/<step>/<speed 1-5> | 需 compress | 正确 | 演示 |

openmate:
- `trace replay` 调试（轻量）
- `trace demo` 演示（压缩 + 美化）
- speed 1-5 参数

---

## 19. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 仓名 | generative_agents（下划线） | 成功抓取 |
| 连字符路径 | 404 | 本轮 |
| Python | 3.9.12 | README |
| 端口 | 8000 | README |
| collision_block_id | "32125" | utils.py 模板 |
| 基础仿真 | n25, n3 | README |
| step | 10 游戏秒 | README |
| demo speed | 1-5 | README |
| 历史分隔 | 分号 | README |
| Paper | arXiv:2304.03442 UIST'23 | README |

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 2 | 非工具型 |
| 权限安全 | 2 | 本地 Django |
| 容错恢复 | 5 | fork + fin |
| 上下文 | 4 | memory stream + 历史预载 |
| 可扩展 | 2 | 研究代码 |
| 可观测 | 4 | replay + demo |
| 成熟度 | 2 | 研究原型；API hang |

**净推荐**: openmate 抄 **fork/fin、历史预载、双进程、replay/demo 分离** 为会话系统 P0。
