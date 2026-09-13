# Pingcap Tidb

## 概述

| GitHub | https://github.com/pingcap/tidb |，主要使用 Python（https://github.com/pingcap/tidb）

## 核心架构

- > 说明：本仓库为超大规模分布式数据库（Go，数百万行），受网络与效率约束，仅读 README（见 §10）。下面为公开架构。
- tidb/                 # TiDB Server（计算层，无状态 SQL 解析/优化/调度）
- ├── planner/        # SQL 优化器
- ├── executor/        # 执行器
- └── infoschema, table, ...

## 关键技术

- 1. **单一引擎同时扛 OLTP + 向量检索**：agent 的"记忆/中间输出/进度"要事务可靠写，又要语义检索查历史——传统方案要 Postgres + 向量库两套并做同步，TiDB 同表同 SQL 解决。
- 2. **HTAP 实时一致**：行存最新写与列存分析通过 Multi-Raft Learner 实时同步，agent 写入即可被分析，无需 ETL 延迟。
- 3. **MySQL 兼容**：openmate 这类 Python 应用用现成 MySQL driver/ORM 即可接，零学习成本。
- 4. **Raft 多副本自带高可用**：agent 记忆丢了是事故，数据库层多数派提交保证不丢。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】记忆/中间输出优先选"事务可靠 + 可语义检索"的存储，而非只向量库**：openmate 做长期记忆时，别只上独立向量库（会丢事务性、要同步）。若服务端化，用 TiDB 这类"行存事务 + 原生向量"同一引擎——一次 SQL 既能可靠写进度、又能按语义查历史。桌面版可先用 SQLite+本地向量，服务端版迁 TiDB。
- - **【P1】计算存储分离的无状态节点思路**：openmate 多端/多副本时，把应用层做成无状态、状态外置到数据库——这样加副本即水平扩，重启不丢会话。

## 参考来源

- 豆包
