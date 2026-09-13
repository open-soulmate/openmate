# Unsloth

## 概述

- **GitHub**：https://github.com/unslothai/unsloth，主要使用 Python（https://github.com/unslothai/unsloth）

## 核心架构

- - **三形态**（README 实证）：
- 1. **Unsloth Desktop**（推荐）：原生桌面 App（Win .exe / macOS .dmg / Linux .deb / AppImage）。
- 2. **Unsloth Studio**：Web UI。
- 3. **Unsloth Core**：代码版（Python 库）。
- - **一键接入 Agent**：`unsloth start claude --model unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_XL`；支持 `claude / codex / hermes / openclaw / opencode / dsh` 等 Agent。

## 关键技术

- 1. **极致性能优化**：2× 训练速度、70% 更少显存、无精度损失（自研 kernel）。
- 2. **跨硬件广泛支持**：Win/Linux/macOS、NVIDIA/AMD/Intel/CPU、Vulkan 后端、MLX。
- 3. **Agent 友好的模型后端**：`unsloth start <agent>` 一行把本地模型接到主流编码 Agent，并提供 OpenAI 兼容 API——是"本地模型×Agent"的桥梁。
- 4. **训练到部署闭环**：Data Recipes → 微调 → 导出 GGUF/FP8 → 本地/远程服务。
- 5. **自动 compaction（滚动上下文窗）**：内置对长上下文的自动压缩，直接服务长任务 Agent。

## 对openmate的启示

- - **P0｜本地模型作为可插拔后端**：openmate 已有 Web 版并规划桌面/手机，Unsloth 的 `unsloth start <agent> --model <GGUF>` 范式提示——openmate 应把"模型后端"做成可插拔（云端 API / 本地 GGUF via Unsloth / OpenAI 兼容 API），桌面端优先本地模型保护隐私、手机端走云端。
- - **P1｜OpenAI 兼容 API 作为统一模型接口**：无论本地还是云，都暴露 OpenAI 兼容端点，Agent 内核只认这一种接口——这是多端/多模型的关键解耦点。
- - **P1｜自动 compaction（滚动上下文窗）内置**：Unsloth 把 compaction 做进运行时，openmate 长会话也应内置滚动上下文压缩，而非靠模型自己。

## 参考来源

- 豆包
