# imartinez/privateGPT（现 zylon-ai/private-gpt）— 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/imartinez/privateGPT（README 现指向 zylon-ai/private-gpt）  
> 抓取通道: cdn.jsdelivr.net/gh/imartinez/privateGPT@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供本地 AI API 层 / Claude API 兼容 / 工具与 MCP 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（定位、Claude API 兼容矩阵、集成、对比）
- 未打开: `private_gpt/` 源码实现
- 历史: 2023 起为离线聊天 PoC → 50K+ stars → **1.0 重写为 API 层**
- 维护方: Zylon 团队

---

## 1. 项目定位（README 实读）

> "PrivateGPT is the open-source API layer that turns local models into production AI applications."

```
Your app / agent / workflow / UI
              |
        PrivateGPT API
              |
OpenAI-compatible inference server (Ollama, llama.cpp, vLLM, …)
```

**关键**: PrivateGPT **不跑模型**。通过 `OPENAI_API_BASE` 连任何实现 `/v1/chat/completions` 和 `/v1/models` 的服务。

内置 Workbench UI 在 `/ui`；**API 才是产品**。

### 1.1 能力清单（README 实读）

- Standard messages API（streaming, async, token counting）
- File / artifact ingestion
- Retrieval with citations + agentic RAG
- **内置工具镜像 Claude API**: web search, web fetch, code execution
- Custom tools + MCP connectors
- Structured DB / CSV access
- Embeddings + orchestration

---

## 2. Claude API 兼容矩阵（README 表实读）

| Area | Capability | Claude API | PrivateGPT |
|------|------------|:---:|:---:|
| Models | Model selection | ✅ | ✅ |
| Messages | Messages API | ✅ | ✅ |
| Messages | Streaming | ✅ | ✅ |
| Messages | Batch / async | ✅ | ✅ async |
| Messages | Token counting | ✅ | ✅ |
| Knowledge | Files / artifacts | ✅ | ✅ |
| Knowledge | PDF/doc ingestion | ✅ | ✅ |
| Knowledge | Retrieval with citations | ✅ | ✅ |
| Knowledge | Embeddings | ✅ | ✅ |
| Tools | Tool use | ✅ | ✅ |
| Tools | Tools in streaming | ✅ | ✅ |
| Tools | Built-in web search | ✅ | ✅ |
| Tools | Web extraction / fetch | ✅ | ✅ |
| Tools | Custom tools | ✅ | ✅ |
| Data | Database querying | Via tools | ✅ built-in |
| Data | CSV / tabular | Via tools/code | ✅ built-in |
| Agents | MCP in the API | ✅ | ✅ |
| Agents | Remote MCP servers | ✅ | ✅ |
| Agents | Skills | ✅ | ⚙️ basic |
| Output | Structured outputs | ✅ | ✅ inference-dependent |
| Models | Vision | ✅ | ✅ model-dependent |
| Optimization | **Prompt caching** | ✅ | **❌** |
| Reasoning | Extended thinking | ✅ | ✅ |
| Platform | Token-based auth | ✅ | ✅ |
| Platform | **OAuth / organizations** | ✅ | **❌** |

**缺口**: Prompt caching、OAuth/orgs、Skills 仅 basic。

---

## 3. 安装与启动（README 实读）

### 3.1 macOS

```bash
brew tap zylon-ai/tap
brew install private-gpt
```

### 3.2 Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install --python 3.11 \
  --find-links https://wheels.privategpt.dev/packages/ \
  "private-gpt[core]"
```

### 3.3 Windows

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
uv tool install --python 3.11 `
  --find-links https://wheels.privategpt.dev/packages/ `
  "private-gpt[core]"
