# OpenSoul — Agent的认知层（最终版）

> 不是更好的Agent框架，是Agent的灵魂。

---

## 一、核心理念

### 1.1 现存问题

当前主流编码Agent缺少认知能力：
- 不清楚应当修改哪些文件、哪些点位需要重点防护
- 无法深度理解用户真实意图，机械直译指令执行
- 缺少复盘闭环，不会从错误中沉淀经验、自我优化
- 安全防护高度依赖硬编码规则；规则越多，边界漏洞、误判场景越多

### 1.2 核心定位

LLM如同图书馆，拥有海量知识，但不具备自主思考、风险推演能力。**OpenSoul是赋予Agent认知能力的独立大脑组件。**

```
传统Agent: 用户指令 → LLM → 执行 → 出错 → 补救
OpenSoul:  用户指令 → 大脑 → 分析意图 → 制定策略 → 执行 → 验证 → 学习
```

### 1.3 与规则防护的本质区别

```
规则防护：if 行数减少30% → 拒绝（机械、死板、总有漏洞）
灵魂防护：理解意图 + 评估风险 + 自主决策（活的、自适应、会学习）
```

**重要说明：** OpenSoul**不取代规则防护**。规则防护保留作为最终兜底防线；OpenSoul认知层作为第一道智能防线，两者协同工作。

---

## 二、整体架构

### 2.1 认知四层（思考流水线）

```
┌─────────────────────────────────────────────────────────┐
│                  意图理解层                              │
│  用户说了什么？想做什么？改哪些文件？改动规模？预期目标？ │
├─────────────────────────────────────────────────────────┤
│                  风险评估层                              │
│  改动是否安全？影响哪些模块？是否需要备份？是否需人工确认？│
├─────────────────────────────────────────────────────────┤
│                  策略决策层                              │
│  编辑方式选择：增量Patch / 全量重写 / 分步执行           │
│  执行模式：auto / confirm_required / deny               │
├─────────────────────────────────────────────────────────┤
│                  执行验证层                              │
│  结果是否符合意图？语法校验？业务校验？是否回滚？         │
│  异常也要复盘学习 — 异常不能跳出闭环                     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 记忆三层（大脑长期存储）

```
┌─────────────────────────────────────────────────────────┐
│                    项目记忆                              │
│ 文件结构、依赖图谱、核心组件、历史改动                   │
│ 支持增量刷新，规避内存快照陈旧                           │
├─────────────────────────────────────────────────────────┤
│                    用户记忆                              │
│ 用户偏好、操作习惯、常用指令、反馈模式、风险容忍度配置   │
├─────────────────────────────────────────────────────────┤
│                    经验记忆                              │
│ 成功模式、失败教训、最佳实践、常见陷阱                   │
│ 向量检索 + 老化衰减，防止数据无限膨胀                    │
└─────────────────────────────────────────────────────────┘
```

### 2.3 和现有系统的关系

```
用户指令
    ↓
SoulBrain.think() → 意图理解 → 风险评估 → 策略决策
    ↓
【若execute_mode=confirm_required：先交给UI询问用户确认】
    ↓
工具执行（file_editor / str_replace_editor / terminal）
    ↓
【捕获全部异常，封装进result，不抛出逃逸】
    ↓
SoulBrain.verify() → 语法检查 → 功能检查 → 反思学习
    ↓
规则防护（atomic_write等）→ 兜底最后防线 → 写入磁盘
```

**SoulBrain不是替代工具，是工具的大脑层。** 只做思考、评估、决策、复盘，不直接操作文件。

---

## 三、数据模型

全部使用dataclass做类型约束。TaskContext作为上下文载体贯穿全链路，废弃裸字典。

```python
from dataclasses import dataclass, field
from typing import Optional, Literal, List
from datetime import datetime

# ── 意图 ──
@dataclass
class Intent:
    user_prompt: str
    target_files: List[str]
    modify_scope: Literal["single_method", "single_file", "multi_file", "project_wide"]
    goal: str                                    # "fix_bug" / "add_feature" / "refactor" / "create" / "rewrite"
    change_size: Literal["small", "medium", "large"]

# ── 风险 ──
@dataclass
class Risk:
    title: str
    level: Literal["low", "medium", "high", "critical"]
    desc: str

@dataclass
class RiskAssessment:
    risks: List[Risk]
    overall_level: Literal["low", "medium", "high", "critical"]
    recommendation: str

