# AntonOsika/gpt-engineer — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/AntonOsika/gpt-engineer（badge 指向 gpt-engineer-org/gpt-engineer）  
> 抓取通道: cdn.jsdelivr.net/gh/AntonOsika/gpt-engineer@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供自然语言→代码生成 / preprompts / vision 输入 / bench 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（安装、preprompts、vision、bench、治理）
- 未打开: `gpt_engineer/` 源码树、preprompts 具体内容（需 clone）
- README 明确: **aider 是更维护的 hackable CLI**；gptengineer.app 是商业托管版
- Python 支持: 3.10–3.12；0.2.6 是最后支持 3.8–3.9 的版本

---

## 1. 项目定位（README 实读）

> "The OG code generation experimentation platform!"

gpt-engineer 让你：
1. 用自然语言 specify 软件
2. 看 AI 写并执行代码
3. 让 AI 实现改进

**使命**: 维护 coding agent builder 可用的工具，促进开源协作。由长期贡献者 board 治理（GOVERNANCE.md）。

### 1.1 与其他产品关系

| 产品 | 关系 |
|------|------|
| gptengineer.app | 商业、opinionated、managed service；团队仍支持开源 |
| aider | 更维护的 hackable CLI 替代 |
| gpt-engineer (本仓) | 实验平台 + bench 工具 |

---

## 2. 安装与运行（README 实读）

### 2.1 安装

```bash
# stable
python -m pip install gpt-engineer

# development
git clone https://github.com/gpt-engineer-org/gpt-engineer.git
cd gpt-engineer
poetry install
poetry shell
```

Python: **3.10 - 3.12**（0.2.6 最后支持 3.8-3.9）

### 2.2 API Key

```bash
export OPENAI_API_KEY=[your api key]
# or .env from .env.template
```

支持: OpenAI API、Azure OpenAI、Anthropic、本地模型（WizardCoder 等，见 docs/open_models.html）

### 2.3 创建新代码（默认用法）

```bash
# 1. 创建空文件夹
# 2. 在文件夹内创建无扩展名文件 `prompt`，写入指令
gpte <project_dir>
# 例: gpte projects/my-new-project
```

### 2.4 改进现有代码

```bash
gpte <project_dir> -i
# 例: gpte projects/my-old-project -i
```

### 2.5 其他运行方式

- Docker: `docker/README.md`
- GitHub Codespaces: browser 内
- Windows: `WINDOWS_README.md`

---

## 3. 核心特性（README 实读）

### 3.1 Pre Prompts（身份定制）

```bash
gpte <project_dir> --use-custom-preprompts
```

- 覆盖 `preprompts` 文件夹定义 AI agent "identity"
- **编辑 preprompts 是让 agent 跨项目记住事情的方式**
- 对 openmate: skill pack / system prompt 覆盖机制同构

### 3.2 Vision 输入

```bash
gpte projects/example-vision gpt-4-vision-preview \
  --prompt_file prompt/text \
  --image_directory prompt/images \
  -i
```

- 默认文本 `prompt` 文件
- 可接受 image 目录（vision-capable model）
- 用途: UX 图、架构图作为额外上下文

### 3.3 Bench（`bench` 二进制）

gpt-engineer 安装 `bench` binary，用于 benchmark 自定义 agent：

当前支持:
- **APPS** (hendrycks/apps)
- **MBPP** (google-research/google-research/mbpp)

模板仓: https://github.com/gpt-engineer-org/gpte-bench-template

---

## 4. 架构模式（基于 README + 公开结构）

### 4.1 典型流程

```
用户 prompt 文件
  → gpte CLI
  → LLM（OpenAI/Azure/Anthropic/local）
  → 生成文件树
  → 写入 project_dir
  → (-i) 基于现有代码改进
```

### 4.2 Prompt 工程入口

| 入口 | 作用 |
|------|------|
| `prompt` 文件 | 任务指令 |
| `preprompts/` | Agent 身份 / 跨项目记忆 |
| `--image_directory` | 视觉上下文 |
| `-i` | 改进模式（读现有代码） |

### 4.3 与 openmate 映射

| 需求 | gpt-engineer 机制 | 可复用度 |
|------|------------------|----------|
| 自然语言→代码 | prompt 文件 + CLI | 高 |
| Agent 身份覆盖 | preprompts 目录 | **高** |
| 跨项目记忆 | 编辑 preprompts | 高 |
| Vision 上下文 | --image_directory | 中 |
| 改进模式 | -i 读现有代码 | 高 |
| 可 hack CLI | 开源实验平台 | 高 |
| Bench 自定义 agent | bench + APPS/MBPP | **高** |
| 多 provider | OpenAI/Azure/Anthropic/local | 高 |
| Docker 运行 | docker/ | 中 |

---

## 5. 失败路径 / 边界（README + 治理推断）

