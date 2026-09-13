# OpenBMB/ToolBench — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/OpenBMB/ToolBench（ToolLLM）  
> 抓取通道: cdn.jsdelivr.net/gh/OpenBMB/ToolBench@master/README.md  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 DFSDT 规划 / API 检索 / ToolEval 评测 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（数据统计、训练、推理、ToolEval、结果表）
- 分支: **master**（`@main` 404）
- 未打开: `toolbench/` 源码实现
- Paper: arXiv:2307.16789
- License: Apache-2.0（数据研究/教育用途声明）

---

## 1. 数据规模（README badge + 表实读）

| 指标 | 值 |
|------|-----|
| Tool Num | **3451** |
| API Num | **16464** |
| Dataset Size | **126K**（表: 126486 instances） |
| Total API Call | **469K**（表: 469585） |
| Average Reasoning Traces | **4.0** |
| Model | ToolLLaMA Released |

数据来源: RapidAPI 16000+ REST APIs。

---

## 2. 核心方法（README 实读）

### 2.1 数据构建流程

```
API Collection (16464 REST from RapidAPI)
  → Instruction Generation (single-tool + multi-tool)
  → Answer Annotation via DFSDT
  → API Retriever 训练
```

### 2.2 DFSDT（Depth-First Search based Decision Tree）

- 增强 LLM 规划与推理
- 解决 CoT/ReACT 无法处理的复杂指令
- 响应包含: **最终答案 + 推理过程 + 工具执行 + 执行结果**

### 2.3 指令分类

| 类 | 场景 |
|----|------|
| G1 | single-tool |
| G2 | intra-category multi-tool |
| G3 | intra-collection multi-tool |

全部场景均用 DFSDT 标注。

---

## 3. 数据目录结构（README 实读）

```
data/
├── instruction/          # 指令数据
├── answer/               # 解路径标注
├── toolenv/              # API jsons / codes / example responses
├── retrieval/            # 工具检索数据
├── test_instruction/
├── test_query_ids/
├── retrieval_test_query_ids/
├── toolllama_G123_dfs_train.json
└── toolllama_G123_dfs_eval.json
reproduction_data/
├── chatgpt_cot/
├── chatgpt_dfs/
└── toolllama_dfs/
```

Atlas Explorer 可视化链接在 README。

---

## 4. 模型与训练（README 实读）

### 4.1 发布模型

| 模型 | 说明 |
|------|------|
| ToolLLaMA-2-7b-v2 | 最新数据，最强 |
| ToolLLaMA-7b-v1 | 0801 数据 |
| ToolLLaMA-7b-LoRA-v1 | LoRA 版 |
| ToolBench_IR_bert_based_uncased | 工具 retriever |

### 4.2 Retriever 训练（真实超参）

```bash
python toolbench/retrieval/train.py \
    --data_path data/retrieval/G1/ \
    --model_name bert-base-uncased \
    --output_path retrieval_model \
    --num_epochs 5 \
    --train_batch_size 32 \
    --learning_rate 2e-5 \
    --warmup_steps 500 \
    --max_seq_length 256
```

### 4.3 ToolLLaMA 训练（真实超参，2×A100 80GB）

```bash
torchrun --nproc_per_node=2 --master_port=20001 toolbench/train/train_mem.py \
    --model_name_or_path huggyllama/llama-7b \
    --data_path data/toolllama_G123_dfs_train.json \
    --conv_template tool-llama-single-round \
    --bf16 True \
    --num_train_epochs 2 \
    --per_device_train_batch_size 2 \
    --gradient_accumulation_steps 8 \
    --learning_rate 5e-5 \
    --warmup_ratio 0.04 \
    --lr_scheduler_type "cosine" \
    --fsdp "full_shard auto_wrap" \
    --fsdp_transformer_layer_cls_to_wrap 'LlamaDecoderLayer' \
    --source_model_max_length 2048 \
    --model_max_length 8192 \
    --gradient_checkpointing True
```

