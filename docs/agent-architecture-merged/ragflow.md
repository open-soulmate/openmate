# Ragflow

## 概述

| GitHub | https://github.com/infiniflow/ragflow |，主要使用 Python（https://github.com/infiniflow/ragflow）

## 核心架构

- │   ├── svr/task_executor.py   # ★ 异步任务执行器（Redis 队列消费）
- │   │   task_executor_limiter.py # task/chunk/embed/minio/kg 限流
- │   ├── svr/ragflow_server.py   # Flask API 后端

## 关键技术

- 1. **解析质量是护城河**：DeepDoc 把"非结构化复杂文档"变成高质量 chunk，是 RAG "quality in, quality out" 的关键。
- 2. **任务/资源双层限流**：task/chunk/embed/minio/kg 五个 limiter 分别控并发，防嵌入/MinIO/ONNX 各自被打爆。
- 3. **worker 内存回收**：针对 ONNX Runtime BFCArena 不释放内存的痛点，`MAX_TASKS_PER_WORKER` 完成 N 个任务后主动退出，由 supervisor 重启——直击生产内存泄漏。
- 4. **灰度双跑（dry-run 对比）**：`TE_RUN_MODE=1` 同时跑新旧两版任务执行器并对比结果，支持无风险重构。
- 5. **心跳 + 分布式锁**：worker 向 Redis 上报心跳，过期心跳清理用 `RedisDistributedLock` 选主，支撑多 worker。

## 对openmate的启示

- **P0｜任务队列 + 多 worker + 心跳选主**
- - 借鉴什么：重活（解析/嵌入/长任务）放 Redis 队列，多 worker 消费；心跳写 Redis，过期清理用分布式锁选主。
- - 怎么用：openmate 桌面/手机端把耗时任务（文档解析、批量工具调用）提交到任务队列，后端多 worker 跑；移动端只看进度。

## 参考来源

- 豆包
