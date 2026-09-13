# AIHawk

## 概述

AIHawk 是一个自动化求职工具。

**仓库**: https://github.com/feder-cr/AIHawk | **语言**: Python | **License**: MIT

## 核心架构

> **项目**: [feder-cr/AIHawk](https://github.com/feder-cr/AIHawk)
> **定位**: 开源 AI 浏览器代理——在隐匿 Firefox 上执行自然语言指令，绕过反机器人检测
> **许可**: MIT（2026-09-02 前为 AGPL-3.0）
> **媒体曝光**: Business Insider、TechCrunch、The Verge、Wired 等

AIHawk 解决的是一个非常具体的问题：**让 AI 能像真人一样操作浏览器**。它不是又一个 Playwright 封装，也不是又一个 LLM 工具调用框架——它的核心卖点是 **不可检测性**。Anti-bot 系统问两个问题：这是真浏览器吗？是真人在用吗？AIHawk 的回答都是"是"。

这通过三层协同实现：

- **C++ 级 Firefox 补丁**（`firefox_antidetect_patch`）：在引擎层面植入指纹，而非 JS 注入
- **贝叶斯指纹生成**（`invisible_core`）：一个种子 → 一台"真实机器"的完整画像
- **人性化操作驱动**（`invisible_playwright`）：贝塞尔曲线鼠标轨迹、真实输入事件

这意味着 AIHawk 不是在 Playwright 之上加了一层伪装，而是**从浏览器引擎的源码级开始，自底向上构建了一条不可检测的自动化通道**。

AIHawk 的代码组织清晰地分为 **三层仓库**：

[详见源码]

这种分层设计的精妙之处在于：**每一层都可以独立使用**。想要纯 Playwright API？用 `invisible_playwright`。想要自己生成指纹配置？用 `invisible_core`。想要完整 AI 代理体验？用 `aihawk`。

这是整个系统的"大脑"——`Conversation` 类实现了一个经典的 **ReAct 循环**，但有几处值得注意的设计决策：

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

## 关键技术

AIHawk 解决的是一个非常具体的问题：**让 AI 能像真人一样操作浏览器**。它不是又一个 Playwright 封装，也不是又一个 LLM 工具调用框架——它的核心卖点是 **不可检测性**。Anti-bot 系统问两个问题：这是真浏览器吗？是真人在用吗？AIHawk 的回答都是"是"。

这通过三层协同实现：

- **C++ 级 Firefox 补丁**（`firefox_antidetect_patch`）：在引擎层面植入指纹，而非 JS 注入
- **贝叶斯指纹生成**（`invisible_core`）：一个种子 → 一台"真实机器"的完整画像
- **人性化操作驱动**（`invisible_playwright`）：贝塞尔曲线鼠标轨迹、真实输入事件

这意味着 AIHawk 不是在 Playwright 之上加了一层伪装，而是**从浏览器引擎的源码级开始，自底向上构建了一条不可检测的自动化通道**。

`say` 回调是 `Conversation.run()` 的参数，而非类的模式。UI 模式传入一个推送事件到页面的回调；测试模式传入 `_silent`（什么都不做）。**一个知道自己是否被观察的循环，会有两种需要分别测试的行为**——这是注释中的原话，体现了对可测试性的深刻理解。

[详见源码]python
secrets = {value for name, value in base_env.items()
           if name.upper() == KEY_VARIABLE and value}
```

注意它**同时按名称和按值**删除，因为：
- `openrouter_api_key`（小写）在 Linux 上是不同变量，但包含相同密钥
- `OPENAI_API_KEY` 可能也持有 OpenRouter 密钥（因为客户端是 OpenAI 兼容的）

任何存活到这一步的密钥都会被继承到 Firefox 进程本身——`invisible_playwright` 从服务器进程的环境启动浏览器。

...
--flag > 环境变量 > .env 文件 > 默认值
```

关键设计决策：
- **`.env` 只从当前目录读取**，不向上搜索——防止子目录意外拾取不同的密钥
- **`.env` 永不覆盖已设置的变量**——shell 中刚设置的值优先于文件中的旧值
- **启动时只打印变量名，不打印值**——避免密钥泄露到终端

`--seed` 参数支持**可复现的浏览器身份**：相同种子 = 相同指纹，每次运行。

---

## 对openmate的启示

> 仓库: https://github.com/feder-cr/AIHawk  
> 抓取通道: cdn.jsdelivr.net/gh/feder-cr/AIHawk@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 stealth 浏览器 agent / MCP server / 配置优先级 借鉴

---

| 需求 | AIHawk 机制 | 可复用度 |
|------|------------|----------|
| MCP browser server | `uvx aihawk` 即 server | **高** |
| Stealth 反检测 | Stealth Firefox + invisible_core | **高** |
| Seed 可复现身份 | `--seed` 同 seed 同指纹 | **高** |
| Profile 持久化 | `--profile-dir` 保登录 | **高** |
| 配置优先级 | flag > env > .env > default | **高** |
| .env 不向上搜索 | 仅当前目录 | **高** |
| 不打印密钥值 | 启动只打名字 | **高** |
| Proxy 隔离 geo/locale | timezone/locale/egress 跟随 | 高 |
| Binary 版本 pin | seal 必须匹配否则拒绝 | **高** |
| 默认绑定 127.0.0.1:8765 | 安全默认；改 host 无鉴权警告 | 高 |
| Playwright API 兼容 | invisible_playwright | 高 |
| 双形态 | MCP + UI | 高 |

---

```
1. CLI flag          --openrouter-key
2. 环境变量          OPENROUTER_API_KEY
3. .env（仅 cwd）    OPENROUTER_API_KEY=...
4. 默认值            z-ai/glm-5.3-flash
```

规则（AIHawk README 实读）:
- .env **从不覆盖**已设置变量
- **不向上搜索**父目录
- 启动打印变量**名**不打印**值**
- flag 会进 shell history / process list → 文档警告

openmate 强制:
- 同一优先级顺序
- cwd-only .env
- 日志脱敏
- 密钥类 flag 标记 deprecated

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（77-aihawk.md）
- MiMo报告（aihawk-l1.md）
- MiMo卡片（aihawk.md）
