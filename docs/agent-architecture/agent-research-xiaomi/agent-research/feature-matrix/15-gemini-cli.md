# Gemini CLI 功能研究

研究时间：2026-09-16 02:50
源码：github.com/google-gemini/gemini-cli（107003 stars，Apache-2.0）

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 终端agent | ❌ | ❌ | 大 | Gemini直接在终端 |
| MCP支持 | ✅ | ✅ | 无 | 已有 |
| 多模态生成 | ❌ | ❌ | 大 | PDF/图片/草图生成应用 |
| Google Search grounding | ❌ | ❌ | 中 | 内置搜索实时信息 |
| 媒体生成MCP | ❌ | ❌ | 中 | Imagen/Veo/Lyria |
| 复杂rebase自动化 | ❌ | ❌ | 中 | Git操作自动化 |
| 三通道发布 | ❌ | ❌ | 小 | preview/stable/nightly |

## 可复用设计

1. **多模态输入**：PDF/图片/草图→应用生成
2. **Search grounding**：内置搜索增强回答
3. **三通道发布**：preview/stable/nightly渐进发布
