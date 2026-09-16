# OpenClaw 功能研究

研究时间：2026-09-16 02:10
源码：github.com/openclaw/openclaw（43240文件，123个核心模块）

## 功能清单

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| context-engine（上下文引擎） | ❌ | 部分（hippo记忆） | 大 | 独立registry管理上下文资源，支持compaction-watchdog、quarantine-health |
| fleet容器管理 | ❌ | ❌ | 大 | Docker/Podman容器生命周期管理，cell-profile隔离 |
| flows（健康检查+渠道配置） | ❌ | 部分（vital） | 中 | doctor系统：50+检查项，自动修复流程 |
| talk（实时语音） | ❌ | 部分（voice） | 大 | 实时语音会话、agent-consult工具委托、音频编解码 |
| meeting-bot | ❌ | ❌ | 大 | 会议机器人：浏览器音频捕获、实时转录、平台适配 |
| snapshot（Git备份） | ❌ | ❌ | 大 | 会话状态Git快照、数据库dump、冷存储备份 |
| image-generation | ❌ | ❌ | 中 | OpenAI兼容图片生成API |
| music-generation | ❌ | ❌ | 中 | 音乐生成provider抽象 |
| video-generation | ❌ | ❌ | 中 | 视频生成（DashScope兼容） |
| polls（投票） | ❌ | ❌ | 小 | 聊天内投票功能 |
| session-cards | ❌ | ❌ | 中 | 会话摘要卡片 |
| pairng（设备配对） | ❌ | ❌ | 中 | 多设备配对协议 |
| proxy-capture | ❌ | ❌ | 小 | 代理流量捕获 |
| realtime-transcription | ❌ | 部分（sense） | 中 | 实时语音转文字 |
| trajectory（轨迹） | ✅ | ✅ | 无 | 已有 |
| skills | ✅ | ❌ | 小 | OpenMate有skills面板 |
| plugins | ✅ | 部分（plugin_loader） | 小 | 已有基础 |
| web-search/web-fetch | ✅ | 部分 | 小 | 已有 |
| model-catalog/model-picker | ❌ | ❌ | 中 | 模型目录+选择器UI |
| system-agent | ❌ | ❌ | 中 | 系统级agent管理 |
| boards（看板） | ❌ | ❌ | 中 | 任务看板 |
| canvas（画布） | ❌ | ❌ | 中 | 可视化画布 |
| audit（审计） | ❌ | 部分（immune） | 中 | 操作审计日志 |
| secrets（密钥管理） | ❌ | ❌ | 中 | 密钥安全存储 |
| wizard（向导） | ❌ | ❌ | 小 | 配置向导 |

## 源码亮点

1. **context-engine**：独立的上下文资源注册表，支持运行时adoption、fallback resources、logical-turn-resources。比OpenSoul的hippo更精细。
2. **fleet**：容器隔离执行，支持Docker/Podman，cell-profile定义资源限制（内存、CPU、PID、存储、capabilities）。
3. **talk**：完整的实时语音栈——音频编解码、能量检测、语音确认策略、agent-consult工具（语音请求委托给agent处理）。
4. **meeting-bot**：浏览器音频捕获、Chrome传输层、实时引擎、会话转录存储。可用于参加在线会议。
5. **snapshot**：Git-based会话备份，支持数据库dump、冷存储备份、manifest管理。
6. **flows/doctor**：50+健康检查项，覆盖gateway、config、state、workspace、browser等。

## 可复用设计

1. **context-engine的registry模式**：资源注册+运行时adoption，可借鉴到OpenSoul的cortex
2. **fleet的cell-profile**：容器资源限制配置，可用于OpenSoul的sandbox执行
3. **talk的agent-consult**：语音请求→agent委托→语音回复的完整链路
4. **snapshot的git-backup**：会话状态版本化备份
5. **flows的doctor模式**：系统健康检查+自动修复
