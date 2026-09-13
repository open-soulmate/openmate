# Mind2Web

## 概述

Mind2Web 是**首个面向通用网页智能体（Generalist Web Agent）的数据集与基准**。其核心问题是：如何构建一个能在**任意网站**上遵循自然语言指令完成复杂任务的智能体？，主要使用 Python（https://github.com/OSU-NLP-Group/Mind2Web）

## 核心架构

- Mind2Web 是**首个面向通用网页智能体（Generalist Web Agent）的数据集与基准**。其核心问题是：如何构建一个能在**任意网站**上遵循自然语言指令完成复杂任务的智能体？
- 与此前工作（MiniWoB++、WebShop 等）的关键区别在于三个"通用性"要求：
- - **网站多样性**：覆盖 137 个真实网站、31 个领域（旅行、购物、服务、娱乐、信息等），而非模拟环境
- - **真实环境**：直接操作真实世界的网页，包含动态内容、噪声和复杂 DOM 结构
- - **交互广度**：支持点击（CLICK）、输入（TYPE）、选择（SELECT）三种操作，任务需要多步跨页面完成
- HF: osunlp/Mind2Web
- Test zip password: mind2web
- Canary: 26b5c67b-..., 4bbb7293-...

## 关键技术

- - https://github.com/OSU-NLP-Group/Mind2Web
- - https://huggingface.co/datasets/osunlp/Mind2Web
- - https://arxiv.org/abs/2306.06070
- - https://osu-nlp-group.github.io/SeeAct/
- - 相关: `reports/webarena-l1.md`、`reports/browser-use.md`、`reports/agentbench-l1.md`

## 对openmate的启示

- Mind2Web 的架构设计对 OpenMate 的 Agent 架构有以下借鉴：
- 1. **网页工具返回要瘦身**：完整 DOM 不可直接喂模型，需可交互元素摘要
- 2. **动作可回放**：录制操作轨迹便于调试与回归

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