# ── 决策 ──
@dataclass
class Decision:
    intent: Intent
    risk: RiskAssessment
    edit_mode: Literal["patch", "full", "stepwise"]    # 增量/全量/分步
    execute_mode: Literal["auto", "confirm_required", "deny"]
    confirm_prompt: Optional[str] = None               # 需要用户确认时的提示语

# ── 验证 ──
@dataclass
class CheckItem:
    name: str
    passed: bool
    error: Optional[str] = None

@dataclass
class Verification:
    success: bool
    checks: List[CheckItem]
    error: Optional[str] = None
    fix: Optional[str] = None

# ── 项目信息 ──
@dataclass
class FileInfo:
    path: str
    language: str              # "python" / "typescript" / "json" / ...
    lines: int
    size_bytes: int
    last_modified: datetime
    is_core: bool = False

@dataclass
class ImpactAnalysis:
    direct_impact: List[str]       # 直接依赖此文件的文件列表
    indirect_impact: List[str]     # 间接依赖（传递依赖）
    risk_level: Literal["low", "medium", "high", "critical"]

# ── 任务上下文 ──
@dataclass
class TaskContext:
    """单次任务的完整状态，贯穿think → assess → decide → verify全链路"""
    task_id: str = ""
    user_input: str = ""
    intent: Optional[Intent] = None
    risk: Optional[RiskAssessment] = None
    decision: Optional[Decision] = None
    tool_result: Optional[dict] = None
    verification: Optional[Verification] = None
    history: List[dict] = field(default_factory=list)   # 本次任务的完整操作历史

# ── 经验 ──
@dataclass
class Experience:
    action: str
    intent_summary: str
    outcome: Literal["success", "failure", "partial"]
    error: Optional[str] = None
    fix: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    relevance_score: float = 1.0       # 用于老化衰减
```

---

## 四、目录结构

```
acp-proxy/soul/
├── __init__.py
├── brain.py                # 大脑主控 — 调度四层认知，TaskContext全链路透传
├── data_models.py          # 上面所有dataclass定义
├── memory/
│   ├── __init__.py
│   ├── project_memory.py   # 项目记忆：文件结构、依赖图、核心组件，支持增量刷新
│   ├── user_memory.py      # 用户记忆：偏好、习惯、风险容忍度
│   └── experience.py       # 经验记忆：成功/失败模式，向量检索、经验老化淘汰
├── context/
│   ├── __init__.py
│   ├── project_model.py    # 项目模型：文件关联、动态依赖图维护
│   └── task_context.py     # 任务上下文：扩展TaskContext的行为方法
├── risk/
│   ├── __init__.py
│   └── assessor.py         # 风险评估器：意图解析、多文件风险聚合评估
└── reflection/
    ├── __init__.py
    └── reflector.py        # 反思器：执行后复盘；正常/异常/业务失败全部进入复盘
```

---

## 五、模块详细设计

### 5.1 brain.py — 大脑主控

```python
class SoulBrain:
    """Agent的大脑 — 调度四层认知流水线"""

    def __init__(self, repo_root: str):
        self.project_memory = ProjectMemory(repo_root)
        self.user_memory = UserMemory()
        self.experience = ExperienceMemory()
        self.project_model = ProjectModel(repo_root)
        self.assessor = RiskAssessor(self.project_memory, self.experience)
        self.reflector = Reflector(self.experience)

    async def think(self, user_input: str, task_ctx: TaskContext) -> Decision:
        """思考主入口：用户输入 → 执行决策"""
        # 1. 意图理解（用LLM分析用户意图）
        intent = await self._understand_intent(user_input, task_ctx)
        task_ctx.intent = intent

        # 2. 风险评估（结合项目记忆 + 经验记忆）
        risk = await self.assessor.assess(intent, task_ctx)
        task_ctx.risk = risk

        # 3. 策略决策（基于意图 + 风险 → 选择编辑方式和执行模式）
        decision = self._decide(intent, risk, task_ctx)
        task_ctx.decision = decision

        return decision

    async def verify(self, action: str, result: dict, task_ctx: TaskContext) -> Verification:
        """执行后反思验证 — 无论成功/失败/异常都进入复盘"""
        verification = await self.reflector.reflect(action, result, task_ctx)
        task_ctx.verification = verification

        # 学习：记住这次的结果
        self.experience.record(action, result, verification, task_ctx)

        return verification

    def _decide(self, intent: Intent, risk: RiskAssessment, task_ctx: TaskContext) -> Decision:
        """基于意图和风险，决策编辑方式和执行模式"""
        # 编辑方式决策
        if intent.goal == "create":
            edit_mode = "full"          # 新建文件必须全量
        elif intent.change_size == "large":
            edit_mode = "patch"         # 大改动强制增量
        else:
            edit_mode = "patch"         # 默认增量

        # 执行模式决策
        if risk.overall_level == "critical":
            execute_mode = "deny"
            confirm_prompt = f"风险过高，拒绝执行：{risk.recommendation}"
        elif risk.overall_level == "high":
            execute_mode = "confirm_required"
            confirm_prompt = f"高风险操作，需要确认：{risk.recommendation}"
        else:
            execute_mode = "auto"
            confirm_prompt = None

        return Decision(
            intent=intent,
            risk=risk,
            edit_mode=edit_mode,
            execute_mode=execute_mode,
            confirm_prompt=confirm_prompt,
        )
