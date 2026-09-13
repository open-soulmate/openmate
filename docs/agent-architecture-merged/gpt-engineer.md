# GPT Engineer

## 概述

GPT Engineer 是一个AI代码生成器。

**仓库**: https://github.com/AntonOsika/gpt-engineer | **语言**: Python

## 核心架构

> 仓库：[gpt-engineer-org/gpt-engineer](https://github.com/AntonOsika/gpt-engineer)（原 AntonOsika/gpt-engineer，55k+ Stars）
> 定位：CLI 代码生成实验平台，"用自然语言描述软件，AI 自动编写并执行代码"
> 语言：Python | 框架：LangChain + Typer CLI

gpt-engineer 采用经典的三层架构，职责清晰：

[详见源码]

**设计哲学**：面向接口编程（ABC 抽象基类），核心层定义抽象，default 层提供默认实现，applications 层组装完整应用。这种分层使得替换 LLM 后端、存储方式、执行环境都非常容易。

gpt-engineer 的提示词策略是其核心竞争力之一，存储在 `preprompts/` 目录下：

| 文件 | 作用 |
|------|------|
| `roadmap` | 总体指令："你会收到代码编写指令，写出非常长的回答" |
| `generate` | 代码生成提示：先列出核心类/函数，然后逐文件实现 |
| `improve` | 代码改进提示：使用 unified diff 格式修改 |
| `philosophy` | 编码哲学：不同类放不同文件、遵循最佳实践 |
| `file_format` | 文件输出格式：FILENAME + [详见源码]

**FileSelector** 交互设计：
- 生成 `file_selection.toml` 文件，用户通过编辑 TOML 选择要包含的文件
- 支持 `.gitignore` 过滤
- 自动排除 `node_modules`、`venv`、`__pycache__` 等目录

1. **极简接口**：BaseAgent 仅 2 个方法（init/improve），降低了扩展门槛
2. **策略模式**：CliAgent 通过依赖注入支持运行时替换代码生成/改进/执行策略
3. **Diff 容错引擎**：内置校验+修正机制，容忍 LLM 输出的不精确 diff
4. **提示词即配置**：preprompts 文件系统化，支持用户自定义 Agent 行为
5. **自愈闭环**：执行→报错→修复的自动循环，提高了代码可用率

## 关键技术

[详见源码]

这是一个**闭环反馈循环**：执行 → 检测错误 → AI 修复 → 重新执行，最多重试 10 次。这体现了 gpt-engineer 的设计哲学——不仅生成代码，还要确保代码能运行。

1. **极简接口**：BaseAgent 仅 2 个方法（init/improve），降低了扩展门槛
2. **策略模式**：CliAgent 通过依赖注入支持运行时替换代码生成/改进/执行策略
3. **Diff 容错引擎**：内置校验+修正机制，容忍 LLM 输出的不精确 diff
4. **提示词即配置**：preprompts 文件系统化，支持用户自定义 Agent 行为
5. **自愈闭环**：执行→报错→修复的自动循环，提高了代码可用率

## 对openmate的启示

> 仓库: https://github.com/AntonOsika/gpt-engineer（badge 指向 gpt-engineer-org/gpt-engineer）  
> 抓取通道: cdn.jsdelivr.net/gh/AntonOsika/gpt-engineer@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供自然语言→代码生成 / preprompts / vision 输入 / bench 借鉴

---

| 需求 | gpt-engineer 机制 | 可复用度 |
|------|------------------|----------|
| 自然语言→代码 | prompt 文件 + CLI | 高 |
| Agent 身份覆盖 | preprompts 目录 | **高** |
| 跨项目记忆 | 编辑 preprompts | 高 |
| Vision 上下文 | --image_directory | 中 |
| 改进模式 | -i 读现有代码 | 高 |
| 可 hack CLI | 开源实验平台 | 高 |
| Bench 自定义 agent | bench + APPS/MBPP | **高** |
| 多 provider | OpenAI/Azure/Anthropic/local | 高 |
| Docker 运行 | docker/ | 中 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（60-gpt-engineer.md）
- MiMo报告（gpt-engineer-l1.md）
- MiMo卡片（gpt-engineer.md）
