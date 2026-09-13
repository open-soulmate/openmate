# Warp

## 概述

Warp 最初是一个现代化终端模拟器，现已演进为**代理化开发环境（Agentic Development Environment）**。其核心理念是：终端不应只是命令行的宿主，而应成为 AI Agent 与开发者协作的主战场。Warp 的产品线包括四个模块：，主要使用 Rust（https://github.com/warpdotdev/Warp）

## 核心架构

- Warp 的架构核心设计是**双前端（Dual Front-end）**模式：
- ┌─────────────────────────────────────────────┐
- │              warp_core / warpui              │
- │   (App / Entity / AppContext / Actions /     │
- │    Appearance / FeatureFlag / Telemetry)     │
- - **Blocks** — command + output as a first-class unit (not raw scrollback).
- - **AI command search** — natural language → shell.
- - **Workflows** — parameterized command templates (repo exists).

## 关键技术

- | 维度 | 技术选型 |
- |------|----------|
- | 核心语言 | Rust（workspace 模式，80+ crate） |
- | GPU 渲染 | WGSL 着色器 + GPU 管线 |
- | 异步运行时 | Tokio + Smol + async-channel |

## 对openmate的启示

- 1. **命令执行做成 block + 确认门**：个人助手 shell 工具必须 preview 命令再执行
- 2. **输出结构化成块**：便于引用、重试与审计

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