LoRA: `deepspeed toolbench/train/train_lora.py`，epochs 5，stage2。

---

## 5. 推理（README 实读）

### 5.1 关键推理参数

```bash
--max_observation_length 1024
--observ_compress_method truncate
--method DFS_woFilter_w2
--retrieved_api_nums 5   # open-domain
```

### 5.2 环境变量

```bash
export TOOLBENCH_KEY="..."   # 官方 RapidAPI 代理
export RAPIDAPI_KEY="..."    # 自有 key + --use_rapidapi_key
export OPENAI_KEY="..."
```

### 5.3 backbone_model

- `toolllama`
- `chatgpt_function`
- `davinci`

### 5.4 API 自定义格式（README 实读）

```json
{
  "tool_description": "Return hello world.",
  "tool_name": "hello world",
  "title": "hello world",
  "api_list": [{
    "name": "get_hello_world",
    "url": "",
    "description": "To get 'hello world'.",
    "method": "GET",
    "required_parameters": [],
    "optional_parameters": []
  }],
  "standardized_name": "hello_world"
}
```

配套 `api.py`:
```python
def get_hello_world():
    observation = "hello world"
    return observation
```

目录: `data/toolenv/tools/<Category>/<tool>.json` + `<tool>/api.py`

**限制**: 自定义 API 目前仅 close-domain。

---

## 6. ToolEval（README 实读）

### 6.1 两指标

| 指标 | 定义 |
|------|------|
| **Pass Rate** | 有限 OpenAI API 调用内完成指令比例 |
| **Preference / Win Rate** | 两答案对比，ChatGPT 评委多次取优 |

### 6.2 评委可靠性（真实数字）

- Pass rate 与人类一致: **87.1%**
- Win rate 与人类一致: **80.3%**

### 6.3 评测脚本参数

```bash
python eval_pass_rate.py \
    --max_eval_threads 20 \
    --evaluate_times 7

python eval_preference.py \
    --use_pass_rate true \
    --evaluate_times 7
```

OpenAI key 放 JSON pool 文件（username/passwd/api_key/organization）。

---

## 7. 主实验结果（README 表实读）

### 7.1 Pass Rate Average

| Method | Model | Avg |
|--------|-------|-----|
| ReACT | Claude-2 | 6.8 |
| ReACT | Text-Davinci-003 | 16.5 |
| ReACT | ChatGPT | 40.2 |
| ReACT | ToolLLaMA | 29 |
| ReACT | GPT4 | 57.2 |
| DFSDT | Claude-2 | 22.6 |
| DFSDT | Text-Davinci-003 | 43.1 |
| DFSDT | ChatGPT | 64.8 |
| DFSDT | ToolLLaMA | **66.7** |
| DFSDT | ToolLLaMA-Retriever | **67.3** |
| DFSDT | GPT4 | **71.1** |

### 7.2 Win Rate Average（ref: ChatGPT-ReACT）

| Method | Model | Avg |
|--------|-------|-----|
| ReACT | ToolLLaMA | 47 |
| ReACT | GPT4 | 64.4 |
| DFSDT | ChatGPT | 64.3 |
| DFSDT | ToolLLaMA | 60 |
| DFSDT | ToolLLaMA-Retriever | 63.1 |
| DFSDT | GPT4 | **70.4** |

**结论**: DFSDT 显著优于 ReACT；ToolLLaMA+DFSDT 接近 ChatGPT。

---

## 8. Web UI（README 实读）

- 前端: chatbot-ui-toolllama（fork）
- 后端: `toolbench/inference/toolbench_server.py` → `http://localhost:5000/stream`
- 请求: `{"text": "...", "top_k": 5, "method": "DFS_woFilter_w2"}`

---

## 9. 与 openmate 映射

