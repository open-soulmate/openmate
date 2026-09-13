# DSPy

## 概述

DSPy 是一个声明式LM编程框架。

**语言**: Python

## 核心架构

> **项目**: stanfordnlp/dspy | **Stars**: 37.6k | **许可**: MIT
> **定位**: "Programming — not prompting — Foundation Models"
> **全称**: Declarative Self-improving Python

DSPy 是 Stanford NLP 团队开发的声明式语言模型编程框架，核心理念是用**组合式 Python 代码**替代脆弱的 prompt 工程，通过编译器自动优化 LM 的 prompt 和权重。本文从 10 个维度深入分析其架构设计。

Module 的 `__call__` 通过元类注入回调机制，并维护调用栈追踪：

[详见源码]

Predict 的后处理阶段将执行轨迹记录到全局 trace 中：

[详见源码]

| 维度 | 设计要点 |
|------|---------|
| **核心抽象** | Module（组合）+ Predict（调用）+ Signature（类型） |
| **优化机制** | 通过修改 Predict.demos 实现 prompt 自动优化 |
| **LM 抽象** | 多引擎（auto/lm15/litellm/自定义），统一 BaseLM 接口 |
| **类型系统** | 自研轻量类型检查，支持泛型、Union、Literal |
| **状态管理** | 完整序列化/反序列化，安全过滤敏感键 |
| **执行模型** | 同步/异步双通道，回调追踪，并行批处理 |
| **微调集成** | Provider 模式，后台线程执行，TrainingJob 轮询 |
| **流式支持** | anyio MemoryStream，chunk 级别推送 |
| **安全设计** | 加载状态时过滤 api_base/base_url，防止 prompt 注入 |
| **元类防护** | ProgramMeta 保证属性初始化，forward 直调警告 |

DSPy 的架构精髓在于**关注点分离**：用户只声明"做什么"（Signature + Module），框架自动决定"怎么做"（Adapter + Optimizer）。这种声明式范式使得 LM 程序可以像传统软件一样被测试、优化和部署，是 Agent 架构设计中值得关注的范式创新。

## 关键技术

DSPy 的根本创新在于将 LM 调用从"手写 prompt 字符串"提升为"声明式 Python 程序"。用户定义输入/输出签名（Signature），编写组合逻辑（Module），框架自动处理 prompt 构造和优化。

README 中明确阐述：

[详见源码]python
class Predict(Module, Parameter):
    """Basic DSPy module that maps inputs to outputs using a language model."""
    def __init__(self, signature: str | type[Signature],
                 callbacks: list[BaseCallback] | None = None, **config):
        super().__init__(callbacks=callbacks)
        self.stage = random.randbytes(8).hex()
        self.signature = ensure_signature(signature)
        self.config = config
        self.reset()

    def reset(self):
        self.lm = None
        self.traces = []
        self.train = []
        self.demos = []
[详见源码]

DSPy 实现了完整的类型检查系统，支持 `Union`、`Literal`、泛型容器（`list[str]`、`dict[str, int]`）等复杂类型，且不依赖外部库（如 typeguard），自行实现了轻量级的 `_check_type` 递归检查器。

Predict 的 `forward` 方法将实际的 LM 通信委托给 Adapter：

[详见源码]

Adapter 的职责是将 Signature + demos + inputs 转化为 LM 可理解的 messages 格式，并将 LM 输出解析回结构化的 `Prediction`。默认使用 `ChatAdapter`，但用户可以替换为自定义 Adapter，实现不同的 prompt 模板策略。

Module 的 `__call__` 通过元类注入回调机制，并维护调用栈追踪：

[详见源码]

Predict 的后处理阶段将执行轨迹记录到全局 trace 中：

[详见源码]

---

## 对openmate的启示

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（15-dspy.md）
