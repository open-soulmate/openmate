# 94. Smol Developer (smol-ai/developer) 架构分析

> **项目地址**: https://github.com/smol-ai/developer
> **定位**: "Human-centric & Coherent Whole Program Synthesis" — 你的个人初级开发者
> **作者**: swyx (Shawn Wang)
> **许可证**: MIT
> **版本**: v0.0.3 (Python library mode)

---

## 1. 项目概述与设计哲学

Smol Developer 是第一个允许开发者将 AI 开发者 Agent 嵌入自己应用的 Python 库。它的核心理念是 **"Build the thing that builds the thing"** — 不是维护一个固定的脚手架模板（如 `create-react-app`），而是创造一个能根据自然语言描述生成任意代码库的"初级开发者"。

设计哲学包含三个关键原则：

- **Markdown is all you need** — Markdown 是整程序合成的最佳提示格式，因为它可以自然地混合英语描述和代码片段（变量名、代码块）
- **Human-centric** — 人类始终在循环中（human-in-the-loop），AI 只在增加价值时使用，一旦碍事就接管
- **Smol-ler is better** — 追求极简代码量，重写后核心逻辑不到 200 行

---

## 2. 核心架构：三阶段流水线

Smol Developer 的核心是一个 **三阶段串行流水线**，每个阶段都是一次 LLM 调用：

```
用户 Prompt → [plan] → shared_dependencies.md → [specify_file_paths] → 文件列表 → [generate_code] × N → 完整代码库
```

### 阶段一：`plan()` — 生成共享依赖计划

```python
shared_deps = plan(prompt)
```

系统提示要求 LLM 生成一个 GitHub Markdown 格式的计划，**以 YAML 开头**描述将要创建的新文件，然后详细说明每个文件的结构：导出的变量、数据模式、DOM 元素 ID、消息名称和函数名称。这个 `shared_dependencies.md` 是整个程序一致性的关键 — 它充当了"架构设计文档"，让后续生成的每个文件都能引用同一份共享约定。

### 阶段二：`specify_file_paths()` — 确定文件结构

```python
file_paths = specify_file_paths(prompt, shared_deps)
```

利用 OpenAI 的 **Function Calling API** 保证输出为合法 JSON，返回一个文件路径字符串数组。这一步将抽象的计划转化为具体的文件清单。

### 阶段三：`generate_code()` — 逐文件生成代码

```python
for file_path in file_paths:
    code = generate_code_sync(prompt, shared_deps, file_path)
```

遍历每个文件路径，分别调用 LLM 生成该文件的源代码。系统提示严格约束三点：
1. 必须为指定文件路径生成代码
2. 不得偏离已确定的文件名和计划
3. 最重要 — 每行代码必须是有效代码，不包含代码围栏标记

---

## 3. Prompt 工程策略

Smol Developer 的 prompt 策略是其核心创新之一：

- **结构化系统提示**：使用 `SMOL_DEV_SYSTEM_PROMPT` 常量作为所有 LLM 调用的基础角色设定
- **分层用户消息**：将 prompt、plan、当前文件路径作为独立的 user message 传入，而非合并为单条消息
- **YAML + Markdown 混合格式**：计划阶段强制输出 YAML 头部 + Markdown 正文，兼顾结构化和可读性
- **Function Calling 保证结构化输出**：`specify_file_paths` 利用 OpenAI 的 Function Calling 确保返回合法的 JSON 数组，而非依赖自由文本解析

这种策略的核心洞察是：**通过中间表示（shared_dependencies.md）让 LLM "与自己对话"**，解决了跨文件一致性这一整程序合成的最大难题。

---

## 4. 三种使用模式

### Git Repo 模式（交互式）

```bash
python main.py "a HTML/JS/CSS Tic Tac Toe Game"
```

人类在循环中：生成代码 → 运行/阅读 → 发现问题 → 修改 prompt → 重新生成。错误消息可以直接粘贴到 prompt 中，类似 "logbook driven programming"。`debugger.py` 可以读取整个代码库给出具体的代码修改建议。

### Library 模式（可编程）

```python
from smol_dev.prompts import plan, specify_file_paths, generate_code_sync
```

将三阶段流水线暴露为 Python 函数，开发者可以在自己的应用中嵌入 smol developer 的能力。支持同步 (`generate_code_sync`) 和异步 (`generate_code`) 两种调用方式。

### API 模式（Agent Protocol）

```bash
poetry run api
```

