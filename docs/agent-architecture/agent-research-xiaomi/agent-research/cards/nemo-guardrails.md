# NeMo Guardrails

## 一句话定位
NVIDIA 可编程对话护栏工具包：用 Colang 在应用与 LLM 之间插入多层 rails。

## 核心架构（4点）
1. **五类 rails**：Input / Dialog / Retrieval / Execution(工具) / Output
2. **Colang 流程语言**：定义用户意图、bot 话术与可控对话路径
3. **LLMRails 配置目录**：config.yml + rails.co + actions.py
4. **Server/CLI**：可作 HTTP `/v1/chat/completions` 护栏网关，支持 Docker

## 稳定性亮点
- 内置 jailbreak/injection 检测、self-check facts、内容与主题安全模型
- 评估命令覆盖主题轨、事实核查、幻觉与审核
- async-first 核心，便于嵌入现有 Python 服务

## 对 openmate 借鉴
1. **工具轨（execution rail）单独设防**：个人助手转账/删消息等工具入参与出参可拦截改写
2. **护栏配置目录化**：rails 与业务代码分离，可版本化与审计

## 链接
https://github.com/NVIDIA/NeMo-Guardrails