| 需求 | ToolBench 机制 | 可复用度 |
|------|---------------|----------|
| DFSDT 决策树规划 | depth-first search 工具调用 | **高** |
| 观察压缩 | max_observation_length=1024 + truncate | **高** |
| Open-domain 工具检索 | retriever + retrieved_api_nums=5 | **高** |
| API schema 标准化 | tool_description/api_list JSON | **高** |
| API 自定义目录约定 | tools/<Cat>/<tool>.json + api.py | **高** |
| ToolEval 双指标 | Pass Rate + Win Rate | **高** |
| 评委一致性验证 | 87.1% / 80.3% | **高** |
| 多 backbone | toolllama / chatgpt_function / davinci | 高 |
| Key 池 | JSON pool 多 key 负载 | 中 |
| 评测并发 | max_eval_threads=20, evaluate_times=7 | 中 |

---

## 10. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Tools | 3451 | badge |
| APIs | 16464 | badge |
| Instances | 126486 | 表 |
| API calls | 469585 | 表 |
| Reasoning traces avg | 4.0 | badge |
| max_observation_length | 1024 | 推理脚本 |
| observ_compress_method | truncate | 推理脚本 |
| method | DFS_woFilter_w2 | 推理脚本 |
| retrieved_api_nums | 5 | open-domain |
| Retriever epochs | 5 | 训练脚本 |
| Retriever batch | 32 | 训练脚本 |
| Retriever lr | 2e-5 | 训练脚本 |
| Retriever max_seq | 256 | 训练脚本 |
| ToolLLaMA epochs | 2 | 训练脚本 |
| ToolLLAma lr | 5e-5 | 训练脚本 |
| model_max_length | 8192 | 训练脚本 |
| source_model_max_length | 2048 | 训练脚本 |
| ToolEval evaluate_times | 7 | 评测脚本 |
| max_eval_threads | 20 | 评测脚本 |
| 评委一致 pass/win | 87.1% / 80.3% | README |
| Web server | 5000 | README |
| 分支 | master | CDN |
| License | Apache-2.0 | README |

---

## 11. 失败路径 / 边界

```
TOOLBENCH_KEY 缺失
  → 需表单申请

RapidAPI server IP 变更
  → 2024.8 更新；需最新代码或本地搭建

自定义 API
  → 仅 close-domain 支持

Open-domain + 自定义
  → TODO 未支持

data.zip 未下载
  → 脚本无法导航数据

Python < 3.9
  → 不支持

ToolEval 无 OpenAI key pool
  → 评测失败

Webshop 类任务内存
  → 见 AgentBench；本仓 Web UI 独立
```

---

## 12. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **DFSDT**: 工具调用的 depth-first 决策树（优于线性 ReACT）
2. **观察截断**: max_observation_length + truncate 压缩方法
3. **工具检索器**: open-domain 检索 top-k APIs（默认 5）
4. **API 文档 JSON schema**: tool_description + api_list + standardized_name
5. **tools/<Category>/<tool>.json + api.py 目录约定**
6. **ToolEval 双指标**: Pass Rate + Preference/Win Rate
7. **LLM 评委与人类一致性量化**（87.1%/80.3%）
8. **多 backbone 统一 pipeline**（toolllama/chatgpt_function/davinci）
9. **Key pool JSON** 多 key 负载均衡
10. **G1/G2/G3 难度分层**（单工具/类内多工具/集合内多工具）

### P1

- 评测 evaluate_times=7 多次取稳
- max_eval_threads 并发控制
- Web UI stream 端点

### P2

- StableToolBench（API 模拟稳定评测）
- Atlas Explorer 可视化

---

## 13. 应避免的坑

- 用 master 不是 main
- TOOLBENCH_KEY 需申请
- 自定义 API 仅 close-domain
- 训练需 2×A100 80GB
- 数据研究用途声明；勿当生产工具目录
- 勿发明 toolbench/ 内部路径

---

## 14. 源码锚点速查

