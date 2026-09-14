# 文件编辑安全防护 — 开发报告

> 日期：2026-09-14
> 问题：LLM token超限导致文件截断，Agent直接覆盖原文件，大量代码丢失
> 状态：已完成，12层防护全部实现

---

## 一、问题描述

### 1.1 故障现象

evo agent在处理项目文件时，会将文件内容截断——文件行数突然大幅减少，丢失大部分代码，但截断后的文件语法仍然合法（不报错），导致页面功能大面积消失。

**已发生案例：**

| 次数 | 文件 | 正常行数 | 截断后 | 恢复方式 |
|------|------|---------|--------|---------|
| 5次 | src/stores/app-store.ts | 1021 | 158~210 | `git show 82e99f1` 恢复 |
| 1次 | src/components/task-choice-menu.tsx | 131 | 152（不完整） | `git show 55f4894` 恢复 |
| 1次 | src/app/(app)/chat/chat-client.tsx | 2189 | 64 | `git show 60cb305` 恢复 |

### 1.2 根因分析

**最高概率：LLM输出截断**

LLM在token上限时，会无视system prompt约束，输出半截合法代码。这是所有生产级编码Agent踩过的共性坑。

**行业共识：** Prompt约束不能作为防护手段，引擎层硬校验才可靠。

---

## 二、调研成果

### 2.1 调研范围

- 18个编码类AI Agent项目源码级分析
- 包括：OpenHands、Aider、RooCode、Claude Code、OpenCode、MiMo Code、SICA、AG2、SWE-agent、Continue、Gemini CLI、Goose、GPT-Engineer、OpenAI Agents、Cline、OpenAI Codex、Open-Interpreter、Agent-Zero

### 2.2 调研文档

- `docs/agent-file-editing-safety-sources.md` — 18个Agent综合调研报告（251行）
- `docs/agent-architecture-merged/` — 154篇Agent架构分析文档

### 2.3 关键发现

**6大类防护机制：**

| 类别 | 代表实现 | 效果 |
|------|---------|------|
| 增量编辑 | OpenCode/Claude Code/Aider | LLM只输出变更片段，不可能截断 |
| 写前干跑 | Aider/RooCode | 先模拟验证，一个失败整个批次作废 |
| 原子写入 | OpenHands | tempfile+os.replace，不留半写文件 |
| 截断检测+续写 | Aider | 检测finish_reason=length自动续写 |
| 写后校验 | SWE-agent/Gemini CLI | flake8选码+omission检测 |
| 大文件处理 | SWE-agent/Continue | 窗口化+分页+上下文门控 |

**4个能力梯队：**

| 梯队 | 代表项目 | 核心特征 |
|------|---------|---------|
| 第一梯队 | aider, opencode, openai-agents | 增量编辑+锚点校验+写前干跑+原子写入+写后校验+回滚 |
| 第二梯队 | cline, roo-code, openhands | 增量编辑+锚点校验，但缺自动续写或写后校验之一 |
| 第三梯队 | open-interpreter, claude-code | 有工具模式但经典路径无防护 |
| 第四梯队 | devika, smol-developer | 全量重写+无截断检测 |

---

## 三、解决方案

### 3.1 架构设计

将防护机制提取为两个通用模块，任何地方只需一次调用：

```
acp-proxy/
├── utils/
│   ├── __init__.py
│   ├── file_safety.py      # 文件安全防护（11个函数）
│   └── llm_safety.py       # LLM安全防护（5个函数）
├── dna_evolution.py         # 进化引擎（已集成12层防护）
└── ...
```

### 3.2 防护层级（12层）

| 层 | 防护 | 来源 | 状态 |
|---|------|------|------|
| 1 | Git快照前置 | 分析方案 | ✅ |
| 2 | 行数锐减拦截(30%) | RooCode | ✅ |
| 3 | TS/JS/JSON语法检查 | 分析方案 | ✅ |
| 4 | 审计日志 | 分析方案 | ✅ |
| 5 | old_string/new_string增量编辑 | OpenCode/Claude Code | ✅ |
| 6 | 精确匹配+校验唯一性 | MiMo Code | ✅ |
| 7 | 5种closest-match hints | MiMo Code | ✅ |
| 8 | 带hint自动重试 | MiMo Code | ✅ |
| 9 | finish_reason检测+自动续写 | Aider | ✅ |
| 10 | omission占位符检测 | Gemini CLI | ✅ |
| 11 | 写前dry-run验证 | Aider | ✅ |
| 12 | 编辑历史/undo | OpenHands | ✅ |

### 3.3 通用模块接口

**utils/file_safety.py（11个函数）：**

```python
# 原子写入（OpenHands方案）
atomic_write(path, content) -> bool

# 行数锐减拦截（RooCode方案）
check_line_reduction(old_content, new_content, target) -> str | None

# 编辑历史（OpenHands方案）
save_edit_history(old_content, target, repo_root) -> str | None
restore_from_history(history_path) -> str | None

# 审计日志
audit_log(old_content, new_content, target, strand_id)

# 语法检查
check_syntax(content, target) -> list[str]

# 文件校验（OpenHands方案）
validate_file(path) -> str | None

# Omission占位符检测（Gemini CLI方案）
check_omission(text) -> str | None

# 编辑验证（Aider dry-run方案）
dry_run_edits(old_content, edits) -> tuple[str | None, str]

# Closest-match hints（MiMo Code方案）
find_closest_match(content, target) -> str | None
```

