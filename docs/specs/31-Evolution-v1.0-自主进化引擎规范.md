**OpenSoulMate\_Evolution-v1.0\_自主进化引擎规范（定稿冻结）**

**0. 总则**

**0.1 规范目的**

定义 OpenSoulMate 集群**自主进化引擎标准**，统一 SoulMate 自编程、自学习、自更新全套机制。解决智能体无法自主完善、代码变更无安全保障、系统更新需人工介入等问题，构建**可观察、可反思、可规划、可执行、可验证、可回滚**的集群自主进化底座。

本规范基于全球顶级开源项目调研成果（MOSS论文、Aider、SWE-agent、selfpatch、SICA、Reflexion、Constitutional AI、OpenAI自进化手册）以及用户提出的**双螺旋DNA自进化理论**综合设计。

**0.2 适用范围**

* SoulMate 自主技能创建、优化、淘汰
* SoulMate 自主代码变更（skills/plugins/routes目录）
* SoulMate 自主反思与模式学习
* 双螺旋DNA容错进化机制
* 进化引擎与记忆系统、技能系统、事件总线联动
* 进程级热更新与零停机部署

**0.3 层级定位**

* **上层依赖**：SoulMate Agent 对话层、技能系统、记忆系统
* **下层依赖**：LLM推理引擎、Git版本控制、文件系统、进程管理
* **职责边界**：负责智能体自主进化与安全保障，**不修改核心引擎代码、不直接操作模型权重、不绕过安全门控**

**0.4 强制约束（永久冻结）**

1. 进化引擎只能修改白名单目录（skills/、plugins/、routes/），禁止修改核心引擎文件。
2. 所有代码变更必须经过语法检查门控，失败自动回滚。
3. 所有代码变更必须自动Git commit，确保可追溯、可回滚。
4. 双螺旋两条链必须独立运行，任何一条链崩溃不影响另一条。
5. 进化过程必须对用户透明（前端可查看进化状态）。
6. 进化引擎不得绕过安全门控自行决定跳过验证。

**1. 核心数据模型（全局固化）**

**1.1 观察记录模型（Observation）**

```json
{
  "obsId": "obs-xxxx",
  "obsType": "conversation | tool_call | error | user_feedback | skill_usage",
  "content": "观察内容摘要（≤500字符）",
  "metadata": {
    "session_id": "om-xxxx",
    "priority": "high | medium | low",
    "user_text": "用户原始输入",
    "assistant_response": "助手回复摘要",
    "tool_calls": []
  },
  "timestamp": 1788000000123,
  "analyzed": false
}
```

**1.2 进化周期模型（EvolutionCycle）**

```json
{
  "cycleId": "evo-xxxx",
  "strandId": "strand_a | strand_b",
  "stage": "observe | reflect | plan | execute | verify | learn",
  "trigger": "periodic_reflection | periodic_evolution | manual_trigger",
  "observations": [],
  "reflections": [],
  "plan": {
    "improvements": [
      {
        "type": "new_skill | improve_skill | new_plugin | config_change",
        "target_file": "acp-proxy/skills/xxx.json",
        "action": "create | modify | delete",
        "content": "文件内容",
        "commit_message": "描述",
        "reason": "改进原因"
      }
    ]
  },
  "changes": [],
  "verification": {
    "verified": true,
    "changes_applied": 1
  },
  "success": true,
  "started_at": "2026-09-10T12:00:00Z",
  "completed_at": "2026-09-10T12:05:00Z"
}
```

**1.3 心跳模型（Heartbeat）**

```json
{
  "strandId": "strand_a | strand_b",
  "role": "primary | shadow | solo",
  "timestamp": 1788000000.123,
  "cycleCount": 42,
  "observationsCount": 156
}
```

**1.4 共享检查点模型（Checkpoint）**

```json
{
  "strandId": "strand_a",
  "cycleId": "evo-xxxx",
  "changes": [],
  "reflections": ["成功经验摘要"],
  "timestamp": "2026-09-10T12:05:00Z"
}
```

**2. 双螺旋DNA自进化架构（核心设计）**

**2.1 架构总览**

