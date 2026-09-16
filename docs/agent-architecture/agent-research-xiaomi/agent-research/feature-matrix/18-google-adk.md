# Google ADK 功能研究

研究时间：2026-09-16 02:50
源码：github.com/google/adk-python（21544 stars，Apache-2.0）

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| Agent Config（无代码） | ❌ | ❌ | 大 | 不写代码构建agent |
| Tool Confirmation（HITL） | ❌ | 部分 | 大 | 工具执行前确认 |
| Workflow | ❌ | 部分（will） | 大 | 边定义的工作流 |
| 多语言SDK | ❌ | ❌ | 中 | Python/Java/Kotlin/Go/TypeScript |
| Web UI | ✅ | ❌ | 小 | adk web |
| 容器化部署 | ❌ | ❌ | 中 | Cloud Run/Vertex AI |
| 社区工具生态 | ❌ | ❌ | 中 | adk-python-community |
| llms.txt | ❌ | ❌ | 小 | Vibe Coding上下文 |

## 可复用设计

1. **Agent Config**：YAML/JSON配置定义agent，无需编码
2. **Tool Confirmation**：危险工具执行前强制确认
3. **Workflow边定义**：edges=[("START", agent1, agent2)]声明式工作流
4. **llms.txt**：为LLM提供项目上下文的标准文件
