# Soulmate Tool Calls 问题修复报告

**日期**: 2026-09-14
**分支**: main
**涉及项目**: OpenMate (acp-proxy)

---

## 一、问题描述

Soulmate 执行任务时，多次出现：
- `write_file` 写出 0 字节文件
- 文件名和扩展名不正确（如 `output.txt`）
- 文件名与用户任务主题无关
- 工具调用参数为空 (`func_args = {}`)

用户测试场景：让 Soulmate 创建攀岩者网站首页，3次尝试全部失败。

---

## 二、排查过程

### 2.1 误判：LLM API 问题？

最初怀疑 MiMo API 返回不完整。但**非流式 API 测试**确认 MiMo 返回了完整的 tool_calls（path + content 都有）。排除 LLM 问题。

### 2.2 误判：流式 SSE 解析问题？

加调试日志追踪 `accumulated_tool_calls` 的 arguments 累积过程。直接流式测试和模拟 Soulmate 场景测试均正常（args_len=1429, path=hello.html, content_len=1325）。

### 2.3 根因定位：max_tokens 不足导致 JSON 截断

在 ACP 代理日志中找到关键证据：

```
[LLM] tool_call args不完整: name=write_file, len=16403, 
preview={"path": "/home/climbing/openmate/climber-homepage.html", 
"content": "<!DOCTYPE html>\n<html lang="
```

**MiMo 确实生成了正确的文件名** (`climber-homepage.html`)，**content 也正确开始了** (`<!DOCTYPE html>`)，但 `max_tokens` 只有 **4096**，HTML 内容太长，JSON 被截断，`json.loads` 失败 → `func_args = {}` → path 和 content 都为空。

---

## 三、根因分析

| 层面 | 问题 |
|------|------|
| **直接原因** | `finish_reason="length"` 时 tool_calls 的 arguments JSON 被截断 |
| **根本原因** | `max_tokens` 硬编码为 4096，不足以生成完整 HTML 文件 |
| **配置缺失** | 无本地 token 估算、无动态 max_tokens 计算、无截断自动处理 |
| **提示不足** | 系统提示未告知 LLM 大文件应使用 execute_code 而非 write_file |

---

## 四、修复方案（7项）

### 4.1 max_tokens 从环境变量读取
- **文件**: `acp-proxy/agent/llm_engine.py`
- **改动**: 3处 `max_tokens` 从硬编码 4096 → `get_max_output_tokens()`（缓存值）
- **默认值**: `.env` 中 `LLM_MAX_TOKENS=65536`

### 4.2 设置页面联动
- **文件**: `src/app/(app)/settings/settings-client.tsx`
- **改动**: 
  - 默认值 4096 → 65536
  - 滑块范围 256~16384 → 256~131072
  - 保存时传 `max_tokens` 到 `/api/llm/config` 后端

### 4.3 Token 管理器（启动时探测 + 缓存）
- **文件**: `acp-proxy/utils/token_manager.py`（新建）
- **功能**:
  - `probe_model_capabilities()`: 启动时探测模型能力，只执行一次
  - `get_max_output_tokens()`: 返回缓存的 max_tokens
  - `truncate_tool_result()`: 工具返回内容超长自动截断（保留头尾）
  - `estimate_tokens()`: 粗略估算 token 数

### 4.4 启动时自动探测
- **文件**: `acp-proxy/app.py`
- **改动**: lifespan 中调用 `probe_model_capabilities()`，启动时探测一次

### 4.5 finish_reason=length 截断检测
- **文件**: `acp-proxy/agent/llm_engine.py`
- **改动**: 检测到 `finish_reason="length"` 且 tool_calls arguments 不完整时，标记 `_truncated=True` 并返回，让调用方处理

### 4.6 write_file 参数不完整时反馈 LLM
- **文件**: `acp-proxy/agent/soulmate_agent.py`
- **改动**: path 或 content 为空时，返回错误信息让 LLM 重新推理，不猜测文件名

### 4.7 系统提示优化
- **文件**: `acp-proxy/agent/soulmate_agent.py`
- **改动**: 系统提示中明确告知 LLM：
  - `write_file` 的 path 必须包含完整路径+文件名+扩展名
  - 根据用户意图推断扩展名（"网页"→.html，"脚本"→.py）
  - content 超过 3000 字符时用 `execute_code` 写入

---

## 五、配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `LLM_MAX_TOKENS` | 65536 | 模型最大输出 token 数 |
| `LLM_CONTEXT_WINDOW` | 131072 | 模型上下文窗口大小 |
| `LLM_SAFETY_MARGIN` | 4000 | 安全余量 token |
| `TOOL_RESULT_MAX_CHARS` | 8000 | 工具返回内容最大字符数 |

---

## 六、关键教训

1. **max_tokens 是根本限制** — 4096 只够简单回复，写文件/代码远远不够
2. **finish_reason="length" 必须处理** — 截断的 JSON 无法解析，必须检测并处理
3. **不同模型上限不同** — 不能硬编码，必须可配置
4. **大文件不该用 write_file** — 应告知 LLM 用 execute_code 分段写入
5. **文件名应由 LLM 推理** — 不应由代码猜测，应反馈错误让 LLM 重新推理
6. **设置页面应联动** — 前端配置必须传到后端生效

---

## 七、相关 Commits

| Commit | 说明 |
|--------|------|
| `b68251c` | 系统提示明确要求 LLM 推断文件名+扩展名 |
| `688b3d4` | max_tokens 从 4096 提升到 16384 |
| `06347fd` | write_file 参数不完整时反馈给 LLM 重新推理 |
| `779af65` | max_tokens 从环境变量读取，默认 65536 |
| `3154fea` | 设置页面 max_tokens + 启动探测 + token 管理器 |
