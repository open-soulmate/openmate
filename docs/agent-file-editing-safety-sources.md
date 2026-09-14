# 标杆Agent文件编辑安全机制 — 综合调研报告

> 调研日期：2026-09-14
> 调研范围：18个编码类AI Agent项目源码级分析
> 核心问题：LLM token超限导致文件截断，Agent直接覆盖原文件，大量代码丢失
> 调研方法：逐个阅读仓库源码核心模块 + 行业公开文档分析

---

## 一、执行摘要

**核心结论：防截断的根本不是"写后修补"，而是"让模型别重写整文件"。**

18个项目呈现出清晰的能力梯队：

| 梯队 | 代表项目 | 核心特征 |
|------|---------|---------|
| **第一梯队** | aider, opencode, openai-agents, continue, openai-codex | 增量编辑+锚点唯一校验+写前干跑+原子写入+写后校验+回滚安全网 |
| **第二梯队** | cline, roo-code, openhands, swe-agent, gemini-cli, goose, agent-zero, gpt-engineer | 增量编辑+锚点校验，但缺自动续写或写后校验之一 |
| **第三梯队** | open-interpreter, claude-code, smolagents | 有工具模式但经典路径无防护，或源码不可得 |
| **第四梯队** | devika, smol-developer | 全量重写+无截断检测，截断即静默写坏 |

---

## 二、防截断机制分类谱系（6大类）

### 2.1 增量编辑（治本机制）★★★★★

不让模型输出整个文件，只输出"变更片段"，输出体积与改动量成正比。

| 子类型 | 代表实现 | 源码证据 |
|--------|---------|---------|
| SEARCH/REPLACE块 | aider | `editblock_coder.py:386-439` |
| find&replace锚点 | opencode, roo-code, cline, goose, openhands | opencode `tool/edit.ts:682`; openhands `editor.py:56` |
| unified diff patch | aider(udiff), gpt-engineer | `core/diff.py:39-41` |
| 自定义patch格式 | opencode(apply_patch), cline, openai-codex | opencode `patch/index.ts:185` |
| V4A结构化diff | openai-agents | `src/agents/tools/apply_diff.py` |

关键设计要点：
- 锚点old_string必须**唯一命中**，0次或>1次都报错不写盘
- opencode的`isDisproportionateMatch`防止模糊匹配命中大块误删
- gemini-cli拒绝`// rest of methods...`省略占位符

### 2.2 写前干跑/批量原子性 ★★★★☆

写盘前先在内存中全部试匹配，只要有一个失败，整个批次作废。

| 项目 | 实现 | 源码证据 |
|------|------|---------|
| aider | `apply_edits_dry_run(edits)`全量试匹配 | `base_coder.py:2296-2304` |
| continue | `multi_edit`的`preprocessArgs`先dry-run | `core/tools/` |
| openai-codex | parse→verify→execute三段式 | `codex-rs/` |
| gpt-engineer | `validate_and_correct`逐行对齐 | `core/diff.py:288-378` |

### 2.3 原子写入 ★★★★☆

`tempfile + os.replace`，进程中断不会产生半写文件。

| 项目 | 实现 | 源码证据 |
|------|------|---------|
| openhands | `tempfile.NamedTemporaryFile` + `shutil.move()` | `editor.py:448-473` |
| agent-zero | `_text_editor`插件 | 原子写入 |
| openai-codex | Rust `AppliedPatchDelta` | 三段式 |

### 2.4 截断检测与续写 ★★☆☆☆（仅aider真正实现）

显式检查`finish_reason=="length"`，自动续写。

```python
# Aider方案 (base_coder.py:1894-1911, 1492-1505)
if completion.choices[0].finish_reason == "length":
    raise FinishReasonLength()
# 检测到截断后，把已生成内容作为assistant prefix回喂继续生成
```

**关键洞察**：18个项目只有aider真正实现了"截断续写"。其余靠"增量编辑让单次输出远短于上限"来规避。

### 2.5 写后校验 ★★★★☆

| 项目 | 实现 | 源码证据 |
|------|------|---------|
| swe-agent | `flake8 --select=F821,F822,F831,E999,E902`（截断典型症状） | `flake8_utils.py:141` |
| opencode | LSP诊断 `lsp.touchFile()` + `lsp.diagnostics()` | `apply_patch.ts:266-293` |
| gemini-cli | `omission-placeholder`检测器 | `src/` |
| aider | lint失败回灌模型自修 + `/undo` | `base_coder.py:1589` |

**swe-agent的flake8选码是神来之笔**：F821(未定义名称)、E999(语法错误)恰好是截断的典型症状。做pre/post diff，只报新错误。

