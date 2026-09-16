# Letta 源代码深度研究

研究时间：2026-09-16 03:55
源码：github.com/letta-ai/letta-code（3.2k stars，TypeScript）
原仓库：github.com/letta-ai/letta（24.6k stars，已归档）

## 已读源代码文件

### 1. src/agent/memory.ts
- 记忆块管理核心
- MEMORY_BLOCK_LABELS：["persona", "human"]
- READ_ONLY_BLOCK_LABELS：["memory_filesystem"]
- parseMdxFrontmatter()：解析MDX frontmatter
- loadMemoryBlocksFromMdx()：从MDX文件加载记忆块
- getDefaultMemoryBlocks()：获取默认记忆块
- 关键设计：记忆块+MDX模板+只读标签

### 2. src/agent/memory-constants.ts
- READ_ONLY_BLOCK_LABELS：只读块标签
- memory_filesystem：记忆文件系统（只读）

### 3. src/agent/prompt-assets.ts
- 提示词资产
- SYSTEM_PROMPT：系统提示词
- MEMORY_PROMPTS：记忆提示词映射
- persona.mdx/human.mdx/project.mdx：记忆块模板
- SYSTEM_PROMPTS：系统提示词选项（Default/Letta/Claude Code/Codex/Gemini）
- 关键设计：模板化提示词+多风格支持

### 4. src/agent/skills.ts
- 技能系统核心
- Skill接口：id, name, description, whenToUse, argumentHint, category, tags, path, source, content
- 四个来源：Project(.agents/skills/), Agent(~/.letta/agents/{id}/memory/skills/), Global(~/.letta/skills/), Bundled(包内)
- 优先级：Project > Agent > Global > Bundled
- 关键设计：多来源技能+优先级+frontmatter解析

## 核心架构发现

### 1. 记忆块系统
- 记忆块：persona/human/project等
- MDX模板：frontmatter+content
- 只读块：memory_filesystem
- 缓存：cachedMemoryBlocks

### 2. 提示词系统
- 系统提示词：多种风格（Default/Letta/Claude Code/Codex/Gemini）
- 记忆提示词：persona/human/project模板
- 模板化：MDX frontmatter

### 3. 技能系统
- 多来源：Project/Agent/Global/Bundled
- 优先级：Project > Agent > Global > Bundled
- frontmatter：name, description, whenToUse, category, tags
- 可禁用：disableModelInvocation

### 4. 恢复机制
- approval_recovery_alert：审批恢复
- interrupt_recovery_alert：中断恢复
- onboarding：引导流程

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 记忆块系统 | ❌ | ❌ | 大 | persona/human/project+MDX模板 |
| 多风格提示词 | ❌ | ❌ | 大 | Default/Letta/Claude Code/Codex/Gemini |
| 技能系统 | ❌ | ❌ | 大 | 多来源+优先级+frontmatter |
| 恢复机制 | ❌ | ❌ | 中 | 审批恢复+中断恢复 |
| 只读块 | ❌ | ❌ | 中 | memory_filesystem只读 |

## 可复用设计

1. **记忆块系统**：persona/human/project+MDX模板+只读标签
2. **多风格提示词**：Default/Letta/Claude Code/Codex/Gemini
3. **技能系统**：多来源（Project/Agent/Global/Bundled）+优先级
4. **恢复机制**：审批恢复+中断恢复+引导流程
5. **frontmatter解析**：YAML frontmatter+content分离
