# web-arena-x/webarena — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/web-arena-x/webarena  
> 抓取通道: cdn.jsdelivr.net/gh/web-arena-x/webarena@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供自托管 web 环境 / Gym 式 API / prompt 构造 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（安装、walkthrough、评测、prompt agent 开发）
- 未打开: `browser_env/`、`agents/`、`evaluation_harness/` 实现
- Paper: arXiv:2307.13854
- 标注: pre-commit / black / mypy / beartype / Python 3.10

---

## 1. 项目定位（README 实读）

> "Standalone, self-hostable web environment for building autonomous agents"

### 1.1 重要更新（2024-12-05）

> 本仓是 **canonical 实现**（复现论文）。web navigation 基础设施已由 [AgentLab](https://github.com/ServiceNow/AgentLab/) 大幅增强:
> 1. BrowserGym 并行实验
> 2. 统一框架集成 VisualWebArena 等
> 3. 统一 leaderboard
> 4. 更好处理环境边界情况
>
> **强烈建议用 AgentLab 做实验。**

### 1.2 相关

- [TheAgentCompany](https://the-agent-company.com): 更 consequential 任务（terminal + coding）
- Leaderboard: Google Sheets 链接在 README

---

## 2. 安装（README 实读）

```bash
conda create -n webarena python=3.10; conda activate webarena
pip install -r requirements.txt
playwright install
pip install -e .

# dev only
pip install -e ".[dev]"
mypy --install-types --non-interactive browser_env agents evaluation_harness
pip install pre-commit
pre-commit install
```

**工具链**: pre-commit、black、mypy、beartype（bear-ified badge）。

---

## 3. Gym 式 API（README 代码实读）

```python
from browser_env import ScriptBrowserEnv, create_id_based_action

env = ScriptBrowserEnv(
    headless=False,
    observation_type="accessibility_tree",
    current_viewport_only=True,
    viewport_size={"width": 1280, "height": 720},
)

config_file = "config_files/0.json"
obs, info = env.reset(options={"config_file": config_file})
# obs["text"] = html / accessibility tree

id = random.randint(0, 1000)
action = create_id_based_action(f"click [id]")
obs, _, terminated, _, info = env.step(action)
```

### 3.1 关键参数（源码实读）

| 参数 | 含义 |
|------|------|
| headless | 无头模式 |
| observation_type | `accessibility_tree` 等 |
| current_viewport_only | 仅当前视口 |
| viewport_size | 1280×720 |
| reset(options=config_file) | JSON 配置任务 |
| create_id_based_action | id 基动作 |

---

## 4. 端到端评测（README 实读）

### 4.1 前提

1. **自建 WebArena 网站**（demo 站仅浏览；评测必须自建）
2. 评测 **812** examples 后按文档 reset 环境

### 4.2 URL 配置（真实 env vars）

```bash
export SHOPPING="<domain>:7770"
export SHOPPING_ADMIN="<domain>:7780/admin"
export REDDIT="<domain>:9999"
export GITLAB="<domain>:8023"
export MAP="<domain>:3000"
export WIKIPEDIA="<domain>:8888/wikipedia_en_all_maxi_2022-05/A/User:The_other_Kiwix_guy/Landing"
export HOMEPAGE="<domain>:4399"  # placeholder
```

### 4.3 流程

```bash
# 1. 生成测试配置
python scripts/generate_test_data.py

# 2. 自动登录 cookies
mkdir -p ./.auth
python browser_env/auto_login.py

# 3. OpenAI key
export OPENAI_API_KEY=sk-...

# 4. 评测
python run.py \
  --instruction_path agent/prompts/jsons/p_cot_id_actree_2s.json \
  --test_start_idx 0 \
  --test_end_idx 1 \
  --model gpt-3.5-turbo \
  --result_dir <your_result_dir>
```

轨迹保存: `<result_dir>/0.html`

**论文 prompt**: `p_cot_id_actree_2s.json`（CoT + id + accessibility tree + 2-shot）

### 4.4 附带资源（News 实读）

- 2024-12: TheAgentCompany
- 2023-12-21: ~170 人类标注轨迹
- 2023-11-03: 执行轨迹 v2、**预装 AMI**、Zeno 分析 notebook
- 2023-10-24: v0.2.0 标注修复（相对稳定）
- 2023-08-04: Docker 自托管文档
- 2023-07-29: `minimal_example.py` 注释 walkthrough

---

## 5. Prompt-based Agent 开发（README 实读）

### 5.1 Prompt 字典结构

```python
prompt = {
  "intro": <guideline: task, actions, hint>,
  "examples": [(obs1, resp1), (obs2, resp2), ...],
  "template": <组织 observation/previous action/instruction/url>,
  "meta_data": {
    "observation": <观察空间类型>,
    "action_type": <动作空间类型>,
    "keywords": <template 关键词，程序枚举校验>,
    "prompt_constructor": <构造器类>,
    "action_splitter": <动作提取 splitter>,
  }
}
```

### 5.2 Prompt Constructor 接口

基线在 `agent/prompts/prompt_constructor.py#L184`（CoT/ReAct 风格）:

| 方法 | 职责 |
|------|------|
| `construct` | 构造 LLM 输入 |
| `_extract_action` | 从生成中提取动作短语 |

**设计**: keywords 枚举校验 → 模板变量未替换可检测。

---

## 6. 与 openmate 映射

| 需求 | WebArena 机制 | 可复用度 |
|------|--------------|----------|
| 自托管 web 环境 | 7 站点 Docker | **高** |
| Gym 式 env API | reset/step/obs | **高** |
| accessibility_tree 观察 | 降噪 DOM | **高** |
| id-based action | create_id_based_action | **高** |
| 视口控制 | current_viewport_only + size | 高 |
| JSON 任务配置 | config_files/*.json | **高** |
| auto_login cookies | browser_env/auto_login.py | **高** |
| Prompt 字典规范 | intro/examples/template/meta_data | **高** |
| keywords 枚举校验 | 防模板变量未替换 | **高** |
| prompt_constructor 接口 | construct + _extract_action | **高** |
| 评测 812 例 | 端到端 | 中 |
| AMI 预装 | 环境镜像 | 中 |
| AgentLab 推荐 | 并行/统一框架 | **高** |
| beartype/mypy | 类型契约 | 高 |

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.10 | README |
| viewport | 1280×720 | 示例 |
| 评测例数 | 812 | README |
| SHOPPING | :7770 | env |
| SHOPPING_ADMIN | :7780/admin | env |
| REDDIT | :9999 | env |
| GITLAB | :8023 | env |
| MAP | :3000 | env |
| WIKIPEDIA | :8888 + 路径 | env |
| HOMEPAGE | :4399 placeholder | env |
| 论文 prompt | p_cot_id_actree_2s.json | README |
| 示例模型 | gpt-3.5-turbo | README |
| 数据版本 | v0.2.0 | README |
| 类型检查 | mypy + beartype | badges |
| 人类轨迹 | ~170 任务 | News |
| Paper | arXiv:2307.13854 | README |

---

## 8. 失败路径 / 边界

```
用 demo 站做评测
  → 结果无效；必须自建

812 例后未 reset
  → 环境状态污染

URL env 未设
  → 站点连不上

auto_login 未跑
  → cookie 缺失

HOMEPAGE 是 placeholder
  → 4399 需自备

Wikipedia 路径长且固定
  → Kiwix 快照路径

本仓 vs AgentLab
  → 本仓 canonical 复现；实验推荐 AgentLab

prompt keywords 未替换
  → meta_data.keywords 枚举可检出

headless vs headed
  → 调试用 headed

Python != 3.10
  → 依赖风险
```

---

## 9. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **Gym 式 ScriptBrowserEnv**: reset(config) / step(action) / obs["text"]
2. **observation_type 可配**: accessibility_tree 降噪
3. **id-based action**: create_id_based_action("click [id]")
4. **JSON 任务配置文件**: config_files/*.json
5. **auto_login 独立脚本**生成 cookies
6. **Prompt 四键字典**: intro / examples / template / meta_data
7. **keywords 枚举校验**防模板泄漏
8. **prompt_constructor 双方法**: construct + _extract_action
9. **站点 URL 全 env 化**（7 个环境变量）
10. **canonical 实现 vs 增强框架分离**（webarena vs AgentLab）诚实推荐

### P1

- current_viewport_only + viewport_size
- AMI 预装镜像
- 人类轨迹 ~170 开放
- beartype + mypy 契约

### P2

- Zeno 分析集成
- TheAgentCompany 扩展

---

## 10. 应避免的坑

- 勿用 demo 站评测
- 812 例后必须 reset
- HOMEPAGE 4399 是 placeholder
- 实验优先 AgentLab
- 勿发明 browser_env 内部路径

---

## 11. 源码锚点速查

```
README.md
  Python 3.10, playwright, beartype, mypy, black, pre-commit
  ScriptBrowserEnv(headless, observation_type, current_viewport_only, viewport_size)
  reset(options={"config_file": ...})
  create_id_based_action(f"click [id]")
  env vars: SHOPPING:7770, SHOPPING_ADMIN:7780/admin, REDDIT:9999,
            GITLAB:8023, MAP:3000, WIKIPEDIA:8888/..., HOMEPAGE:4399
  scripts/generate_test_data.py
  browser_env/auto_login.py  → ./.auth
  run.py --instruction_path agent/prompts/jsons/p_cot_id_actree_2s.json
         --test_start_idx --test_end_idx --model --result_dir
  812 examples; reset after eval
  prompt dict: intro, examples, template, meta_data
  meta_data: observation, action_type, keywords, prompt_constructor, action_splitter
  constructor: agent/prompts/prompt_constructor.py#L184
    construct / _extract_action
  AMI preinstalled; human trajectories ~170; Zeno notebook
  v0.2.0 stable annotations
  Recommend AgentLab (BrowserGym parallel, unified leaderboard)
  Paper: arXiv:2307.13854
```

**未本轮打开**: `browser_env/`、`agents/`、`evaluation_harness/`。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | id-based actions |
| 权限/安全边界 | 3 | 自托管隔离 |
| 容错与会话恢复 | 2 | 无 checkpoint |
| 上下文工程 | 4 | accessibility_tree |
| 可扩展（技能/MCP） | 3 | prompt 可换 |
| 可观测与可评测 | 5 | 812 例 + 轨迹 HTML |
| 生产可用成熟度 | 3 | 自托管完整；实验推荐 AgentLab |

**综合**: **自托管 web agent 环境的 canonical 参考**。openmate 抄 Gym API、accessibility_tree、prompt 字典规范与 keywords 校验。

---

## 13. 关键链接

- https://github.com/web-arena-x/webarena
- https://github.com/ServiceNow/AgentLab/
- https://the-agent-company.com
- https://arxiv.org/abs/2307.13854
- 相关: `reports/mind2web-l1.md`、`reports/browser-use.md`、`reports/agentbench-l1.md`

---

## 14. 附录 A — Gym 式 Env openmate 接口（P0）

```python
class BrowserEnv:
    def __init__(self, headless=False, observation_type="accessibility_tree",
                 current_viewport_only=True, viewport_size={"width":1280,"height":720}): ...
    def reset(self, options={"config_file": "..."}) -> (obs, info): ...
    def step(self, action) -> (obs, reward, terminated, truncated, info): ...

def create_id_based_action(cmd: str) -> Action: ...
```

openmate:
- 对齐 Gym 五元组
- observation_type: html | accessibility_tree | screenshot
- 动作: id-based 优先，坐标兜底

---

## 15. 附录 B — Prompt 字典规范（P0）

```python
prompt = {
  "intro": "...",
  "examples": [(obs, resp), ...],
  "template": "... {observation} ... {previous_action} ...",
  "meta_data": {
    "observation": "accessibility_tree",
    "action_type": "id",
    "keywords": ["observation", "previous_action", "instruction", "url"],
    "prompt_constructor": "CoTIdActree",
    "action_splitter": "```",
  }
}
```

校验: 枚举 keywords，未替换则 fail。

Constructor 接口:
- `construct(...)` → LLM 输入
- `_extract_action(text)` → 动作

---

## 16. 附录 C — 站点 URL env 清单

```
SHOPPING=:7770
SHOPPING_ADMIN=:7780/admin
REDDIT=:9999
GITLAB=:8023
MAP=:3000
WIKIPEDIA=:8888/wikipedia_en_all_maxi_2022-05/A/...
HOMEPAGE=:4399  # placeholder
```

openmate: 7 env 全配；HOMEPAGE 需自备。

---

## 17. 附录 D — 失败路径明细

```
demo 站评测 → 无效
812 例后未 reset → 状态污染
URL env 缺 → 连不上
auto_login 未跑 → 无 cookie
HOMEPAGE 4399 placeholder → 需自备
keywords 未替换 → 校验失败
本仓 vs AgentLab → 实验用 AgentLab
Python != 3.10 → 依赖风险
```

---

## 18. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.10 | README |
| viewport | 1280x720 | 示例 |
| 评测例 | 812 | README |
| 论文 prompt | p_cot_id_actree_2s.json | README |
| 人类轨迹 | ~170 | News |
| 版本 | v0.2.0 | News |
| 类型 | mypy + beartype | badges |
| 推荐 | AgentLab | 2024-12-05 |

---

## 19. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | id-based |
| 权限安全 | 3 | 自托管 |
| 容错恢复 | 2 | 无 checkpoint |
| 上下文 | 4 | accessibility_tree |
| 可扩展 | 3 | prompt 可换 |
| 可观测 | 5 | 812 例 + 轨迹 |
| 成熟度 | 3 | 完整；荐 AgentLab |

**净推荐**: openmate 抄 **Gym API + a11y tree + prompt 字典 + keywords 校验** 为浏览器 Agent P0。
