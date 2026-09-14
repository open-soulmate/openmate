# Cursor CLI

## 一句话定位
Cursor 的无头/CLI 入口：在终端用同一套 Agent 编码能力做自动化与脚本化改码。

## 核心架构（4点）
1. **Headless Agent**：非交互模式接受任务并产出 diff/文件变更
2. **与 IDE 同源模型栈**：共享 Cursor 的上下文与工具策略（近似产品面）
3. **脚本友好**：适合 CI、批处理、远程环境
4. **权限/审批依赖产品策略**：危险操作受 Cursor 侧控制

## 稳定性亮点
- 编码产品打磨多年的上下文与补全质量
- CLI 扩展了「必须在终端/流水线跑」场景
- 与 GUI 产物一致，减少双工具行为漂移

## 对 openmate 借鉴
1. **同一 Agent 内核多入口**：CLI/IDE/IM 共享 runner，而不是各写一套循环
2. **无头模式是一等公民**：个人助手也应支持 `run task → exit code + artifacts`

## 链接
https://github.com/anysphere/cursor-cli