### 2.6 大文件上下文处理 ★★★★☆

| 项目 | 实现 | 源码证据 |
|------|------|---------|
| opencode | 默认2000行/单行2000字符/50KB | `read.ts:13-16` |
| swe-agent | `WindowedFile`窗口化+tree-sitter折叠 | `windowed_file.py:53` |
| continue | `throwIfFileExceedsHalfOfContext` | `core/` |
| cline | `generateAssistantMessageWithOverflowRecovery()`自动compact | `agent-runtime.ts` |

---

## 三、18个项目横向对比表

| # | 项目 | 编辑模型 | 锚点唯一 | 写前干跑 | 原子写入 | 截断续写 | 写后校验 | 回滚 | 综合 |
|---|------|---------|---------|---------|---------|---------|---------|------|------|
| 01 | claude-code | find&replace | ✅(推断) | ? | ✅快照 | ? | ? | ✅/rewind | 源码不可得 |
| 02 | opencode | patch+find&replace | ✅+防过度模糊 | ✅ | ✅ | ❌ | ✅LSP | ✅ | ★★★★★ |
| 03 | roo-code | search_replace | ✅ | ✅ | ✅ | ❌ | ✅IDE | ✅git | ★★★★☆ |
| 04 | aider | SEARCH/REPLACE | ✅多级兜底 | ✅dry_run | ❌(git兜底) | ✅**唯一** | ✅lint | ✅/undo | ★★★★★ |
| 05 | openhands | str_replace | ✅ | ❌ | ✅**原子** | ❌ | ❌ | ✅10级undo | ★★★★☆ |
| 06 | swe-agent | windowed+str_replace | ✅ | ❌ | ❌ | ❌ | ✅**flake8选码** | ✅undo | ★★★★☆ |
| 07 | cline | editor+apply_patch | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ★★★★☆ |
| 08 | continue | multi_edit | ✅5档模糊 | ✅ | ❌ | ❌ | ❌ | ❌ | ★★★★☆ |
| 09 | gemini-cli | edit(4级回退) | ✅ | ❌ | ❌ | ❌ | ✅**omission检测** | ❌ | ★★★★☆ |
| 10 | openai-codex | apply_patch(唯一) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ★★★★★ |
| 11 | goose | find&replace | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★☆☆ |
| 12 | open-interpreter | str_replace | ✅ | ❌ | ❌ | ❌ | ✅执行即校验 | ✅ | ★★★☆☆ |
| 13 | gpt-engineer | 全量+diff | ✅ | ✅ | ❌ | ❌ | ✅black | ❌ | ★★★★☆ |
| 14 | devika | 纯全量重写 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ★★☆☆☆ |
| 15 | smolagents | 无内置文件工具 | ❌ | ❌ | ❌ | 仅补围栏 | ❌ | ❌ | ★☆☆☆☆ |
| 16 | openai-agents | V4A diff | ✅ | ✅ | ❌ | ❌ | ✅审批 | ❌ | ★★★★★ |
| 17 | agent-zero | patch/write | ✅ | ❌ | ✅ | ❌ | ✅回读 | ❌ | ★★★★☆ |
| 18 | smol-developer | 全量裸写 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ★☆☆☆☆ |

---

## 四、跨项目收敛的「防截断铁律」

1. **禁止默认整文件Write**（新建文件除外）
2. **内容锚定**：SEARCH/old_string必须在盘上精确命中
3. **唯一性强制**：命中0或>1 -> 拒绝
4. **先读后改**：未Read过的文件禁止Edit
5. **只替换匹配区**，其余字节原样保留
6. **比例/省略守卫**：`isDisproportionateMatch`; 拒绝省略占位符
7. **写前快照/写后可undo**（git或shadow-git）
8. **原子写**：临时文件+rename
9. **错误结构化回注**，限次重试
10. **编辑后校验**：lint/LSP/flake8

---

## 五、OpenMate Evo Agent现状 vs 行业最佳

| 维度 | 我们已实现 | 行业最佳 | 差距 |
|------|-----------|---------|------|
| 增量编辑(old_string/new_string) | ✅ | OpenCode/Claude Code | ✅已对齐 |
| 存量文件禁止全量覆盖 | ✅ | OpenHands | ✅已对齐 |
| 精确匹配+唯一性 | ✅ | 同上 | ✅已对齐 |
| Closest-match hints | ✅ 5种策略 | MiMo Code 7种 | 基本对齐 |
| 带hint重试 | ✅ | MiMo Code | ✅已对齐 |
| 行数锐减拦截(30%) | ✅ | RooCode差异告警 | ✅已对齐 |
| Git快照 | ✅ | Aider/OpenHands | ✅已对齐 |
| 原子写入 | ✅ | OpenHands | ✅已对齐 |
| TS/JS语法检查 | ✅ | SWE-agent flake8选码 | ✅已对齐 |
| **finish_reason:length检测** | ❌ | Aider自动续写 | **需补充P0** |
| **写前dry-run验证** | ❌ | Aider/RooCode | **需补充P1** |
| **编辑历史/undo** | ❌ | OpenHands/SICA | **需补充P1** |
| **omission-placeholder检测** | ❌ | Gemini CLI | **需补充P2** |