```

### 3.4 LLM Server 示例（Ollama）

```bash
ollama pull qwen3.5:35b         # LLM ~24 GB
ollama pull mxbai-embed-large   # Embeddings ~670 MB
ollama serve
```

### 3.5 启动

```bash
OPENAI_API_BASE=http://localhost:<llm-port>/v1 \
OPENAI_EMBEDDING_API_BASE=http://localhost:<embedding-port>/v1 \
private-gpt serve
```

- API: `http://localhost:8080`
- UI: `http://localhost:8080/ui`
- API 规范: **Anthropic API**（非 OpenAI）

### 3.6 UI 能力

发消息、选 /v1/models 模型、上传文档、带引用检索测试、按 chat 启用工具、配置 DB/MCP/skills/custom tools、API Debugger。

---

## 4. 集成生态（README 表实读）

| 集成 | 能力 |
|------|------|
| Claude Code | 本地模型作 terminal agentic coding backend |
| Claude Desktop / Cowork | 桌面连私有模型 |
| Claude for Microsoft 365 | Word/Excel/Outlook/PowerPoint 私有 AI |
| OpenCode | 本地 AI coding assistant |
| n8n | workflow |
| OpenClaw / Hermes Agent / VS Code / Cline | 任何 OpenAI-compatible 工具 |

---

## 5. 架构分层（README 对比节实读）

### 5.1 vs Ollama / LM Studio / LocalAI / vLLM / llama.cpp

```
Ollama / vLLM / llama.cpp  =  local inference layer（怎么跑模型）
PrivateGPT                 =  local AI application API layer（怎么建应用）
```
组合使用。

### 5.2 vs Onyx / Open WebUI

```
Onyx / Open WebUI = self-hosted AI applications（app-first）
PrivateGPT        = API layer for building such apps（API-first）
```

### 5.3 PrivateGPT vs Zylon（商业）

| PrivateGPT (OSS) | Zylon (商业) |
|------------------|--------------|
| messages/ingestion/tools/retrieval/citations/DB/tabular/MCP/skills/custom tools | + NVIDIA Triton+vLLM 推理 |
| | + 并发/批处理/负载均衡 |
| | + K8s 20+ 服务 |
| | + 安装/更新 CLI |
| | + API gateway / 治理 |
| | + Workspace 应用 |
| | + LDAP/AD + RBAC |
| | + 遥测/可观测 |
| | + SIEM 审计日志 |
| | + SharePoint/Confluence/FTP/Samba |
| | + air-gapped 运行 |
| | + 内置 n8n CE |

---

## 6. 与 openmate 映射

| 需求 | PrivateGPT 机制 | 可复用度 |
|------|----------------|----------|
| API-first 本地 AI 层 | Anthropic API 兼容 | **高** |
| 不跑模型只连 inference | OPENAI_API_BASE | **高** |
| 内置工具镜像 Claude | web search/fetch/code exec | **高** |
| MCP 连接器 | API 内 MCP | **高** |
| 带引用检索 | citations | **高** |
| 自定义工具 | custom tools | 高 |
| DB/CSV 结构化访问 | built-in | 高 |
| Workbench UI | /ui 演示层 | 中 |
| Token auth | 有 | 高 |
| Prompt caching | **无** | 缺口 |
| OAuth/orgs | **无** | 缺口 |
| Skills | basic | 部分 |

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| API 端口 | 8080 | README |
| UI 路径 | /ui | README |
| API 规范 | Anthropic / Claude API | README |
| Python | 3.11（uv tool install） | README |
| LLM server | 任意 OpenAI-compatible | README |
| 必须端点 | /v1/chat/completions, /v1/models | README |
| Embedding | OPENAI_EMBEDDING_API_BASE | README |
| Prompt caching | ❌ | 兼容矩阵 |
| OAuth/orgs | ❌ | 兼容矩阵 |
| Skills | ⚙️ basic | 兼容矩阵 |
| 示例 LLM | qwen3.5:35b (~24GB) | README |
| 示例 Embedding | mxbai-embed-large (~670MB) | README |

---

## 8. 失败路径 / 边界

