# Openviking

## 概述

- **项目名称**：OpenViking（GitHub: https://github.com/volcengine/OpenViking ），主要使用 Python（https://github.com/volcengine/OpenViking）

## 核心架构

- openviking/
- ├── client.py / async_client.py / session.py / agfs_manager.py   # 对外 SDK
- ├── core/                  # context / directories / building_tree / mcp_converter / skill_loader
- ├── session/               # ★ 会话与记忆自迭代
- │   ├── session.py / compressor.py / compressor_v3.py

## 关键技术

- 1. **两阶段 commit：归档同步、记忆抽取异步（源码确认）**：`commit_async` docstring 明确"Phase 1 archive always runs inline; Phase 2 memory extraction runs in a background task, returning task_id for polling"。用户提交即返回，昂贵的 LLM 记忆抽取在后台。
- 2. **冷热记忆生命周期打分（源码确认）**：`hotness_score = sigmoid(log1p(active_count)) * exp(-ln2/7d * age_days)`——访问频次经 sigmoid 饱和、新鲜度按半衰期 7 天指数衰减，再与语义相似度混合提升检索。纯函数、可单测、可注入 `now`。
- 3. **记忆类型注册表 + 策略校验（源码确认）**：`MemoryTypeRegistry().list_names()` 与 `MemoryPolicy.validate_memory_types(...)`，非法记忆类型在建策略时即报错，避免脏类型。
- 4. **防重复自动提交的 in-flight 守卫（源码确认）**：`_auto_commit_inflight: set` + `asyncio.Lock`，并持有 task 强引用防 GC——"bursts don't spawn duplicate commit tasks"。
- 5. **事务/redo-log 工程（源码确认，测试证据）**：`tests/transaction/` 覆盖 `test_lock_manager`、`test_concurrent_lock`、`test_redo_log`、`test_path_lock`、`test_e2e`；`tests/vectordb/test_crash_recovery.py`、`test_stale_lock.py`。

## 对openmate的启示

- - **P0｜两阶段 commit：归档同步、记忆抽取异步 + task_id 轮询**：openmate 的"保存会话/沉淀记忆"应拆成：(1) 同步把消息落盘归档（快、不阻塞）；(2) 后台 LLM 抽取长期记忆，立即返回 task_id 让前端轮询。预期：保存快、长会话不卡 UI、记忆抽取失败不丢对话。
- - **P0｜记忆冷热打分 = 频次 sigmoid × 时间指数衰减**：openmate 长期记忆检索时，给每条记忆算 `score = sigmoid(log1p(访问次数)) * exp(-ln2/半衰期*天数)`，与向量相似度混合。预期：高频/近期记忆优先、陈旧记忆自然淡化，无需手写复杂遗忘策略。
- - **P0｜记忆类型注册表 + 建策略时校验类型**：openmate 定义 User profile/preferences/identity、Agent soul 等记忆类型，建用户记忆策略时校验只允许合法类型。预期：记忆结构规整、不会抽出垃圾类型。

## 参考来源

- 豆包
