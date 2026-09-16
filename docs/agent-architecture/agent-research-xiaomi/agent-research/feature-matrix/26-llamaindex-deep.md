# LlamaIndex 源代码深度研究

研究时间：2026-09-16 04:25
源码：github.com/run-llama/llama_index（52.1k stars）

## 已读源代码文件

### 1. llama-index-core/llama_index/core/tools/function_tool.py
- FunctionTool核心实现
- 继承：AsyncBaseTool
- 属性：fn, async_fn, callback, async_callback, partial_params
- requires_context：是否需要Context
- ctx_param_name：Context参数名
- from_defaults()：从默认创建
- to_langchain_tool()：转换为LangChain工具
- extract_param_docs()：提取参数文档（Sphinx/Google/Javadoc风格）
- 关键设计：函数工具+上下文+回调+LangChain兼容

### 2. llama-index-core/llama_index/core/memory/chat_memory_buffer.py
- ChatMemoryBuffer核心实现
- 继承：BaseChatStoreMemory
- token_limit：token限制
- tokenizer_fn：分词器函数
- from_defaults()：从LLM创建
- get()：获取聊天历史（token限制内）
- _token_count_for_messages()：计算消息token数
- 关键设计：token缓冲+智能裁剪+分词器

## 核心架构发现

### 1. 工具系统
- FunctionTool：函数工具
- 上下文检测：Context参数
- 回调：callback/async_callback
- LangChain兼容：to_langchain_tool()
- 文档提取：Sphinx/Google/Javadoc风格

### 2. 记忆系统
- ChatMemoryBuffer：token缓冲
- 智能裁剪：token_limit内保留最近消息
- 工具消息处理：TOOL/ASSISTANT消息对
- 分词器：可配置

### 3. 内容块系统
- TextBlock/ImageBlock/AudioBlock/VideoBlock
- CitableBlock/CitationBlock/DocumentBlock
- ContentBlock：内容块基类

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 函数工具系统 | ❌ | ❌ | 大 | FunctionTool+上下文+回调 |
| Token缓冲记忆 | ❌ | ❌ | 大 | ChatMemoryBuffer+智能裁剪 |
| 内容块系统 | ❌ | ❌ | 大 | TextBlock/ImageBlock/AudioBlock/VideoBlock |
| LangChain兼容 | ❌ | ❌ | 中 | to_langchain_tool() |
| 文档提取 | ❌ | ❌ | 中 | Sphinx/Google/Javadoc风格 |

## 可复用设计

1. **函数工具系统**：FunctionTool+上下文检测+回调+LangChain兼容
2. **Token缓冲记忆**：ChatMemoryBuffer+智能裁剪+工具消息对处理
3. **内容块系统**：TextBlock/ImageBlock/AudioBlock/VideoBlock/CitableBlock
4. **LangChain兼容**：to_langchain_tool()/to_langchain_structured_tool()
5. **文档提取**：extract_param_docs()支持多种风格
