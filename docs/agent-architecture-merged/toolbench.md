# Toolbench

## 概述

ToolBench 是由清华大学 OpenBMB 团队开发的**工具学习（Tool Learning）开放平台**，旨在为大语言模型提供训练、推理和评估的一体化框架。其核心目标是让开源 LLM 掌握 **16,464 个真实世界 REST API** 的调用能力，覆盖 3,451 个工具类别。，主要使用 Python（https://github.com/OpenBMB/ToolBench）

## 核心架构

- ToolBench 是由清华大学 OpenBMB 团队开发的**工具学习（Tool Learning）开放平台**，旨在为大语言模型提供训练、推理和评估的一体化框架。其核心目标是让开源 LLM 掌握 **16,464 个真实世界 REST API** 的调用能力，覆盖 3,451 个工具类别。
- 与传统的 function calling 研究不同，ToolBench 不仅关注"能不能调用工具"，更关注**多步推理、多工具协作**的复杂场景。项目的核心产出包括：
- - **ToolBench 数据集**：126K 条指令调优数据，469K 次真实 API 调用，平均每条推理链 4.0 步
- - **ToolLLaMA 模型**：基于 LLaMA 微调的工具使用专用模型，性能接近 ChatGPT
- - **ToolEval 评估框架**：自动化机器评估系统，替代昂贵的人工评估
- Stats: 3451 tools, 16464 APIs, 126486 instances, 469585 calls, 4.0 traces
- DFSDT: depth-first search decision tree
- G1/G2/G3: single / intra-cat / intra-collection multi-tool

## 关键技术

- 提供 API 服务接口，支持远程调用。`utils.py` 中实现了流式生成（`generate_stream`），支持温度采样、重复惩罚、Top-P/Top-K 等解码策略。
- torchrun --nproc_per_node=2 --master_port=20001 toolbench/train/train_mem.py \
- --model_name_or_path huggyllama/llama-7b \
- --data_path data/toolllama_G123_dfs_train.json \
- --conv_template tool-llama-single-round \
- --bf16 True \

## 对openmate的启示

- 1. **工具描述质量决定上限**：像评测一样优化 tool schema 与错误信息
- 2. **长工具集要检索/分层**：不能把全部工具塞进每轮 prompt

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