```

### 5.2 memory/project_memory.py — 项目记忆

```python
class ProjectMemory:
    """项目记忆：文件索引、依赖图谱、核心组件识别，支持增量刷新"""

    def __init__(self, repo_root: str):
        self.repo_root = repo_root
        self.file_index: dict[str, FileInfo] = {}
        self.dependency_graph: dict[str, list[str]] = {}   # file → [依赖它的文件]
        self.core_files: list[str] = []
        self._build_index()

    def _build_index(self):
        """全量扫描项目，初始化文件索引与依赖图"""
        # 遍历所有源文件（.py, .ts, .tsx, .js, .jsx, .json）
        # 记录：路径、大小、语言、行数、最后修改时间
        # 分析：import/require关系，建立双向依赖图
        # 识别：核心文件（被最多文件依赖的前10%）
        pass

    async def refresh_incremental(self):
        """增量刷新：仅扫描自上次以来发生变更的文件"""
        # 对比文件的last_modified时间戳
        # 只重新解析变更文件的import关系
        # 更新依赖图
        pass

    def is_core_file(self, path: str) -> bool:
        return path in self.core_files

    def get_dependents(self, path: str) -> list[str]:
        """哪些文件依赖这个文件？"""
        return self.dependency_graph.get(path, [])

    def get_impact(self, path: str) -> ImpactAnalysis:
        """评估修改此文件的影响范围"""
        direct = self.get_dependents(path)
        indirect = self._transitive_deps(path)
        level = "critical" if len(direct) > 10 else "high" if len(direct) > 5 else "medium" if len(direct) > 2 else "low"
        return ImpactAnalysis(direct_impact=direct, indirect_impact=indirect, risk_level=level)

    def _transitive_deps(self, path: str) -> list[str]:
        """传递依赖：A依赖B，B依赖C → 修改C间接影响A"""
        visited = set()
        queue = self.get_dependents(path)
        while queue:
            f = queue.pop(0)
            if f not in visited:
                visited.add(f)
                queue.extend(self.get_dependents(f))
        return list(visited)
```

### 5.3 memory/experience.py — 经验记忆

```python
class ExperienceMemory:
    """经验记忆：存储成功/失败模式，支持语义检索、老化衰减"""

    def __init__(self, storage_path: str = "data/experience.json"):
        self.storage_path = storage_path
        self.experiences: list[Experience] = []
        self._load()

    def record(self, action: str, result: dict, verification: Verification, task_ctx: TaskContext):
        """记录一次行动结果"""
        exp = Experience(
            action=action,
            intent_summary=task_ctx.intent.goal if task_ctx.intent else "unknown",
            outcome="success" if verification.success else "failure",
            error=verification.error,
            fix=verification.fix,
        )
        self.experiences.append(exp)
        self._aging_prune()
        self._save()

    def get_relevant_experience(self, intent: Intent) -> list[Experience]:
        """获取和当前意图相关的历史经验"""
        # 先按目标文件匹配，再按操作类型匹配
        relevant = []
        for exp in self.experiences:
            score = self._compute_relevance(exp, intent)
            if score > 0.3:
                relevant.append(exp)
        # 按相关度排序
        relevant.sort(key=lambda e: e.relevance_score, reverse=True)
        return relevant[:10]   # 最多返回10条

    def _compute_relevance(self, exp: Experience, intent: Intent) -> float:
        """计算经验与当前意图的相关度"""
        score = 0.0
        # 目标类型匹配
        if exp.intent_summary == intent.goal:
            score += 0.5
        # 时间衰减（越近的经验越相关）
        age_hours = (datetime.now() - exp.timestamp).total_seconds() / 3600
        time_decay = max(0, 1.0 - age_hours / (24 * 30))   # 30天衰减到0
        score *= time_decay
        # 失败经验权重更高（要吸取教训）
        if exp.outcome == "failure":
            score += 0.2
        return min(1.0, score)

    def _aging_prune(self):
        """老化淘汰：移除过期经验，控制内存"""
        cutoff = datetime.now()
        self.experiences = [
            e for e in self.experiences
            if (cutoff - e.timestamp).days < 90   # 保留90天内
        ]
        # 如果还是太多，保留最高权重的
        if len(self.experiences) > 1000:
            self.experiences.sort(key=lambda e: e.relevance_score, reverse=True)
            self.experiences = self.experiences[:1000]

    def _load(self):
        """从磁盘加载经验"""
        pass

    def _save(self):
        """持久化到磁盘"""
        pass
