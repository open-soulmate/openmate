# Soulmate任务状态机与工具调用修复报告

**日期**: 2026-09-14
**分支**: main
**涉及项目**: OpenMate (acp-proxy)

---

## 一、问题描述

Soulmate执行任务时存在两个核心问题：

1. **write_file写出0字节** — 文件名和内容丢失
2. **新消息重复执行旧任务** — 用户说"把文件发送给我"，Soulmate却重新执行之前的网页创建任务

---

## 二、根因分析

### 2.1 write_file 0字节

| 层面 | 问题 |
|------|------|
| **直接原因** | `finish_reason="length"` 时 tool_calls 的 arguments JSON 被截断 |
| **根本原因** | `max_tokens` 硬编码为 4096，HTML内容超过 4096 tokens |
| **证据** | 日志：`[LLM] tool_call args不完整: name=write_file, len=16403, preview={"path": "climber-homepage.html", "content": "<!DOCTYPE html>\n<html lang="` |

MiMo确实生成了正确的文件名和内容开头，但JSON被截断导致解析失败。

### 2.2 重复执行旧任务

| 层面 | 问题 |
|------|------|
| **直接原因** | `task_engine.py` 的 `plan()` 方法中，`get_active_plan()` 返回旧的 active 状态 plan |
| **根本原因** | 新消息到来时没有判断是继续旧任务还是新任务，直接返回旧 plan |
| **影响** | 每条新消息都会触发旧任务的重新执行 |

---

## 三、修复方案

### 3.1 max_tokens 可配置化（6项改动）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `llm_engine.py` | 3处 `max_tokens` 从硬编码改为 `get_max_output_tokens()` |
| 2 | `settings-client.tsx` | 默认值 4096→65536，滑块范围 256~131072 |
| 3 | `settings-client.tsx` | 保存时传 `max_tokens` 到 `/api/llm/config` |
| 4 | `.env` | 新增 `LLM_MAX_TOKENS=65536` |
| 5 | `ws_chat.py` | `_get_llm_config()` 读取 `LLM_MAX_TOKENS` |
| 6 | `token_manager.py` | 启动时探测模型能力并缓存 |

### 3.2 TaskStateManager 独立任务状态机（核心）

参考LangGraph范式实现：**后端状态机为主，LLM意图为辅**。

**架构**：
```
用户消息 → 规则层(确定性) → LLM层(模糊输入) → 任务状态机
```

**规则优先级表**：

| 层级 | 判断逻辑 | 优先级 | 说明 |
|------|----------|--------|------|
| 规则A | 显式指令("继续"/"新任务"/清空上下文) | 最高 | 直接生效，跳过后续判断 |
| 规则B | 超时(30分钟) → 任务挂起 | 高 | 挂起后询问用户确认 |
| 规则F | 多意图检测(新任务动词+旧实体) | 高 | 交由LLM判断 |
| 规则C | 实体匹配(仅非挂起状态) | 高 | 消息含当前任务实体名词 |
| 规则D | 短消息(<15字) | 中 | 主动询问用户确认意图 |
| 规则E | 文本重叠度 | 辅助 | 不单独决策，送入LLM参考 |
| LLM | 规则无法确定时 | 最低 | 输出: continue/new/ask |

**任务状态定义**：
- `ongoing` — 进行中
- `suspended` — 挂起（超时/切到子任务）
- `completed` — 已完成
- `archived` — 归档

**任务栈**：支持push/pop多任务切换，子任务完成后自动恢复父任务。

### 3.3 send_file 工具增强

| 改动 | 说明 |
|------|------|
| 文本文件(<1MB) | 读取内容，通过ACP发给前端显示 |
| 大文件 | 提示路径，建议用read_file分段读取 |
| 二进制文件 | 提示路径，建议用read_image或终端处理 |

### 3.4 其他修复

| # | 改动 | 说明 |
|---|------|------|
| 1 | `soulmate_agent.py` import | 补充 `truncate_tool_result` import |
| 2 | `soulmate_agent.py` 系统提示 | 大文件(>3000字符)用execute_code写入 |
| 3 | `soulmate_agent.py` write_file | path为空时返回错误让LLM重试，不猜文件名 |
| 4 | `task_engine.py` plan() | 不再直接返回旧plan，而是判断后决定 |

