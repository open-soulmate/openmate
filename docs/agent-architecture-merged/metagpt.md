# Metagpt

## 概述

MetaGPT 的核心设计哲学是将软件公司的标准操作流程（SOP）形式化，让 LLM 角色像真实团队一样协作。一行需求输入，产出用户故事、竞品分析、需求文档、数据结构、API 设计等完整软件交付物。，主要使用 Python（https://github.com/geekan/MetaGPT）

## 核心架构

- Role 是 MetaGPT 最核心的抽象，每个角色拥有独立的身份（profile）、目标（goal）、约束（constraints）、动作列表（actions）、记忆系统（memory）和运行时上下文（RoleContext）。
- # role.py - Role 类定义
- class Role(BaseRole, SerializationMixin, ContextMixin, BaseModel):
- """Role/Agent"""
- name: str = ""
- 通过直接读取 `raw.githubusercontent.com/FoundationAgents/MetaGPT/main/...` 验证，核心包为 `metagpt/`。关键目录职责：
- ├── roles/            # 角色（Agent）基类与具体角色：role.py, react_role.py
- ├── team/team.py      # Team：雇佣角色、跑项目、预算控制（注：实际为 metagpt/team.py 顶层模块）

## 关键技术

- 1. **SOP 即代码**：把"需求→设计→任务→编码→测试"的人类公司 SOP 固化为角色+动作+消息路由，而非自由对话。源码上体现为 `RoleContext` 把状态机（state/todo）与消息缓冲（msg_buffer）解耦。
- 2. **三层记忆分离**：`memory`（长期、写入并建索引）、`working_memory`（给 planner 用）、`msg_buffer`（异步接收缓冲，exclude 出序列化）。见 `RoleContext` 字段（role.py:100-105）。
- 3. **预算硬约束**：`Team.invest()` → `cost_manager.max_budget`，每轮 `_check_balance()` 超支即 `raise NoMoneyException`（team.py:98-100），把"成本控制"提升为一等公民。
- 4. **断点续跑**：`Team.serialize()/deserialize()`（team.py:59-81）把整队状态写入 `storage/team/team.json`，`Role.recovered`/`latest_observed_msg`（role.py:155-156）支持从中断点恢复观察。
- 5. **差异化**：相比 AutoGen 的"对话即编排"，MetaGPT 强调**角色职责 + 固定 SOP + 结构化交付物**，产出更可控、更接近真实软件流水线。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】角色运行时与"消息缓冲/长期记忆/工作记忆"三段式分离**：直接借鉴 `RoleContext`（role.py:92）设计——把 `msg_buffer`（异步接收，不入库）、`memory`（持久+倒排索引）、`working_memory`（当前任务临时）分开。openmate 做多端时，消息缓冲可对应到"离线也能收、联网再处理"的队列，持久记忆对应同步到云端。收益：多端弱网/离线场景的一致性。
- - **【P0】预算/轮次双重硬闸**：借鉴 `Team._check_balance()` + `max_react_loop` + `n_round`（team.py:98 / role.py:461）。openmate 面向 C 端多模型调用，必须有"单次任务最大步数"和"费用上限"两个闸，否则死循环烧钱。直接照抄 `NoMoneyException` 思路即可。

## 参考来源

- 我们
- 豆包
- MiMo报告
