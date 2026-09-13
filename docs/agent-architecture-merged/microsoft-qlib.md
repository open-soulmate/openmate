# Microsoft Qlib

## 概述

| 项目名 | Qlib（pip 包名 `pyqlib`） |，主要使用 Python（https://github.com/microsoft/qlib）

## 核心架构

- 经 raw 探测（`qlib/config.py` HTTP 200）确认包根为 `qlib/`。典型结构（README/docs 与已知布局）：
- ├── config.py          # 【核心】全局 Config 单例 + provider 注册表 + qlib.init()
- ├── data/              # 数据层：表达式引擎(Ref($close,1) DSL)、calendar/instrument/feature/PIT provider、dataset handler
- ├── rl/                # 强化学习子框架（env/agent/algorithm）

## 关键技术

- 1. **PIT（point-in-time）数据层**：从根上杜绝量化研究最大坑——未来函数/数据泄漏，是工程严谨性的体现。
- 2. **表达式 DSL + 可插拔 provider**：`Ref($close,1)` 类领域语言让研究员用声明式写因子，provider 注册表让后端可本地/在线无缝切换。
- 3. **模型统一接口 + Paper Zoo**：SOTA 模型统一在 `fit/predict` 接口下，复现论文成本极低。
- 4. **全链路覆盖**：alpha→风险→组合→执行→分析一站打通，而非只是个训练库。
- 5. **RD-Agent 自动研发 loop**：把量化 R&D 拆成 Specification/Synthesis 等多 LLM 单元，自动挖因子、写代码、回测、迭代（README 头条 + arXiv:2505.15155）。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】全局配置单例 + provider 注册表（可插拔后端）**：照搬 `Config` 单例 + provider map 的模式——openmate 接不同模型/工具/记忆后端时，别写死，做成"默认 Local*Provider、按配置注入"。这正是 openmate 多端（Web/桌面/手机）需要的"同一套 agent 逻辑、不同端提供不同能力后端"。
- - **【P0】point-in-time / 防未来函数式的数据正确性**：openmate 若处理历史/时序/多轮状态，学 Qlib 把"不能用到尚未发生的信息"做进数据层，而非靠调用方自觉——从源头防上下文泄漏与状态错乱。

## 参考来源

- 豆包
