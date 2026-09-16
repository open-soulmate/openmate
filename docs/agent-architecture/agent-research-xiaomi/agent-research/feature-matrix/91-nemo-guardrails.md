# NVIDIA NeMo-Guardrails 功能研究

研究时间：2026-09-16（cron第26轮）
GitHub: https://github.com/NVIDIA/NeMo-Guardrails （Apache-2.0，Python，938个py文件）
研究方式：shallow clone源码逐一阅读核心模块

## 架构概述

NeMo-Guardrails是一个**可编程对话安全层**，插在应用和LLM之间。核心思想：
- **Colang DSL**（v1.0/v2.0两代）：用专用语言编写对话"轨道"(rails)，描述bot应该/不应该做什么
- **四种rails**：input rails（输入过滤）→ dialog rails（对话流程控制）→ retrieval rails（RAG过滤）→ output rails（输出过滤）
- **Rails Runtime**：Colang解释器 + 事件驱动运行时（v2.0是完全事件驱动的多轮状态机）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **对话轨道DSL（Colang）**：专用语言定义对话流程、意图、槽位、规范形式(canonical forms) | ❌无 | ❌无（will/工作流是Python硬编码） | 完全没有 | 价值高难度大。可先做YAML声明式对话规则（意图→动作映射），不必实现完整DSL解释器 |
| 2 | **Input Rails管线**：输入依次过多个检查器，任一拒绝即拦截 | ❌无 | 部分：immune/moderator只做PII正则脱敏 | 部分有 | 在OpenSoul入口加rails管线框架：每个rail是一个async函数，支持allow/reject/transform三种结果 |
| 3 | **Jailbreak检测**：启发式（per-model预训练模式库）+ transformer分类器两级 | ❌无 | ❌无（intrusion.py只防web层攻击，不防prompt攻击） | 完全没有 | 高价值。第一版：移植nemoguardrails的heuristic检测器（纯正则+模式，零依赖）即可覆盖大量攻击 |
| 4 | **Prompt Injection检测**：基于embedding相似度（injection_embeddings）+ transformer | ❌无 | ❌无 | 完全没有 | 高价值高优先。本地embedding模型（如bge-small）对已知注入模式做相似度匹配 |
| 5 | **Output Rails含幻觉检查**：self-check（LLM自我核对）+ fact-checking（对RAG检索内容核对） | ❌无 | 部分：cortex/quality.py有质量评估但非幻觉检测 | 部分有 | self-check模式可直接抄：让LLM用另一个prompt判断"生成内容是否被上下文支持" |
| 6 | **Topic Control**：定义允许/禁止话题，embedding分类器判断输入是否离题 | ❌无 | ❌无 | 完全没有 | 中价值中难度。用户可配置话题白名单，对售前/企业场景有用 |
| 7 | **敏感数据检测+脱敏（Presidio集成+自定义NER）**：输入输出双向 | ❌无 | 部分：moderator.py正则版（手机号/身份证/银行卡CN模式，比NemO更贴中国场景） | 部分有 | OpenSoul已有正则版；可加gliner/Presidio NER补充非结构化实体（人名/公司名） |
| 8 | **外部Rails生态集成**：Llama Guard、Guardrails AI、Patronus、Cleanlab、PrivateAI、ActiveFence、GCP Moderation、CrowdStrike等20+ | ❌无 | ❌无 | 完全没有 | 不必全接。设计rail接口时预留"第三方检查器"协议，按需接1-2个开源的（Llama Guard本地可跑） |
| 9 | **Action Server / Action Dispatcher**：rails和业务动作解耦，动作可跑在独立服务器 | ❌无 | 部分：will/工作流+MCP已能调工具 | 部分有 | OpenSoul的MCP机制已覆盖"外部能力调用"，缺的是rails层调用动作的统一入口 |
| 10 | **流式支持（streaming.py）**：rails检查与流式输出兼容，边生成边过滤 | ✅前端流式展示 | 部分 | 部分有 | 难点在output rail要缓冲句子级chunk检查。可先做"逐句检查+缓冲"策略 |
| 11 | **对话状态跟踪（v2.0事件驱动运行时）**：多轮状态机、并行流、子流程 | ❌无 | 部分：intelligence/意图+will/状态机 | 部分有 | OpenSoul有意图和工作流状态机，但缺"以对话为中心"的流程定义 |
| 12 | **KB检索轨道（Retrieval Rails）**：对RAG检索结果做相关性/事实性过滤后再进上下文 | ❌无 | 部分：cortex/graphrag.py | 部分有 | GraphRAG管道中加"检索结果过滤rail"，价值高实现中等 |
| 13 | **评估工具包（evaluate/ + benchmark）**：对rails配置做自动化测试、回归评估 | ❌无 | 部分：src/benchmark/ | 部分有 | OpenSoul有benchmark目录但需确认是否含安全用例库。可导入NeMo的注入/jailbreak测试集 |
| 14 | **OpenTelemetry追踪（tracing/）**：rails执行链路可视化 | ❌无 | 部分：vital/运维 | 部分有 | 结合本轮Langfuse研究结论统一做可观测性 |
| 15 | **YAML声明式配置**：models、rails、instructions全部YAML配置化 | ✅config.yaml | ✅config | 已有 | 已有类似机制 |
| 16 | **VSCode扩展**：Colang语言server（高亮/补全） | ❌ | ❌ | 完全没有 | 低优先级，DSL成熟后再做 |
| 17 | **LLM参数守卫**：generation options校验、temperature等参数约束、模型白名单 | ❌无 | 部分：.env有LLM_MAX_TOKENS | 部分有 | 低价值，参数已由配置管理 |
| 18 | **上下文膨胀检测（context_bloat_detection）**：检测并阻止上下文被恶意撑大 | ❌无 | 部分：reflex缓存+上下文压缩在acp-proxy | 部分有 | 已有压缩机制，缺"攻击性膨胀"检测（低优先级） |

