# Tooljet

## 概述

| 项目名 | ToolJet（Community Edition） |，主要使用 Python（https://github.com/ToolJet/ToolJet）

## 核心架构

- > 说明：受本批次网络限制，仅下载到 `develop/README.md`（见 §10）。下面结构来自架构清单与公开布局。
- ├── server/            # Node.js 服务端（K8s/Docker 部署）
- │   ├── controllers/    # 鉴权、应用定义持久化、查询执行、数据源凭据
- │   ├── services/      # 查询执行引擎、数据源插件加载

## 关键技术

- 1. **proxy-only 数据流 + 凭据集中**：前端永不直连数据源，所有查询经服务端代理，凭据只在服务端加密保管（AES-256-GCM）——低代码平台最易出的数据泄漏点被堵死。
- 2. **AI-native 反向定位**：不是"在低代码上加个聊天框"，而是把整个产品重定位为"AI 生成应用"——prompt→UI+query+绑定，编码 agent 又能通过 ToolJet MCP 直接编辑应用，形成人+AI 共建闭环。
- 3. **内置 no-code DB**：开箱即用 PostgreSQL 13 容器，降低"搭第一个内部工具"的门槛。
- 4. **插件生态**：`@tooljet/cli` 让任何人开发数据源/连接器插件。
- 5. **企业级访问模型**：row/component/page/query 四级权限 + RBAC + audit log，适合生产。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】proxy-only 数据流（凭据永不下发客户端）**：openmate 多端（尤其手机）接 DB/外部 API 时，照抄"客户端只发意图、服务端代理执行、密钥只在服务端加密"。手机端被反编译/抓包风险高，这是安全底线。
- - **【P1】把"应用/工作流"抽象成可被 agent 操作的对象 + 对外 MCP**：openmate 若有"配置/工作流"概念，学 ToolJet——不仅让人在 UI 上改，也开源 MCP 让编码 agent 直接创建/修改，把产品变成 agent 可消费的工具。

## 参考来源

- 豆包
