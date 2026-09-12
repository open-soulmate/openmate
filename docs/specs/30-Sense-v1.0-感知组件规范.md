# OpenSense 感知组件规范 v1.0

> 组件代号：**OpenSense** | 层级：核心主体层 · 感官感知 | 隐喻：👁 五官感知系统

## 一、组件定位

**OpenSense（感知组件）**：OpenMate 生命体架构的**全局感官总入口**，对应人体五官感知系统。

不负责思考、不负责调度、不负责存储记忆，只做一件事：**采集、降噪、标准化、分发所有外界输入信号**。

### 核心职责（唯一职责）

- 统一管理所有传感器子模块（指针、视觉、语音、页面状态、设备状态）
- 对原始感知数据进行**防抖、降采样、去噪、语义格式化**
- 输出统一结构的标准感知事件，推送至 Nerve 神经事件总线
- 提供全局感知开关、隐私权限管控
- 向上层组件屏蔽「网页端 / 桌面端（Tauri）」的环境差异

### 上下级依赖关系（强制架构）

- **上游（数据来源）**：浏览器原生事件、Tauri 系统钩子、Vision 截图模块、Voice 语音模块
- **下游（数据输出）**：Nerve 神经总线（唯一出口）
- **消费组件**：Cortex（推理）、Reflex（即时反射）、Mind（上下文理解）、Hippo（短期记忆）

**禁止规则**：Sense 禁止直接调用 Cortex、禁止直接执行业务逻辑、禁止存储长期数据。

---

## 二、模块结构规范（固定目录结构）

所有感知能力必须拆分为**独立子传感器**，统一挂载在 Sense 核心之下，禁止散乱编码。

```
sense/
├── core.ts          # Sense 核心调度、开关、事件标准化
├── types.ts         # 全局统一感知类型定义（强制统一）
├── manager.ts       # 传感器注册、启停、全局状态管理
└── sensors/
    ├── pointer-web.ts      # 网页端鼠标感知（OpenFace 组件语义解析）
    ├── pointer-desktop.ts  # 桌面端全局系统鼠标感知（Tauri/Rust）
    ├── vision.ts           # 视觉感知（截图、画面理解触发）
    ├── voice.ts            # 语音听觉感知
    └── page-state.ts       # 页面可见、焦点、切换感知
```

---

## 三、核心设计原则（必须遵守）

### 3.1 双端一致性原则

网页端、桌面端感知数据源不同，但**对外输出事件结构完全一致**，上层 Agent、Nerve、Reflex 无需区分运行环境。

### 3.2 强降噪原则（核心性能保障）

原始高频事件（mousemove、系统鼠标流）**绝对禁止直接上总线**。所有传感器必须内置：

- 防抖阈值（默认 150–200ms）
- 静止停留判定（只有悬停/驻留才算有效关注）
- 快速掠过事件丢弃
- 降采样限流（全局感知最大 10fps）

### 3.3 开关可控原则（隐私强制要求）

所有感知能力默认**可关闭**，提供全局总开关 + 分传感器子开关：

- 全局感知总开关
- 鼠标感知独立开关
- 视觉截图感知独立开关
- 语音感知独立开关

### 3.4 纯输入原则

Sense 只做「采集 + 加工 + 分发」，**无决策、无推理、无业务逻辑**。所有判断、响应、反射全部交给下游组件。

---

## 四、全局统一事件结构体规范（强制统一）

所有传感器输出事件，必须遵循 **SenseEvent** 标准结构，不允许自定义字段。

