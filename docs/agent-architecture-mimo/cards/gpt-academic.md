# GPT Academic

## 一句话定位
GPT 学术优化：润色/翻译/代码解释/论文精读 + 模块化函数插件 + 中文大模型深度支持。

## 核心架构（3点）
1. **函数插件系统**：热更新、低门槛编写，Arxiv 精翻/LaTeX 校对/程序剖析/批量注释等
2. **虚空终端**：自然语言调度本项目其他插件
3. **多模型混合**：同时问询 GPT/GLM/文心/星火/Qwen 等，API Key 负载均衡

## 稳定性亮点
- 对话保存/载入（可读 HTML + 可复原）
- Mermaid 图表渲染、公式双显（tex+渲染）
- Docker 多方案镜像（纯在线/含 Latex/含 CUDA/含语音）

## 对 openmate 借鉴
1. **函数插件热更新**：插件即 Python 文件，修改即生效，无需重启
2. **虚空终端模式**：用一个 Agent 调度其他插件，是"元 Agent"的简单实现

## 链接
https://github.com/binary-husky/gpt_academic