```
┌─────────────────────────────────────────────────────────┐
│                    DNA Evolution Engine                   │
│                                                           │
│  ┌─────────────────┐         ┌─────────────────┐        │
│  │   Strand A      │←─HB──→│   Strand B      │        │
│  │   (Primary)     │         │   (Shadow)      │        │
│  │                 │         │                 │        │
│  │  ┌───────────┐  │         │  ┌───────────┐  │        │
│  │  │ Observer  │  │         │  │ Observer  │  │        │
│  │  │ Reflector │  │         │  │ Reflector │  │        │
│  │  │ Evolver   │  │         │  │ Evolver   │  │        │
│  │  │ Gate      │  │         │  │ Gate      │  │        │
│  │  └───────────┘  │         │  └───────────┘  │        │
│  │                 │         │                 │        │
│  │  state_a.json   │         │  state_b.json   │        │
│  └─────────────────┘         └─────────────────┘        │
│           │                           │                  │
│           └─────────┬─────────────────┘                  │
│                     ▼                                    │
│           ┌─────────────────┐                            │
│           │  Shared Memory  │                            │
│           │  (checkpoint)   │                            │
│           └─────────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

**2.2 双螺旋设计理念**

借鉴DNA双螺旋结构的生物学原理：

| DNA特性 | 进化引擎对应设计 |
|---|---|
| 两条链都能独立承载完整信息 | 每条链都是完整进化引擎，能独立运行 |
| 碱基互补配对 | 交叉验证：A的改进B验证，B的改进A验证 |
| 链断裂修复 | 伙伴挂掉 → 另一条独立运行，完整服务不受影响 |
| 冗余保障 | 任何一条链崩溃，另一条保持系统完整性 |
| 独立变异 | 两条链使用不同进化策略，探索不同改进方向 |
| 复制校验 | 交叉验证防止退化，取最优结果 |

**双螺旋 vs 普通热备**：

| 维度 | 普通热备 | 双螺旋 |
|---|---|---|
| 能力 | A和B做同样的事 | A和B用不同策略做同样的事 |
| 容错 | A挂了B接替 | A挂了B独立运行（本来就完整） |
| 质量保障 | 无交叉验证 | 交叉验证防退化 |
| 探索性 | 单一路径 | 保守+激进双路径探索 |

**2.3 两条链的策略参数**

| 参数 | Strand A（保守策略） | Strand B（激进策略） |
|---|---|---|
| temperature | 0.2 | 0.7 |
| 每次最大改进数 | 1 | 3 |
| 验证标准 | 严格（语法+功能+健康检查） | 宽松（语法+健康检查） |
| 进化风格 | 小步改进，低风险 | 大胆尝试，高探索 |

**2.4 交叉验证机制**

```
Strand A 产生改进 → 提交到验证队列 → Strand B 验证
    ↓
Strand B 检查：
  1. 文件语法正确？
  2. 服务健康？
  3. LLM评估质量分≥5？
    ↓
全部通过 → approved → A的改进生效
任一失败 → rejected → A自动回滚
```

**核心原则**：
- 每条链的改进都需要另一条链验证
- 验证失败自动回滚，防止退化
- 伙伴挂掉时超时视为通过（不阻塞进化）
- 交叉验证结果记录到checkpoint

**2.5 心跳检测机制**

| 参数 | 值 | 说明 |
|---|---|---|
| 心跳间隔 | 5秒 | 每5秒写入心跳文件 |
| 超时判定 | 15秒 | 连续3次心跳丢失宣告死亡 |
| 心跳文件 | data/dna_heartbeat_{strand_id}.json | JSON格式，含策略和周期计数 |

**2.6 容错机制**

| 故障场景 | 处理方式 |
|---|---|
| Strand A 崩溃 | Strand B 独立运行，完整服务不受影响 |
| Strand B 崩溃 | Strand A 独立运行，完整服务不受影响 |
| 两条链同时崩溃 | 系统停止进化，但不影响正常对话服务 |
| 交叉验证超时 | 伙伴可能挂了，视为通过（不阻塞进化） |
| LLM不可用 | 跳过反思和规划，等待下次重试 |
| Git操作失败 | 记录错误，不阻塞进化循环 |

**3. 六阶段进化流水线**

**3.1 总览**

```
观察(O) → 反思(R) → 规划(P) → 执行(E) → 验证(V) → 学习(L)
  ↑                                                      |
  └──────────────────────────────────────────────────────┘
