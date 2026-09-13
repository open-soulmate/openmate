# Mcp Sdk

## 概述

MCP Python SDK 是 Model Context Protocol 的官方 Python 实现，当前为 v2 版本——一次重大的架构重写，既支持 2026-07-28 规范及所有早期版本，也修复了长期存在的架构问题。SDK 同时提供 **Server** 和 **Client** 两套完整能力，支持 stdio、Streamable HTTP、SSE 三种标准传输方式。，主要使用 Python

## 核心架构

- SDK 采用清晰的四层分层设计，每层职责明确、边界严格：
- ┌─────────────────────────────────────────┐
- │  FastMCP 层 (MCPServer)                 │  装饰器 API，开发者面向
- ├─────────────────────────────────────────┤
- │  Lowlevel Server 层 (Server)            │  构造函数 handler 注册

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
