# Zeroclaw

## 概述

- **项目名称**：ZeroClaw（GitHub: https://github.com/zeroclaw-labs/zeroclaw ），主要使用 Rust（https://github.com/zeroclaw-labs/zeroclaw）

## 核心架构

- ├── Cargo.toml / robot.toml / SOUL.md   # workspace + 机器人配置 + 人格
- │   ├── agent/          # ★ agent.rs / loop_.rs / dispatcher.rs / classifier.rs
- │   ├── channels/      # ★ traits.rs + 15+ 实现

## 关键技术

- 1. **Rust trait 全可插拔**：改配置即可换 provider/channel/memory/tool/runtime/security/peripherals，examples 直接示范自定义——这是"Agent 操作系统"的实现方式。
- 2. **极致轻量 + 内存安全**：单静态二进制、<5MB RAM、<10ms 冷启动（架构说明），Rust 所有权模型从语言层杜绝内存错误。
- 3. **执行环境分级**：native/docker/wasm 三种 runtime + bubblewrap 沙箱 + audit 审计，按信任等级选隔离强度。
- 4. **硬件原生**：不是桌面套壳，而是真能跑在 ESP32/STM32/Arduino 固件上，接物理外设。

## 对openmate的启示

- - **P0｜用 trait/接口把六大横切能力抽象成可替换总线**：openmate（Python）应仿此定义 `Provider`/`Channel`/`Memory`/`Tool`/`Runtime`/`Security` 六个抽象基类，新增后端/通道/工具只实现接口、靠配置装配，业务循环不写 if-else。预期：接多模型/多端/多工具的成本极低。
- - **P0｜执行环境按信任分级（native/容器/wasm 三档）**：openmate 让 Agent 跑代码/命令时，提供"信任级"开关——本机直跑 / 子进程 / 容器/沙箱，高风险走 bubblewrap 式隔离 + 人工审批 + 审计。预期：安全与灵活兼得。
- - **P1｜reliable provider 装饰层**：把重试、超时、限流封装成 Provider 的一层装饰，业务循环只调 `provider.chat()`。预期：换模型不改业务、容错集中。

## 参考来源

- 豆包