---

## 六、推荐补充实现

### P0: finish_reason:length检测（Aider方案）

```python
def chat_with_continuation(messages, model, max_continuation=3):
    full_content = ""
    for _ in range(max_continuation):
        response = client.chat.completions.create(model=model, messages=messages, max_tokens=4096)
        choice = response.choices[0]
        full_content += choice.message.content or ""
        if choice.finish_reason != "length":
            break
        if model_supports_prefill(model):
            messages.append({"role": "assistant", "content": full_content, "prefix": True})
        else:
            messages.append({"role": "assistant", "content": full_content})
            messages.append({"role": "user", "content": "Continue from where you left off."})
    return full_content
```

### P1: 写前干跑（Aider方案）

```python
def apply_edits_batch(edits):
    # Phase 1: dry-run all edits in memory
    contents = {}
    for edit in edits:
        if edit.path not in contents:
            contents[edit.path] = read_file(edit.path)
        if contents[edit.path].count(edit.old_string) != 1:
            raise EditError(f"Batch aborted: {edit.path} old_string not unique")
        contents[edit.path] = contents[edit.path].replace(edit.old_string, edit.new_string, 1)
    # Phase 2: atomic write only after all pass
    for path, content in contents.items():
        atomic_write(path, content)
```

### P1: 写后校验（SWE-agent选码方案）

```python
def post_write_validate(path, old_content):
    errors = []
    if path.endswith(".py"):
        try:
            ast.parse(read_file(path))
        except SyntaxError as e:
            errors.append(f"SyntaxError: {e}")
    return errors
```

### P2: omission-placeholder检测（Gemini CLI方案）

```python
OMISSION_PATTERNS = [
    r"\(rest of methods \.\.\.\)",
    r"# \.\.\. existing code \.\.\.",
    r"// \.\.\. rest of the function",
    r"\[\.\.\.\]",
]

def check_omission(llm_output):
    for pattern in OMISSION_PATTERNS:
        if re.search(pattern, llm_output):
            return True
    return False
```

---

## 七、参考资料

| Agent | GitHub | 关键源码 |
|-------|--------|---------|
| OpenHands | [All-Hands-AI/openhands-aci](https://github.com/All-Hands-AI/openhands-aci) | `openhands_aci/editor/editor.py` |
| Aider | [Aider-AI/aider](https://github.com/Aider-AI/aider) | `aider/coders/editblock_coder.py`, `base_coder.py` |
| RooCode | [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | `src/core/tools/ApplyDiffTool.ts` |
| Claude Code | [anthropics/claude-code](https://github.com/anthropics/claude-code) | 闭源 |
| OpenCode | [sst/opencode](https://github.com/sst/opencode) | `packages/opencode/src/tool/edit.ts` |
| MiMo Code | [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) | `packages/opencode/src/tool/edit.ts`, PR #1466 |
| SICA | [MaximeRobeyns/self_improving_coding_agent](https://github.com/MaximeRobeyns/self_improving_coding_agent) | `base_agent/src/tools/edit_tools/` |
| AG2 | [ag2ai/ag2](https://github.com/ag2ai/ag2) | `autogen/tools/experimental/apply_patch/` |
| SWE-agent | [princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent) | `sweagent/agent/edit_tools/` |
| Continue | [continuedev/continue](https://github.com/continuedev/continue) | `core/tools/` |
| Gemini CLI | [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | `src/` |
| Goose | [block/goose](https://github.com/block/goose) | `goose/src/` |
| GPT-Engineer | [gpt-engineer-org/gpt-engineer](https://github.com/gpt-engineer-org/gpt-engineer) | `gpt_engineer/core/diff.py` |
| OpenAI Agents | [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | `src/agents/tools/` |
| Cline | [cline/cline](https://github.com/cline/cline) | `src/core/tools/` |
| OpenAI Codex | [openai/codex](https://github.com/openai/codex) | `codex-rs/` |
| Cursor | 闭源 | 公开分析: fabianhertwig.com |
| OpenMate | NousResearch/openmate | `acp-proxy/dna_evolution.py` |
