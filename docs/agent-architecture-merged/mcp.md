# Mcp

## 概述

- 成功拉取: `src/mcp/server/session.py`（完整 ServerSession，约 400 行），主要使用 Python（https://github.com/modelcontextprotocol/python-sdk）

## 核心架构

- @deprecated("The logging capability is deprecated as of 2026-07-28 (SEP-2577).")
- async def send_log_message(
- level: types.LoggingLevel,

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- MiMo报告