基于 [Agent Protocol](https://github.com/e2b-dev/agent-protocol) 标准暴露 REST API，支持创建任务 (`POST /agent/tasks`) 和逐步执行 (`POST /agent/tasks/{id}/steps`)。这使得 smol developer 可以被任何支持 Agent Protocol 的平台（如 e2b）调用和编排。

---

## 5. 技术栈与依赖

```
python >=3.10,<4.0.0
openai ^0.27.8          # LLM API 调用
openai-function-call ^0.0.5  # 结构化输出解析
tenacity ^8.2.2         # 重试/退避策略
agent-protocol ^1.0.0   # Agent Protocol API 标准
```

**关键设计选择**：
- **Modal** 作为运行时平台：解决 Python 依赖地狱、实现并行代码生成、提供从本地到云端的平滑升级路径、提供带重试/退避的容错 OpenAI API 调用
- **Poetry** 作为包管理器
- **openai-function-call** 库用于将 Function Calling 响应解析为 Python 数据结构（`file_paths.from_response(completion)`）

---

## 6. 上下文窗口管理策略

Smol Developer 对 LLM 上下文窗口的管理策略是**分而治之**：

- **Plan 阶段**：只需要用户 prompt，上下文占用最小
- **File Paths 阶段**：prompt + plan（shared_dependencies），中等上下文
- **Code Generation 阶段**：prompt + plan + 当前文件路径，每个文件独立调用

这种设计的巧妙之处在于：**每个文件的代码生成是一次独立的 LLM 调用**，不需要将所有已生成的文件都塞入上下文。shared_dependencies.md 作为"浓缩的全局知识"替代了完整的代码库上下文，大幅降低了 token 消耗。

但也存在明显局限：`shared_dependencies.md` 有时无法全面理解文件间的硬依赖关系，需要用户在 prompt 中手动指定关键名称来弥补。

---

## 7. 并发与容错机制

### Modal 并行化

代码库通过 Modal 实现文件级并行生成 — 多个文件的代码生成可以同时进行，将 2-4 分钟的总生成时间从串行模式大幅压缩。

### 容错策略

- 使用 `tenacity` 库实现 OpenAI API 调用的自动重试和指数退避
- Modal 提供附加存储用于未来用途
- 图片等特殊资源有跳过销毁/重新生成的保护逻辑（针对 Chrome 扩展等用例）

---

## 8. 生态系统与社区扩展

Smol Developer 激发了多语言重写和垂直场景扩展：

| 分支 | 语言/平台 | 特点 |
|------|----------|------|
| smol-dev-js | JavaScript/TypeScript | 支持更 smol 的增量修改 |
| smol-ai-dotnet | C#/.NET | .NET 生态适配 |
| smol-dev-go | Go | Go 语言实现 |
| smol-plugin | Python | 自动生成 ChatGPT Plugin |

这些分支验证了 smol developer 架构的**语言无关性** — 三阶段流水线的设计模式可以在任何技术栈中复现。

---

## 9. 优势与局限性分析

### 优势

1. **极简架构** — 核心逻辑不到 200 行代码，三阶段流水线清晰可理解
2. **Prompt 即规格** — Markdown 提示词本身就是应用的"规格文档"，可版本控制
3. **人机协作友好** — 不追求全自动化，保留人类在循环中的控制权
4. **嵌入式设计** — 作为库使用，可以集成到任何 Python 应用中
5. **标准化 API** — Agent Protocol 支持使其可被平台化编排
6. **低认知门槛** — 不需要学习新的 DSL 或框架，Markdown + Python 即可

### 局限性

1. **无自修复能力** — 不能自动运行代码并利用错误信息重新提示（已在 future directions 中）
2. **跨文件一致性依赖 prompt 质量** — shared_dependencies.md 有时不够全面
3. **无依赖安装能力** — 生成的代码不能自动安装其依赖
4. **单轮生成** — 不支持增量修改已生成的代码（需人工介入或重新生成）
5. **上下文有限** — 未利用 GPT-4-32k 的长上下文能力将完整 API 文档注入
6. **无代码验证** — 生成后不进行语法检查或测试执行
7. **OpenAI 锁定** — 核心依赖 OpenAI API，切换到 Anthropic 等其他模型效果不佳（README 明确提到）

---

## 10. 对 Agent 架构设计的启示

Smol Developer 虽然代码量极小，但其设计模式对更复杂的 Agent 系统有深远启示：

### "中间表示"模式

`shared_dependencies.md` 作为 LLM 与自身"对话"的中间表示，是解决多步生成一致性的关键技巧。这类似于编译器设计中的中间表示（IR）— 将复杂的端到端任务分解为多个阶段，每个阶段共享一个浓缩的全局状态。

### "分文件独立生成"策略

每个文件的代码生成是独立的 LLM 调用，只依赖 prompt + plan + 当前文件路径。这种**无状态的文件级生成**避免了上下文爆炸问题，是大规模代码生成的实用策略。

### 人机协作 vs 全自动化的光谱

Smol Developer 故意选择留在"人机协作"端，而非追求全自动 Agent 循环。这反映了一个务实的工程判断：在 LLM 能力尚未完全可靠时，**保留人类判断力的系统比追求全自动的系统更实用**。

### 模块化 API 设计

三阶段流水线暴露为独立函数，每个都可以被替换、跳过或重新编排。这种设计使得库可以被嵌入各种上下文 — 从命令行工具到 Web API 到 IDE 插件。

### Agent Protocol 标准化

通过实现 Agent Protocol，smol developer 将自己从一个独立工具变成了一个可被平台编排的"Agent 单元"。这是 Agent 生态系统标准化的重要实践。

---

## 总结

Smol Developer 是"整程序合成"领域的一个里程碑式实验。它证明了三个重要观点：

1. **极简架构可以解决复杂问题** — 三阶段流水线 + Markdown 中间表示就足以生成可工作的完整代码库
2. **Prompt 工程就是软件工程** — 开发者的工作从写代码转向写提示词和迭代 prompt
3. **Agent 不需要很复杂** — 一个 200 行的 Python 脚本就可以是一个有价值的"AI 初级开发者"

它的核心创新不在于技术复杂度，而在于**设计哲学的清晰性**：Markdown 是最好的提示格式，人类应该在循环中，代码量应该尽可能 smol。这些原则对所有 Agent 系统的设计都有参考价值。
