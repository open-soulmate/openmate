# labring/FastGPT — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/labring/FastGPT  
> 抓取通道: cdn.jsdelivr.net/gh/labring/FastGPT@main  
> 版本快照: main @ 2026-09-13（app package.json version **4.17.0**）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Flow 工作流编排 / RAG / MCP 双向 / 插件热更新 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md`（中文完整）、`projects/app/package.json`（真实依赖与版本）
- 未打开: `projects/app/src/` 工作流引擎实现、节点定义
- License: FastGPT Open Source License — **允许后台商用，不允许 SaaS**；商用需保留版权

---

## 1. 项目定位（README 实读）

FastGPT 是 **AI Agent 构建平台**：
- 开箱即用的数据处理、模型调用
- **Flow 可视化工作流编排**
- 复杂应用场景

三形态:
1. **云服务**: fastgpt.io
2. **社区自托管**: Docker / Sealos
3. **商业版**: 完整功能 + 落地辅导

### 1.1 快速启动（真实命令）

```bash
bash <(curl -fsSL https://doc.fastgpt.io/deploy/install.sh)
docker compose up -d
# http://localhost:3000
# 默认账号 root / 密码 1234
```

---

## 2. 核心功能清单（README 实读）

### 2.1 应用编排

- [x] Agent Skill 编排
- [x] 对话工作流、插件工作流，含基础 RPA 节点
- [x] 用户交互
- [x] **双向 MCP**
- [ ] 辅助生成工作流（未完成）

### 2.2 应用调试

- [x] 知识库单点搜索测试
- [x] 对话时反馈引用并可修改删除
- [x] 完整调用链路日志
- [x] 应用评测
- [ ] 高级编排 DeBug 调试模式
- [ ] 应用节点日志

### 2.3 知识库能力

- [x] 多库复用、混用
- [x] chunk 记录修改和删除
- [x] 手动输入、直接分段、QA 拆分导入
- [x] 格式: TXT, MD, HTML, PDF, Docx, PPTX, CSV, XLSX；URL 读取；CSV 批量导入
- [x] 混合检索 & 重排
- [x] API 知识库

### 2.4 插件能力

- [x] **系统工具热更新**
- [ ] RAG 模块热更新
- [ ] Agent-loop 热更新
- [ ] AI 实时生成插件

### 2.5 运营能力

- [x] 免登录分享窗口
- [x] iframe 一键嵌入
- [x] 统一查阅对话记录并标注
- [x] 应用运营日志

---

## 3. 技术栈（package.json 源码实读）

### 3.1 运行时约束

```json
"engines": {
  "node": ">=22.23.2",
  "pnpm": "10.x"
}
"name": "@fastgpt/app"
"version": "4.17.0"
```

### 3.2 Monorepo workspace 包

```
@fastgpt/dal          # 数据访问层
@fastgpt/global       # 全局类型/常量
@fastgpt/next         # Next.js 封装
@fastgpt/service      # 服务层
@fastgpt/web          # Web 层
@fastgpt-sdk/otel     # OpenTelemetry
@fastgpt-sdk/sandbox-adapter
@fastgpt-sdk/storage
```

### 3.3 关键依赖（真实版本）

| 依赖 | 版本 | 用途 |
|------|------|------|
| next | catalog | 框架 |
| react / react-dom | catalog | UI |
| @chakra-ui/react | catalog | 组件库 |
| reactflow | ^11.7.4 | **Flow 可视化编排** |
| @dagrejs/dagre | ^1.1.4 | 图布局 |
| @modelcontextprotocol/sdk | catalog | **MCP** |
| mongoose | catalog | MongoDB |
| minio | catalog | 对象存储 |
| mermaid | catalog | 图表 |
| katex | 0.16.22 | 公式 |
| echarts | 5.4.1 + echarts-gl 2.0.9 | 可视化 |
| @xterm/xterm | catalog | 终端（sandbox） |
| esbuild | ^0.25.11 | 插件/worker 构建 |
| zod | catalog | schema |
| i18next / next-i18next | catalog | 国际化 |
| @t3-oss/env-core | catalog | env 校验 |
| undici | catalog | HTTP |
| p-limit | ^7.2.0 | 并发限制 |
| jsondiffpatch | ^0.7.6 | 工作流 diff |
| @node-rs/jieba | catalog | 中文分词 |
| @llamaindex/liteparse-wasm | catalog | 文档解析 |
| ip2region.js | ^3.1.6 | IP 归属 |

### 3.4 构建脚本（真实）

```json
"dev": "pnpm run build:workers && next dev",
"build": "pnpm run build:workers && next build --debug",
"build:workers": "tsx scripts/build-workers.ts",
"migrate:auth-code": "tsx scripts/migration/authCodeToTmpData.ts",
"test": "vitest run -c vitest.config.ts",
"typecheck": "tsc --noEmit --pretty",
"lint": "eslint ./src"
```

**Workers 预构建**: sandbox/插件 worker 先 esbuild 再启 Next。

---

## 4. 架构模式（README + 依赖推断，标注推断）

### 4.1 Flow 工作流

```
用户配置 Flow（reactflow UI）
  → 节点图（dagre 布局）
  → 对话工作流 / 插件工作流
  → RPA 基础节点
  → LLM / 知识库 / 工具节点
  → 输出
```

[推断] 节点类型与执行引擎在 `projects/app/src/`（本轮未打开）。

### 4.2 双向 MCP

- 作为 MCP client 调用外部工具
- 作为 MCP server 暴露自身能力
- `@modelcontextprotocol/sdk` catalog 版本

### 4.3 RAG 链路

```
文档 (PDF/DOCX/...) 
  → @llamaindex/liteparse-wasm / 其他 loader
  → 分段 / QA 拆分
  → Embedding
  → 混合检索 + 重排
  → chunk 可改可删
```

### 4.4 插件与 Sandbox

- 系统工具**热更新**（已完成）
- esbuild 构建 workers
- @xterm/xterm 暗示终端型 sandbox UI
- `@fastgpt-sdk/sandbox-adapter`

---

## 5. 与 openmate 映射

| 需求 | FastGPT 机制 | 可复用度 |
|------|-------------|----------|
| 可视化工作流 | reactflow + dagre | **高** |
| 对话 vs 插件工作流 | 两种 Flow 类型 | **高** |
| 双向 MCP | MCP SDK | **高** |
| 知识库多库混用 | 多库复用 | 高 |
| 混合检索+重排 | 已实现 | 高 |
| chunk 级编辑 | 修改删除 | 高 |
| 完整调用链日志 | 已实现 | **高** |
| 应用评测 | 已实现 | 中 |
| 插件热更新 | 系统工具已支持 | **高** |
| iframe 嵌入 | 一键嵌入 | 中 |
| OTel | @fastgpt-sdk/otel | 高 |
| env 校验 | @t3-oss/env-core | 高 |
| 并发限制 | p-limit | 高 |
| 工作流 diff | jsondiffpatch | 中 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 版本 | 4.17.0 | package.json |
| Node | >=22.23.2 | engines |
| pnpm | 10.x | engines |
| 默认端口 | 3000 | README |
| 默认账号 | root / 1234 | README |
| 浏览器 | Chrome>=80, Edge>=80, Firefox>=74, Safari>=13 | browserslist |
| 支持文件 | TXT/MD/HTML/PDF/Docx/PPTX/CSV/XLSX | README |
| 公式 | katex 0.16.22 | package.json |
| 图表 | echarts 5.4.1 | package.json |
| 终端 | @xterm/xterm | package.json |
| License | FastGPT Open Source（禁 SaaS） | README/LICENSE |

---

## 7. 失败路径 / 边界

```
Docker 部署失败
  → 完整教程 doc.fastgpt.io/self-host/deploy/docker

Sealos 一键部署
  → 备选路径

商业 SaaS 使用
  → License 禁止；需商业授权

工作流辅助生成
  → README 未完成项

RAG/Agent-loop 热更新
  → 未完成项

高级 DeBug 调试模式
  → 未完成项

应用节点日志
  → 未完成项

Node 版本过低
  → engines 要求 >=22.23.2

pnpm 版本不匹配
  → 要求 10.x

Workers 构建失败
  → build 先跑 build:workers

默认密码 1234
  → 生产必须改
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **reactflow 可视化工作流编排**（对话型 + 插件型分开）
2. **双向 MCP**（client + server）
3. **知识库 chunk 级修改删除**
4. **混合检索 + 重排**
5. **完整调用链路日志**
6. **系统工具热更新**（esbuild workers）
7. **@t3-oss/env-core 启动 env 校验**
8. **OTel SDK 独立包**（@fastgpt-sdk/otel）
9. **monorepo 分层**: dal / global / service / web / app
10. **jsondiffpatch 工作流版本 diff**

### P1 — 应抄

- 多库复用混用
- iframe 一键嵌入 + 免登录分享
- 应用评测
- i18n（i18next）
- ip2region 归属
- p-limit 并发限制
- engines 硬约束 Node 22.23.2+

### P2 — 可选

- RPA 基础节点
- @node-rs/jieba 中文分词
- @xterm 终端 UI
- @llamaindex/liteparse-wasm

---

## 9. 应避免的坑

- 勿在未授权下做 SaaS（License 明确禁止）
- Node 必须 >=22.23.2、pnpm 10.x
- 默认密码 1234 必须改
- 工作流辅助生成 / RAG 热更新 / 节点日志均为未完成
- 勿发明节点实现路径（本轮未打开 src）
- browserslist 最低 Safari 13 / Firefox 74

---

## 10. 源码锚点速查

```
README.md
  快速启动: install.sh + docker compose up -d
  默认: localhost:3000 root/1234
  编排: Agent Skill / 对话工作流 / 插件工作流 / RPA / 双向 MCP
  知识库: 混合检索+重排 / chunk 编辑 / 8 格式 + URL
  插件: 系统工具热更新（RAG/Agent-loop 未完成）
  运营: 免登录分享 / iframe / 标注 / 运营日志

projects/app/package.json
  name: @fastgpt/app
  version: 4.17.0
  engines: node>=22.23.2, pnpm 10.x
  workspaces: dal/global/next/service/web + fastgpt-sdk/{otel,sandbox-adapter,storage}
  reactflow ^11.7.4, dagre ^1.1.4
  @modelcontextprotocol/sdk
  mongoose, minio
  esbuild ^0.25.11
  @xterm/xterm
  p-limit ^7.2.0
  jsondiffpatch ^0.7.6
  @t3-oss/env-core
  @llamaindex/liteparse-wasm
  @node-rs/jieba
  ip2region.js ^3.1.6
  katex 0.16.22, echarts 5.4.1
  scripts: build:workers, dev, build, test, typecheck, lint
```

**未本轮打开**: `projects/app/src/` 节点/引擎。不发明路径。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | Flow 节点 + MCP |
| 权限/安全边界 | 3 | 有，但默认弱密码 |
| 容错与会话恢复 | 3 | 调用链日志完整 |
| 上下文工程 | 4 | RAG 多库 + chunk 编辑 |
| 可扩展（技能/MCP） | 5 | 双向 MCP + 插件热更新 |
| 可观测与可评测 | 4 | OTel + 调用链 + 评测 |
| 生产可用成熟度 | 4 | Docker/Sealos/云三形态 |

**综合**: **可视化 Flow + 双向 MCP + 知识库运营平台**。openmate 抄 Flow 编排、双向 MCP、chunk 编辑、热更新与 env 校验。

---

## 12. 附录 A — openmate Flow 节点最小集（P0）

基于 FastGPT README 能力清单推导的最小节点集:

| 节点类型 | 职责 | FastGPT 对应 |
|----------|------|--------------|
| LLM | 模型调用 | 对话工作流 |
| KnowledgeSearch | 知识库检索 | 混合检索+重排 |
| HTTP | 外部 API | 插件/RPA |
| MCPClient | 调 MCP server | 双向 MCP |
| MCPServer | 暴露工具 | 双向 MCP |
| Code | 沙箱代码 | sandbox-adapter |
| IF/ELSE | 分支 | Flow |
| Iteration | 循环 | Flow |
| UserInput | 用户交互 | 用户交互 |
| Output | 汇总输出 | 对话工作流 |

---

## 13. 附录 B — 部署矩阵

| 方式 | 命令/入口 | 适用 |
|------|-----------|------|
| 一键脚本 | install.sh + compose | 社区默认 |
| Sealos | doc.fastgpt.io/self-host/deploy/sealos | 云原生 |
| 商业版 | doc.fastgpt.io/guide/version/commercial | 企业 |
| 本地开发 | doc.fastgpt.io/self-host/dev | 贡献者 |
| Docker 镜像 | docker compose | 自托管 |

---

## 14. 附录 C — 未完成项跟踪（openmate 勿抄半成品）

| 项 | 状态 | openmate 策略 |
|----|------|---------------|
| 辅助生成工作流 | 未完成 | 不依赖 |
| 高级 DeBug 模式 | 未完成 | 自建 |
| 应用节点日志 | 未完成 | 自建（调用链已有） |
| RAG 模块热更新 | 未完成 | 仅抄系统工具热更新 |
| Agent-loop 热更新 | 未完成 | 同上 |
| AI 实时生成插件 | 未完成 | P2 |

---

## 15. 抓取核对

| 项 | 值 | 文件 |
|----|-----|------|
| 版本 | 4.17.0 | projects/app/package.json |
| Node | >=22.23.2 | engines |
| pnpm | 10.x | engines |
| 端口/账号 | 3000 / root/1234 | README |
| MCP | 双向 | README checklist |
| 热更新 | 系统工具 | README checklist |
| License | 禁 SaaS | README |

均可回溯本轮 jsDelivr 抓取。

---

## 16. 关键链接

- https://github.com/labring/FastGPT
- https://doc.fastgpt.io/
- https://github.com/labring/fastgpt-plugin
- https://github.com/labring/aiproxy
- 相关: `reports/dify.md`、`reports/flowise.md`、`reports/langflow.md`、`reports/mcp.md`

---

## 17. 附录 D — Monorepo 分层 openmate 参照

```
@fastgpt/dal      → 数据访问
@fastgpt/global   → 共享类型/常量
@fastgpt/service  → 业务服务
@fastgpt/web      → Web 组件
@fastgpt/next     → 框架封装
@fastgpt/app      → 应用入口
@fastgpt-sdk/*    → otel / sandbox-adapter / storage
```

openmate:
```
packages/core / dal / service / web / app
packages/sdk-otel / sdk-sandbox / sdk-storage
```

规则: app 不直接碰 dal；sdk 独立版本。

---

## 18. 附录 E — Workers 预构建

```
build:workers → esbuild 打包 sandbox/插件 worker
dev/build     → 先 workers 再 next
```

openmate: 重资源/沙箱 worker 预构建；watch 模式开发。

---

## 19. 附录 F — License 红线

FastGPT Open Source License:
1. 允许后台服务直接商用
2. **不允许提供 SaaS 服务**
3. 商用需保留版权信息

openmate: 使用其模式可；勿直接拿其代码做 SaaS。

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | Flow + MCP |
| 权限安全 | 3 | 默认弱密码 |
| 容错恢复 | 3 | 调用链日志 |
| 上下文 | 4 | RAG + chunk 编辑 |
| 可扩展 | 5 | 双向 MCP + 热更新 |
| 可观测 | 4 | OTel + 链路 |
| 成熟度 | 4 | 三形态部署 |

**净推荐**: openmate 抄 **Flow + 双向 MCP + chunk 编辑 + 热更新 + env 校验** 为平台 P0。