```
无 OpenAI-compatible server
  → PrivateGPT 不跑模型，必须外部提供

端点不实现 /v1/chat/completions 或 /v1/models
  → 不工作

Prompt caching
  → 未支持（成本优化缺口）

OAuth / organizations
  → 仅 token auth

Skills
  → 仅 basic

Structured outputs
  → inference-dependent（模型能力决定）

Vision
  → model-dependent

Windows
  → PowerShell 安装脚本

Wheels 源
  → --find-links https://wheels.privategpt.dev/packages/
```

---

## 9. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **API-first 分层**: 应用层不跑模型，只连 OpenAI-compatible inference
2. **镜像成熟 API 规范**（Claude API）而非自创
3. **兼容矩阵公开**: ✅/⚙️/❌ 诚实标注
4. **内置工具三件套**: web search / web fetch / code execution
5. **API 内 MCP + custom tools**
6. **带引用检索**作为一等能力
7. **Workbench UI 与 API 分离**（UI 是演示不是产品）
8. **Token counting 作为标准 messages 能力**
9. **DB/CSV 结构化访问 built-in**（不只靠 LLM code exec）
10. **安装路径三平台**（brew / uv / powershell）

### P1 — 应抄

- batch/async processing
- extended thinking 支持
- 与 Claude Code / Desktop / Office 集成模式
- 商业版能力清单作 roadmap 对照

### P2 — 可选

- air-gapped 运行
- LDAP/AD + RBAC（企业）
- SIEM 审计

---

## 10. 应避免的坑

- 勿假设 PrivateGPT 能跑模型
- Prompt caching 未实现 → 成本优化需自建
- OAuth/orgs 未实现
- Skills 仅 basic
- Structured outputs 依赖底层模型
- 勿发明 private_gpt/ 内部路径

---

## 11. 源码锚点速查

```
README.md
  Positioning: API layer over OpenAI-compatible inference
  Ports: API 8080, UI /ui
  Spec: Anthropic / Claude API
  Env: OPENAI_API_BASE, OPENAI_EMBEDDING_API_BASE
  Install: brew | uv tool install --python 3.11 private-gpt[core]
  Binary: private-gpt serve
  Tools built-in: web search, web fetch, code execution
  MCP: in-API + remote servers
  Citations: retrieval with citations
  Gaps: prompt caching ❌, OAuth/orgs ❌, skills ⚙️
  vs inference: use together
  vs apps: API-first
  Zylon: enterprise on top (Triton+vLLM, K8s, LDAP, SIEM, n8n)
  History: 2023 PoC → 50K stars → 1.0 API rewrite
  Maintainer: Zylon
```

**未本轮打开**: `private_gpt/` 实现。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | 镜像 Claude tools + MCP |
| 权限/安全边界 | 3 | token auth；无 OAuth |
| 容错与会话恢复 | 3 | async/batch 有 |
| 上下文工程 | 4 | citations + RAG |
| 可扩展（技能/MCP） | 5 | MCP + custom tools |
| 可观测与可评测 | 3 | API Debugger |
| 生产可用成熟度 | 4 | 三平台安装 + Zylon 生产验证 |

**综合**: **本地 AI 的 API-first 标准层**。openmate 抄 API 分层、Claude 兼容矩阵、内置工具三件套与 MCP-in-API。

---

## 13. 关键链接

- https://github.com/imartinez/privateGPT
- https://github.com/zylon-ai/private-gpt
- https://docs.privategpt.dev/
- https://www.zylon.ai/
- 相关: `reports/mcp.md`、`reports/openai-agents.md`、`reports/anything-llm-l1.md`

---

## 14. 附录 A — Claude API 兼容矩阵 openmate 落地（P0）