## 源码亮点

1. **`nemoguardrails/library/`的插件化检查器设计**：每个检查器一个目录（jailbreak_detection/、hallucination/、injection_detection/…），统一action接口，注册制加载。这是OpenSoul immune/应该学的结构——现在intrusion.py和moderator.py是两个平铺文件，20+检查器后会失控。
2. **两级检测策略**：heuristic（快、零成本、覆盖已知模式）先过，transformer分类器（慢、准、覆盖未知）兜底。售前场景完全适用：先正则/模式，可疑的再上小模型。
3. **Colang v2.0的事件驱动运行时**（`colang/v2_x/runtime/`）：对话流程=事件流，支持并行轨道和中断恢复。虽然我们不必实现DSL，但"对话=事件流"的思想可以注入OpenSoul的will/模块。
4. **`rails/llm/utils.py`中的LLM调用包装**：所有rails内部的LLM调用统一走一个入口，自带缓存和超时——避免安全检查自身拖垮响应。

## 可复用设计（针对OpenSoul）

- **Rail管线框架**（最高价值，1-2天可落地）：
  ```
  # opensoul/src/immune/rails.py
  class RailResult(Enum): ALLOW / REJECT / TRANSFORM
  class BaseRail: async def check(text, ctx) -> RailResult, reason
  class RailPipeline: 按序执行，REJECT即停，TRANSFORM改写后继续
  ```
  先移植NemO的jailbreak启发式检测（纯正则）+ 现有moderator接进管线 = 一天见效。
- **检查器目录化重构**：immune/ 改为 immune/rails/<name>/ 每个检查器独立目录+注册，为将来接第三方（Llama Guard）留口子。
- **self-check幻觉检测prompt**：直接抄`library/self_check/`的实现思路，接入cortex/quality.py。
- **测试用例库**：NeMo的tests/里有大量注入/jailbreak样本，可直接导入做OpenSoul安全回归测试集。

## 与OpenMate的对接

OpenMate已有 `src/app/(app)/immune/immune-client.tsx` 安全页面。建议：
- 免疫页面增加"Rails"标签页：展示各rail的开关、命中统计、拦截日志
- 命中详情展示：哪个rail、什么模式、原始输入（脱敏后）
