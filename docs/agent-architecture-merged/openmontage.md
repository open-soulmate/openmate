# Openmontage

## 概述

- **项目名称**：OpenMontage（GitHub: https://github.com/calesthio/OpenMontage ），主要使用 Python（https://github.com/calesthio/OpenMontage）

## 核心架构

- OpenMontage/
- ├── tools/                 # 100+ 注册生产工具（agent 的手）
- │   ├── video/ audio/ graphics/ enhancement/ analysis/ avatar/ subtitle/
- ├── pipeline_defs/         # YAML 管线 manifest（阶段/工具/评审标准/成功门）
- ├── skills/                # Markdown 技能（agent 的知识）

## 关键技术

- 1. **manifest + 导演技能双层声明式编排**：YAML 管"做哪些阶段/用什么工具/过什么门"，Markdown 技能管"怎么做"；新增管线=写一个 YAML + 一组 stage skill，零代码编排器。
- 2. **7 维打分的 provider 选择层**：60+ provider 被统一打分排序，本地/云端混排，"用你手头有的"。
- 3. **渲染运行时治理**：proposal 锁定运行时，禁止静默切换，避免后期风格漂移。
- 4. **人在回路审批门**：script 门、逐场景 contact sheet 门，creative gate 挂起等用户答复。
- 5. **取证式研究阶段**：写任何脚本前先联网取证并引用，压制幻觉。

## 对openmate的启示

- - **P0｜manifest 声明式阶段 + 导演技能双层**：openmate 复杂任务流应把"阶段定义(YAML)、工具、成功门"与"每阶段怎么做(Markdown skill)"分离。预期：流程可配置、可审计、易增删阶段。
- - **P0｜渲染/方案选型一经锁定即治理**：openmate 在规划阶段选定后端/方案后，把"中途静默换方案"列为违规并记录。预期：避免长流程中途风格/成本漂移。
- - **P1｜阶段产出用 JSON Schema 契约校验 + 预执行校验门**：openmate 每阶段产出先过 schema，进入重成本步骤前过"交付承诺/资源"校验。预期：把错误前移、避免浪费。

## 参考来源

- 豆包
