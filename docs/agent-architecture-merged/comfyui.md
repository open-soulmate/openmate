# ComfyUI

## 概述

ComfyUI 是一个AI图像生成工作流。

**仓库**: https://github.com/comfyanonymous/ComfyUI | **语言**: Python

## 核心架构

> **仓库**: [comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) | **语言**: Python + TypeScript/Vue | **许可证**: GPL-3.0 | **Star**: 78k+

ComfyUI 是当前最强大的开源 AI 内容生成引擎，以**节点图（Node Graph）**为核心范式，支持图像、视频、音频、3D 模型等多种模态的生成与编辑。其架构设计精妙，将复杂的扩散模型推理流程抽象为可组合、可缓存、可复用的有向无环图（DAG）执行模型。

ComfyUI 的架构可分为 **五层**：

[详见源码]

前端（Vue/TypeScript）自 2024 年 8 月起独立为 [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend)，编译后通过 pypi 包 `comfyui-frontend-package` 分发。后端以 Python 为核心，通过 aiohttp 提供 HTTP REST API 和 WebSocket 实时通信。

ComfyUI 的核心抽象是**节点（Node）**。每个节点是一个 Python 类，通过类属性和类方法声明其输入输出类型：

[详见源码]

关键设计要素：
- **`INPUT_TYPES()`**：类方法，声明输入参数的类型、约束（min/max/step）、UI 提示（multiline、tooltip）
- **`RETURN_TYPES`**：声明输出类型，用于类型安全的连线验证
- **`FUNCTION`**：指定执行时调用的方法名，支持同一节点类的多态
- **`CATEGORY`**：前端分类路径，支持多级嵌套
- **`IS_CHANGED` / `fingerprint_inputs`**：可选，用于缓存失效判断
- **`INPUT_IS_LIST`**：控制输入是逐元素还是批量处理
- **`check_lazy_status`**：惰性求值支持，允许节点声明"我不需要这个输入"

节点通过全局注册表 `NODE_CLASS_MAPPINGS`（字典）和 `NODE_DISPLAY_NAME_MAPPINGS` 管理。内置节点在 `nodes.py` 中定义，扩展节点从 `comfy_extras/` 和 `custom_nodes/` 自动发现加载。

ComfyUI 同时支持 **V3 API**（基于 `comfy_api.latest.io` 模块），新 API 使用装饰器和更严格的类型系统，但保持向后兼容。

- **纯本地、零依赖**：核心不主动下载任何内容，`--disable-api-nodes` 可强制完全离线
- **JSON 即工作流**：工作流可序列化为 JSON，也可从生成的图片中恢复完整工作流和种子
- **异步队列**：支持多个工作流排队执行，带优先级（Ctrl+Shift+Enter 插队）
- **部分重执行**：修改工作流中的某个节点后，只重新执行受影响的节点，利用缓存跳过未变化的部分

三仓库联动发布：
1. **ComfyUI Core**：每 2 周一个稳定版本（v0.x.0），patch 版本用于回退修复
2. **Comfy Desktop**：基于最新稳定版构建桌面应用
3. **ComfyUI Frontend**：每 2 周合并到 Core，每日发布可在独立仓库获取

## 关键技术

节点可实现 `IS_CHANGED()` 方法或 `fingerprint_inputs()` 方法，返回一个"变化指纹"。例如，随机种子节点每次返回不同值，确保不被缓存命中。引擎在缓存失效判断时调用此方法。

- CORS 中间件，限制跨域访问
- Origin 检查中间件，防止 CSRF 攻击（特别是 localhost 场景）
- gzip 压缩中间件
- TLS/SSL 支持（`--tls-keyfile`/`--tls-certfile`）
- 可选的 API 节点禁用（`--disable-api-nodes`），确保完全离线运行

| 决策 | 原因 |
|------|------|
| aiohttp 而非 FastAPI | 历史选择，WebSocket 支持成熟 |
| 全局注册表模式 | 简化节点发现，但牺牲了命名空间隔离 |
| Python 类方法声明类型 | 避免额外的 schema 定义层，降低节点开发门槛 |
| 拓扑排序而非消息传递 | 确定性执行顺序，便于缓存和调试 |
| safetensors 优先 | 安全（无 pickle 反序列化风险）+ 惰性加载支持 |

## 对openmate的启示

- **P0**: 评估其工具集成方案对openmate工具层的参考价值
- **P1**: 研究其插件/扩展机制
- **P2**: 关注其性能优化和部署方案

## 参考来源

- 我们（46-comfyui.md）
