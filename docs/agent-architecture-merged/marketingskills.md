# Marketingskills

## 概述

- **项目名称**：marketingskills（GitHub: https://github.com/coreyhaines31/marketingskills ）（https://github.com/coreyhaines31/marketingskills）

## 核心架构

- marketingskills/
- ├── README.md                 # 安装/升级/技能目录（本次重点读）
- ├── skills/                   # 每个技能一个目录
- │   ├── product-marketing/     # 基础技能（共享产品上下文）
- │   ├── cro/ copywriting/ emails/ cold-email/ ai-seo/ seo-audit/

## 关键技术

- 1. **共享上下文基座（源码确认）**：product-marketing 作为全局前提，避免每个技能重复问产品定位——减少歧义、保证一致语气。
- 2. **触发条件写进 frontmatter**：用 "When the user wants..." 让宿主可靠地选技能。
- 3. **渐进披露**：SKILL.md 小、references 按需，控制上下文膨胀。
- 4. **版本迁移工程化**：v1→v2 提供完整重命名映射表 + stale 目录清理命令 + 旧路径 fallback（"技能仍检查 .claude/ 旧名作为 fallback，不迁移也不崩"）。
- 5. **多安装通道**：npx/插件市场/submodule/fork/SkillKit 覆盖各种宿主。

## 对openmate的启示

- - **P0｜"共享上下文基座"技能**：openmate 做业务时，设一个"产品/用户/定位"基础文档，所有任务技能先读它。预期：跨任务语气与事实一致，减少反复澄清。
- - **P0｜触发条件写进技能 frontmatter**：用明确的 "When the user wants..." 描述，让 openmate 路由层可靠选技能。
- - **P1｜渐进披露：入口 SKILL + references 按需**：openmate 复杂业务技能拆成"小入口 + 详细 references"，首屏不塞全量知识。

## 参考来源

- 豆包
