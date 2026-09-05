# OpenMate 项目文档

> 最后更新：2026-09-05

## 文档目录

### 一、项目基础文档

| 文档 | 说明 | 状态 |
|---|---|---|
| [README.md](../README.md) | 项目入口：简介、架构、启动命令、目录说明 | ✅ |
| [ROADMAP.md](../ROADMAP.md) | 路线图：短期迭代、中长期目标 | 📝 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 | 📝 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献指南：环境搭建、PR规范 | 📝 |
| [ADR/](./ADR/) | 架构决策记录：重大技术选择的来龙去脉 | ✅ |
| [FAQ.md](./FAQ.md) | 开发常见问题、踩坑记录 | 📝 |

### 二、架构 & 设计文档

| 文档 | 说明 | 状态 |
|---|---|---|
| [design/architecture.md](./design/architecture.md) | 系统总体架构：模块划分、数据流、组件关系 | 📝 |
| [design/data-model.md](./design/data-model.md) | 数据模型：实体定义、字段、状态机 | 📝 |
| [design/database.md](./design/database.md) | 数据库设计：表结构、ER图、迁移规则 | 📝 |
| [protocols/acp.md](./protocols/acp.md) | ACP 协议规范：报文、RPC、错误码 | 📝 |
| [protocols/a2a.md](./protocols/a2a.md) | A2A 协议规范 | 📝 |

### 三、开发规范文档

| 文档 | 说明 | 状态 |
|---|---|---|
| [guidelines/coding.md](./guidelines/coding.md) | 编码规范：命名、格式、注释 | 📝 |
| [guidelines/git.md](./guidelines/git.md) | Git 规范：分支、commit message | 📝 |
| [guidelines/plugin-dev.md](./guidelines/plugin-dev.md) | 插件/技能开发手册 | 📝 |
| [guidelines/ui-spec.md](./guidelines/ui-spec.md) | UI 设计规范 v2.0（HyperOS4 + 三端适配） | ✅ |
| [guidelines/error-code.md](./guidelines/error-code.md) | 错误码规范 | 📝 |
| [guidelines/logging.md](./guidelines/logging.md) | 日志规范 | 📝 |

### 四、使用 & 运维文档

| 文档 | 说明 | 状态 |
|---|---|---|
| [usage/dev-env.md](./usage/dev-env.md) | 开发环境搭建 | 📝 |
| [usage/deploy.md](./usage/deploy.md) | 部署手册 | 📝 |
| [usage/operations.md](./usage/operations.md) | 运维手册 | 📝 |
| [usage/user-manual.md](./usage/user-manual.md) | 用户使用手册 | 📝 |

---

## 文档原则

1. **Markdown 是唯一事实来源** — 底层存储为标准 .md 文件，托管在 Git
2. **系统是增强视图** — OpenMate 内置文档模块提供 UI 编辑、检索、版本管理
3. **两类文档分开策略**：
   - **静态规范类**（协议、开发规范、数据模型）→ `docs/` 目录，双向同步
   - **过程类**（开发笔记、草稿）→ 系统内文档库，标记正式后才同步到 git
4. **不写无用的形式化文档** — 重点解决「隔半年还看得懂 + 其他人能参与开发」
5. **Agent 可消费** — 文档可被 Agent 检索、引用、自动校验

## 目录结构

```
docs/
├── README.md          ← 你在这里
├── ADR/               ← 架构决策记录
├── design/            ← 架构、数据模型、数据库设计
├── protocols/         ← ACP / A2A 协议规范
├── guidelines/        ← 开发规范（编码、plugin、git、UI、日志）
├── usage/             ← 部署、运维、用户手册
├── FAQ.md             ← 踩坑记录
└── features/          ← 功能设计文档（历史，逐步迁移到 design/）
```

## 与旧文档的关系

| 旧位置 | 新位置 | 说明 |
|---|---|---|
| `docs/specs/28-UI-v2.0-*.md` | `guidelines/ui-spec.md` | UI 规范迁移到 guidelines |
| `docs/specs/09-ACP-*.md` | `protocols/acp.md` | ACP 协议迁移到 protocols |
| `docs/specs/10-A2A-*.md` | `protocols/a2a.md` | A2A 协议迁移到 protocols |
| `docs/features/` | `design/` | 功能设计文档逐步迁移 |
| `docs/devlog/` | 系统内文档库 | 开发日志降为轻量级，不进正式文档 |
