# Semantic Router

## 概述

Semantic Router 是一个**超高速语义决策层**，通过向量空间的语义相似度替代 LLM 推理来做出路由决策。其核心理念是：与其等待缓慢的 LLM 生成来决定调用哪个工具，不如用语义向量的余弦相似度在毫秒级完成决策。，GitHub Stars: 3,893，主要使用 Python（https://github.com/aurelio-labs/semantic-router）

## 核心架构

- 项目采用清晰的四层分层架构：
- semantic_router/
- ├── route.py          # Route 模型定义
- ├── schema.py         # 核心数据结构（Message、SparseEmbedding、Metric、Utterance 等）
- ├── linear.py         # 底层向量相似度计算（纯 numpy）

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
