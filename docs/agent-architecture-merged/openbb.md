# Openbb

## 概述

| 项目名 | OpenBB（Open Data Platform, ODP） |，主要使用 Python（https://github.com/OpenBB-finance/OpenBB）

## 核心架构

- 经 README（`develop` 分支，raw HTTP 200）确认：
- ├── openbb/              # 核心 Python 包（obb.* 命名空间）
- │   ├── equity/ crypto/ macro/ derivatives/ ...  # 各资产类别 provider
- │   └── core/            # 平台、注册表、路由

## 关键技术

- 1. **统一契约 + 多消费面**：一次集成，Python/CLI/REST/MCP 同时可用——这是"数据即产品"的优秀范式。
- 2. **provider 注册表**：新数据源插拔不改核心，横向可扩展。
- 3. **标准化输出 OBBject**：屏蔽底层数据格式差异，下游（含 LLM）消费稳定。
- 4. **对 openmate 的启发**：把"领域数据"做成统一门面 + MCP 工具，让 Agent 不必直接对接杂乱 API。

## 对openmate的启示

- - **【P0】"统一数据门面 + MCP 暴露"**：openmate 若要接多种第三方 API（尤其金融/业务数据），应照 ODP 做一层统一契约层：内部一个函数签名，对外同时暴露 SDK/REST/MCP，避免每种数据对接散落在 Agent 代码里。
- - **【P1】标准化返回对象**：照 `OBBject` 设计统一返回（data + metadata + provider provenance），让 Agent 输出可溯源、可审计。
- - **【P1】provider 注册表 + 可替换降级**：同一能力预留多家 provider，挂了自动切换；对 openmate 接多 LLM/多数据源直接适用。

## 参考来源

- 豆包
