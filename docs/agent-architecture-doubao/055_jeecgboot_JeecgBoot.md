# JeecgBoot 源码级调研报告（Rank 55）

> 调研对象：`jeecgboot/JeecgBoot`
> 报告日期：2026-09-13　｜　数据基线：GitHub `master` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | JeecgBoot |
| GitHub | https://github.com/jeecgboot/JeecgBoot |
| Star | 约 4.78w（清单快照 47,776） |
| 主要语言 | Java（Spring Boot/Cloud）+ Vue3 前端 |
| 许可证 | 开源（含商业版策略） |
| 一句话定位 | **企业级低代码平台 + 内置一套"类 Dify"的 AIGC 应用开发平台：把 AI 流程编排、RAG 知识库、模型管理做成低代码业务引擎，与 Java 业务系统无缝集成** |

**目标用户/场景**：企业做 MIS/OA/ERP/CRM/SAAS 系统的 Java 团队。核心口号是"AI生成 → OnlineCoding → 代码生成 → 手工 MERGE"，解决 80% 重复 CRUD。AI 侧定位是"低代码与 AIGC 应用二者结合"，而非独立 LLM 平台。

**成熟度**：很高、长期维护、国内生态庞大（QQ 群、jeecg.com 商业文档、在线演示 boot3.jeecg.com）。前后端分离、Maven 分模块、多租户、SaaS 化。

> **性质判定**：主体是企业低代码平台，AI 是其中一个模块（AIGC）。其"agent"能力=可视化 AI 流程编排（DAG）+ RAG，是**业务编排型 agent 应用**，不是通用 agent 框架。

---

## 2. 源码结构总览

经 raw 探测：后端根目录为 `jeecg-boot/`（`jeecg-boot-base-core/pom.xml` 实测 200）。典型 Maven 多模块：

```
JeecgBoot/
├── jeecg-boot/                  # 后端
│   ├── jeecg-boot-base-core/    # 基础核心（用户/角色/权限/字典/基础服务）
│   ├── jeecg-module-ai*         # AIGC 模块（应用管理/模型/知识库/流程编排）
│   └── ...其他业务模块
└── 前端（Ant Design Vue3 / Vite，Uniapp 移动端）
```

**核心源码文件（HTTP 200 校验）**：`README.md`（27KB）、`README-AI.md`（8KB，全文通读）、`jeecg-boot/jeecg-boot-base-core/pom.xml`。
**注**：AI 模块具体 Java 类（流程引擎节点执行器）未逐文件下载（网络限流 + 模块路径重定位中），AI 架构据 README-AI 与配置文档确认，已在第 10 章标注。

**技术栈（README 确认）**：Spring Boot 2/3、Spring Cloud Alibaba、MyBatis-Plus、Shiro/Spring AuthorizationServer、Flowable（在线流程引擎）、pgvector（向量库）。AI 侧集成多家大模型（DeepSeek/ChatGPT/Qwq/智谱/Ollama/Qwen/豆包/千帆/Claude/Gemini）。**注**：清单所述 LangChain4j/Spring AI 本报告未在 pom 中直接核到（base-core pom 无相关依赖），标为推断。

---

## 3. 系统架构分析

### 编排模式：Workflow-DAG（可视化 AI 流程设计器）——文档确认

README-AI 明确 AI 流程设计器节点（:154）：**开始、结束、AI 知识库节点、AI 节点、分类节点、分支节点、JAVA 节点、脚本节点、子流程节点、HTTP 请求节点、直接回复节点**。用户在画布上拖节点连成 DAG，可"实时运行查看"。这是典型的**声明式 DAG 工作流**，LLM 只在"AI 节点/AI 知识库节点"作为被调用的步骤，而非自主规划 loop。

数据流（RAG）：文档摄入（PDF/PPT/Word/Markdown）→ 切分 → embedding → pgvector → 检索 → 拼 prompt → LLM 生成 → 保持 Markdown/图片格式返回。

### 关键组件
- **AI 应用平台**：普通应用（配置 prompt/模型/知识库）与高级流程应用（挂 AI 流程 DAG）。
- **模型管理**：统一接入国内外多家模型，运行时切换。
- **知识库**：导入文档/问答对，对接 pgvector。
- **AI 流程即服务**：流程编排完可暴露成 API（"翻译接口/格式转换接口/聊天机器人"）。

---

## 4. 功能拆解

- **低代码本体**：Online 表单/报表/大屏/流程（Flowable）、代码生成器、在线建表/AI 建表。
- **AI 能力**：AI 对话助手、AI 知识库问答、AI 文章写作（CMS）、AI 表单字段建议、AI 建表、AI 报表。
- **RAG**：PDF/PPT/Word/Markdown 摄取，README 主打"Markdown 库导入保留格式与图片"，与 Dify 差异化。
- **嵌入**：Iframe 一键把 AI 聊天助手嵌入第三方系统。
- **多租户/SaaS**：README 特性表第 28 条明确 SaaS 多租户架构。