```

**3.2 阶段一：观察（Observe）**

**触发条件**：每次对话结束后自动触发

**观察数据来源**：
* 用户输入（user_text）
* 助手回复（assistant_response）
* 工具调用记录（tool_calls）
* 用户反馈（user_feedback）
* 技能使用记录（skill_usage）
* 错误日志（error）

**优先级规则**：

| 触发条件 | 优先级 | 说明 |
|---|---|---|
| 用户纠正（"不对"、"错了"） | high | 立即触发反思 |
| 工具调用失败 | high | 记录错误模式 |
| 技能使用失败 | medium | 标记待分析 |
| 正常对话 | low | 累积后批量分析 |

**3.3 阶段二：反思（Reflect）**

**触发条件**：每10分钟，且有≥3条未分析观察

**LLM分析内容**：
1. 反复出现的失败模式（需要修复的问题）
2. 用户反复纠正的问题（需要改进的地方）
3. 成功的模式（可以固化为技能的经验）
4. 可以自动化的重复任务

**输出格式**：
```json
{
  "failure_patterns": ["pattern1", "pattern2"],
  "success_patterns": ["pattern1", "pattern2"],
  "improvements": [
    {"type": "skill|config|prompt", "description": "...", "priority": "high|medium|low"}
  ]
}
```

**3.4 阶段三：规划（Plan）**

**触发条件**：反思产生有效改进机会

**规划约束**：
* 只能规划修改白名单目录内的文件
* 每次规划最多3个改进（避免过度变更）
* 改进必须包含明确的commit_message

**3.5 阶段四：执行（Execute）**

**执行流程**：

```
1. 路径权限检查（白名单+黑名单）
2. 写入文件
3. 语法检查
   ├── Python文件 → ast.parse()
   ├── JSON文件 → json.loads()
   └── 其他文件 → 跳过语法检查
4. 语法失败 → 立即删除文件（回滚）
5. 语法通过 → git add + git commit
```

**白名单目录**（允许进化修改）：
* `acp-proxy/skills/` — 技能存储
* `acp-proxy/plugins/` — 插件目录
* `acp-proxy/routes/` — API路由

**黑名单文件**（禁止修改）：
* `acp-proxy/app.py` — FastAPI主应用
* `acp-proxy/main.py` — 启动入口
* `acp-proxy/ws_acp.py` — ACP WebSocket
* `acp-proxy/ws_chat.py` — 聊天WebSocket
* `acp-proxy/agent/soulmate_agent.py` — SoulMate核心
* `acp-proxy/agent/llm_engine.py` — LLM引擎
* `acp-proxy/dna_evolution.py` — 进化引擎自身
* `acp-proxy/skill_manager.py` — 技能管理器

**3.6 阶段五：验证（Verify）**

**验证步骤**：
1. 服务健康检查（GET /health）
2. 确认服务进程存活
3. 确认新文件语法正确

**验证失败处理**：
* 服务不可达 → 标记验证失败，但不自动回滚（避免二次破坏）
* 记录失败原因，供下次反思分析

**3.7 阶段六：学习（Learn）**

**学习内容**：
* 成功的进化经验 → 写入共享checkpoint（供伙伴链学习）
* 失败的进化经验 → 记录到本地记忆（避免重复犯错）
* 进化统计 → 更新cycle_count、memory列表

**经验共享机制**：
* 成功的进化自动写入 `data/dna_checkpoint.json`
* 伙伴链每30秒检查一次checkpoint
* 跳过自己的checkpoint（避免重复学习）
* 跳过已学习的checkpoint（通过cycle_id去重）

**4. 技能自学习系统**

**4.1 自动学习触发条件**

| 条件 | 阈值 | 说明 |
|---|---|---|
| 工具调用次数 | ≥2次 | 复杂任务才值得学习 |
| 已有匹配技能 | use_count<3 | 避免重复学习 |
| 用户未纠正 | 无负面反馈 | 纠正过的不学习 |

**4.2 学习流程**

```
对话完成 → 检查工具调用次数 → 检查是否已有类似技能
    ↓
提取技能名称（用户输入前30字符）
    ↓
提取触发词（中文分词+英文提取，取前5个）
    ↓
提取工作流步骤（从助手中提取编号步骤）
    ↓
提取代码模板（从回复中提取最长代码块）
    ↓
去重检查 → 创建新技能（tags: ["auto-learned"]）
```

**4.3 技能生命周期**

```
创建 → 使用 → 记录(use_count++) → 淘汰(use_count=0且30天未用)
```

**5. 文件结构**

```
acp-proxy/
├── dna_evolution.py      # 双螺旋DNA进化引擎核心
├── evolution.py          # 单链进化引擎（基础实现）
├── skill_manager.py      # 技能存储/CRUD/搜索/自动学习
├── skills/               # 技能存储目录（JSON文件）
├── routes/
│   ├── skills.py         # 技能管理REST API
│   └── evolution.py      # 进化引擎REST API
├── data/
│   ├── dna_state_strand_a.json   # Strand A状态文件
│   ├── dna_state_strand_b.json   # Strand B状态文件
│   ├── dna_heartbeat_strand_a.json  # Strand A心跳
│   ├── dna_heartbeat_strand_b.json  # Strand B心跳
│   ├── dna_checkpoint.json       # 共享检查点
│   └── evolution_state.json      # 进化引擎状态
└── docs/specs/
    └── 31-Evolution-v1.0-自主进化引擎规范.md  # 本文档
