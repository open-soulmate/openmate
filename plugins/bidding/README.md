# 智能投标插件 (Bidding Plugin)

AI智能招投标系统 — 招标文件解析、标书生成、合规检查、Word导出

## 功能特性

- **招标文件解析**：支持PDF和Word格式，自动提取评分标准、技术参数、废标条款
- **标书提纲生成**：根据解析结果自动生成三级提纲，覆盖所有评分得分点
- **标书内容生成**：逐章生成标书正文，支持流式输出和配图预编排
- **合规风控检查**：70+规则自动检查，检测废标风险、评分覆盖、格式规范
- **Word文档导出**：生成标准格式Word文档，支持TOC域、横向表格、多级编号

## 工具列表

本插件向全局Tool网关注册以下工具：

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `parse_bid_document` | 解析招标文件 | `file_path` |
| `generate_outline` | 生成标书提纲 | `project_id` |
| `generate_chapter` | 生成章节内容 | `project_id`, `chapter_id` |
| `check_compliance` | 合规风控检查 | `project_id` |
| `export_to_word` | 导出Word文档 | `project_id` |

## 使用方式

### 通过AI Agent调用

```
用户：帮我解析这个招标文件
AI：调用 parse_bid_document 工具
```

### 通过API调用

```bash
# 创建项目
curl -X POST http://localhost:8092/bidding/project \
  -H "Content-Type: application/json" \
  -d '{"name": "示例项目"}'

# 解析招标文件
curl -X POST http://localhost:8092/bidding/parse \
  -F "file=@招标文件.pdf" \
  -F "project_id=xxx"
```

### 通过前端页面

访问 `http://your-openmate/bidding` 使用图形界面

## 权限要求

- `file:read` - 读取招标文件
- `file:write` - 生成Word文档
- `storage:read/write` - 项目数据存储
- `network:http` - 调用AI API
- `log:write` - 操作日志

## 配置

插件配置在 `plugin.json` 中：

```json
{
  "hot_reload": true,  // 支持热重载
  "protected": false    // 非核心保护插件
}
```

## 开发说明

本插件遵循 OpenMate Plugin v1.0 规范：

- 目录结构：标准插件目录
- 元数据：plugin.json 标准 Schema
- 生命周期：支持热加载
- 工具注册：统一至全局Tool网关
- 权限控制：白名单机制

## 依赖

- Python 3.10+
- FastAPI
- pymupdf (PDF解析)
- python-docx (Word解析)
- lxml (Word生成)
