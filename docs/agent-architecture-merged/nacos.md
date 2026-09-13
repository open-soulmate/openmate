# Nacos

## 概述

- **项目名称**：Nacos（GitHub: https://github.com/alibaba/nacos ），主要使用 Java（https://github.com/alibaba/nacos）

## 核心架构

- ├── ai/                      # ★ 3.0 新增：AI / MCP 注册中心模块
- │   └── src/main/java/com/alibaba/nacos/ai/
- │       ├── service/         # ★ 核心业务服务
- │       │   ├── McpServerOperationService.java     # MCP Server 增删改查

## 关键技术

- 1. **AI 注册中心 = 配置中心的自然延伸**：不另造存储，把 MCP 元数据当配置托管，直接复用配置中心的持久化、长连接推送、灰度发布。源码上 `createMcpServer` 就是两次 `publishConfig`，成本极低。
- 2. **写后主动失效缓存的读优化**：`CachedMcpServerIndex` + `MemoryMcpCacheIndex` 提供高性能读，写后按 name/id 双维度 `removeMcpServerByName/ById` 失效，且失效本身包 try-catch 只 warn 不阻断主流程。
- 3. **强校验前置**：创建时强制 `version` 必填、自定义 ID 必须符合 UUID 模式、重名冲突抛 `RESOURCE_CONFLICT`、未找到抛 `MCP_SERVER_NOT_FOUND`——把脏数据挡在入口。
- 4. **久经考验的微服务一致性底座**：Nacos 原生提供 AP（Distro，临时实例）与 CP（Raft/JRaft，配置）两套一致性协议，这是它能做"注册中心"的根本。

## 对openmate的启示

- - **P0｜把"可调用能力"元数据当配置托管，而非另造数据库**：openmate 的工具/MCP/技能注册表，可仿 Nacos 用一份"配置存储 + 读缓存索引"结构。写：每次注册落一份带版本的 spec；读：走内存索引，写后按 name/id 双维度失效缓存。预期：注册表查询快、且天然支持版本与热更新。
- - **P0｜写后主动失效缓存，且失效失败只 warn 不阻断**：openmate 工具列表在运行时常被高频读取，应缓存；每次工具变更后主动 invalidate，且 invalidate 包 try-catch，不因缓存清理异常拖垮主流程。预期：读性能与写可用性兼得。
- - **P1｜注册即强校验前置**：注册工具/Agent 时强制必填项、ID 格式、重名冲突、版本必填，把错误挡在入口并返回语义化错误码（NOT_FOUND / CONFLICT / INVALID_PARAM）。预期：减少运行时"工具名拼错才报错"的延迟失败。

## 参考来源

- 豆包