---

## 四、测试结果

### TaskStateManager 单元测试

| 测试 | 输入 | 预期 | 实际 | 结果 |
|------|------|------|------|------|
| 无任务 | "你好" | new | new (无活跃任务) | ✅ |
| 显式新任务 | "新任务换个话题" | new | new (显式要求新任务) | ✅ |
| 显式继续 | "下一步" | continue | continue (显式要求继续) | ✅ |
| 短消息 | "1" | ask | ask (消息过短) | ✅ |
| 发送文件 | "把文件发送给我" | ask/new | ask (消息过短) | ✅ |
| 实体匹配 | "首页改成蓝色" | continue | continue (匹配['攀岩','首页']) | ✅ |
| 混合意图 | "帮我写招标文件，顺便看下结节" | llm_judge | llm_judge (新动词+旧实体) | ✅ |
| 无关联 | "帮我分析天气预报" | llm_judge | llm_judge (overlap=0%) | ✅ |

### max_tokens 测试

| 模型 | max_tokens | 结果 |
|------|------------|------|
| mimo-v2.5-pro | 65536 | ✅ 完整生成33811字节HTML |
| mimo-v2.5-pro | 4096 (旧) | ❌ JSON截断，write_file 0字节 |

---

## 五、配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `LLM_MAX_TOKENS` | 65536 | 模型最大输出 token 数 |
| `LLM_CONTEXT_WINDOW` | 131072 | 模型上下文窗口大小 |
| `LLM_SAFETY_MARGIN` | 4000 | 安全余量 token |
| `TOOL_RESULT_MAX_CHARS` | 8000 | 工具返回内容最大字符数 |
| `TASK_TIMEOUT` | 1800 (30分钟) | 任务超时自动挂起 |

---

## 六、关键教训

1. **max_tokens是根本限制** — 4096不够写文件，必须可配置
2. **finish_reason="length"必须处理** — 截断的JSON无法解析
3. **任务状态不能只靠LLM** — 必须有独立的后端状态机
4. **规则优先级必须明确** — 显式指令 > 超时 > 混合意图 > 实体匹配 > 短消息 > 重叠度 > LLM
5. **短消息要主动确认** — 用户发"1"时不能猜，要问
6. **混合意图要特殊处理** — 消息同时含新旧任务关键词时，交给LLM判断
7. **实体要动态管理** — 任务执行过程中追加/移除实体，上限20个

---

## 七、相关Commits

| Commit | 说明 |
|--------|------|
| `b68251c` | 系统提示明确要求LLM推断文件名+扩展名 |
| `688b3d4` | max_tokens从4096提升到16384 |
| `06347fd` | write_file参数不完整时反馈给LLM重新推理 |
| `779af65` | max_tokens从环境变量读取，默认65536 |
| `3154fea` | 设置页面max_tokens+启动探测+token管理器 |
| `b87cfa7` | send_file工具读取文件内容发给前端 |
| `f625fa5` | 新消息判断是否继续旧任务（初版） |
| `871593d` | 继续关键词+目标重叠度判断（二版） |
| `87c2de3` | TaskStateManager独立任务状态管理 |
| `999f155` | 5处任务状态机优化 |
| `a5b13cb` | 规则F优先级提升+overlap预计算 |

---

## 八、架构总结

```
用户消息
    │
    ▼
┌─────────────────────────────┐
│   TaskStateManager          │
│   (独立状态，不进LLM上下文)  │
│                             │
│   规则A: 显式指令           │ ← 最高优先级
│   规则B: 超时挂起           │
│   规则F: 混合意图           │
│   规则C: 实体匹配           │
│   规则D: 短消息确认         │
│   规则E: 重叠度(辅助)       │
│   LLM:  兜底判断            │ ← 最低优先级
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   TaskPlanner               │
│   (任务拆分+执行+反思)      │
│                             │
│   plan() → 子任务列表       │
│   execute → 工具调用        │
│   reflect → 结果校验        │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   LLM Engine                │
│   (max_tokens动态计算)      │
│                             │
│   token_manager: 启动探测   │
│   finish_reason=length检测  │
│   工具返回截断              │
└─────────────────────────────┘
```
