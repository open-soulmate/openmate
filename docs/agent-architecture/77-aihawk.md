# 77 - AIHawk 架构深度分析

> **项目**: [feder-cr/AIHawk](https://github.com/feder-cr/AIHawk)
> **定位**: 开源 AI 浏览器代理——在隐匿 Firefox 上执行自然语言指令，绕过反机器人检测
> **许可**: MIT（2026-09-02 前为 AGPL-3.0）
> **媒体曝光**: Business Insider、TechCrunch、The Verge、Wired 等

---

## 1. 系统定位与核心价值

AIHawk 解决的是一个非常具体的问题：**让 AI 能像真人一样操作浏览器**。它不是又一个 Playwright 封装，也不是又一个 LLM 工具调用框架——它的核心卖点是 **不可检测性**。Anti-bot 系统问两个问题：这是真浏览器吗？是真人在用吗？AIHawk 的回答都是"是"。

这通过三层协同实现：

- **C++ 级 Firefox 补丁**（`firefox_antidetect_patch`）：在引擎层面植入指纹，而非 JS 注入
- **贝叶斯指纹生成**（`invisible_core`）：一个种子 → 一台"真实机器"的完整画像
- **人性化操作驱动**（`invisible_playwright`）：贝塞尔曲线鼠标轨迹、真实输入事件

这意味着 AIHawk 不是在 Playwright 之上加了一层伪装，而是**从浏览器引擎的源码级开始，自底向上构建了一条不可检测的自动化通道**。

---

## 2. 仓库架构与模块拆解

AIHawk 的代码组织清晰地分为 **三层仓库**：

```
feder-cr/AIHawk              ← 产品层：CLI + UI + MCP Server + Agent Loop
  ├── src/aihawk/
  │   ├── agent.py            ← 核心对话循环（model → tools → browser → repeat）
  │   ├── brain.py            ← Brain 抽象 + OpenRouterBrain 实现
  │   ├── llm.py              ← OpenRouter 客户端配置
  │   ├── cli.py              ← Click CLI：MCP Server 模式 + UI 模式
  │   ├── runner.py           ← 子进程隔离：密钥清除 + 浏览器选项传递
  │   ├── link.py             ← MCP 连接桥接
  │   ├── sessions.py         ← 多会话管理
  │   ├── web.py              ← FastAPI/uvicorn Web UI 后端
  │   ├── routes.py           ← HTTP 路由
  │   ├── chat.py             ← 聊天逻辑
  │   ├── actions_help.py     ← 工具调用的人类可读描述
  │   └── mcp/server.py       ← MCP 协议服务器实现
  │
feder-cr/invisible_playwright ← 引擎层：Playwright 封装 + 隐匿驱动
feder-cr/invisible_core       ← 配置层：种子 → 指纹 → Firefox prefs
feder-cr/firefox_antidetect_patch ← 底层：Firefox C++ 源码补丁
```

这种分层设计的精妙之处在于：**每一层都可以独立使用**。想要纯 Playwright API？用 `invisible_playwright`。想要自己生成指纹配置？用 `invisible_core`。想要完整 AI 代理体验？用 `aihawk`。

---

## 3. Agent Loop 设计（agent.py）

这是整个系统的"大脑"——`Conversation` 类实现了一个经典的 **ReAct 循环**，但有几处值得注意的设计决策：

### 3.1 单一循环，拒绝重复

代码注释中反复强调"ONE loop"——历史上曾短暂存在两个循环副本，导致同一任务产生不同结果。这反映了一个工程教训：**相同逻辑的副本会静默分叉**，尤其是当修复只应用于其中一个时。

### 3.2 叙述是参数，不是模式

`say` 回调是 `Conversation.run()` 的参数，而非类的模式。UI 模式传入一个推送事件到页面的回调；测试模式传入 `_silent`（什么都不做）。**一个知道自己是否被观察的循环，会有两种需要分别测试的行为**——这是注释中的原话，体现了对可测试性的深刻理解。

### 3.3 工具结果的双通道截断

```python
SHOWN, SENT = 1200, 8000
```

页面展示给用户的工具结果截断到 1200 字符，发送给模型的截断到 8000 字符。这是两个完全不同的信息消费场景：页面是"工作窗口"，消息列表是"上下文预算"。注释中记录了一个曾经的 bug：截断时没有标注，导致审计者看到的是不完整的页面却以为是全部。

### 3.4 错误处理的诚实原则

MCP 协议中，工具失败以 `isError` 标志返回，而非异常。早期版本忽略了这个标志，将失败以成功样式展示——"Navigated https://..."后面跟着错误信息，但状态显示为 ok。注释称这是"日志中最恶劣的缺陷：不是缺失，而是谎言"。

---

## 4. Brain 抽象与实现（brain.py）

`Brain` 是一个极简的策略接口：

```python
class Brain:
    async def handle(self, text: str, link: Link, say: Say) -> None:
        raise NotImplementedError
```

只有一个方法。无论填充它的是模型、脚本还是录制的回放——上层都不需要知道。

`OpenRouterBrain` 是唯一的生产实现，它做了三件事：

1. **持有 `Conversation` 实例**——一个 Brain 对应一个对话历史
2. **提供 `forget()` / `remember()` 方法**——支持新建对话和恢复会话
3. **注入叙述回调**——让每一步操作对用户可见

注释中记录了一个关键 bug：恢复会话时，系统消息曾经随历史一起恢复，这意味着对 `SYSTEM_PROMPT` 的修改永远无法影响已打开的对话。修复方式是 `remember()` 始终用当前进程的系统消息替换历史中的那个。

---

## 5. MCP 协议集成

AIHawk 有两种使用模式，都通过 MCP（Model Context Protocol）：

| 模式 | 入口 | 说明 |
|------|------|------|
| MCP Server | `uvx aihawk`（无子命令） | stdio 上的 MCP 服务器，供 Claude Code / Codex / Gemini CLI 注册 |
| Web UI | `aihawk ui` | 内置对话界面 + 实时浏览器视图 |

MCP 模式的设计亮点是**工具定义的转换**（`mcp_tools_to_openai`）：将 MCP 工具描述转换为 OpenAI function calling 格式。两个细节是"承重"的：
- `parameters` 必须是对象，不能是 None
- 描述被截断到 1024 字符，因为过长的描述会被 API 拒绝而非修剪

---

## 6. 密钥隔离与安全设计（runner.py）

这是安全敏感度最高的模块。`child_env()` 函数构建浏览器子进程的环境变量，**核心操作是删除密钥**：

```python
secrets = {value for name, value in base_env.items()
           if name.upper() == KEY_VARIABLE and value}
```

注意它**同时按名称和按值**删除，因为：
- `openrouter_api_key`（小写）在 Linux 上是不同变量，但包含相同密钥
- `OPENAI_API_KEY` 可能也持有 OpenRouter 密钥（因为客户端是 OpenAI 兼容的）

任何存活到这一步的密钥都会被继承到 Firefox 进程本身——`invisible_playwright` 从服务器进程的环境启动浏览器。

---

## 7. 隐匿引擎（invisible_playwright + invisible_core）

引擎层是 AIHawk 区别于所有竞品的核心：

### 7.1 指纹生成：种子 → 贝叶斯采样器 → 200+ 字段

`invisible_core.generate_profile(seed=42)` 生成一个确定性的浏览器指纹，涵盖：
- GPU/WebGL 渲染器
- Canvas 哈希
- AudioContext
- 字体列表（跨平台捆绑，不从宿主采样）
- 屏幕分辨率、硬件并发数
- WebRTC、时区、网络

**同一个种子 = 同一台机器**，无论在 Windows、Linux 还是 macOS 上运行。

### 7.2 C++ 级补丁 vs JS 注入

传统方案（如 playwright-stealth）在页面中注入 JS 覆盖 `navigator.webdriver` 等属性。AIHawk 的方案是在 Firefox C++ 源码级修改，让指纹由浏览器引擎本身产生——**没有 JS shim，没有 override，没有可供检测的接缝**。

### 7.3 人性化操作

每次点击、悬停、拖拽都遵循贝塞尔曲线的自然鼠标路径，带有类人时间间隔。每个输入事件都与真实鼠标字节一致：真实输入源、压力、可信事件。

---

## 8. CLI 与配置优先级

CLI 基于 Click 构建，提供精心设计的配置优先级：

```
--flag > 环境变量 > .env 文件 > 默认值
```

关键设计决策：
- **`.env` 只从当前目录读取**，不向上搜索——防止子目录意外拾取不同的密钥
- **`.env` 永不覆盖已设置的变量**——shell 中刚设置的值优先于文件中的旧值
- **启动时只打印变量名，不打印值**——避免密钥泄露到终端

`--seed` 参数支持**可复现的浏览器身份**：相同种子 = 相同指纹，每次运行。

---

## 9. 多会话管理

`Sessions` 类管理多个并发对话，每个对话拥有：
- 独立的 `Brain` 实例（独立的对话历史）
- 独立的 MCP 连接（独立的浏览器实例）
- 独立的会话 ID（`AIHAWK_SESSION_ID`）

默认会话在启动时**急切创建**（验证服务器正常），其他会话**懒创建**（首次使用时）。这避免了启动时为可能永远不会使用的会话浪费资源。

一个关键设计：**一个 client，多个 brain**。Client 是连接（共享），brain 是对话历史（不共享）。共享后者会导致一个会话的提问用另一个会话的记忆来回答。

---

## 10. 工程文化与代码质量

AIHawk 的源码注释是我见过的**最具教育意义的工程文档之一**。每个 `⛔` 标记都记录了一个曾经的 bug 或设计缺陷：

- **emoji 规则**：曾说"emoji 在有语义时可以用"，模型把每行都加了勾号标记。教训：有例外的规则等于有许可的规则
- **结束语句**：曾说"回复答案，不要调用更多工具"，模型从不关闭辅助浏览器。教训：关闭指令必须在说"停止"的那个句子中
- **截断标记**：曾静默截断，审计者看到不完整页面以为是全部。教训：被截断的模型可以请求剩余部分，但只有知道有剩余才会请求
- **错误状态**：MCP 失败曾以成功样式展示。教训：日志中最恶劣的缺陷不是缺失，而是谎言

这种"每个注释都是一个故事"的风格，使得代码库本身就是一本关于 AI agent 工程化的教科书。

---

## 总结

| 维度 | 评估 |
|------|------|
| **架构分层** | 四层仓库，每层可独立使用，关注点分离优秀 |
| **核心循环** | 单一 ReAct 循环，叙述参数化，错误诚实处理 |
| **隐匿能力** | C++ 源码级指纹 + 贝叶斯采样 + 人性化操作，行业领先 |
| **协议集成** | MCP 原生支持，可作为 Server 嵌入任何 AI 助手 |
| **安全设计** | 密钥按名称+值双重清除，隔离浏览器子进程 |
| **配置管理** | 清晰的优先级链，`.env` 不向上搜索 |
| **多会话** | 急切/懒创建策略，client 共享 + brain 隔离 |
| **工程文化** | 注释即文档，每个 ⛔ 标记都是实战教训 |
| **可复现性** | 种子驱动的确定性指纹，相同种子 = 相同机器 |
| **生态完整性** | 引擎/核心/产品三层解耦，wiki 覆盖竞品对比和故障排查 |

AIHawk 的核心洞察是：**AI 浏览器代理的瓶颈不在 LLM 能力，而在浏览器的不可检测性**。当所有框架都在优化 agent loop 时，AIHawk 从浏览器引擎的 C++ 源码开始，自底向上解决了"被看见"的问题。这是一个典型的"基础设施决定上层建筑"的案例。
