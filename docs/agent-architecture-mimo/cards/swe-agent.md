# SWE-agent

## 一句话定位
Princeton/Stanford 研究团队的 Agent-Computer 接口：让 LLM 自主修复 GitHub issue、找安全漏洞。

## 核心架构（3点）
1. **ACI（Agent-Computer Interface）**：专为 LLM 设计的工具接口，而非人类 CLI 直接暴露
2. **单一 YAML 配置**：整个 Agent 行为由一个 yaml 文件定义，可复现
3. **EnIGMA 模式**：扩展为 CTF 攻防安全挑战，多基准 SOTA

## 稳定性亮点
- SWE-bench 开源项目 SOTA
- 代码库简洁可 hack，专为研究设计
- ⚠️ 官方推荐迁移到 mini-swe-agent（100 行 Python 达到同等性能）

## 对 openmate 借鉴
1. **ACI 设计哲学**：为 LLM 设计工具接口 ≠ 人类 CLI，要考虑 token 效率与错误恢复
2. **单一配置文件**：Agent 行为可完全由一个 YAML 定义，便于版本控制与复现

## 链接
https://github.com/SWE-agent/SWE-agent
