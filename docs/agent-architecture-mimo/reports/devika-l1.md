# stitionai/devika — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/stitionai/devika  
> 抓取通道: cdn.jsdelivr.net/gh/stitionai/devika@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 agentic 软件工程师形态 / 多模型 / 浏览器研究 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（定位、特性、安装、配置、架构链接）
- 未打开: `docs/architecture` 详细文档、`devika.py` 实现
- **项目状态（README 顶部）**: 转向 **[Opcode](https://opcode.sh/)**（第二代）；本仓早期实验阶段，大量未实现/损坏特性
- License: MIT

---

## 1. 项目定位（README 实读）

> "Advanced AI software engineer that can understand high-level human instructions, break them down into steps, research relevant information, and write code"

- 模仿 **Devin**（Cognition AI）的开源替代
- 目标: SWE-bench 对齐 Devin 分数…并超越
- 当前: **very early development/experimental**；unimplemented/broken features 多

### 1.1 后继

README 顶部: **Checkout Opcode, the second iteration of Devika. New version out soon!**

---

## 2. 关键特性（README 实读）

| 特性 | 说明 |
|------|------|
| 多模型 | **Claude 3**, GPT-4, Gemini, Mistral, Groq, 本地 via **Ollama** |
| 最优推荐 | **Claude 3 family** |
| 规划与推理 | Advanced AI planning and reasoning |
| 关键词提取 | Contextual keyword extraction for focused research |
| 网页浏览 | Seamless web browsing and information gathering |
| 多语言代码 | Code writing in multiple programming languages |
| 状态可视化 | Dynamic agent state tracking and visualization |
| 自然语言交互 | Chat interface |
| 项目管理 | Project-based organization |
| 可扩展 | Extensible architecture |

---

## 3. 系统要求与安装（README 实读）

### 3.1 要求

```
Python >= 3.10 and < 3.12
NodeJs >= 18
bun
```

另需:
- [uv](https://github.com/astral-sh/uv) Python 包管理
- [bun](https://bun.sh/docs/installation) JS runtime
- Playwright browsers（爬取能力）

### 3.2 安装步骤（真实命令）

```bash
git clone https://github.com/stitionai/devika.git
cd devika
uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
playwright install --with-deps
python devika.py            # → "Devika is up and running!"
```

前端:
```bash
cd ui/
bun install
bun run start
# http://127.0.0.1:3001
```

### 3.3 Ollama（可选）

文档: `docs/Installation/ollama.md`；不用本地模型可跳过。

---

## 4. 使用流程（README 实读）

1. 打开 `http://127.0.0.1:3001`
2. select project → new project
3. 选搜索引擎 + 模型配置
4. Chat 中给 high-level objective
5. Devika 拆步骤并开始工作
6. 监控进度、查看生成代码、给反馈
7. 完成后 review 代码与项目文件
8. 迭代 refine

---

## 5. 配置（README 实读）

首次运行创建根目录 **`config.toml`**。UI settings 页可改。

### 5.1 API KEYS

| Key | 用途 |
|-----|------|
| BING | Bing Search |
| GOOGLE_SEARCH | Google Search |
| GOOGLE_SEARCH_ENGINE_ID | Google CSE |
| OPENAI | GPT |
| GEMINI | Gemini |
| CLAUDE | Anthropic |
| MISTRAL | Mistral |
| GROQ | Groq |
| NETLIFY | 部署/管理 web 项目 |

### 5.2 API_ENDPOINTS

| Endpoint | 用途 |
|----------|------|
| BING | Bing 搜索 |
| GOOGLE | Google 搜索 |
| OLLAMA | 本地 LLM |
| OPENAI | OpenAI |

搜索 key 设置见 `docs/Installation/search_engine.md`。

---

## 6. 架构文档（README 链接）

详细文档: `docs/architecture/README.md`（本轮未打开）。

从 README 特性可推断的高层流程 [推断]:
```
用户目标
  → 规划/拆步
  → 关键词提取
  → 网页浏览研究
  → 多语言写码
  → 状态跟踪/可视化
  → chat 反馈迭代
```

---

## 7. 与 openmate 映射

| 需求 | Devika 机制 | 可复现度 |
|------|------------|----------|
| Agentic SWE 定位 | 理解→拆步→研究→写码 | **高** |
| 多模型 + Ollama | 6 provider | **高** |
| Claude 3 推荐 | 最优性能 | 高 |
| 关键词提取研究 | contextual keywords | **高** |
| Playwright 浏览 | playwright install --with-deps | **高** |
| 项目隔离 | project-based | 高 |
| 状态可视化 | dynamic agent state | **高** |
| config.toml 集中 | UI settings | 高 |
| 后端 Python + 前端 bun | 分离 | 高 |
| uv 包管理 | uv venv / uv pip | 高 |
| Python 3.10–3.11 硬区间 | <3.12 | 高 |
| 后继产品 Opcode | 二迭代独立 | 中 |
| 实验阶段诚实声明 | README IMPORTANT | **高** |

---

## 8. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | >=3.10 <3.12 | README |
| Node | >=18 | README |
| JS runtime | bun | README |
| 前端端口 | 127.0.0.1:3001 | README |
| 配置文件 | config.toml | README |
| LLM | Claude 3, GPT-4, Gemini, Mistral, Groq, Ollama | README |
| 推荐模型 | Claude 3 family | README |
| 搜索 | Bing, Google CSE | README |
| 部署 | Netlify key | README |
| 包管理 | uv | README |
| 浏览器 | playwright --with-deps | README |
| License | MIT | README |
| 状态 | early/experimental；转向 Opcode | README |

---

## 9. 失败路径 / 边界（README 实读 + 推断）

```
Python >= 3.12
  → 不支持（硬上界）

未装 bun
  → ui/ 无法启动

未 playwright install
  → 浏览/研究能力缺失

搜索 key 未配
  → Bing/Google 研究失败

Ollama 未起
  → 本地模型失败

config.toml 未生成
  → 首次运行应自动创建

大量特性未实现/损坏
  → README IMPORTANT 明确

后继 Opcode
  → 本仓可能停滞

端口 3001 占用
  → 前端失败

Windows
  → .venv\Scripts\activate
```

---

## 10. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **Agentic SWE 四段式**: 理解 → 拆步 → 研究 → 写码
2. **多 provider 统一配置**（含 Ollama）+ 明确最优推荐
3. **上下文关键词提取**驱动聚焦研究
4. **Playwright 作为研究工具**（非仅自动化）
5. **项目级隔离**（new project）
6. **动态状态跟踪可视化**
7. **config.toml 集中 + UI settings 编辑**
8. **Python 3.10–3.11 硬区间**写清上界
9. **后端 Python / 前端 bun 分离**
10. **实验阶段诚实声明 + 后继产品指路**（Opcode）

### P1

- uv 包管理
- Netlify 部署 key
- Google CSE 双 key（SEARCH + ENGINE_ID）

### P2

- SWE-bench 目标设定
- 多语言代码生成

---

## 11. 应避免的坑

- 勿把 early/experimental 当生产
- Python 必须 <3.12
- bun 与 Node 职责勿混
- 搜索需 Bing 或 Google CSE 双配置
- 新开发考虑 Opcode 而非本仓
- 勿发明 docs/architecture 内部路径

---

## 12. 源码锚点速查

```
README.md
  Status: experimental; successor Opcode (opcode.sh)
  Python >=3.10 <3.12; Node >=18; bun
  Install: uv venv; uv pip install -r requirements.txt
           playwright install --with-deps
  Backend: python devika.py
  Frontend: cd ui/; bun install; bun run start → 127.0.0.1:3001
  Config: config.toml (auto-created); UI settings
  Keys: BING, GOOGLE_SEARCH, GOOGLE_SEARCH_ENGINE_ID,
        OPENAI, GEMINI, CLAUDE, MISTRAL, GROQ, NETLIFY
  Endpoints: BING, GOOGLE, OLLAMA, OPENAI
  Models: Claude 3 (recommended), GPT-4, Gemini, Mistral, Groq, Ollama
  Features: planning, keyword extract, browsing, multi-lang code,
            state viz, chat, projects
  Architecture doc: docs/architecture/README.md
  Ollama doc: docs/Installation/ollama.md
  Search doc: docs/Installation/search_engine.md
  License: MIT
  Modeled after Devin; SWE-bench goal
```

**未本轮打开**: `docs/architecture/`、`devika.py` 实现。

---

## 13. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 研究+写码，细节在架构文档 |
| 权限/安全边界 | 2 | 本地实验 |
| 容错与会话恢复 | 2 | 无 checkpoint 叙事 |
| 上下文工程 | 3 | 关键词提取聚焦 |
| 可扩展（技能/MCP） | 3 | 声称 extensible |
| 可观测与可评测 | 3 | 状态可视化 |
| 生产可用成熟度 | 2 | early/experimental；转向 Opcode |

**综合**: **Devin 开源仿制品的 agentic SWE 形态参考**。openmate 抄四段式、多 provider 配置与关键词研究；生产向看 Opcode 或自建。

---

## 14. 关键链接

- https://github.com/stitionai/devika
- https://opcode.sh/
- https://www.swebench.com/
- 相关: `reports/swe-agent-l1.md`、`reports/gpt-pilot-l1.md`、`reports/openhands.md`

---

## 15. 附录 A — config.toml openmate 对照（P0）

Devika README 实读字段:

```toml
[api_keys]
BING = ""
GOOGLE_SEARCH = ""
GOOGLE_SEARCH_ENGINE_ID = ""
OPENAI = ""
GEMINI = ""
CLAUDE = ""
MISTRAL = ""
GROQ = ""
NETLIFY = ""

[api_endpoints]
BING = ""
GOOGLE = ""
OLLAMA = ""
OPENAI = ""
```

openmate 建议扩展:

```toml
[llm]
provider = "claude"   # claude|openai|gemini|mistral|groq|ollama
model = "claude-3-..."

[research]
search_engine = "bing"
max_keywords = 10
max_pages = 15

[sandbox]
enabled = true
```

UI settings 只读写该文件；启动校验必填项 fail-loud。

---

## 16. 附录 B — Agentic SWE 四段式任务图

```
[理解] 用户 high-level objective
   ↓
[拆步] planning → step list（可 HITL 确认）
   ↓
[研究] keyword extract → browse → 摘要入库
   ↓
[写码] multi-lang codegen → 项目文件
   ↓
[反馈] chat 迭代 → 回到拆步或写码
```

对照: Devika 更「研究驱动」；gpt-pilot 更「角色流水线」。openmate 可组合: 研究段用 Devika 形态，写码段用 Pilot 角色链。

---

## 17. 附录 C — 失败路径明细

```
Python >= 3.12
  → 硬上界拒绝
  → openmate: requires-python = ">=3.10,<3.12" 或放宽并测

bun 未装
  → ui/ bun run start 失败
  → openmate: 启动前 which bun 检查

playwright 未装 browsers
  → 研究/浏览失败
  → openmate: install 后 playwright install chromium

搜索 key 缺失
  → Bing/Google 研究降级或失败
  → openmate: 无 key 时禁用研究段并 WARN

Ollama 未起
  → 本地模型超时
  → openmate: 健康检查 /v1/tags

端口 3001 占用
  → 前端失败
  → openmate: 端口可配 + 冲突检测

特性未实现
  → README IMPORTANT
  → openmate: 功能开关 + 集成测试

转向 Opcode
  → 本仓可能停滞
  → openmate: 勿硬依赖；抽象研究/写码接口
```

---

## 18. 附录 D — 多 Provider 健康检查表

| Provider | 检查 | 超时建议 |
|----------|------|----------|
| OPENAI | GET /v1/models | 3s |
| CLAUDE | 最小 messages | 3s |
| GEMINI | 最小 generate | 3s |
| MISTRAL | 最小 chat | 3s |
| GROQ | 最小 chat | 3s |
| OLLAMA | GET /v1/tags | 2s |
| BING | 搜索 ping | 3s |
| GOOGLE | CSE ping | 3s |
| NETLIFY | 可选 | 5s |

启动并行探测；失败项禁用对应能力而非崩溃。

---

## 19. 附录 E — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| Python | >=3.10 <3.12 | README |
| Node | >=18 | README |
| bun | 必需 | README |
| 前端端口 | 127.0.0.1:3001 | README |
| 配置 | config.toml | README |
| Keys | 9 个 | README |
| Endpoints | 4 个 | README |
| 推荐模型 | Claude 3 family | README |
| 状态 | experimental → Opcode | README |
| License | MIT | README |

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 3 | 研究+写码；细节在架构文档 |
| 权限安全 | 2 | 本地实验 |
| 容错恢复 | 2 | 无 checkpoint 叙事 |
| 上下文 | 3 | 关键词聚焦 |
| 可扩展 | 3 | 声称 extensible |
| 可观测 | 3 | 状态可视化 |
| 成熟度 | 2 | early；转向 Opcode |

**净推荐**: openmate 抄 **四段式 + 多 provider 配置 + 关键词研究**；生产路径参考 Opcode 或自建，勿硬依赖本仓。Python 3.10–3.11 硬区间与 bun 前端为部署约束；config.toml 九 key 四 endpoint 需健康检查；Playwright 浏览器驱动为研究段前置依赖；状态可视化便于 HITL 监控；MIT 许可可自由借鉴架构模式；项目级隔离与 UI settings 编辑配置为良好默认；uv 包管理与 requirements.txt 分离安装路径需同时支持；Claude 3 family 为 README 推荐的最优模型档位。
