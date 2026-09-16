# Aider 功能研究

研究时间：2026-09-16 02:45
源码：github.com/Aider-AI/aider（48636 stars，Apache-2.0）

## 架构概述

Aider是终端AI结对编程工具——代码库映射+Git集成+100+语言支持。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 代码库映射 | ❌ | ❌ | 大 | repo-map生成整个代码库地图 |
| Git自动提交 | ❌ | ❌ | 中 | 自动提交+有意义的commit消息 |
| 100+语言 | ✅ | ❌ | 小 | Python/JS/Rust/Ruby/Go等 |
| IDE集成 | ❌ | ❌ | 中 | watch模式，注释触发修改 |
| 图片/网页上下文 | ❌ | 部分 | 中 | 截图/网页作为上下文 |
| 语音编程 | ❌ | 部分（voice） | 中 | 语音请求功能 |
| 自动lint+test | ❌ | ❌ | 中 | 每次修改自动lint+test |
| 网页chat复制粘贴 | ❌ | ❌ | 小 | 与任意LLM网页chat配合 |

## 可复用设计

1. **repo-map**：tree-sitter生成代码库地图，帮助agent理解项目结构
2. **自动lint+test**：修改后自动运行，失败自动修复
3. **watch模式**：监控文件变化，注释触发AI修改
