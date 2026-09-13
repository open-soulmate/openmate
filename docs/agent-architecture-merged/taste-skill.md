# Taste Skill

## 概述

| 项目名称 | taste-skill（主技能名 `design-taste-frontend`） |，主要使用 JavaScript（https://github.com/Leonxlnx/taste-skill）

## 核心架构

- 通过 GitHub Contents API 读取仓库根目录，得到如下结构（**源码确认**）：
- taste-skill/
- ├── .claude-plugin/      # Claude Code 插件清单（hook/skill 注册元数据）
- ├── .github/             # CI/Issue 模板
- ├── assets/              # 示例图/参考图资产

## 关键技术

- 1. **"旋钮"把审美从主观感受变成可调参数**：三旋钮 + 信号映射表，让 Agent 不必在每次生成时重新"品味"，而是查表。源码中 `DESIGN_VARIANCE/MOTION_INTENSITY/VISUAL_DENSITY` 是全局唯一变量名，强制一致引用。
- 2. **Anti-default 清单直击 LLM 痛点**：不教"什么好看"，而是枚举"LLM 最常产出的丑默认值"并逐条禁止——这是对生成模型分布偏差的工程化对抗。
- 3. **Progressive disclosure 分层**：主 SKILL.md 只保留路由与三旋钮，13 个细分变体按需加载，控制上下文预算。
- 4. **与宿主解耦**：纯 Markdown + bash，无运行时依赖，可跨 Claude Code/Codex/Cursor/Copilot/Windsurf 移植。
- 差异化：相比一次性 prompt，它是**可版本化、可组合、可迭代**的"设计纪律即代码"。

## 对openmate的启示

- openmate 是 Python 开发、已有 Web 版、规划桌面/手机多端的 AI Agent 应用。该技能包对它的借鉴价值集中在"提示/技能工程"层面：
- - **【P0】采用 SKILL.md + frontmatter 的渐进披露技能格式**。把 openmate 的领域知识（如用户偏好、写作风格、排障流程）拆成"主索引 + 按需子技能"的 Markdown，而非塞进一个巨型 system prompt。直接收益：上下文窗口可控、可版本化、可被桌面/手机/Web 三端共享同一份技能资产。
- - **【P1】用"旋钮/参数表"把模糊指令变成显式变量**。openmate 做多端 UI 或文案生成时，可学三旋钮模式（如 `TONE`/`DETAIL_LEVEL`/`FORMALITY`），用信号→参数映射表替代每次重新 LLM 推断，降低多端输出不一致。

## 参考来源

- 豆包
