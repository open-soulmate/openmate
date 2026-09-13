# Haystack

## 一句话定位
deepset 开源生产级 AI 编排框架：显式控制检索、路由、记忆与生成的 Pipeline/Agent。

## 核心架构（4点）
1. **Component + Pipeline**：模块化组件图，支持分支/循环/条件
2. **Agent + lifecycle hooks**：`before_llm` / `before_tool` / `on_exit` 做护栏与自定义
3. **SkillToolset**：技能描述按需进入上下文，减少 prompt 膨胀
4. **Hayhooks**：把 Pipeline/Agent 暴露为 REST 或 MCP Server

## 稳定性亮点
- 原生 Async：同一 Pipeline 同步/异步可跑，Agent 支持并发工具
- 内置 step_count / token_usage / tool call 追踪，便于成本与监控
- 企业客户面广（Apple/Meta/Netflix 等），3.0 强调 context engineering

## 对 openmate 借鉴
1. **工具前后 hooks 是护栏挂点**：权限、审计、截断不必改业务循环
2. **技能按需注入**：把长技能说明改成 SkillToolset 式延迟加载

## 链接
https://github.com/deepset-ai/haystack
