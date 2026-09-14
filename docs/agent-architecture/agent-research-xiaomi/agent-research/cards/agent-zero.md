# Agent Zero

## 一句话定位
给 Agent 一台完整 Linux 计算机：Docker 容器内 XFCE 桌面 + 浏览器 + 文档协作 + 宿主机桥接。

## 核心架构（5点）
1. **Dockerized Linux Desktop**：Canvas 内真实 XFCE 桌面，可驱动 Blender 等 GUI 软件
2. **Browser DOM Annotation**：点击网页元素→inspect/change/lift/comment，把页面变成指令面
3. **Live Document Cowork**：Markdown/Writer/Spreadsheet/Presentation 实时协同编辑
4. **Plugin Hub 100+**：社区插件、MCP、A2A、自定义 tools/prompts，项目级隔离
5. **A0 CLI Host Bridge**：`a0` 连接宿主机真实仓库，Docker 隔离与本地工作兼得

## 稳定性亮点
- Time Travel 快照：工作区文件历史、diff、回滚
- Projects 隔离：记忆/密钥/指令/模型预设按项目分离
- 多 Agent 协作：superior 分任务、subagent 保持专注上下文

## 对 openmate 借鉴
1. **"给 Agent 一台电脑"范式**：比纯 API 工具链更接近真实工作，GUI 自动化是差异化
2. **Time Travel 安全层**：Agent 改文件前有快照与回滚，是信任的关键

## 链接
https://github.com/frdel/agent-zero
