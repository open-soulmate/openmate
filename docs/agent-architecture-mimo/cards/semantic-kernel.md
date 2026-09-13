# Semantic Kernel

## 一句话定位
微软企业级 Agent 编排 SDK（.NET/Python/Java），现已被 Microsoft Agent Framework 继承。

## 核心架构（4点）
1. **Kernel 中枢**：注册 plugins（native/prompt/OpenAPI/MCP）+ AI services + memory stores
2. **Agents**：ChatCompletionAgent 等，thread 维护会话，可嵌套为多 Agent 分诊
3. **Process Framework**：把业务流程显式建模为可编排步骤
4. **跨语言三栈**：dotnet / python / java 同概念对齐，企业集成友好

## 稳定性亮点
- 官方标注 enterprise-ready：可观测、安全、稳定 API
- Plugin 抽象统一函数/提示/外部 API，减少「散装工具调用」
- ⚠️ 官方已指向 MAF 1.0 为继任者，提供 migration guide

## 对 openmate 借鉴
1. **Kernel = 工具注册中心**：把工具/提示/连接统一成 plugin 接口，Agent 只认一种调用面
2. **多 Agent 用「分诊 Agent + 子 Agent 作 plugin」** 而非另起框架

## 链接
https://github.com/microsoft/semantic-kernel
