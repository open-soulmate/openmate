# AutoGen 功能研究

研究时间：2026-09-16 02:40
源码：github.com/microsoft/autogen（Python，MIT，⚠️维护模式）

## 状态
AutoGen已进入维护模式，微软推荐迁移到Microsoft Agent Framework (MAF)。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 多agent对话 | ❌ | ❌ | 大 | agent间自主对话 |
| AutoGen Studio | ❌ | ❌ | 中 | 无代码GUI |
| AgentChat | ❌ | ❌ | 大 | 高级agent对话API |
| 多provider支持 | ✅ | ✅ | 小 | OpenAI等 |
| A2A+MCP互操作 | ✅ | ✅ | 无 | 已有 |

## 结论
维护模式，不建议深入学习。MAF是继任者，值得关注。
