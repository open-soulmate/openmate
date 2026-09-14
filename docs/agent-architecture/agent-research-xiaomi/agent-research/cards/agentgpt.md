# AgentGPT

## 一句话定位
浏览器内配置并部署自主 AI Agent 的轻量平台，目标驱动、任务自分解执行。

## 核心架构（3点）
1. **T3 全栈**：Next.js 13 + FastAPI + Prisma/SQLModel + MySQL，create-t3-app 模板起步
2. **目标→任务循环**：命名 Agent → 输入目标 → 自动拆任务 → 执行 → 从结果学习
3. **一键 setup 脚本**：`setup.sh`/`setup.bat` 自动配置 env、DB、前后端

## 稳定性亮点
- CLI 自动化安装降低部署门槛
- Langchain 作为 LLM 工具层，可替换模型
- Serper/Replicate 可选接入，核心不强绑外部服务

## 对 openmate 借鉴
1. **"命名即部署"UX**：给 Agent 起名字 + 目标一句话，极大降低上手门槛
2. **前后端分离 + 标准化 setup**：本地体验路径要一键可跑

## 链接
https://github.com/reworkd/AgentGPT
