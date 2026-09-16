# Claude Code 功能研究

研究时间：2026-09-16 02:15
源码：github.com/anthropics/claude-code

## 架构特点

Claude Code是CLI工具，不开源核心代码，但提供了丰富的插件系统和示例。

## 插件系统

### 1. code-review（代码审查）
- 多agent并行审查PR：4个agent独立审计
- Agent #1&2：CLAUDE.md合规检查
- Agent #3：明显bug扫描
- Agent #4：git blame历史分析
- 置信度评分（0-100），阈值80过滤误报
- **OpenMate/OpenSoul没有**：多agent并行代码审查+置信度评分

### 2. hookify（钩子系统）
- Markdown配置文件定义规则（YAML frontmatter）
- 正则模式匹配
- 无需编码，描述行为即可
- 热加载，无需重启
- **OpenMate/OpenSoul没有**：声明式钩子系统

### 3. feature-dev（功能开发）
- 7阶段结构化工作流
- Discovery → 理解需求
- 架构设计 → 实现 → 质量审查
- **OpenMate/OpenSoul没有**：结构化功能开发流程

### 4. security-guidance（安全指导）
- 三层安全审查：
  1. 模式警告：25+危险模式正则匹配（yaml.load、pickle.load、innerHTML等）
  2. LLM diff审查：完成turn后发送diff给快速LLM检查
  3. Agent提交审查：git commit时读取相关文件追踪数据流
- 覆盖：注入、XSS、SSRF、硬编码密钥、IDOR、认证绕过、不安全反序列化、路径遍历
- **OpenMate/OpenSoul没有**：自动化安全审查流水线

### 5. pr-review-toolkit（PR审查工具包）
- **OpenMate/OpenSoul没有**

### 6. learning-output-style（学习输出风格）
- **OpenMate/OpenSoul没有**

### 7. frontend-design（前端设计）
- **OpenMate/OpenSoul没有**

## 企业级功能

### MDM部署
- Jamf、Kandji、Intune、Group Policy模板
- managed-settings.json优先级最高，用户无法覆盖
- **OpenMate/OpenSoul没有**：企业级配置管理

### Gateway
- examples/gateway有示例
- **OpenMate/OpenSoul部分有**：OpenSoul有a2a/gateway

## 功能清单

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 多agent并行代码审查 | ❌ | ❌ | 大 | 4个独立agent+置信度评分 |
| 声明式钩子系统 | ❌ | ❌ | 大 | Markdown配置+正则匹配+热加载 |
| 结构化功能开发流程 | ❌ | ❌ | 中 | 7阶段工作流 |
| 自动化安全审查 | ❌ | 部分（immune） | 大 | 三层：模式+LLM diff+agent审查 |
| PR审查工具包 | ❌ | ❌ | 中 | PR专用审查命令 |
| 企业MDM部署 | ❌ | ❌ | 中 | 配置管理模板 |
| 学习输出风格 | ❌ | ❌ | 小 | 输出格式定制 |
| 前端设计插件 | ❌ | ❌ | 小 | 前端代码生成规范 |

## 可复用设计

1. **多agent并行审查+置信度评分**：4个独立视角+0-100评分+阈值过滤
2. **hookify声明式钩子**：Markdown配置+正则+热加载，比硬编码hooks灵活
3. **三层安全审查**：模式匹配（快）→ LLM diff（中）→ agent审查（慢但深）
4. **7阶段功能开发**：Discovery→设计→实现→审查的结构化流程
