# OpenBMB/AgentVerse — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/OpenBMB/AgentVerse  
> 抓取通道: cdn.jsdelivr.net/gh/OpenBMB/AgentVerse@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供双框架（task-solving / simulation）/ 五规则环境 / 多 Agent 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（双框架、安装、CLI、本地模型、showcases）
- 未打开: `agentverse/` 源码实现
- Paper: arXiv:2308.10848（ICLR 2024）
- License: Apache-2.0
- Python: **3.9+**

---

## 1. 项目定位（README 实读）

**AgentVerse** 部署多 LLM-based agents，提供两套框架：

1. **Task-solving**: 多 Agent 自动系统协作完成任务（软件开发、咨询等）
2. **Simulation**: 自定义环境观察/交互多 Agent 行为（游戏、社会行为研究）

**警告（README 实读）**: 代码正在重构。需要纯 simulation 稳定版请用 **`release-0.1`** 分支。

Minecraft 示例在 **`minecraft`** 分支。

---

## 2. 双框架模块结构（README 实读）

### 2.1 Simulation

```
agentverse
  ├── agents
  │     └── simulation_agent
  └── environments
        └── simulation_env
```

CLI:
```shell
agentverse-simulation --task simulation/nlp_classroom_9players
agentverse-simulation-gui --task simulation/nlp_classroom_9players
# GUI: http://127.0.0.1:7860/
```

带工具的 simulation（如 `nlp_classroom_3players_withtool`）需装 **BMTools**:
```bash
git clone git+https://github.com/OpenBMB/BMTools.git
cd BMTools
pip install -r requirements.txt
python setup.py develop
```
不装 BMTools 则无工具的 simulation 仍可跑。

### 2.2 Task-Solving

```
agentverse
  ├── agents
  │     └── simulation_env    # README 此处标注似有笔误
  └── environments
        └── tasksolving_env
```

CLI:
```shell
# Benchmark
agentverse-benchmark --task tasksolving/humaneval/gpt-3.5 \
  --dataset_path data/humaneval/test.jsonl --overwrite

# 单查询
agentverse-tasksolving --task tasksolving/brainstorming

# 工具使用（需 XAgent ToolServer）
agentverse-tasksolving --task tasksolving/tool_using/24point
```