| 能力 | PrivateGPT | openmate P0 | 实施要点 |
|------|:---:|:---:|----------|
| Messages API | ✅ | ✅ | 对齐 Anthropic 形状 |
| Streaming | ✅ | ✅ | SSE |
| Token counting | ✅ | ✅ | count_tokens 端点 |
| Tool use | ✅ | ✅ | tools + tool_choice |
| Tools in streaming | ✅ | ✅ | 流式 tool call 增量 |
| Built-in web search | ✅ | ✅ | 内置工具 |
| Web fetch | ✅ | ✅ | 内置工具 |
| Code execution | ✅ | ✅ | 沙箱 |
| Custom tools | ✅ | ✅ | 注册表 |
| MCP in API | ✅ | ✅ | client+server |
| Citations | ✅ | ✅ | 检索引用 |
| Structured outputs | ✅* | ✅ | *inference-dependent |
| Prompt caching | ❌ | P1 自建 | PrivateGPT 缺口 |
| OAuth/orgs | ❌ | P1 | 仅 token |
| Skills | ⚙️ | P1 | basic |

openmate: **先做 ✅ 列**；prompt caching 与 OAuth 列入 P1 自研，不阻塞 MVP。

---

## 15. 附录 B — 内置工具三件套契约

### B1. web_search

```
input: { query, max_results? }
output: { results: [{title, url, snippet}] }
```

### B2. web_fetch

```
input: { url, max_length? }
output: { title, url, markdown, truncated }
```

### B3. code_execution

```
input: { language, code, timeout_ms? }
output: { stdout, stderr, exit_code, duration_ms }
```

失败路径:
- 搜索无结果 → 空数组 + warning
- fetch 超时/4xx/5xx → 结构化 error
- code 超时 → kill + timeout error
- code 逃逸 → 沙箱拒绝

---

## 16. 附录 C — 分层架构 openmate 参照

```
openmate app / agent / UI
        ↓
openmate API（Anthropic-shaped）
        ↓
OpenAI-compatible inference（Ollama / vLLM / llama.cpp）
```

规则:
1. API 层 **不跑模型**
2. 只要求 `/v1/chat/completions` + `/v1/models`
3. Embedding 单独 `OPENAI_EMBEDDING_API_BASE`
4. UI 是演示，API 是产品

---

## 17. 附录 D — 失败路径明细

```
无 OpenAI-compatible server
  → 启动失败并提示 Ollama 安装

端点缺 /v1/chat/completions 或 /v1/models
  → 健康检查失败

structured outputs 不支持
  → 降级 JSON mode 或文本解析 + 重试

vision 模型缺失
  → 图片工具禁用

prompt caching 未实现
  → 成本上升；P1 自建缓存层

token auth 泄漏
  → 仅本地/内网；生产加网关

Windows 安装
  → PowerShell uv 脚本

wheels 源不可达
  → --find-links 失败；改 PyPI
```

---

## 18. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| API 端口 | 8080 | README |
| UI | /ui | README |
| Spec | Anthropic / Claude API | README |
| 必须端点 | /v1/chat/completions, /v1/models | README |
| Env | OPENAI_API_BASE, OPENAI_EMBEDDING_API_BASE | README |
| Python | 3.11 | uv tool install |
| Prompt caching | ❌ | 兼容矩阵 |
| OAuth/orgs | ❌ | 兼容矩阵 |
| Skills | ⚙️ basic | 兼容矩阵 |
| 示例 LLM | qwen3.5:35b (~24GB) | README |
| 示例 Emb | mxbai-embed-large (~670MB) | README |

---

## 19. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | 镜像 Claude + MCP |
| 权限安全 | 3 | token；无 OAuth |
| 容错恢复 | 3 | async/batch |
| 上下文 | 4 | citations + RAG |
| 可扩展 | 5 | MCP + custom tools |
| 可观测 | 3 | API Debugger |
| 成熟度 | 4 | 三平台 + Zylon |

**净推荐**: openmate 以 **API-first + Claude 兼容矩阵 + 工具三件套 + MCP-in-API** 为本地 AI 层 P0。