```
Python 3.8/3.9
  → 仅 gpt-engineer<=0.2.6 支持

Windows
  → 需 WINDOWS_README 指引

本地模型
  → 需额外 setup（docs/open_models.html）

商业 vs 开源分叉
  → gptengineer.app 与本仓演进不同

维护状态
  → README 明确推荐 aider 做 production CLI
  → 本仓定位 experimentation platform

API key 缺失
  → export OPENAI_API_KEY 或 .env

Terms of Use
  → 运行即同意 TERMS_OF_USE.md
```

---

## 6. 治理与社区（README 实读）

- Board 治理: 长期贡献者（GOVERNANCE.md）
- 常规贡献者可进 board
- Discord: https://discord.gg/8tcDQ89Ej2
- Roadmap: ROADMAP.md
- Research briefs: Google Doc 链接

显著贡献者: @ATheorell、@similato87、@TheoMcCabe、@captivus

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.10–3.12 | README |
| 最后支持 3.8-3.9 | 0.2.6 | README |
| 默认模型接入 | OpenAI / Azure / Anthropic | README |
| 本地模型 | 需额外 setup | README |
| Vision | 需 vision-capable model | README |
| Bench 数据集 | APPS, MBPP | README |
| CLI | `gpte` | README |
| Bench 二进制 | `bench` | README |
| 包管理 | poetry (dev) / pip (stable) | README |
| License | 见 LICENSE（badge） | README |

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **preprompts 身份目录**: 用户可覆盖 agent system prompt / 跨项目记忆
2. **prompt 文件约定**: 项目目录内无扩展名 `prompt` 文件作为任务入口
3. **`-i` 改进模式**: 显式区分 create vs improve
4. **bench 二进制 + 模板仓**: 自定义 agent 对 APPS/MBPP 可复现评测
5. **多 provider**: OpenAI / Azure / Anthropic / local 统一入口
6. **项目目录隔离**: 每个 project 一个 folder，输出写回该 folder

### P1 — 应抄

- `--image_directory` 视觉上下文（架构图/UX 图）
- `.env.template` 约定
- Docker + Codespaces 双路径

### P2 — 可选

- 与商业托管版关系澄清（开源实验 vs 托管产品）
- Board 治理模型

---

## 9. 应避免的坑

- 勿把实验平台当 production coding CLI（README 自己推荐 aider）
- Windows 需单独文档路径
- 本地模型非开箱即用
- Python 版本硬约束 3.10+
- 勿发明 preprompts 内部文件名（本轮未打开源码）

---

## 10. 源码锚点速查

```
README.md
  Install: pip install gpt-engineer | poetry install
  CLI: gpte <project_dir> [-i] [--use-custom-preprompts]
       [--image_directory DIR] [--prompt_file FILE]
  prompt file: <project>/prompt (no extension)
  preprompts/: identity / cross-project memory
  bench: APPS, MBPP
  template: gpt-engineer-org/gpte-bench-template
  models: OpenAI, Azure, Anthropic, local (docs/open_models.html)
  Python: 3.10-3.12 (0.2.6 last for 3.8-3.9)
  Governance: GOVERNANCE.md board
  Terms: TERMS_OF_USE.md
  Windows: WINDOWS_README.md
  Docker: docker/README.md
  Related: gptengineer.app (commercial), aider (CLI alternative)
```

**未本轮打开**: `gpt_engineer/` 实现、preprompts 内容。不发明路径。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 2 | 非工具型；文件生成为主 |
| 权限/安全边界 | 2 | 无 RBAC |
| 容错与会话恢复 | 2 | 无 checkpoint 叙事 |
| 上下文工程 | 3 | preprompts + vision + -i |
| 可扩展（技能/MCP） | 3 | preprompts 可覆盖 |
| 可观测与可评测 | 4 | bench + APPS/MBPP |
| 生产可用成熟度 | 2 | 实验平台定位 |

**综合**: **OG 代码生成实验平台 + preprompts 身份机制 + bench 评测**。openmate 抄 preprompts、prompt 文件约定与 bench 模式，不抄其生产定位。

---

## 12. 关键链接

- https://github.com/AntonOsika/gpt-engineer
- https://gpt-engineer.readthedocs.io/
- https://github.com/gpt-engineer-org/gpte-bench-template
- 相关: `reports/smol-developer-l1.md`、`reports/gpt-pilot-l1.md`、`reports/aider.md`

---

## 13. 附录 A — openmate P0 实施清单（可直接开 issue）

### A1. preprompts 身份目录

```
openmate/
  skills/
    default-preprompts/
      identity.txt
      code-style.txt
      security.txt
    user-override/          # 用户覆盖，优先于 default
```

- CLI: `--use-custom-preprompts` 切换到 user-override
- 跨项目记忆: 用户编辑 identity 文件，不靠对话历史
- 校验: 启动时检查 override 目录非空才启用

### A2. prompt 文件约定

```
<project>/
  prompt          # 无扩展名，任务指令
  prompt/images/  # 可选视觉上下文
```

