# Open WebUI

## 一句话定位
"AI 的家"：可扩展、功能丰富、完全可离线运行的自托管 AI 平台，provider 无关。

## 核心架构（4点）
1. **插件体系**：Filters/Actions/Pipes/Tools/Skills + MCP/MCPO/OpenAPI 工具服务器
2. **Models & Agents**：包装任意基座模型为专用 Agent，支持动态变量与权限控制
3. **Channels 协作**：实时共享空间，团队与 AI 在同一时间线协作
4. **企业级**：RBAC、LDAP/SSO/SCIM、OpenTelemetry、Redis 水平扩展

## 稳定性亮点
- 9 种向量数据库 + 混合检索（BM25+向量）+ 重排
- 持久化 Artifact KV 存储 + 日历/自动化调度
- 安全披露流程文档化，响应式 PWA 支持离线

## 对 openmate 借鉴
1. **Channels 共享时间线**：比单人对话更适合团队协作场景
2. **插件四层（Filter/Action/Pipe/Tool）**：细粒度扩展点设计值得参考

## 链接
https://github.com/open-webui/open-webui
