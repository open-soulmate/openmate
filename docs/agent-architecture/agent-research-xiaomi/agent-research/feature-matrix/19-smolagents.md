# smolagents 功能研究

研究时间：2026-09-16 02:50
源码：github.com/huggingface/smolagents（29331 stars，Apache-2.0）

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| CodeAgent（代码思考） | ❌ | ❌ | 大 | agent直接写代码执行 |
| 多provider支持 | ✅ | ✅ | 小 | HF/OpenAI/Azure/Bedrock |
| Hub分享 | ❌ | ❌ | 中 | push_to_hub分享agent |
| CLI工具 | ❌ | ❌ | 小 | smolagent/webagent |
| 沙箱执行 | ❌ | ❌ | 大 | 安全执行不可信代码 |
| WebSearchTool | ✅ | ✅ | 小 | 已有 |

## 可复用设计

1. **CodeAgent模式**：agent直接生成Python代码执行，比tool-call更灵活
2. **Hub分享**：agent可发布到Hub供他人使用
3. **沙箱执行**：安全执行agent生成的代码