```

### 5.4 risk/assessor.py — 风险评估

```python
class RiskAssessor:
    """理解式风险评估；支持多文件风险聚合（不简单取max）"""

    def __init__(self, project_memory: ProjectMemory, experience: ExperienceMemory):
        self.project = project_memory
        self.experience = experience

    async def assess(self, intent: Intent, task_ctx: TaskContext) -> RiskAssessment:
        """遍历全部target_files，单文件评估后做风险聚合"""
        all_risks: list[Risk] = []

        for file_path in intent.target_files:
            file_risks = self._assess_single_file(file_path, intent)
            all_risks.extend(file_risks)

        # 历史经验风险
        similar_failures = self.experience.get_relevant_experience(intent)
        failure_count = sum(1 for e in similar_failures if e.outcome == "failure")
        if failure_count > 0:
            all_risks.append(Risk(
                title="历史失败经验",
                level="high" if failure_count >= 3 else "medium",
                desc=f"类似操作曾失败{failure_count}次",
            ))

        # 多风险聚合
        overall = self._aggregate_risk_level(all_risks)
        recommendation = self._recommend(all_risks, intent)

        return RiskAssessment(risks=all_risks, overall_level=overall, recommendation=recommendation)

    def _assess_single_file(self, path: str, intent: Intent) -> list[Risk]:
        """单文件风险评估"""
        risks = []

        # 核心文件
        if self.project.is_core_file(path):
            risks.append(Risk("核心文件修改", "high", f"{path}是项目核心文件"))

        # 影响范围
        impact = self.project.get_impact(path)
        if impact.risk_level in ("high", "critical"):
            risks.append(Risk(
                f"影响{len(impact.direct_impact)}个直接依赖文件",
                impact.risk_level,
                f"直接依赖：{', '.join(impact.direct_impact[:5])}",
            ))

        # 改动规模
        if intent.change_size == "large":
            risks.append(Risk("大规模改动", "medium", "建议分步执行"))

        return risks

    def _aggregate_risk_level(self, risks: list[Risk]) -> Literal["low", "medium", "high", "critical"]:
        """多风险聚合：不简单取max，考虑风险叠加"""
        if not risks:
            return "low"
        levels = [r.level for r in risks]
        if "critical" in levels:
            return "critical"
        high_count = levels.count("high")
        if high_count >= 2:
            return "critical"   # 多个高风险叠加 = 临界
        if "high" in levels:
            return "high"
        if levels.count("medium") >= 2:
            return "high"       # 多个中风险叠加 = 高
        if "medium" in levels:
            return "medium"
        return "low"

    def _recommend(self, risks: list[Risk], intent: Intent) -> str:
        if any(r.level == "critical" for r in risks):
            return "风险过高，建议人工审查后执行"
        if any(r.level == "high" for r in risks):
            return "建议：先备份，增量编辑，改完验证"
        if any(r.level == "medium" for r in risks):
            return "建议：增量编辑，改完检查"
        return "正常执行"
