# PrivateGPT

## 一句话定位
开源 API 层：把本地模型变成生产级 AI 应用，遵循 Claude API 规范，无需重建后端原语。

## 核心架构（3点）
1. **API-first**：Messages API（流式/异步/token 计数）+ 文件摄取 + 引用检索 + 工具
2. **Claude API 兼容**：Web search/Web fetch/Code execution/MCP/结构化输出
3. **不跑模型**：连接任意 OpenAI 兼容推理服务器（Ollama/llama.cpp/vLLM）

## 稳定性亮点
- 生产验证：PrivateGPT 支撑 Zylon 企业级私有 AI 平台
- 内置 Workbench UI 用于测试与演示
- 与 Claude Desktop/Code/Excel/Word/n8n/OpenCode 原生集成

## 对 openmate 借鉴
1. **API 层与推理层分离**：模型可换，API 层稳定，是长期架构的关键
2. **Claude API 作为参考规范**：对齐成熟 API 设计，降低集成成本

## 链接
https://github.com/imartinez/privateGPT
