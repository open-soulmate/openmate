# Pi

## 概述

| GitHub | https://github.com/earendil-works/pi |，主要使用 TypeScript（https://github.com/earendil-works/pi）

## 核心架构

- ├── ai/               # ★ pi-ai：统一 LLM API（30+ 提供商归一为 Model/Message/StreamFn）
- ├── agent/            # ★ pi-agent-core：Agent 状态机 + agent-loop
- │   ├── src/agent.ts        #   Agent 类（状态、事件、队列、生命周期钩子）
- │   ├── src/agent-loop.ts   #   runAgentLoop/runAgentLoopContinue 底层循环
- **「Adapt pi, not the other way around」**：会话是 JSONL 树；能力靠 TypeScript Extension 热挂载；**刻意不做** MCP/Sub-agents/权限弹窗/Plan mode/TODO/后台 bash，全部可选由用户或包补齐。
- | 路径 | 内容 |
- | `README.md` | 包表、权限/容器、供应链、哲学 |

## 关键技术

- 1. **循环与状态解耦**：`runAgentLoop` 是无状态纯循环，`Agent` 只管状态与事件——可单独测试/替换循环，是框架可拆用的根本。
- 2. **两段上下文管线（transformContext + convertToLlm）**：先裁剪/注入，再按 LLM 协议过滤 role——把"上下文工程"从模型协议里干净分离。
- 3. **steer/followUp 双队列 + drain 策略**：运行中安全地"插话"或"追加一轮"，且队列模式可配（一次全放 vs 一条一条）。
- 4. **失败即事件**：任何异常都被 `handleRunFailure` 规范化成一条 stopReason="error"/"aborted" 的 synthetic message，并完整走 message_start→…→agent_end 生命周期——UI 永不裸抛。
- 5. **可观测**：`packages/telemetry` 独立包 + `onPayload/onResponse` 回调 + usage（input/output/cacheRead/cacheWrite/cost）。
- - 精确 pin 的直接依赖 + shrinkwrap
- - 自研 `pi-tui` 差分渲染
- - `pi-ai` 多协议

## 对openmate的启示

- **P0｜"低阶无状态循环 + 高阶状态机"两层分离**
- - 借鉴什么：`runAgentLoop` 纯函数循环与 `Agent` 状态/事件分离；事件流（message_start/…/agent_end）作为唯一 UI 契约。
- - 怎么用：openmate 把 Agent 内核写成无状态循环，外层用事件类（含 streamId/timestamp）桥接 Web/桌面/手机三端；断线重连按事件续。

## 参考来源

- 豆包
- MiMo报告
