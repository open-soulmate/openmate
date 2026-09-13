# 026 · opendatalab/MinerU 源码调研报告

> 调研日期：2026-09-13 ｜ 调研方式：README 全文精读 ｜ 注：本项目为**文档解析工具（RAG 数据预处理），非 Agent 系统**

## 1. 项目概述与定位

- **项目名称**：MinerU
- **GitHub**：https://github.com/opendatalab/MinerU
- **Star 数**：约 79,791（rank 26）
- **主要语言**：Python
- **一句话定位**：把 PDF / 图像 / DOCX / PPTX / XLSX 转换为机器可读 Markdown / JSON 的文档解析工具，为下游检索、抽取、处理（Agentic RAG）做文档清洗。
- **目标用户/场景**：需要把科研文献、复杂版式文档灌入 LLM/RAG 流水线的开发者；诞生于 InternLM 预训练过程，专攻学术文献的符号（公式/表格）转换。
- **成熟度**：高，OpenDataLab 出品，OmniDocBench v1.6 端到端评测得分 86.47（pipeline）~95.39（VLM-engine），提供 CLI / FastAPI / Gradio WebUI / mineru-router。
- **重要定性**：**本身不含 LLM 推理循环或工具调用**，而是作为 RAG/Agent 的**数据预处理组件**被调用，故稳定性/高可用/自我进化等 Agent 专属章节标注"不适用"并说明原因。

## 2. 源码结构总览

- **核心定位**：magic-pdf 线性解析流水线（architecture_batch2 已查证）。
- **四种解析后端**（README 部署表实证）：
  1. `pipeline`（多小模型级联，兼容性好，纯 CPU 可跑，最低 4GB VRAM）
  2. `*-engine`（hybrid / vlm，解耦式视觉语言模型，精度最高 95.39，需 8GB VRAM，不支持纯 CPU）
  3. `*-http-client`（对接 OpenAI 兼容服务器 vLLM/SGLang/LMDeploy，仅需 2GB VRAM）
- **入口**：CLI `mineru -p <input> -o <output> [-b pipeline]`；亦提供 FastAPI / Gradio WebUI / mineru-router 多服务部署。
- **依赖**：Python 3.10–3.13；关键依赖 `ray`（Windows 下不支持 3.13）；底层 DocLayout-YOLO / PaddleOCR / UniMERNet 等检测识别模型。
- **代码规模**：中大型 Python 包（`mineru[all]`），含版面分析、OCR（109 语言）、公式→LaTeX、表格→HTML、阅读顺序排序模块。

## 3. 系统架构分析

- **编排模式**：**Workflow-DAG（线性流水线）**，非 ReAct/Plan-and-Execute——无模型决策分支，是固定阶段的级联。
- **数据流**：PDF/图像输入 → 版面分析（去页眉/页脚/脚注/页码）→ OCR（自动检测扫描件/乱码件触发）→ 公式检测识别（→LaTeX）→ 表格识别（→HTML）→ 阅读顺序排序（单/多栏复杂版式）→ 输出按阅读序的 Markdown/JSON + 可视化 span。
- **核心组件**：版面检测、OCR、公式识别（UniMERNet）、表格结构识别、阅读顺序模型；后端可在 pipeline（小模型级联）与 vlm-engine（粗到细两阶段 VLM）间切换。
- **架构图**：`Input(PDF/Img/Office) → [Layout → OCR → Formula → Table → ReadingOrder] → Markdown/JSON`，后端可插拔（pipeline/hybrid/vlm/http-client）。

## 4. 功能拆解

- **输入**：PDF、图像、DOCX、PPTX、XLSX。
- **版式**：去噪去页眉页脚，按阅读序输出，保留标题/段落/列表结构，抽取图片/图注/表格/表题/脚注。
- **公式**：自动转 LaTeX；**表格**：自动转 HTML。
- **OCR**：109 语言，自动识别扫描/乱码 PDF。
- **输出**：多模态 Markdown、按阅读序 JSON、丰富中间格式；版面/span 可视化用于质量确认。
- **部署形态**：CLI / FastAPI / Gradio / router，纯 CPU 或 GPU/MPS 加速，跨 Win/Linux/macOS。

## 5. 技术亮点与优势

1. **双后端精度/成本权衡**：pipeline 兼容好可纯 CPU（4GB VRAM），vlm-engine 精度 95.39（8GB VRAM），http-client 把重模型推到 OpenAI 兼容服务器（本地仅 2GB）——三种形态覆盖从边缘到服务端的部署谱。
2. **学术符号专精**：公式→LaTeX、表格→HTML，针对科研文献做了深度优化。
3. **自动触发 OCR**：检测到扫描/乱码 PDF 自动启用 OCR，无需用户预判。
4. **阅读序排序**：单/多栏复杂版式按人读顺序输出，直接适配 RAG chunk。
5. **开放可评测**：以 OmniDocBench 公开分数自证精度，鼓励附样本提 issue 改进。

## 6. 稳定性机制

- **不适用（Agent 稳定性章节）**：MinerU 是确定性流水线工具，无 Agent 推理循环、无重试/熔断/状态持久化概念。
- **工程层面**：明确只在推荐软硬件主线环境做优化测试，非主线环境要求先读 FAQ（多数问题 FAQ 已有解）；Docker 部署以解决环境兼容问题；Windows 下因 `ray` 不支持 3.13 而限定 3.10–3.12——这是其"稳定性"策略：收敛支持矩阵而非无限兼容。

## 7. 高可用机制

- **不适用（Agent 高可用章节）**：无并发 Agent 调度/无状态横向扩展诉求。
- **工程层面**：提供 FastAPI 服务端 + mineru-router 多服务部署，可作为独立微服务被上游 Agent 调用；GPU/CPU 双路径保证降级。

## 8. 自我进化机制

- **不适用（Agent 自我进化章节）**：无反思/记忆/自反馈循环。
- **工程层面**：以 issue 收集真实难例样本持续改进模型（"attach the relevant document"），精度靠模型版本迭代提升。

## 9. openmate 可借鉴点

- **P0｜把"文档摄入"做成独立可插拔预处理服务**：openmate 桌面/手机端若要做知识库/RAG，应把 MinerU 这类解析器独立成预处理微服务（FastAPI），与 Agent 主循环解耦——重模型走 vlm/http-client，轻量走 pipeline。
- **P1｜精度/成本分级后端**：同一解析任务提供"兼容 CPU / 高精度 GPU / 远程 VLM 服务器"三档，openmate 在不同设备（手机 NPU vs 桌面 GPU vs 云）上可按算力选档。
- **P1｜阅读序优先输出**：直接产出按阅读序的 Markdown/JSON，openmate 的 RAG chunk 层可省去二次重排。
- **P2｜收敛支持矩阵**：与其无限兼容环境，不如明确推荐配置并配 FAQ，openmate 多端发布时可借鉴这种"主线环境保障"策略。

## 10. 源码验证标注

- **文档直接读取**：README（输入类型、关键特性、四种后端对比表含精度/VRAM/RAM/磁盘/Python 版本、安装与 CLI 用法）。
- **架构来源**：architecture_batch2（magic-pdf 流水线、DocLayout-YOLO/PaddleOCR/UniMERNet、pipeline 与 vlm-engine 双后端）。
- **源码不可得**：未拉取 `magic_pdf/` 源文件逐行阅读；流水线各阶段的具体实现代码未确认，架构判断以 README 与已查证架构信息为准。
