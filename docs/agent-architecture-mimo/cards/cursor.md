# Cursor

## 一句话定位
AI-first 代码编辑器（VS Code 分叉）：内嵌 Agent 改码、多文件编辑与项目级上下文。

## 核心架构（4点）
1. **Agent / Chat / Edit 模式**：从问答到跨文件应用编辑
2. **Codebase Indexing**：仓库索引供检索增强上下文
3. **Composer 式多文件变更**：批量生成可审查 diff
4. **Rules / 自定义指令**：项目与用户级行为约束

## 稳定性亮点
- 产品级审查流：变更以 diff 呈现，用户逐步接受
- 索引与嵌入管道持续更新，降低「找不到相关文件」
- 商业闭源，稳定性靠版本发布而非社区 fork

## 对 openmate 借鉴
1. **默认产出可审查 diff**：个人助手改文件也应先 preview 再 commit
2. **项目 Rules 文件**：`.openmate/rules` 级约束比系统提示更可维护

## 链接
https://github.com/getcursor/cursor
