# gpt-engineer

## 一句话定位
OG 代码生成实验平台：自然语言描述软件，AI 写代码并执行，支持改进现有代码。

## 核心架构（3点）
1. **prompt 文件驱动**：项目目录放 `prompt` 文件，`gpte <dir>` 执行
2. **Preprompts 可覆盖**：自定义 AI "身份"，跨项目记忆
3. **Benchmark 工具**：内置 `bench` 命令，支持 APPS/MBPP 基准测试自定义 Agent

## 稳定性亮点
- 支持 OpenAI/Azure/Anthropic + 本地开源模型（WizardCoder 等）
- Vision 输入：可附架构图/UX 图作为上下文
- 治理：由长期贡献者董事会管理，非单一作者项目

## 对 openmate 借鉴
1. **Preprompts 覆盖机制**：通过替换提示词目录定制 Agent 行为，简单有效
2. **Benchmark 内置**：Agent 框架应自带评估能力，而非只靠主观体验

## 链接
https://github.com/AntonOsika/gpt-engineer
