# AgentBench

## 概述

AgentBench 是一个Agent评测基准。

**仓库**: https://github.com/THUDM/AgentBench | **语言**: Python

## 核心架构

> **项目地址**: [THUDM/AgentBench](https://github.com/THUDM/AgentBench)
> **论文**: [arXiv:2308.03688](https://arxiv.org/abs/2308.03688) (ICLR 2024)
> **团队**: 清华大学 THUDM (唐杰团队)

AgentBench 采用**三层解耦架构**，将整个评测系统分为三个独立组件，通过 HTTP 协议通信，支持分布式部署：

AgentBench 的配置系统基于 YAML 并做了三个语法扩展：

- **`import`**：支持从其他文件导入配置，递归合并
- **`default`**：定义默认值，低优先级合并
- **`overwrite`**：覆盖已有值，高优先级

配置目录结构清晰：`configs/assignments/`（任务分配）、`configs/agents/`（Agent 定义）、`configs/tasks/`（任务定义）、`configs/start_task.yaml`（启动配置）。这种分层配置使得切换模型、调整并发、增减任务变得非常简单。

## 关键技术

AgentBench 是**首个系统性评测 LLM 作为自主 Agent 能力的多维度基准**。不同于传统的 NLP benchmark（如 MMLU、HumanEval 等单轮问答或代码生成），AgentBench 专注于评估 LLM 在**交互式环境**中的多轮推理、决策和执行能力。

其核心理念是：LLM 的真正价值不仅在于"回答问题"，更在于"自主完成任务"。因此，AgentBench 构建了 8 个截然不同的环境，涵盖操作系统操控、数据库查询、知识图谱推理、卡牌策略博弈、网页浏览等场景，从多个维度全面检验 LLM 的 Agent 能力。

AgentBench 通过 `Task` 基类定义了统一的任务接口：

```python
class Task:
    def get_indices(self) -> List[SampleIndex]: ...
    async def start_sample(self, index, session) -> TaskSampleExecutionResult: ...
    def calculate_overall(self, results) -> Dict[str, Any]: ...
    def release(self): ...
```

扩展新任务只需继承 `Task` 并实现这四个方法。`Session` 对象提供 `inject()` 和 `action()` 两个方法，分别用于注入历史记录和等待 Agent 响应。`SampleStatus` 枚举（COMPLETED、AGENT_CONTEXT_LIMIT、TASK_ERROR 等）支持精细化的失败原因统计。

AgentBench 的配置系统基于 YAML 并做了三个语法扩展：

- **`import`**：支持从其他文件导入配置，递归合并
- **`default`**：定义默认值，低优先级合并
- **`overwrite`**：覆盖已有值，高优先级

配置目录结构清晰：`configs/assignments/`（任务分配）、`configs/agents/`（Agent 定义）、`configs/tasks/`（任务定义）、`configs/start_task.yaml`（启动配置）。这种分层配置使得切换模型、调整并发、增减任务变得非常简单。

AgentBench 论文揭示了几个重要发现：

1. **商业模型领先但差距显著**：GPT-4 等顶级商业模型表现突出，但与开源 70B 以下模型存在显著差距
2. **失败原因分析**：长期推理能力不足、决策质量低、指令遵循能力差是主要障碍
3. **代码训练的双面性**：与传统假设不同，代码训练数据对不同 Agent 任务的影响是**矛盾的**——在某些任务上有帮助，在另一些任务上反而有害
4. **指令遵循和多轮对齐是关键**：提升指令遵循能力和使用高质量多轮对齐数据可以改善 Agent 性能

## 对openmate的启示

> 路径纠错: 用户指定 `OpenBMB/AgentBench`；`cdn.jsdelivr.net/gh/OpenBMB/AgentBench@main` 与 `@master` 均 **404**。  
> 实际成功拉取: **`THUDM/AgentBench@main/README.md`**（清华 THUDM，论文 arXiv:2308.03688）  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 LLM-as-Agent 多环境评测 / 容器化任务 / FC 版本 借鉴

---

| 需求 | AgentBench 机制 | 可复用度 |
|------|----------------|----------|
| 多环境统一评测 | 8 环境 + FC 5 环境 | **高** |
| 容器化 task worker | Docker per task | **高** |
| Controller + worker | AgentRL Controller | **高** |
| Redis 容器分配 | 可复用本机 Redis 7+ | **高** |
| Lite preset | 低内存 1 worker/task | **高** |
| 资源表公开 | 启动时间 + 内存 | **高** |
| 泄漏已知问题 | alfworld 泄漏；需重启 worker | **P0 警示** |
| Python pin | 3.9 + numpy~=1.23 | 高 |
| 端口范围声明 | 5000-5015 | 高 |
| sparql_url 可配 | KG 本地化 | 中 |
| Dev/Test 分裂 | 4k / 13k 生成 | 中 |
| agent_test 自检 | 配置验证命令 | **高** |

---

```
openmate-eval/
  docker-compose.yml
    controller
    redis (or external)
    workers: one per env
  configs/
    start_task_lite.yaml      # 1 worker/env
    assignments/lite.yaml
    agents/openai-chat.yaml
...

强制项:
- RESOURCE_TABLE 必填
- KNOWN_ISSUES 必填
- agent_test 必须先于 assigner

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（90-agentbench.md）
- MiMo报告（agentbench-l1.md）
- MiMo卡片（agentbench.md）