```
README.md
  Stats: 3451 tools, 16464 APIs, 126486 instances, 469585 calls, 4.0 traces
  DFSDT: depth-first search decision tree
  G1/G2/G3: single / intra-cat / intra-collection multi-tool
  Models: ToolLLaMA-2-7b-v2, ToolLLaMA-7b-v1, LoRA, IR bert retriever
  Train retriever: bert-base-uncased, 5 epochs, bs 32, lr 2e-5, seq 256
  Train ToolLLaMA: 2xA100, 2 epochs, lr 5e-5, max_len 8192
  Infer: max_observation_length=1024, truncate, DFS_woFilter_w2
  Open-domain: retrieved_api_nums=5
  Env: TOOLBENCH_KEY, RAPIDAPI_KEY, OPENAI_KEY
  backbone: toolllama | chatgpt_function | davinci
  ToolEval: Pass Rate + Win Rate; 87.1%/80.3% human agreement
  Eval: evaluate_times=7, max_eval_threads=20
  Web: toolbench_server.py :5000/stream
  Results: DFSDT ToolLLaMA-Retriever pass 67.3, GPT4 71.1
  Paper: arXiv:2307.16789
  License: Apache-2.0
```

**未本轮打开**: `toolbench/` 实现。

---

## 15. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | DFSDT + 检索 |
| 权限/安全边界 | 2 | 研究向 |
| 容错与会话恢复 | 2 | 无 |
| 上下文工程 | 4 | 观察截断 + 压缩 |
| 可扩展（技能/MCP） | 4 | API 自定义 schema |
| 可观测与可评测 | 5 | ToolEval 双指标 + 一致性 |
| 生产可用成熟度 | 2 | 研究数据集/训练框架 |

**综合**: **工具学习的 DFSDT + 检索 + 评测黄金参考**。openmate 抄 DFSDT、观察截断、API schema 与 ToolEval 双指标。

---

## 16. 关键链接

- https://github.com/OpenBMB/ToolBench
- https://arxiv.org/abs/2307.16789
- https://github.com/zhichengg/StableToolBench
- 相关: `reports/agentbench-l1.md`、`reports/mcp.md`、`reports/composio.md`

---

## 17. 附录 A — DFSDT openmate 实现要点（P0）

```
线性 ReACT: 调工具 → 观察 → 调工具 → ... → 答
DFSDT:     决策树节点可回溯 / 分支 / 深度优先探索
```

openmate:
- 工具调用支持 backtrack
- 每节点: action + observation + score
- 预算: max_nodes / max_depth / max_api_calls
- 失败分支可剪枝

失败路径:
```
无限分支 → max_nodes 截断
观察过长 → truncate 1024
API 失败 → 重试后标记死分支
```

---

## 18. 附录 B — API Schema 标准（P0）

```json
{
  "tool_description": "...",
  "tool_name": "...",
  "title": "...",
  "api_list": [{
    "name": "get_xxx",
    "url": "",
    "description": "...",
    "method": "GET|POST",
    "required_parameters": [],
    "optional_parameters": []
  }],
  "standardized_name": "xxx"
}
```

目录: `tools/<Category>/<tool>.json` + `<tool>/api.py`

---

## 19. 附录 C — ToolEval 双指标

| 指标 | 定义 | 人类一致 |
|------|------|----------|
| Pass Rate | 有限调用内完成比例 | 87.1% |
| Win Rate | 两答案偏好 | 80.3% |

openmate:
- 评测必须双指标
- evaluate_times ≥7
- 报告与人类一致率

---

## 20. 附录 D — 关键推理常量

```
max_observation_length = 1024
observ_compress_method = truncate
method = DFS_woFilter_w2
retrieved_api_nums = 5
backbone = toolllama | chatgpt_function | davinci
```

---

## 21. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | DFSDT + 检索 |
| 权限安全 | 2 | 研究向 |
| 容错恢复 | 2 | 无 |
| 上下文 | 4 | 观察截断 |
| 可扩展 | 4 | API schema |
| 可观测 | 5 | ToolEval 双指标 |
| 成熟度 | 2 | 研究框架 |

**净推荐**: openmate 工具学习模块以 **DFSDT + 观察截断 + API schema + ToolEval** 为 P0。
