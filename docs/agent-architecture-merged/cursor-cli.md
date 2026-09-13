# Cursor CLI

## 概述

Cursor CLI 是一个Cursor命令行工具。

**仓库**: https://github.com/anysphere/cursor-cli

## 核心架构

> 仓库: https://github.com/anysphere/cursor-cli  
> 抓取通道: cdn.jsdelivr.net/gh/anysphere/cursor-cli@main 与 @master  
> 版本快照: 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Cursor CLI 形态对照

---

## 关键技术

- 支持 client: Antigravity, Claude, **Cursor**, Copilot
- 配置: `npx -y chrome-devtools-mcp@latest`

→ 旁证: Cursor（产品）作为 **MCP client** 消费 chrome-devtools-mcp；**不能**据此推断 cursor-cli 仓内容。

- https://github.com/anysphere/cursor-cli（待人工确认可达性）
- https://cursor.com/
- 旁证: `reports/aihawk-l1.md`、`reports/chrome-devtools-mcp-l1.md`、`reports/privategpt-l1.md`、`reports/cursor-l1.md`
- 相关: `reports/mcp.md`、`reports/aider.md`、`reports/opencode.md`

```
优先级: flag > env > .env(cwd) > default
.env 不覆盖已设变量
不向上搜索
日志打名不打值
密钥 flag 标记不推荐
```

openmate 强制同规范。

---

## 对openmate的启示

> 仓库: https://github.com/anysphere/cursor-cli  
> 抓取通道: cdn.jsdelivr.net/gh/anysphere/cursor-cli@main 与 @master  
> 版本快照: 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Cursor CLI 形态对照

---

- 勿假设 anysphere/cursor-cli 开源内容（本轮不可达）
- 勿把 Cursor IDE 报告（cursor-l1.md）当 CLI 仓源码
- 勿用产品品牌推断仓库结构

---

| 需求 | 旁证机制 | 可复用度 | 来源 |
|------|----------|----------|------|
| CLI `mcp add` | claude/codex/gemini | **高** | AIHawk |
| npx MCP server | chrome-devtools-mcp@latest | **高** | CDT MCP |
| Slim 模式 | --slim --headless | **高** | CDT MCP |
| OpenAI-compatible | PrivateGPT | **高** | PrivateGPT |
| 配置优先级 | flag>env>.env>default | **高** | AIHawk |
| 默认 localhost | 127.0.0.1:8765 | **高** | AIHawk |
| 懒启动重资源 | 首次工具调用才起浏览器 | **高** | CDT MCP |
| 工具分组工厂 | createTools(args) | **高** | CDT MCP |

---

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- MiMo报告（cursor-cli-l1.md）
- MiMo卡片（cursor-cli.md）
