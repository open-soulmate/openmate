# CowAgent

## 一句话定位
开源超级 AI 助手：主动规划任务、控制电脑与外部服务、创建运行 Skills、构建知识库与长期记忆、多 Agent 团队、自我进化。

## 核心架构（4点）
1. **Agent Harness 分层**：Channels → Agent Core（规划/推理/记忆/知识/工具）→ Models → 回传通道
2. **三层记忆**：上下文→日常→MEMORY.md，夜间 Deep Dream 蒸馏 + 混合检索
3. **Skills 系统**：Skill Hub 一键安装 + 对话式创建自定义 Skill
4. **多 Agent 团队**：每个 Agent 独立记忆/模型/技能/知识，共享会话协作

## 稳定性亮点
- 一行安装脚本 + cow CLI 服务管理（start/stop/logs/update）
- 会话级权限模式 + 工作区文件编辑
- 上下文压缩（/compact）+ 推理力度调节

## 对 openmate 借鉴
1. **Deep Dream 夜间蒸馏**：把零散记忆提炼为长期条目，是记忆架构的关键创新
2. **Agent Harness 完整分层**：Channel/Core/Model 三层解耦，每层可独立扩展

## 链接
https://github.com/zhayujie/CowAgent
