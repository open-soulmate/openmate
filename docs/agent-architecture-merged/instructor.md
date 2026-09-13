# Instructor

## 概述

Instructor 是一个LLM结构化输出库。

**语言**: Python

## 核心架构

> **项目**: instructor-ai/instructor (567-labs/instructor)
> **定位**: 为 LLM 提供结构化输出的 Python 库，基于 Pydantic 实现类型安全的 JSON 提取
> **版本**: v1.17.1 | **Stars**: 13,000+ | **语言**: Python 100% | **许可证**: MIT
> **主页**: https://python.useinstructor.com/

Instructor 的代码库经历了从 v1 到 v2 的重大重构，当前采用 **兼容层 + 核心层** 的双层架构：

[详见源码]

**关键设计决策**：v1 的 `instructor.client`、`instructor.patch` 等模块已变为纯兼容 shim，通过 `__getattr__` 实现懒加载重定向到 v2。这意味着现有用户的代码无需改动，但新功能全部在 v2 中开发。

`IterableModel` 支持从流式响应中逐个提取列表项，适用于处理大量数据时不想等待完整响应的场景。内部维护 tasks 列表的流式 JSON 解析器，每完成一个 item 就 yield 一个 Pydantic 模型实例。

Instructor 提供了完整的事件钩子系统，用于监控和调试：

```python
class HookName(Enum):
    COMPLETION_KWARGS = "completion:kwargs"     # API 调用参数
    COMPLETION_RESPONSE = "completion:response"  # API 原始响应
    COMPLETION_ERROR = "completion:error"        # 调用错误
    COMPLETION_LAST_ATTEMPT = "completion:last_attempt"  # 最后一次尝试
    COMPLETION_USAGE = "completion:usage"        # Token 用量
    PARSE_ERROR = "parse:error"                  # 解析错误
```

Hooks 支持：
- `on()`/`off()` 注册和移除处理器
- `clear()` 清除指定或所有处理器
- `__add__`/`__iadd__` 合并多个 Hooks 实例
- `combine()` 类方法批量合并
- `copy()` 深拷贝
- 处理器错误被 `warnings.warn()` 捕获，不会中断主流程
- 通过 `inspect.signature()` 自动适配不同签名的处理器

顶层 `__init__.py` 通过 `__getattr__` 实现完全懒加载，所有导出（40+ 个符号）都通过 `_LAZY_IMPORTS` 字典延迟解析。`_add_optional_export()` 动态检测可选依赖（anthropic、google、mistral 等）是否安装，只导出可用的提供商。

Instructor 的架构可以用三个关键词概括：

1. **Schema-First**：Pydantic 模型即 JSON Schema，即 API 约束，即类型安全保障。开发者只需定义数据结构，所有 API 适配逻辑自动完成。

2. **Registry-Driven**：(Provider, Mode) → ModeHandlers 的中心注册表是整个系统的调度枢纽。每个提供商的每种交互模式都有独立的处理器，通过懒加载实现按需初始化。

3. **Retry-Resilient**：基于 tenacity 的智能重试引擎，结合 reask 机制（将验证错误反馈给 LLM 引导修正）和 token budget 控制，在可靠性与成本之间取得平衡。

这个架构使 Instructor 成为 LLM 结构化输出的事实标准——13,000+ Stars、250+ 贡献者、20+ 提供商支持、40+ 种交互模式，证明了"一个 Pydantic 模型搞定一切"的设计理念的成功。

## 关键技术

Instructor 解决的是一个极其具体的问题：**从 LLM 的非结构化文本输出中可靠地提取结构化数据**。传统方式需要手动编写 JSON Schema、处理验证错误、实现重试逻辑、解析不同提供商的 API 差异——Instructor 将这一切封装为一个极简接口：

[详见源码]

注册表支持两种注册方式：
- **即时注册**：`register()` 直接绑定处理器
- **懒加载注册**：`register_lazy()` 延迟到首次访问时才 import 提供商模块

懒加载通过 `_lazy_load_lock`（threading.Lock）保证线程安全——首次访问时只有一个线程执行 loader，其他线程等待后直接读取已加载的结果。这避免了 20+ 提供商模块在 import 时全部加载的开销。

[详见源码]python
_RETRYABLE_PARSE_ERRORS = (
    ValidationError,           # Pydantic 验证失败
    json.JSONDecodeError,      # JSON 解析错误
    AsyncValidationError,      # 异步验证错误
    ResponseParsingError,      # 响应解析错误
)
```

重试策略的核心逻辑：
- **token_budget**：可设置 token 预算上限，累积 usage 超过预算时终止重试
- **max_retries**：支持 int 或 tenacity 的 Retrying/AsyncRetrying 对象
- **reask 机制**：验证失败时，通过 reask_handler 将错误信息注入对话历史，引导 LLM 修正输出
- **usage 追踪**：每次重试后累加 token 使用量，支持 Anthropic 的 cache_creation_input_tokens 等特殊字段

```python
def _validate_token_budget(token_budget, *, response_model, kwargs):
    if token_budget is None:
        return
    # 检查累积 token 是否超过预算
```

---

## 对openmate的启示

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 我们（37-instructor.md）
