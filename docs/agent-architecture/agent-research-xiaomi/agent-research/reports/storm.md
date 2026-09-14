# Stanford-oval/storm — 多视角研究写作系统调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/stanford-oval/storm |
| 包名 | `knowledge-storm`（pip） |
| 语言 | Python 3.11；实现基于 **DSPy** 高度模块化 |
| License | 仓库 License（研究代码；论文 NAACL 2024 / EMNLP 2024） |
| 定位一句话 | 从零写出带引用的维基百科式长文：预写作（检索+大纲）→ 写作（全文）；Co-STORM 加入人机协作话语 |
| 论文 | STORM: arXiv:2402.14207；Co-STORM: arXiv:2408.15232 |

> 对 openmate：STORM 是「**多 Agent 研究写作**」的学术级参照；其价值在 **视角引导提问、模拟对话检索、模块化流水线开关**，Co-STORM 则示范了 **轮次管理协议 + 人类插话/旁听 + 共享心智图** 的 HITL 形态。

---

## 1. 系统架构

### 1.1 两阶段生成

```
预写作 Pre-writing
  Perspective-Guided Question Asking（由相似主题旧文发现视角）
  Simulated Conversation（维基作者 ↔ 主题专家， grounded on 检索）
  → 收集 references + 生成 outline

写作 Writing
  按大纲填入全文 + 引用
  → 可选 polish（摘要段、去重）
```

### 1.2 模块划分（可替换）

1. **Knowledge Curation**：广覆盖信息收集  
2. **Outline Generation**：层级大纲  
3. **Article Generation**：按章节成文  
4. **Article Polish**：润色  

接口在 `knowledge_storm/interface.py`，Wiki 实现于 `storm_wiki/modules/*`。

### 1.3 Co-STORM 协作话语

**协作话语协议 + 轮次管理策略**，参与者：

| 角色 | 行为 |
|---|---|
| **LLM Experts** | 基于外部知识回答 / 追问 |
| **Moderator** | 提出检索发现但尚未充分讨论的启发式问题（可 grounded） |
| **Human User** | 旁听加深理解，或 **注入 utterance 引导方向** |

另维护动态 **Mind Map**（层级概念结构），作为人机共享概念空间，降低长对话认知负荷。

---

## 2. 四个关键维度

### 2.1 错误恢复

STORM 本体偏研究代码，**无平台级自动重试 UI**；工程与语义层面：

| 机制 | 说明 |
|---|---|
| **流水线开关** | `run(do_research=, do_generate_outline=, do_generate_article=, do_polish_article=)`；某阶段失败可 **置 False 并加载既有结果** 续跑 |
| **多 LM 分配** | 对话模拟用便宜模型、成文用强模型，隔离不同阶段失败域 |
| **多检索器可插拔** | YouRM / Bing / Serper / Brave / SearXNG / DuckDuckGo / Tavily / Google / AzureAISearch / VectorRM；单一检索源故障可换源 |
| **LoggingWrapper**（Co-STORM） | 过程可观测 |
| **DSPy 模块化** | 单模块（如 outline）出错可单独改提示/重跑 |

公开文档未见「自动补偿分支」；恢复主要靠 **阶段级断点 + 手动/脚本重入**。

### 2.2 沙箱

- **无代码执行沙箱**：系统只做检索、对话模拟与写作，不执行任意用户代码。
- 本地语料经 **VectorRM** 接入用户文档，作用域可控。
- 密钥经 `secrets.toml` / 环境变量注入。
- 在进程内跑，依赖部署方提供的 OS 隔离（Docker 可自行封装 demo）。

### 2.3 长运行作业

| 特性 | 说明 |
|---|---|
| 全文生成 | 两阶段可数分钟～更久（视搜索与模型） |
| 阶段缓存 | `do_*` 开关支持只跑缺失阶段 |
| Co-STORM step API | `warm_start()` 后多次 `step()` / `step(user_utterance=...)`，**人机往返可拉长到小时/天**（由调用方进程生命周期决定） |
| 知识库重组 | `knowledge_base.reorganize()` 后 `generate_report()` |
| Demo | Streamlit demo-light；Research preview 服务 |

与 Dify/Flowise 相比，**缺少内置检查点存储与分布式队列**；长任务需自管进程或包一层服务。

### 2.4 人工审批 / HITL（Co-STORM 最强）

Roadmap 明确 **Human-in-the-Loop Functionalities** 为持续方向；Co-STORM 已实现：

| 模式 | 机制 |
|---|---|
| **主动插话** | `costorm_runner.step(user_utterance="...")` 注入人类发言，改变讨论焦点 |
| **旁听** | 无 utterance 的 `step()` 仅推进 LLM 话语，人类可先读再介入 |
| **Moderator** | 自动补位提问，减少人类「必须不断说话」的负担 |
| **共享心智图** | 动态概念树，人类可对照系统理解 |
| **报告生成时机** | 人类判断何时结束协作、进入 `generate_report()` —— **天然的发布前确认点** |

STORM 原版为全自动出稿；**Co-STORM = 结构化 HITL 研究写作**，审批粒度在「讨论轮次」而非单个工具调用。

---

## 3. 检索与模型集成

**语言模型**：经 litellm 覆盖主流 provider；各阶段可配不同 LM：

```
conv_simulator_lm / question_asker_lm / outline_gen_lm
article_gen_lm / article_polish_lm
```

Co-STORM 另拆：question_answering / discourse_manage / utterance_polishing / warmstart_outline_gen / question_asking / knowledge_base 等 LM。

**检索模块**（`knowledge_storm/rm.py`）：YouRM、BingSearch、VectorRM、Serper、Brave、SearXNG、DuckDuckGo、Tavily、Google、Azure AI Search。

**运行示例**：

```python
runner = STORMWikiRunner(engine_args, lm_configs, rm)
runner.run(topic=topic,
           do_research=True, do_generate_outline=True,
           do_generate_article=True, do_polish_article=True)
runner.post_run(); runner.summary()
```

---

## 4. 数据集与研究资产

| 数据集 | 用途 |
|---|---|
| **FreshWiki** | 100 篇高编辑维基文章，评测自动知识整理 |
| **WildSeek** | 研究预览中的真实用户深搜兴趣对（topic + goal） |

支持 `pip install knowledge-storm` 与源码级定制模块。

---

## 5. 对 openmate 的可借鉴点

1. **视角引导提问 + 模拟专家对话**：比裸 LLM「多搜几下」更能提升研究深度。
2. **阶段化流水线 + 开关续跑**：长写作任务应允许从 outline/成文任一点重入。
3. **Co-STORM 轮次管理协议**：LLM 专家 / Moderator / 人类三方轮转，可移植到 openmate 研究模式。
4. **共享心智图**：长上下文协作时降低人类追踪成本。
5. **无沙箱**：写作类工具隔离要求低，但检索源与 API key 治理不可少。
6. **HITL 在「讨论级」而非「工具级」**：适合开放式探索；与 Flowise/Dify 的动作级审批互补。

---

## 6. 参考链接

- 仓库：https://github.com/stanford-oval/storm
- STORM 论文：https://arxiv.org/abs/2402.14207
- Co-STORM 论文：https://www.arxiv.org/abs/2408.15232
- 研究预览：http://storm.genie.stanford.edu
- 网站：https://storm-project.stanford.edu
