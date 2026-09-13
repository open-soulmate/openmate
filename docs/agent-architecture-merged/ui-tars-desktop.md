# Ui Tars Desktop

## 概述

- **项目名称**：UI-TARS-desktop（GitHub: https://github.com/bytedance/UI-TARS-desktop ），主要使用 TypeScript（https://github.com/bytedance/UI-TARS-desktop）

## 核心架构

- ├── agent-tars/        # Agent TARS：CLI/Web 通用多模态 agent（Electron + vite）
- └── ui-tars/           # UI-TARS Desktop：Electron 原生 GUI agent
- └── ui-tars/           # ★ 共享原子能力包

## 关键技术

- 1. **三段式 async-retry 覆盖全链路（源码确认）**：screenshot、model.invoke、operator.execute 各用 `async-retry`，且分别配置 `minTimeout`（截图 5s、模型 30s、执行 5s）与 `retries`——按环节差异给退避参数。
- 2. **可中断的暂停/恢复（源码确认）**：`pause/resume` 用 Promise 挂起主循环而非 busy-wait；`finally` 里 `model.reset()` 并对 USER_STOPPED 发一次 `user_stop` 动作做收尾。
- 3. **滑动图像窗控成本（源码确认）**：`processVlmParams` 对历史图片做滑动窗口，避免随轮次增长把上下文塞满截图。
- 4. **内建动作空间控制流（源码确认）**：VLM 可输出 `FINISHED/CALL_USER/MAX_LOOP/ERROR_ENV` 等内部动作，直接映射为循环终止/人机交接——让模型自己决定何时收工或求助。
- 5. **错误不抛给调用方（源码确认）**：`finally` 中仅通过 `onError` 回调派发错误，注释明确 "we will not throw error to the caller"，保证上层不会因未捕获异常崩溃。

## 对openmate的启示

- - **P0｜三段式重试：截图/模型/执行分别配退避参数**：openmate 的 agent 主循环里，每个外部调用环节（截图、调模型、执行工具）单独用 async-retry，并按环节性质设 `minTimeout`（IO 快退避、模型长退避）。预期：各环节故障独立恢复，不会一处慢拖垮全局。
- - **P0｜循环上限 + 某类错误计数熔断**：openmate 给主循环设 `maxLoopCount`；对"截图失败/工具返回空"这类可恢复错误设独立计数器，超阈值熔断并报错，而非无限重试。预期：防死循环、防烧 token。
- - **P0｜可暂停/恢复/停止：Promise 挂起 + AbortSignal 双通道**：openmate 长任务用 `pause()` 挂起（Promise）、`stop()` 置标志位、同时支持外部 `AbortSignal.aborted`；每轮开头检查。预期：用户随时可控、取消即时。

## 参考来源

- 豆包
