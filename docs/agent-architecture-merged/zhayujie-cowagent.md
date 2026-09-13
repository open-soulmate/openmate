# Zhayujie Cowagent

## 概述

| 项目名 | CowAgent（前身为 chatgpt-on-wechat / CoW） |，主要使用 Python（https://github.com/zhayujie/CowAgent）

## 核心架构

- 经 raw 探测 + `config.py`（50,871 字节）import 确认：保留 `common/` 公共层（`common.log`、`common.i18n`），核心为 Channel → Agent Core → Models 的解耦分层。
- ├── config.py          # 【核心】全局配置默认值 + 配置合并/env 注入
- ├── common/            # log、i18n 等公共
- ├── bot/  /  bridge/   # Channel（Web/微信/飞书/钉钉/企微/QQ/Telegram/Slack）与 Agent 核心

## 关键技术

- 1. **三层记忆 + Deep Dream 蒸馏**：context→daily→core 分层，夜间把记忆蒸馏进 MEMORY.md，是个人 agent 记忆工程的完整范本。
- 2. **Self-Evolution 自动复盘**：会话闲置后自动复盘对话、改进技能、跟进未完成任务。
- 3. **MCP 工具按需检索**：工具多时只注入 top-k 相关工具，控上下文膨胀。
- 4. **子 agent 委派带独立预算**：spawn/delegated 各有 timeout 预算，类型可外挂 `.md`。
- 5. **生态成熟**：Skill Hub、Web 控制台、桌面端、多渠道、一行安装。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】三层记忆 + 双门槛自进化**：照搬 CowAgent 的"context→daily→core"分层记忆，以及自进化触发的双门槛（闲置 N 分钟 **且** 至少 M 轮）。openmate 移动端别在每次对话后都跑重的复盘——设阈值，省 token 省电。
- - **【P0】MCP/工具按需检索（阈值 + top-k）**：照抄 `工具数 > threshold(20) 才启用按需检索，每轮只注入 top_k(10) 相关工具`。openmate 工具一多，这是控上下文的关键。

## 参考来源

- 豆包
