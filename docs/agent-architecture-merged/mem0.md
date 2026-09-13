# Mem0

## 概述

Mem0 将自身定义为 **"The Memory Layer for Personalized AI"**，不是一个 RAG 框架，不是向量数据库，而是一个面向 Agent 的**记忆中间层**。它的核心命题是：AI 助手应该像人一样"记住"对话上下文、用户偏好和历史事实，而不是每次会话都从零开始。，主要使用 Python（https://github.com/mem0ai/mem0）

## 核心架构

- class MemoryBase(ABC):
- @abstractmethod
- def get(self, memory_id): ...
- @abstractmethod
- def get_all(self): ...
- 顶层（经 jsDelivr 包清单确认）：
- ├── memory/
- │   ├── main.py            # Memory 类核心（~45k 字符），add/search/get/delete 主流程

## 关键技术

- 1. **UUID 映射反幻觉（源码确认）**：Phase 1 把真实 UUID 换成 `0..N` 序号交给 LLM，再在输出时映射回真实 ID——避免 LLM 编造不存在的记忆 ID，是工业级记忆系统的关键细节。
- 2. **批量 + 降级的管线设计（源码确认）**：Phase 3/6/7 一律先 `*_batch` 批量，异常时逐条重试（`except Exception: for ... embed()/insert()`），兼顾吞吐与健壮性。
- 3. **MD5 哈希 + 语义双重去重（源码确认）**：精确文本用 MD5（快、零成本），跨记忆的实体关系用向量 `score>=0.95` 语义合并——精确与模糊两层。
- 4. **多租户/多作用域隔离（源码确认）**：`user_id/agent_id/run_id/actor_id` 强制通过 filters 传递，`_strip_identity_keys()` 防止调用方通过 metadata 越权写入他人作用域（注释引用 issue #6655）。
- 5. **配置深拷贝容错**：`_safe_deepcopy_config()` 对不可序列化对象（如 OpenSearch 的 AWSV4SignerAuth）走 `model_dump()` 重建，并区分"运行时字段（保留）"与"敏感字段（置空）"。
- class Memory(MemoryBase):          # L487
- def add(                       # L760
- user_id=None, agent_id=None, app_id=None, run_id=None,

## 对openmate的启示

- Mem0 的架构对 OpenMate 的 Agent 记忆系统设计有直接参考价值：
- 1. **接口极简主义**：`MemoryBase` 只有 5 个方法，但足以支撑完整记忆生命周期。OpenMate 的记忆接口也应遵循最小完备原则。
- 2. **工厂模式 + 配置驱动**：所有组件通过 Factory 创建，零硬编码。这使得同一套代码可以跑在 OpenAI 云端，也可以跑在本地 Ollama。
- - **P0｜记忆增删改四态 + 反幻觉 UUID 映射**：openmate 的长期记忆不要只做"追加"。引入 `ADD/UPDATE/DELETE/NONE` 判定（可直接参考 `DEFAULT_UPDATE_MEMORY_PROMPT`），并把内部实体 ID 用序号喂给 LLM、输出再映射回真 ID。预期：记忆不再无限膨胀/自相矛盾，长期对话一致性显著提升。
- - **P0｜批量管线 + 单点失败降级**：openmate 写记忆时先批量 embed/批量落库，失败自动逐条重试。预期：批量吞吐高，且单条坏数据不中断整条记忆写入链路。

## 参考来源

- 我们
- 豆包
- MiMo报告