```typescript
// types.ts 统一类型
export enum SenseSensorType {
  POINTER_WEB = "pointer_web",
  POINTER_DESKTOP = "pointer_desktop",
  VISION = "vision",
  VOICE = "voice",
  PAGE_STATE = "page_state"
}

export enum SenseAction {
  HOVER = "hover",
  CLICK = "click",
  DOWN = "mousedown",
  UP = "mouseup",
  SCROLL = "scroll",
  FOCUS = "focus",
  BLUR = "blur"
}

export interface SenseEvent {
  // 基础通用字段（必填）
  sensor: SenseSensorType
  action: SenseAction
  timestamp: number
  valid: boolean // 是否为降噪后的有效事件

  // 指针类专属字段
  screenX?: number
  screenY?: number
  clientX?: number
  clientY?: number

  // 网页端专属语义
  componentId?: string
  componentText?: string
  componentType?: string

  // 桌面端专属语义
  windowTitle?: string
  processName?: string
  windowHandle?: string
}
```

---

## 五、两大指针传感器开发规范

### 5.1 Web端指针感知（pointer-web）

**适用场景**：OpenMate 网页内、OpenFace 组件体系内交互

**核心能力**：可解析精准组件语义

**强制逻辑**：

- 通过 `elementFromPoint` 反向解析 OpenFace 组件实例
- 必须携带 `componentId / componentType / componentText`
- 快速滑动、无意晃动全部过滤
- 鼠标停留超 200ms 才上报 HOVER 事件

### 5.2 桌面端全局指针感知（pointer-desktop）

**适用场景**：Tauri 桌面客户端，全局系统级鼠标监听

**核心能力**：可感知系统任意软件、桌面、任务栏

**强制约束**：

- Rust 后端通过系统钩子采集，前端只做转发与格式化
- 无法获取第三方软件内部控件语义，**禁止强行脑补 DOM 信息**
- 仅输出：屏幕坐标、窗口名、进程名
- 语义缺失时，自动联动 Vision 局部截图补全感知

---

## 六、事件分发规范（与 Nerve 总线对接）

1. Sense **唯一出口**：Nerve 神经事件总线
2. 禁止跨组件直接通信，所有感知事件统一 `nerve.emit('sense:event', payload)`
3. 下游组件**按需订阅**，默认不订阅、不占用性能
4. 事件总线不允许高频轰炸，有效事件上限：**单秒 10 次**

---

## 七、性能规范（硬性红线）

- 禁止原始 mousemove 流直接输出
- 所有传感器必须具备：启停销毁逻辑，页面卸载/窗口关闭必须移除监听
- 空闲状态自动降级休眠，无交互 3s 暂停感知上报
- 所有感知数据轻量化，禁止携带冗余 DOM、冗余截图数据

---

## 八、隐私与安全规范（上线强制要求）

- 全局感知能力**默认非强制开启**，用户手动授权后启用
- 所有感知日志可一键清空
- 桌面全局鼠标监听必须在设置页明确告知用户用途
- 禁止持久化存储用户鼠标轨迹、窗口浏览记录

---

## 九、与其他核心组件协作规范

| 组件 | 协作方式 |
|------|---------|
| **Nerve** | 接收 Sense 标准化事件，负责路由分发 |
| **Reflex** | 消费感知事件，执行无思考即时反射操作 |
| **Cortex** | 对话理解时，按需拉取最新感知上下文 |
| **Vision** | 作为 Sense 视觉补全传感器，弥补桌面端语义缺失 |
| **Hippo** | 可选订阅，将高频关注行为写入短期情景记忆 |

---

## 十、版本迭代规范

- 新增任何感知传感器，必须统一挂载在 `sensors/` 目录
- 所有新增字段必须兼容旧版事件结构，禁止破坏性修改
- 双端能力差异必须在 Sense 内部抹平，上层无感知

---

## 核心总结

> **OpenSense 是 OpenMate 生命体的五官神经系统总入口，负责把「原始外界信号」过滤、翻译、标准化，变成 AI 能读懂的结构化感知信息，通过神经总线供给大脑使用，是系统从"纯代码思考"走向"真实环境共生交互"的唯一核心入口。**

---

*文档版本：v1.0.0 | 最后更新：2026-09-05*
*所属：OpenMate 官方标准开发规范体系*