**utils/llm_safety.py（5个函数）：**

```python
# Omission占位符检测
check_omission(text) -> str | None

# finish_reason检测（Aider方案）
check_finish_reason(choice) -> str

# 构建续写消息（Aider方案）
build_continuation_messages(messages, partial_content, error_hint) -> list[dict]

# 安全LLM调用封装（集成所有防护）
safe_llm_call(client, base_url, headers, model, messages, ...) -> str
```

### 3.4 使用示例

**场景1：安全写入文件**

```python
from utils.file_safety import atomic_write, check_line_reduction, save_edit_history, check_syntax

# 1. 保存编辑历史
save_edit_history(old_content, target_file, repo_root)

# 2. 行数校验
error = check_line_reduction(old_content, new_content, target_file)
if error:
    return {"status": "blocked", "reason": error}

# 3. 语法检查
errors = check_syntax(new_content, target_file)
if errors:
    return {"status": "failed", "reason": f"Syntax errors: {errors}"}

# 4. 原子写入
if not atomic_write(target_file, new_content):
    return {"status": "failed", "reason": "Atomic write failed"}
```

**场景2：安全LLM调用**

```python
from utils.llm_safety import safe_llm_call

# 一行调用，集成所有防护
result = await safe_llm_call(
    client=client,
    base_url=llm_base_url,
    headers=headers,
    model=llm_model,
    messages=[{"role": "user", "content": prompt}],
    strand_id=strand_id,
)
```

**场景3：安全编辑验证**

```python
from utils.file_safety import dry_run_edits, find_closest_match

# 干跑验证所有编辑
error, new_content = dry_run_edits(old_content, edits)
if error:
    # 自动提供closest-match hints
    return {"status": "failed", "reason": error}
```

---

## 四、实施效果

### 4.1 防护覆盖

| 组件 | 文件写入 | LLM调用 | 防护状态 |
|------|---------|---------|---------|
| dna_evolution.py | ✅ | ✅ | 已集成12层防护 |
| evolution_pipeline.py | - | 4处 | 可调用safe_llm_call |
| routes/evolution.py | 1处 | - | 可调用atomic_write |
| agent/artifact.py | 3处 | - | 可调用atomic_write |
| agent/soulmate_agent.py | 2处 | - | 可调用atomic_write |
| plugins/ (5个文件) | 5处 | - | 可调用atomic_write |

### 4.2 预期效果

**之前：** LLM截断 → 文件被覆盖 → 大量代码丢失 → 需要手动git恢复

**之后：**
1. LLM截断 → finish_reason检测 → 自动续写（Aider方案）
2. LLM偷懒 → omission检测 → 要求重新完整输出（Gemini CLI方案）
3. 编辑不匹配 → dry-run验证 → 整个批次作废（Aider方案）
4. 行数锐减 → 拦截 → 阻止写入（RooCode方案）
5. 写入失败 → 原子写入 → 不留半写文件（OpenHands方案）
6. 需要回滚 → 编辑历史 → 一键恢复（OpenHands方案）

---

## 五、参考资料

### 5.1 调研文档

- `docs/agent-file-editing-safety-sources.md` — 18个Agent综合调研报告
- `docs/agent-architecture-merged/` — 154篇Agent架构分析

### 5.2 关键源码

| Agent | GitHub | 关键文件 |
|-------|--------|---------|
| OpenHands | [All-Hands-AI/openhands-aci](https://github.com/All-Hands-AI/openhands-aci) | `openhands_aci/editor/editor.py` |
| Aider | [Aider-AI/aider](https://github.com/Aider-AI/aider) | `aider/coders/editblock_coder.py`, `base_coder.py` |
| MiMo Code | [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) | `packages/opencode/src/tool/edit.ts`, PR #1466 |
| Gemini CLI | [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | `src/` |
| RooCode | [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | `src/core/tools/ApplyDiffTool.ts` |

### 5.3 行业共识

**防截断铁律（10条）：**

1. 禁止默认整文件Write（新建文件除外）
2. 内容锚定：SEARCH/old_string必须在盘上精确命中
3. 唯一性强制：命中0或>1 → 拒绝
4. 先读后改：未Read过的文件禁止Edit
5. 只替换匹配区，其余字节原样保留
6. 比例/省略守卫：`isDisproportionateMatch`; 拒绝省略占位符
7. 写前快照/写后可undo（git或shadow-git）
8. 原子写：临时文件+rename
9. 错误结构化回注，限次重试
10. 编辑后校验：lint/LSP/flake8

---

## 六、总结

### 6.1 核心成果

1. **调研了18个标杆Agent**，提炼出6大类防护机制
2. **实现了12层防护**，达到行业第一梯队水平
3. **提取了2个通用模块**，任何地方只需一次调用
4. **编写了完整文档**，包括调研报告和开发报告

### 6.2 关键洞察

**防截断的根本不是"写后修补"，而是"让模型别重写整文件"。**

增量编辑（old_string/new_string）是最有效的防护——LLM只输出变更片段，输出体积与改动量成正比，不可能触发截断。

### 6.3 后续建议

1. **应用到所有组件** — 将通用模块集成到evolution_pipeline、routes/evolution、agent/artifact等
2. **定期演练** — 模拟LLM截断场景，验证防护有效性
3. **持续优化** — 根据实际运行情况调整阈值和策略
