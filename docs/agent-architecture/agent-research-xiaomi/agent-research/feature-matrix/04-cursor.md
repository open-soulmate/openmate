# Cursor 功能研究

研究时间：2026-09-16 02:25
源码：github.com/getcursor/cursor（33012 stars，核心代码不开源）

## 状态
Cursor是商业产品，GitHub仓库只有README和少量资源，核心代码不开源。无法深入研究源码。

## 已知功能（从官网和社区了解）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| AI代码补全 | ✅ | ❌ | 小 | OpenMate有codemirror-editor |
| Tab补全 | ❌ | ❌ | 中 | 智能Tab键补全 |
| 多文件编辑 | ❌ | ❌ | 中 | AI同时编辑多个文件 |
| 代码库理解 | ❌ | 部分 | 中 | 全代码库索引+语义搜索 |
| Composer | ❌ | ❌ | 大 | 多文件重构界面 |
| Bug Finder | ❌ | ❌ | 中 | 自动bug发现 |
| 后台Agent | ❌ | ❌ | 大 | 后台异步执行任务 |

## 结论
无法读源码，跳过深入研究。从功能列表看，Composer（多文件重构）和后台Agent是OpenMate/OpenSoul缺少的高价值功能。
