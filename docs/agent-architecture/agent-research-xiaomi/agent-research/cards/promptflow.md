# Prompt flow

## 一句话定位
微软端到端 LLM 应用开发工具链：从原型、批量测试、评估到部署与监控（正迁往 MAF）。

## 核心架构（4点）
1. **Flow DAG**：`flow.dag.yaml` 把 LLM/Prompt/Python 工具连成可执行图
2. **VS Code 扩展**：可视化画布调试节点与 LLM 交互
3. **评估闭环**：大数据集批量跑 + 指标评估，可进 CI/CD
4. **Connection 管理**：API Key 与部署名与代码分离

## 稳定性亮点
- 强调「prototype → production」质量门禁而非 demo 跑通
- 本地 CLI（`pf flow test`）与 Azure AI 云端协作双轨
- ⚠️ 提供 PromptFlow-to-MAF 迁移指南，项目进入维护期

## 对 openmate 借鉴
1. **Flow 文件即可复现实验**：把 prompt/工具/模型参数固化成 DAG，便于 diff 与回滚
2. **批量评估先于上线**：改 prompt 必须过数据集指标，而不是肉眼看两轮

## 链接
https://github.com/microsoft/promptflow
