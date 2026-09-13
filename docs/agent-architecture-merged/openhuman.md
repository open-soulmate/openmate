# Openhuman

## 概述

| GitHub | https://github.com/tinyhumansai/openhuman |，主要使用 Rust（https://github.com/tinyhumansai/openhuman）

## 核心架构

- **Rust workspace 拆分（README:164-168，一手）**：
- ├── openhuman-core/   # 包名 openhuman：核心 + openhuman-core CLI
- ├── openhuman-app/    # Tauri 桌面壳（独立 Cargo world）
- ├── openhuman-embed/  # 嵌入核心的 library facade

## 关键技术

- 1. **Memory Tree 而非向量黑盒**：把数据压成"带打分的层次化 Markdown 树"，存 SQLite 并镜像 Obsidian vault，人可直接看/改——这是对"向量库一坨 embedding 不可解释"的直接反叛，透明度极高。
- 2. **TokenJuice 工具输出压缩**：工具结果进模型前压缩，省至多 80% token——支撑"一个大脑这么大还负担得起"（README:72）。
- 3. **Graphs not loops + checkpoint**：对话轮次是带 checkpoint 的图，可暂停/跨重启/中途恢复——比单 loop 健壮。
- 4. **分裂脑（reflex + deep core）**：快 agent 分流、慢核心委派 worker 舰队，是双系统认知架构的工程化。
- 5. **Rust 核心 + Tauri 壳 + 独立 crate**：核心能力拆成 tinyagents/tinyflows/tinymemory 等独立开源 crate，openhuman 是集成层——可复用、可替换。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。**OpenHuman 是本批与 openmate 最同构的项目（桌面个人 agent），借鉴价值最高。**
- - **【P0】记忆用"带打分的层次化 Markdown 树 + 本地 SQLite"，而非向量黑盒**：openmate 做长期记忆时，别只上向量库。照抄 Memory Tree——把数据压成 ≤3k token 的 Markdown chunk、按重要性打分、折叠成树、存 SQLite、镜像成可人工编辑的文件。透明、可调试、离线友好，移动端也能跑。
- - **【P0】Graphs not loops + checkpoint 续跑**：openmate 桌面/手机做长任务时，照抄"对话轮次是带 checkpoint 的图，可暂停等人、跨重启存活、中途恢复"。手机杀后台是常态，这是体验基石。

## 参考来源

- 豆包