```

### 5.5 reflection/reflector.py — 反思器

```python
class Reflector:
    """行动后反思 — 无论成功/失败/异常，统一复盘"""

    def __init__(self, experience: ExperienceMemory):
        self.experience = experience

    async def reflect(self, action: str, result: dict, task_ctx: TaskContext) -> Verification:
        """复盘单次行动"""
        checks: list[CheckItem] = []

        # 1. 系统异常检查（异常不能跳出闭环）
        if result.get("exception"):
            checks.append(CheckItem("系统异常", False, result.get("error")))

        # 2. 语法检查
        if result.get("file_written"):
            syntax_ok = await self._check_syntax(result["file_path"])
            checks.append(CheckItem("语法校验", syntax_ok))

        # 3. 功能检查（如果有测试输出）
        if result.get("test_output"):
            test_ok = result["test_output"].get("passed", False)
            checks.append(CheckItem("功能校验", test_ok, result["test_output"].get("error")))

        # 4. 意图匹配检查（改动是否符合用户意图）
        if result.get("diff") and task_ctx.intent:
            intent_match = await self._check_intent_match(result["diff"], task_ctx.intent)
            checks.append(CheckItem("意图匹配", intent_match))

        success = all(c.passed for c in checks)

        # 如果失败，生成修复建议
        fix = None
        if not success:
            failed = [c for c in checks if not c.passed]
            fix = self._suggest_fix(failed)

        return Verification(success=success, checks=checks, error=failed[0].error if not success else None, fix=fix)

    def _suggest_fix(self, failed_checks: list[CheckItem]) -> str:
        """根据失败的检查项，建议修复方案"""
        suggestions = []
        for check in failed_checks:
            if check.name == "语法校验":
                suggestions.append("修复语法错误后重试")
            elif check.name == "系统异常":
                suggestions.append(f"异常处理：{check.error}")
            elif check.name == "意图匹配":
                suggestions.append("改动与预期不符，建议用增量编辑重试")
        return "; ".join(suggestions) if suggestions else "请人工检查"
```

---

## 六、集成方式

### 6.1 调用示例

```python
from soul.brain import SoulBrain
from soul.data_models import TaskContext

brain = SoulBrain(repo_root="/home/climbing/openmate")
task_ctx = TaskContext(task_id="task_001", user_input="改一下登录逻辑")

# 思考
decision = await brain.think(user_input="改一下登录逻辑", task_ctx=task_ctx)

if decision.execute_mode == "confirm_required":
    # UI展示confirm_prompt，等待用户确认
    user_confirmed = await show_confirm_dialog(decision.confirm_prompt)
    if not user_confirmed:
        return
elif decision.execute_mode == "deny":
    # 拒绝执行
    return {"error": decision.confirm_prompt}

# 执行（异常不逃逸，封装进result）
try:
    tool_result = await run_agent_tool(decision)
except Exception as e:
    tool_result = {"exception": True, "error": str(e)}

# 验证 + 学习
verification = await brain.verify(action="修改登录模块", result=tool_result, task_ctx=task_ctx)
```

### 6.2 防护层级

```
SoulBrain认知判断（第一道防线）
    ↓ 通过
规则防护（atomic_write等，兜底最后防线）
    ↓ 通过
写入磁盘
```

---

## 七、实现计划

### Phase 1：记忆系统（基础底座）
- [ ] data_models.py — 所有dataclass定义
- [ ] ProjectMemory — 文件索引、依赖图，增量刷新
- [ ] ExperienceMemory — 成功失败记录、老化淘汰
- [ ] UserMemory — 用户偏好、风险容忍配置

### Phase 2：上下文模型
- [ ] ProjectModel — 动态维护项目状态
- [ ] TaskContext扩展 — 全链路行为方法
- [ ] import/require解析 — 构建双向依赖图谱

### Phase 3：风险意识（核心能力）
- [ ] RiskAssessor — 意图解析 + 多文件风险聚合
- [ ] 修改影响范围推演
- [ ] 历史相似失败案例检索

### Phase 4：反思学习（闭环）
- [ ] Reflector — 兼容正常/异常/业务失败复盘
- [ ] 从执行结果提取可复用经验模式
- [ ] 经验语义检索

### Phase 5：系统集成落地
- [ ] 集成soulmate_agent — 作为第一道防线
- [ ] 接入evolution引擎 — 智能判断代码变更风险
- [ ] 100+测试用例验证

---

## 八、关键设计原则

1. **大脑不是规则引擎** — 核心逻辑依靠LLM做意图理解，拒绝堆砌大量if-else
2. **记忆不是简单缓存** — 具备语义检索、老化淘汰，不能只是key-value
3. **风险不只是阈值** — 不只看行数变化，重点看文件重要等级、依赖影响面、历史故障
4. **反思不等于打日志** — 不是单纯记录事件，而是理解成功/失败背后原因，沉淀模式
5. **学习不等于全部保存** — 经验衰减、去重、截断，防止记忆膨胀，避免prompt爆炸
6. **异常不能跳出闭环** — 工具报错、崩溃也必须流入verify，保证每次交互都参与学习
7. **支持人工介入** — 高风险不直接拒绝，提供"需要用户确认"中间状态