---

## 5. 技术亮点与优势

1. **AI 流程作为业务引擎**：与纯 Dify 不同，Jeecg 把 AI DAG 当业务系统的编排引擎，可挂 JAVA/脚本/HTTP 节点直接调自家业务接口——AI 与 CRUD 业务闭环。
2. **文档保真**：Markdown/PDF 导入保留格式与图片，对话回复保持原格式。
3. **多模型统一管理**：一家后台接 OpenAI/Claude/DeepSeek/Qwen/Ollama/豆包/千帆等，运行时切换。
4. **成熟企业底座**：用户/角色/菜单/数据权限/多租户/定时任务开箱即用，AI 不缺治理。
5. **低代码→AI 编程闭环**：AI 生成→OnlineCoding→代码生成→手工 MERGE。

---

## 6. 稳定性机制【重点】

> 企业级平台，"稳定性"体现在工程底座，非 agent loop。

- **企业级权限/事务**：MyBatis-Plus + Shiro/Spring AuthorizationServer，数据权限、按钮权限、接口 AK/SK 鉴权（README 特性表）。这是企业应用稳定运行的基础。
- **多租户隔离**：SaaS 多租户架构保证租户间数据不串。
- **在线流程引擎 Flowable**：业务流程持久化在 Flowable，支持流程挂起/继续/回退，长流程状态可恢复。
- **向量库 pgvector**：RAG 检索走标准 pgvector，复用 PostgreSQL 事务能力。
- **运行观察**：AI 流程支持"画布上实时运行查看"（README-AI:69/149），每步执行可观测。
- **未读部分（如实）**：AI 流程引擎节点的异常处理、重试、节点级事务回滚未读源码，仅据"实时运行查看"与企业底座推断；LLM 调用超时/重试未核到具体实现。

---

## 7. 高可用机制【重点】

- **Spring Cloud Alibaba**：微服务架构，网关/注册中心/配置中心，服务可横向扩展（README:24）。
- **无状态可扩展**：业务后端无状态、状态在 PostgreSQL，多实例部署 + 负载均衡。
- **多租户资源隔离**：SaaS 模式下租户级数据隔离。
- **未发现/未读**：AI 流程引擎的分布式调度/失败转移、LLM 调用熔断降级未在 README 体现，未读源码确认，标为推断。

---

## 8. 自我进化机制【重点】

> 企业低代码平台，非自主学习 agent。

- **RAG 知识库即"经验沉淀"**：企业把文档/问答对喂进知识库，AI 回答时检索——是符号式的知识外挂，非在线学习。
- **AI 流程资产复用**：编排好的 DAG 流程可存为模板、暴露成 API 复用。
- **未发现**：无反思 loop、无自动改 prompt、无在线权重学习；"进化"= 人维护的知识库与流程模板。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】"AI 节点 + 普通业务节点"混合 DAG**：openmate 若要做业务化 agent 流，学 Jeecg 的 DAG——LLM 节点之外，显式提供 HTTP/脚本/子流程节点，让 AI 流程能调真实业务接口，而不只是对话。这是"agent 落地业务"的关键补全。
- **【P1】RAG 文档保真**：知识库导入文档时保留格式/图片，比纯文本切分体验好，openmate 做知识类功能可参考。
- **【P1】多模型统一管理 + 运行时切换**：一个后台抽象多家 provider，openmate 多端也需要统一模型网关。
- **【P2】"流程即 API"**：把编排好的 agent 流直接暴露成可复用 API，方便多端/外部调用。
- **注意**：Jeecg 是 Java 重型企业方案，openmate 是 Python 轻量个人产品，不应照搬其体量；只借鉴"混合 DAG 节点 + RAG 保真 + 模型网关"三点设计思想。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读）**：
- `README.md`（27KB：定位、技术栈 SpringBoot/CloudAlibaba/MyBatis-Plus/Shiro/Flowable、AI 应用平台功能、多租户、代码生成器）
- `README-AI.md`（8KB 全文：类 Dify 定位、AI 流程节点清单、RAG 管道、模型清单、与 Dify 对比、pgvector、JDK 限制）
- `jeecg-boot/jeecg-boot-base-core/pom.xml`（确认后端 Maven 模块结构；grep 未见 langchain/spring-ai 依赖，AI 依赖在独立模块未取到）

**文档/推断**：
- AI 流程引擎节点执行器、RAG 切分/embedding、LLM 调用的 Java 源码未逐行读（模块路径 `jeecg-module-ai*` 未成功定位下载）。
- 清单所述 LangChain4j/Spring AI/MCP 的具体集成未在 pom 核到，标为推断。
- 星级/活跃度来自清单快照。