工具任务在 `agentverse/tasks/tasksolving/tool_using/`；需先按 [XAgent](https://github.com/OpenBMB/XAgent) 搭建 ToolServer。

---

## 3. 环境五规则组件（README 注释块实读）

环境抽象为 **5 个规则组件**，实现不同环境 = 实现不同规则：

| 组件 | 职责 |
|------|------|
| **Describer** | 每回合为每 agent 描述环境（可交互对象等） |
| **Order** | 行动顺序：`random` / `sequential` / `concurrent` |
| **Selector** | 过滤 agent 生成的无效消息 |
| **Updater** | 更新各 agent 记忆（仅更新可见者，如同房间） |
| **Visibility** | 维护各 agent 可见列表（换房时更新） |

### 3.1 Agent 类型

- **ConversationAgent**
- **ToolAgent**
- 可继承 `BaseAgent` 自定义

### 3.2 自定义环境步骤（README 注释）

1. 在 `agentverse/tasks` 建任务目录
2. 写 `config.yaml`
3. 写 output parser
4. 在 `agentverse/tasks/__init__.py` 注册 parser

#### config.yaml 示例（README 实读）

```yaml
environment:
  env_type: basic
  max_turns: 10
  rule:
    order:
      type: sequential
    visibility:
      type: all
    selector:
      type: basic
    updater:
      type: basic
    describer:
      type: basic

agents:
  - agent_type: conversation
    name: Professor Micheal
    role_description: You are Prof. Micheal, ...
    memory:
      memory_type: chat_history
    prompt_template: *professor_prompt
    llm:
      llm_type: text-davinci-003
      model: text-davinci-003
      temperature: 0.7
      max_tokens: 250
```

Parser 注册:
```python
@output_parser_registry.register('classroom_parser')
```

Prompt 格式示例:
```
Action: Speak
Action Input: (the content)
```

---

## 4. 本地模型支持（README 实读）

### 4.1 vLLM

```bash
export VLLM_API_KEY="your_api_key_here"
export VLLM_API_BASE="http://your_vllm_url_here"
```

config:
```yaml
model_type: vllm
model: llama-2-7b-chat-hf
```

### 4.2 FSChat (FastChat)

```bash
pip install -r requirements_local.txt
bash scripts/run_local_model_server.sh  # 默认 Llama 7B chat
```

支持的 `MODEL_NAME`（README 实读）:
- llama-2-7b-chat-hf
- llama-2-13b-chat-hf
- llama-2-70b-chat-hf
- vicuna-7b-v1.5
- vicuna-13b-v1.5

新增模型需改 `agentverse/llms/__init__.py` 的 `LOCAL_LLMS` + `LOCAL_LLMS_MAPPING`。

config:
```yaml
llm:
  llm_type: local
  model: llama-2-7b-chat-hf
```

参考: `agentverse/tasks/tasksolving/commongen/llama-2-7b-chat-hf/config.yaml`

---

## 5. Showcases（README 列表实读）

### 5.1 Simulation

| 场景 | 说明 |
|------|------|
| NLP Classroom 9 players | 教授点名学生举手发言 |
| Prisoner Dilemma | 两理性 agent 合作/背叛 |
| SDE Team | writer + tester + reviewer 协作写码 |
| DB Diagnosis | Chief DBA + 领域专家诊断 |
| ChatEval | 多 agent 裁判团评文本（独立仓） |
| Pokemon | 仅 release-0.1；uvicorn:10002 + npm ui |

### 5.2 Task-Solving

- Humaneval benchmark
- brainstorming
- tool_using/24point 等

### 5.3 环境规则示例（注释列表）

1. nlp_classroom_3players — sequential
2. nlp_classroom_9players — 举手+点名
3. nlp_classroom_9players_group — 小组讨论
4. nlp_classroom_3players_withtool — Bing search
5. math_problem_2players_tools — WolframAlpha
6. prisoner_dilema
7. db_diag
8. sde_team
9. pokemon

---

## 6. 安装（README 实读）

```bash
git clone https://github.com/OpenBMB/AgentVerse.git --depth 1
cd AgentVerse
pip install -e .
# 或
pip install -U agentverse

# 本地模型
pip install -r requirements_local.txt
```

Env:
```bash
export OPENAI_API_KEY="..."
# Azure
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_API_BASE="..."
```

---

## 7. 与 openmate 映射

| 需求 | AgentVerse 机制 | 可复用度 |
|------|----------------|----------|
| 双框架分离 | task-solving vs simulation | **高** |
| 环境五规则 | Describer/Order/Selector/Updater/Visibility | **高** |
| Order 类型 | random/sequential/concurrent | **高** |
| 可见性过滤 | Visibility + Updater 只更新可见者 | **高** |
| 无效消息过滤 | Selector | **高** |
| config.yaml 声明环境 | environment+agents+rule | **高** |
| output parser 注册表 | @output_parser_registry.register | **高** |
| memory_type | chat_history | 中 |
| 多 LLM 后端 | OpenAI/Azure/vLLM/FSChat | **高** |
| ToolServer 外置 | XAgent ToolServer | 中 |
| BMTools 可选 | 带工具 simulation | 中 |
| GUI | Gradio 7860 | 中 |
| Benchmark CLI | agentverse-benchmark | 中 |
| 分支策略 | release-0.1 稳定 / minecraft 专题 | 高 |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9+ | README badge |
| max_turns 示例 | 10 | config 示例 |
| temperature 示例 | 0.7 | config 示例 |
| max_tokens 示例 | 250 | config 示例 |
| GUI 端口 | 7860 | README |
| Pokemon server | 10002 | README |
| 本地模型 | 5 个 MODEL_NAME | README |
| vLLM env | VLLM_API_KEY, VLLM_API_BASE | README |
| Order 类型 | random, sequential, concurrent | README 注释 |
| License | Apache-2.0 | README |
| Paper | arXiv:2308.10848 ICLR 2024 | README |
| 稳定 simulation | release-0.1 分支 | README |

---

## 9. 失败路径 / 边界

```
main 分支重构中
  → simulation 稳定请用 release-0.1

带工具 simulation 无 BMTools
  → 该类任务失败；无工具任务仍可跑

tool_using 任务无 ToolServer
  → 需先建 XAgent ToolServer

新增本地模型
  → 必须改 LOCAL_LLMS + LOCAL_LLMS_MAPPING

Pokemon
  → 仅 release-0.1；需 uvicorn + npm

Parser 未注册
  → tasks/__init__.py 必须 import

无效 agent 输出
  → Selector 过滤；basic 则不过滤

跨房间消息
  → Visibility + Updater 控制；config 错则泄漏/丢失
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **环境五规则组件化**: Describer / Order / Selector / Updater / Visibility
2. **Order 三型**: random / sequential / concurrent
3. **可见性驱动的记忆更新**（Updater 只更新可见者）
4. **Selector 无效输出过滤**
5. **config.yaml 声明环境+agents+rule**
6. **output parser 注册表模式**
7. **双框架目录分离**: tasksolving_env vs simulation_env
8. **多 LLM 后端统一 llm_type**（openai/azure/vllm/local）
9. **LOCAL_LLMS + LOCAL_LLMS_MAPPING 双表**扩展本地模型
10. **稳定分支策略**: release-0.1 冻结 / main 重构

### P1

- ToolServer 外置（XAgent）
- BMTools 可选依赖
- agentverse-benchmark CLI
- Gradio GUI 端口约定

### P2

- Pokemon 游戏化 simulation
- ChatEval 裁判团模式

---

## 11. 应避免的坑

- 勿在生产依赖 main（重构中）
- 带工具任务必须先 BMTools / ToolServer
- 新增本地模型必须改双表
- Parser 必须在 tasks/__init__.py 注册
- 勿发明 agentverse/ 内部实现路径

---

## 12. 源码锚点速查

```
README.md
  Dual framework: task-solving + simulation
  Modules: agents/{simulation_agent,simulation_env}, environments/{simulation_env,tasksolving_env}
  Env rules: Describer, Order, Selector, Updater, Visibility
  Order: random | sequential | concurrent
  Agents: ConversationAgent, ToolAgent, BaseAgent
  CLI: agentverse-simulation, agentverse-simulation-gui,
       agentverse-tasksolving, agentverse-benchmark
  GUI: 127.0.0.1:7860
  Config: environment.max_turns, rule.*, agents[].llm
  Parser: @output_parser_registry.register
  Local: VLLM_API_KEY/BASE; FSChat scripts/run_local_model_server.sh
  MODEL_NAME: llama-2-7b/13b/70b-chat-hf, vicuna-7b/13b-v1.5
  LOCAL_LLMS + LOCAL_LLMS_MAPPING in agentverse/llms/__init__.py
  Tools: BMTools optional; XAgent ToolServer for tool_using
  Branches: release-0.1 (stable sim), minecraft
  Paper: arXiv:2308.10848
  License: Apache-2.0
```

**未本轮打开**: `agentverse/` 实现。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | ToolAgent + ToolServer |
| 权限/安全边界 | 2 | 研究向 |
| 容错与会话恢复 | 2 | 无 checkpoint 叙事 |
| 上下文工程 | 5 | 五规则 + 可见性 |
| 可扩展（技能/MCP） | 4 | 规则组件可换 |
| 可观测与可评测 | 3 | benchmark CLI |
| 生产可用成熟度 | 2 | 研究框架；main 重构中 |

**综合**: **环境五规则 + 双框架的多 Agent 研究平台**。openmate 抄五规则组件、可见性记忆、Selector 过滤与 config 声明式环境。

---

## 14. 关键链接

- https://github.com/OpenBMB/AgentVerse
- https://arxiv.org/abs/2308.10848
- https://github.com/OpenBMB/BMTools
- https://github.com/OpenBMB/XAgent
- 相关: `reports/camel-l1.md`、`reports/chatdev-l1.md`、`reports/crewai.md`

---

## 15. 附录 A — 环境五规则 openmate 接口（P0）

```python
class Environment:
    describer: Describer   # 每回合每 agent 描述
    order: Order           # random|sequential|concurrent
    selector: Selector     # 过滤无效输出
    updater: Updater       # 更新可见者记忆
    visibility: Visibility # 可见列表
```

openmate:
- 五组件可插拔
- 默认 basic 实现
- 自定义通过 config 注入

---

## 16. 附录 B — config.yaml 声明式环境（P0）

```yaml
environment:
  env_type: basic
  max_turns: 10
  rule:
    order: { type: sequential }
    visibility: { type: all }
    selector: { type: basic }
    updater: { type: basic }
    describer: { type: basic }
agents:
  - agent_type: conversation
    name: Professor Micheal
    role_description: You are Prof. Micheal, ...
    memory: { memory_type: chat_history }
    prompt_template: *professor_prompt
    llm:
      llm_type: text-davinci-003
      model: text-davinci-003
      temperature: 0.7
      max_tokens: 250
```

Parser 注册:
```python
@output_parser_registry.register('classroom_parser')
```

---

## 17. 附录 C — 可见性记忆更新

```
agent A 发言
  → Visibility: 谁能看到 A？
  → Updater: 只更新可见者的 memory
  → 不可见者无感知
```

场景: 不同房间、小组讨论、私聊。

openmate: 可见性为一等；默认 all，可配 group/room。

---

## 18. 附录 D — 失败路径明细

```
main 重构中 → simulation 用 release-0.1
带工具 simulation 无 BMTools → 失败
tool_using 无 ToolServer → 需 XAgent
新增本地模型 → 必须改 LOCAL_LLMS 双表
Pokemon → 仅 release-0.1
Parser 未注册 → tasks/__init__.py
无效输出 → Selector 过滤（basic 不滤）
跨房间泄漏 → Visibility/Updater 配错
```

---

## 19. 附录 E — 本地模型双表

```python
# agentverse/llms/__init__.py
LOCAL_LLMS = [...]
LOCAL_LLMS_MAPPING = { name: hf_id }
```

支持: llama-2-7b/13b/70b-chat-hf, vicuna-7b/13b-v1.5

vLLM:
```
VLLM_API_KEY, VLLM_API_BASE
model_type: vllm
```

---

## 20. 附录 F — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| 双框架 | task-solving + simulation | README |
| 五规则 | Describer/Order/Selector/Updater/Visibility | README 注释 |
| Order | random/sequential/concurrent | README |
| GUI | 7860 | README |
| max_turns 示例 | 10 | config |
| Python | 3.9+ | badge |
| 稳定分支 | release-0.1 | README |
| Paper | ICLR 2024 arXiv:2308.10848 | README |

---

## 21. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | ToolAgent + ToolServer |
| 权限安全 | 2 | 研究向 |
| 容错恢复 | 2 | 无 checkpoint |
| 上下文 | 5 | 五规则 + 可见性 |
| 可扩展 | 4 | 规则可换 |
| 可观测 | 3 | benchmark CLI |
| 成熟度 | 2 | 研究；main 重构 |

**净推荐**: openmate 抄 **五规则组件 + 可见性记忆 + Selector + 声明式 config** 为多 Agent 环境 P0。