```

**6. API端点规范**

**6.1 进化引擎API**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/evolution/status | 获取双螺旋状态 |
| GET | /api/evolution/strands | 获取两条链详细状态 |
| POST | /api/evolution/observe | 手动注入观察数据 |
| POST | /api/evolution/trigger | 手动触发进化周期 |
| GET | /api/evolution/checkpoint | 查看共享检查点 |

**6.2 技能管理API**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/skills | 列出所有技能 |
| POST | /api/skills | 创建技能 |
| GET | /api/skills/{id} | 获取技能详情 |
| PUT | /api/skills/{id} | 更新技能 |
| DELETE | /api/skills/{id} | 删除技能 |
| POST | /api/skills/search | 搜索技能 |

**7. 配置参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| HEARTBEAT_INTERVAL | 5秒 | 心跳发送间隔 |
| HEARTBEAT_TIMEOUT | 15秒 | 心跳超时判定 |
| EVOLUTION_INTERVAL | 300秒 | 进化周期间隔 |
| REFLECTION_INTERVAL | 600秒 | 深度反思间隔 |
| BATCH_ANALYSIS_INTERVAL | 3600秒 | 批量分析间隔 |
| MAX_IMPROVEMENTS_PER_CYCLE | 3 | 每次进化最多改进数 |
| MAX_OBSERVATIONS | 200 | 最大观察记录数 |
| MAX_MEMORIES | 100 | 最大进化记忆数 |

**8. 与现有系统联动**

| 系统 | 联动方式 |
|---|---|
| **SoulMate Agent** | 每次对话自动注入观察数据 |
| **技能系统(SkillManager)** | 进化引擎创建/优化技能，技能使用反馈给进化引擎 |
| **记忆系统(Memory)** | 进化经验持久化到记忆，反思时检索历史经验 |
| **事件总线(EventBus)** | 进化事件发布到总线，供监控和告警消费 |
| **健康检查(Health)** | 进化验证依赖健康检查端点 |
| **Git版本控制** | 所有变更自动commit，支持回滚到任意版本 |

**9. 安全保障机制**

**9.1 代码安全**

| 机制 | 说明 |
|---|---|
| 白名单目录 | 只允许修改skills/plugins/routes |
| 黑名单文件 | 核心引擎文件禁止修改 |
| 语法门控 | 写入后立即语法检查，失败删除 |
| JSON门控 | JSON文件写入后立即解析验证 |
| Git版本化 | 每次变更自动commit，可追溯 |

**9.2 运行安全**

| 机制 | 说明 |
|---|---|
| 双螺旋冗余 | 一条链崩溃不影响另一条 |
| 心跳检测 | 5秒心跳，15秒超时判定 |
| 健康检查 | 变更后验证服务存活 |
| 异常隔离 | 进化异常不影响正常对话服务 |
| 异步运行 | 进化引擎在后台异步执行 |

**9.3 回滚机制**

| 场景 | 回滚方式 |
|---|---|
| 语法检查失败 | 立即删除文件（写入后回滚） |
| 服务健康检查失败 | 标记验证失败，记录原因 |
| 手动回滚 | git reset --hard {commit_hash} |
| 自动回滚 | 进化引擎检测到连续失败，暂停进化 |

**10. 调研来源与设计依据**

| 项目/论文 | 核心贡献 | 引用位置 |
|---|---|---|
| MOSS (arXiv:2605.22794) | 四层嵌套自进化架构 | 六阶段流水线设计 |
| Aider (30K+ ⭐) | Git-first工作流 + /undo | Git自动commit机制 |
| SWE-agent (16K+ ⭐) | Docker沙箱隔离执行 | 安全门控设计 |
| selfpatch | verify-gate-revert三步安全链 | 语法检查+回滚机制 |
| SICA (394 ⭐) | benchmark门控 + 变更日志 | 验证阶段设计 |
| Reflexion (Shinn 2023) | 语言梯度（verbal gradients） | LLM反思分析 |
| Constitutional AI | 自评+修订循环 | 进化引擎自评机制 |
| OpenAI自进化手册 | Observe→Reflect→Update→Validate→Deploy | 六阶段流水线 |
| A-EVOLVE | evolver只改workspace不碰agent | 白名单保护机制 |
| 用户DNA双螺旋理论 | 两条链互为备份 | 双螺旋架构核心设计 |

**11. 版本信息**

* 规范版本：Evolution v1.0
* 归档状态：定稿冻结
* 创建时间：2026-09-10
* 基于：全球顶级开源项目调研 + 用户DNA双螺旋自进化理论
