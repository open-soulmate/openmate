# GPT Researcher

## 概述

GPT Researcher 是一个AI深度研究Agent。

**仓库**: https://github.com/assafelovic/gpt-researcher | **语言**: Python

## 核心架构

> **项目**: [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher)
> **Stars**: 29k+ | **License**: Apache 2.0 | **语言**: Python
> **定位**: 首个开源深度研究 Agent，支持 Web 和本地数据源的自主研究与报告生成

GPT-Researcher 采用 **技能化（Skills-based）分层架构**，核心是一个中央协调 Agent（`GPTResearcher` 类），通过组合多个专职技能模块完成研究流程。架构灵感来自 [Plan-and-Solve](https://arxiv.org/abs/2305.04091) 和 [RAG](https://arxiv.org/abs/2005.11401) 论文。

[详见源码]

**Agent 核心类**的初始化展示了其模块化组合设计：

[详见源码]

该构造函数暴露了 **20+ 个可配置参数**，覆盖报告类型、数据源、LLM 角色、MCP 集成等维度，体现了高度可定制性。

`ResearchConductor` 是研究流程的核心编排器，负责从查询规划到上下文收集的全流程管理。它实现了 **多数据源路由** 和 **子查询并行执行** 两大关键模式。

[详见源码]

研究编排器支持 **5 种数据源模式**：Web、Local、Hybrid（本地+Web）、Azure Blob、LangChain Documents/VectorStore。每种模式都走独立的上下文收集路径。

class Config:
    CONFIG_DIR = os.path.join(os.path.dirname(__file__), "variables")

    def __init__(self, config_path=None):
        config_to_use = self.load_config(config_path)
        self._set_attributes(config_to_use)        # 基础属性
        self._set_embedding_attributes()            # 嵌入模型
        self._set_llm_attributes()                  # 多 LLM 类型（fast/smart/strategic）
        self._handle_deprecated_attributes()        # 废弃兼容
        self.mcp_servers = []                       # MCP 服务器配置
        self.mcp_allowed_root_paths = []            # MCP 安全路径

    def _set_attributes(self, config):
        for key, value in config.items():
            env_value = os.getenv(key)  # 环境变量优先于配置文件
            if env_value is not None:
                value = self.convert_env_value(key, env_value, BaseConfig.__annotations__[key])
            setattr(self, key.lower(), value)
```

配置优先级：**环境变量 > JSON 配置文件 > 代码默认值**。系统支持三种 LLM 角色：`fast_llm`（轻量任务）、`smart_llm`（复杂推理）、`strategic_llm`（查询规划），各自有独立的 provider/model/token_limit 配置。

GPT-Researcher 的设计哲学可以用三个关键词概括：**自主性**、**可组合性**、**成本意识**。

自主性体现在 Agent 可以独立完成从查询理解、信息检索、上下文压缩到报告生成的全流程，无需人工干预。可组合性体现在 Skills-based 架构使得每个模块（检索器、压缩器、写作者、深度研究器）都可以独立替换或扩展。成本意识则贯穿整个系统——从使用轻量 strategic_llm 做查询规划，到嵌入计算的阈值跳过优化，再到分步成本追踪，每一处都体现了对 API 调用成

## 关键技术

GPT-Researcher 提供了完善的成本追踪机制和分层配置体系：

[详见源码]

配置优先级：**环境变量 > JSON 配置文件 > 代码默认值**。系统支持三种 LLM 角色：`fast_llm`（轻量任务）、`smart_llm`（复杂推理）、`strategic_llm`（查询规划），各自有独立的 provider/model/token_limit 配置。

GPT-Researcher 的设计哲学可以用三个关键词概括：**自主性**、**可组合性**、**成本意识**。

自主性体现在 Agent 可以独立完成从查询理解、信息检索、上下文压缩到报告生成的全流程，无需人工干预。可组合性体现在 Skills-based 架构使得每个模块（检索器、压缩器、写作者、深度研究器）都可以独立替换或扩展。成本意识则贯穿整个系统——从使用轻量 strategic_llm 做查询规划，到嵌入计算的阈值跳过优化，再到分步成本追踪，每一处都体现了对 API 调用成本的精细控制。

## 对openmate的启示

1. **Three-tier LLM split** (fast/smart/strategic) with independent token caps — don't use the expensive model for summaries.
2. **Summary token ceiling of 700** per source — aggressive but keeps context bounded.
3. **Chunk length 8192** before summarization — matches common embedding/context sweet spots.
4. **SIMILARITY_THRESHOLD = 0.42** for dedup — tunable, not binary.
5. **Deep research as breadth×depth×concurrency** — explicit productized knobs.
6. **MCP auto-wire only when user didn't set RETRIEVER** — respect operator config.
7. **Image generation before writing** — UX ordering.
8. **Ex

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（20-gpt-researcher.md）
- MiMo报告（gpt-researcher.md）