- create 模式: 空目录 + prompt
- improve 模式 (`-i`): 读现有代码 + prompt
- 冲突: prompt 不存在则报错并提示模板

### A3. bench 集成

```
openmate bench --dataset apps|mbpp --agent <name>
openmate bench --template gpte-bench-template
```

- 输出: pass@1 / pass@5 / 成本 / token
- 对照: 内置 baseline agent 分数
- CI: bench 失败可阻断合并

### A4. 多 Provider 统一入口

```
OPENAI_API_KEY
AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT
ANTHROPIC_API_KEY
LOCAL_MODEL_URL (OpenAI-compatible)
```

- 优先级: flag > env > .env > default
- 失败: 缺 key 启动即报错（fail-loud）

### A5. 项目目录隔离

- 每 project 独立 folder
- 输出写回该 folder，不污染 cwd
- `.openmate/` 存 run 元数据（gitignore）

---

## 14. 附录 B — 失败路径明细

```
Python 3.8 / 3.9
  → 仅 gpt-engineer<=0.2.6
  → openmate 设 python_requires>=3.10

prompt 文件缺失
  → CLI 拒绝并打印模板示例

preprompts 目录空
  → 回落内置默认，日志 WARN

--image_directory 非 vision 模型
  → 忽略图片，日志 WARN

-i 模式无现有代码
  → 当 create 处理，日志 INFO

bench 数据集未下载
  → 提示下载 URL，退出码 2

Windows 路径
  → 使用 WINDOWS_README；openmate 测 CI 矩阵含 windows-latest

Terms of Use
  → 首次运行需 --accept-terms 或交互确认
```

---

## 15. 附录 C — 与同谱系对照（源码旁证）

| 维度 | gpt-engineer | gpt-pilot | smol-developer |
|------|--------------|-----------|----------------|
| live 源本轮 | ✅ README | ✅ README | ❌ 404 |
| 生成方式 | 一次性 + -i 改进 | 逐步多角色 | 旁证: 一次性 |
| 身份定制 | preprompts | 角色 prompt | 未知 |
| 上下文 | 全量 + vision | 过滤器 | 未知 |
| 评测 | bench APPS/MBPP | 无内置 | 未知 |
| 维护 | 实验平台；荐 aider | **不维护** + 供应链事故 | 未知 |
| openmate 优先级 | **P0 抄 preprompts+bench** | P0 抄角色链；**勿依赖仓** | 待可达 |

---

## 16. 附录 D — 评分理由展开

| 维度 | 分 | 理由（README 实读） |
|------|-----|---------------------|
| 工具调用策略 | 2 | 无工具调用循环；文件写入为主 |
| 权限/安全 | 2 | TERMS_OF_USE 存在但无 RBAC/沙箱叙事 |
| 容错恢复 | 2 | 无 checkpoint；失败需重跑 |
| 上下文工程 | 3 | preprompts 跨项目 + vision + -i 读现有码 |
| 可扩展 | 3 | preprompts 目录可覆盖；无 MCP |
| 可观测评测 | 4 | bench + APPS/MBPP + 模板仓 |
| 生产成熟度 | 2 | README 自荐 aider 做 CLI |

**净推荐**: openmate 采用 **preprompts + prompt 文件 + bench** 三件套；生产 CLI 形态对齐 aider 而非本仓。

---

## 17. 版本与许可核对清单

| 项 | 值 | 核对状态 |
|----|-----|----------|
| Python 支持 | 3.10–3.12 | README 实读 |
| 最后 3.8-3.9 | 0.2.6 | README 实读 |
| 安装 | pip / poetry | README 实读 |
| CLI 名 | gpte | README 实读 |
| Bench 名 | bench | README 实读 |
| 数据集 | APPS, MBPP | README 实读 |
| 商业版 | gptengineer.app | README 实读 |
| 替代 CLI | aider | README 实读 |
| 治理 | GOVERNANCE.md board | README 实读 |
| Terms | TERMS_OF_USE.md | README 实读 |
| 本轮源码 | 仅 README | 诚实性说明 |

以上条目均可回溯到 `cdn.jsdelivr.net/gh/AntonOsika/gpt-engineer@main/README.md` 本轮抓取内容。

---

## 18. 最终结论

openmate 从 gpt-engineer 抄三件套:

1. **preprompts 身份目录** — 跨项目记忆，用户可覆盖
2. **prompt 文件约定** — 项目内无扩展名入口 + `-i` 改进模式
3. **bench 二进制 + APPS/MBPP** — 自定义 agent 可复现评测

生产 coding CLI 形态对齐 **aider**（README 自荐），不把本仓当 production。

失败路径已覆盖: Python 版本、Windows、本地模型、preprompts 空目录、bench 数据缺失、Terms 确认。

相关报告: `smol-developer-l1.md`（404 教训）、`gpt-pilot-l1.md`（角色链+安全）、`aider.md`（生产 CLI）。
