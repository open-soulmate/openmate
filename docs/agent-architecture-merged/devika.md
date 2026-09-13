# Devika

## 概述

Devika 是一个AI软件工程师。

**仓库**: https://github.com/stitionai/devika | **语言**: Python | **License**: MIT

## 核心架构

> **仓库**: [stitionai/devika](https://github.com/stitionai/devika)  
> **Stars**: 19.5k | **License**: MIT  
> **定位**: 首个开源 Agentic AI Software Engineer，对标 Cognition AI 的 Devin  
> **目标**: 在 SWE-bench 基准测试中达到甚至超越 Devin 的成绩

Devika 是一个面向软件工程全流程的 AI Agent 系统。其核心设计理念是将复杂的编程任务分解为多个子步骤，由不同的专用子 Agent 协作完成。系统采用**多 Agent 协作 + 工具调用 + 持久化状态**的三层架构：

- **前端层**: 基于 Bun + React 的 Web UI（端口 3001），提供聊天界面和项目管理
- **后端层**: Flask + SocketIO 服务（端口 1337），处理 WebSocket 实时通信
- **Agent 层**: 多个专用子 Agent 协作执行规划、研究、编码等任务
- **持久化层**: SQLite 数据库存储项目、对话和 Agent 状态

[详见源码]

Devika 的核心是 `Agent` 类（`src/agent/agent.py`），它作为中央调度器协调 9 个专用子 Agent：

| 子 Agent | 职责 | 触发时机 |
|----------|------|----------|
| **Planner** | 将高层需求分解为逐步计划 | 首次任务接收 |
| **Researcher** | 从计划中提取搜索关键词和上下文 | 规划完成后 |
| **Coder** | 根据计划和研究结果生成代码 | 研究完成后 |
| **Action** | 根据用户后续消息决定动作类型 | 后续交互 |
| **Runner** | 在沙箱中执行代码并流式输出 | 运行代码时 |
| **Feature** | 基于规格添加新功能到现有项目 | 功能扩展 |
| **Patcher** | 分析错误并修复代码 | Bug 修复 |
| **Reporter** | 生成项目综合报告（含 PDF 导出） | 报告生成 |
| **Decision** | 处理特殊命令（git clone、浏览器交互等） | 其他场景 |

**编排流程**：
[详见源码]
Projects 表
├── id (主键)
├── project (项目名)
└── message_stack_json (JSON 序列化的对话历史)
```

前端采用 **Bun + React** 技术栈（`ui/` 目录），核心交互模式：

- **聊天界面**：自然语言输入，支持多轮对话
- **项目选择器**：创建/切换项目，每个项目独立上下文
- **模型和搜索引擎配置**：通过 UI 页面直接设置 API Key
- **实时状态面板**：通过 WebSocket 接收 Agent 状态，展示：
  - Agent 的内部独白
  - 浏览器截图和当前 URL
  - 终端命令和输出
  - 步骤进度
  - Token 用量

前端与后端通过 SocketIO 双向通信，实现了类似 IDE 的实时反馈体验。

---

## 关键技术

| 特性 | 说明 |
|------|------|
| 多模型 | **Claude 3**, GPT-4, Gemini, Mistral, Groq, 本地 via **Ollama** |
| 最优推荐 | **Claude 3 family** |
| 规划与推理 | Advanced AI planning and reasoning |
| 关键词提取 | Contextual keyword extraction for focused research |
| 网页浏览 | Seamless web browsing and information gathering |
| 多语言代码 | Code writing in multiple programming languages |
| 状态可视化 | Dynamic agent state tracking and visualization |
| 自然语言交互 | Chat interface |
| 项目管理 | Project-based organization |
| 可扩展 | Extensible architecture |

首次运行创建根目录 **`config.toml`**。UI settings 页可改。

- https://github.com/stitionai/devika
- https://opcode.sh/
- https://www.swebench.com/
- 相关: `reports/swe-agent-l1.md`、`reports/gpt-pilot-l1.md`、`reports/openhands.md`

Devika README 实读字段:

```toml
[api_keys]
BING = ""
GOOGLE_SEARCH = ""
GOOGLE_SEARCH_ENGINE_ID = ""
OPENAI = ""
GEMINI = ""
CLAUDE = ""
MISTRAL = ""
GROQ = ""
...

openmate 建议扩展:

```toml
[llm]
provider = "claude"   # claude|openai|gemini|mistral|groq|ollama
model = "claude-3-..."

[research]
search_engine = "bing"
max_keywords = 10
max_pages = 15

...

UI settings 只读写该文件；启动校验必填项 fail-loud。

---

## 对openmate的启示

> 仓库: https://github.com/stitionai/devika  
> 抓取通道: cdn.jsdelivr.net/gh/stitionai/devika@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 agentic 软件工程师形态 / 多模型 / 浏览器研究 借鉴

---

| 需求 | Devika 机制 | 可复现度 |
|------|------------|----------|
| Agentic SWE 定位 | 理解→拆步→研究→写码 | **高** |
| 多模型 + Ollama | 6 provider | **高** |
| Claude 3 推荐 | 最优性能 | 高 |
| 关键词提取研究 | contextual keywords | **高** |
| Playwright 浏览 | playwright install --with-deps | **高** |
| 项目隔离 | project-based | 高 |
| 状态可视化 | dynamic agent state | **高** |
| config.toml 集中 | UI settings | 高 |
| 后端 Python + 前端 bun | 分离 | 高 |
| uv 包管理 | uv venv / uv pip | 高 |
| Python 3.10–3.11 硬区间 | <3.12 | 高 |
| 后继产品 Opcode | 二迭代独立 | 中 |
| 实验阶段诚实声明 | README IMPORTANT | **高** |

---

Devika README 实读字段:

```toml
[api_keys]
BING = ""
GOOGLE_SEARCH = ""
GOOGLE_SEARCH_ENGINE_ID = ""
OPENAI = ""
GEMINI = ""
CLAUDE = ""
MISTRAL = ""
GROQ = ""
...

openmate 建议扩展:

```toml
[llm]
provider = "claude"   # claude|openai|gemini|mistral|groq|ollama
model = "claude-3-..."

[research]
search_engine = "bing"
max_keywords = 10
max_pages = 15

...

UI settings 只读写该文件；启动校验必填项 fail-loud。

---

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 我们（96-devika.md）
- MiMo报告（devika-l1.md）
- MiMo卡片（devika.md）
