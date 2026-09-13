# Mineru

## 概述

- **GitHub**：https://github.com/opendatalab/MinerU，主要使用 Python（https://github.com/opendatalab/MinerU）

## 核心架构

- - **核心定位**：magic-pdf 线性解析流水线（architecture_batch2 已查证）。
- - **四种解析后端**（README 部署表实证）：
- 1. `pipeline`（多小模型级联，兼容性好，纯 CPU 可跑，最低 4GB VRAM）
- 2. `*-engine`（hybrid / vlm，解耦式视觉语言模型，精度最高 95.39，需 8GB VRAM，不支持纯 CPU）
- 3. `*-http-client`（对接 OpenAI 兼容服务器 vLLM/SGLang/LMDeploy，仅需 2GB VRAM）

## 关键技术

- 1. **双后端精度/成本权衡**：pipeline 兼容好可纯 CPU（4GB VRAM），vlm-engine 精度 95.39（8GB VRAM），http-client 把重模型推到 OpenAI 兼容服务器（本地仅 2GB）——三种形态覆盖从边缘到服务端的部署谱。
- 2. **学术符号专精**：公式→LaTeX、表格→HTML，针对科研文献做了深度优化。
- 3. **自动触发 OCR**：检测到扫描/乱码 PDF 自动启用 OCR，无需用户预判。
- 4. **阅读序排序**：单/多栏复杂版式按人读顺序输出，直接适配 RAG chunk。
- 5. **开放可评测**：以 OmniDocBench 公开分数自证精度，鼓励附样本提 issue 改进。

## 对openmate的启示

- - **P0｜把"文档摄入"做成独立可插拔预处理服务**：openmate 桌面/手机端若要做知识库/RAG，应把 MinerU 这类解析器独立成预处理微服务（FastAPI），与 Agent 主循环解耦——重模型走 vlm/http-client，轻量走 pipeline。
- - **P1｜精度/成本分级后端**：同一解析任务提供"兼容 CPU / 高精度 GPU / 远程 VLM 服务器"三档，openmate 在不同设备（手机 NPU vs 桌面 GPU vs 云）上可按算力选档。
- - **P1｜阅读序优先输出**：直接产出按阅读序的 Markdown/JSON，openmate 的 RAG chunk 层可省去二次重排。

## 参考来源

- 豆包
