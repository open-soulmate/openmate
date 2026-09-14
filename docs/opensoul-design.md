# OpenSoul — Agent的认知层

> 不是更好的Agent框架，是Agent的灵魂。

---

## 一、核心理念

### 1.1 问题

当前Agent没有自我意识：
- 不知道应该改哪些、防护哪些
- 不理解用户意图，机械执行指令
- 不会从错误中学习
- 防护靠规则，规则越多漏洞越多

### 1.2 答案

LLM是图书馆，有知识但没脑子。OpenSoul是给Agent装一个大脑。

```
传统Agent: 用户指令 → LLM → 执行 → 出错 → 补救
OpenSoul:  用户指令 → 大脑 → 分析意图 → 制定策略 → 执行 → 验证 → 学习
```

### 1.3 和规则防护的本质区别

```
规则防护：if 行数减少30% → 拒绝（机械、死板、总有漏洞）
灵魂防护：理解意图 + 评估风险 + 自主决策（活的、自适应、会学习）
```

---

## 二、架构

### 2.1 认知四层

```
┌─────────────────────────────────────────────┐
│              意图理解层                        │
│  用户说了什么？想做什么？改哪里？改多大？         │
├─────────────────────────────────────────────┤
│              风险评估层                        │
│  这个改动安全吗？会影响什么？需要备份吗？         │
├─────────────────────────────────────────────┤
│              策略决策层                        │
│  用什么方式？增量还是全量？分步还是一次？          │
├─────────────────────────────────────────────┤
│              执行验证层                        │
│  改完了对吗？语法对吗？功能对吗？要回滚吗？        │
└─────────────────────────────────────────────┘
```

### 2.2 记忆三层

```
┌─────────────────────────────────────────────┐
│              项目记忆                          │
│  文件结构、依赖关系、核心组件、历史改动           │
├─────────────────────────────────────────────┤
│              用户记忆                          │
│  偏好、习惯、常用指令、反馈模式                  │
├─────────────────────────────────────────────┤
│              经验记忆                          │
│  成功模式、失败教训、最佳实践、常见陷阱           │
└─────────────────────────────────────────────┘
```

### 2.3 目录结构

```
acp-proxy/soul/
├── __init__.py
├── brain.py              # 大脑主控 — 调度四层认知
├── memory/
│   ├── __init__.py
│   ├── project_memory.py  # 项目记忆 — 文件结构、依赖、核心组件
│   ├── user_memory.py     # 用户记忆 — 偏好、习惯
│   └── experience.py      # 经验记忆 — 成功/失败模式
├── context/
│   ├── __init__.py
│   ├── project_model.py   # 项目模型 — 文件关联、依赖图
│   └── task_context.py    # 任务上下文 — 当前任务的状态
├── risk/
│   ├── __init__.py
│   └── assessor.py        # 风险评估 — 意图理解 + 风险判断
└── reflection/
    ├── __init__.py
    └── reflector.py       # 反思器 — 行动后反思 + 学习
```

---

## 三、模块设计

### 3.1 brain.py — 大脑主控

```python
class SoulBrain:
    """Agent的大脑 — 调度四层认知"""

    def __init__(self, repo_root: str):
        self.project_memory = ProjectMemory(repo_root)
        self.user_memory = UserMemory()
        self.experience = ExperienceMemory()
        self.project_model = ProjectModel(repo_root)
        self.assessor = RiskAssessor(self.project_memory, self.experience)
        self.reflector = Reflector(self.experience)

    async def think(self, user_input: str, context: dict) -> Decision:
        """思考：从用户输入到决策"""
        # 1. 意图理解
        intent = self.understand_intent(user_input, context)

        # 2. 风险评估
        risk = self.assessor.assess(intent, context)

        # 3. 策略决策
        decision = self.decide(intent, risk, context)

        return decision

    async def verify(self, action: str, result: dict) -> Verification:
        """验证：行动后的反思"""
        verification = self.reflector.reflect(action, result)
        # 学习：记住这次的结果
        self.experience.record(action, result, verification)
        return verification
```

### 3.2 memory/project_memory.py — 项目记忆

```python
class ProjectMemory:
    """记住项目的结构、依赖、核心组件"""

    def __init__(self, repo_root: str):
        self.repo_root = repo_root
        self.file_index: dict[str, FileInfo] = {}
        self.dependency_graph: dict[str, list[str]] = {}
        self.core_files: list[str] = []
        self._build_index()

    def _build_index(self):
        """扫描项目，建立文件索引"""
        # 遍历所有源文件
        # 记录：路径、大小、语言、行数、最后修改时间
        # 分析：import/require关系，建立依赖图
        # 识别：核心文件（被最多文件依赖的）
        pass

    def is_core_file(self, path: str) -> bool:
        """这个文件是核心组件吗？"""
        return path in self.core_files

    def get_dependents(self, path: str) -> list[str]:
        """哪些文件依赖这个文件？"""
        return self.dependency_graph.get(path, [])

    def get_impact(self, path: str) -> ImpactAnalysis:
        """修改这个文件会影响什么？"""
        dependents = self.get_dependents(path)
        return ImpactAnalysis(
            direct_impact=dependents,
            indirect_impact=self._transitive_deps(path),
            risk_level="high" if len(dependents) > 5 else "medium" if len(dependents) > 2 else "low",
        )
```

### 3.3 memory/experience.py — 经验记忆

```python
class ExperienceMemory:
    """记住成功和失败的经验"""

    def __init__(self):
        self.success_patterns: list[Pattern] = []
        self.failure_lessons: list[Lesson] = []
        self.best_practices: list[Practice] = []

    def record(self, action: str, result: dict, verification: Verification):
        """记录一次行动的结果"""
        if verification.success:
            self.success_patterns.append(Pattern(
                action=action,
                context=result.get("context"),
                outcome="success",
            ))
        else:
            self.failure_lessons.append(Lesson(
                action=action,
                error=verification.error,
                fix=verification.fix,
            ))

    def get_relevant_experience(self, intent: Intent) -> list[Experience]:
        """获取和当前意图相关的经验"""
        # 匹配：类似文件、类似操作、类似场景
        pass
```

### 3.4 risk/assessor.py — 风险评估

```python
class RiskAssessor:
    """不是规则判断，是理解判断"""

    def __init__(self, project_memory, experience):
        self.project = project_memory
        self.experience = experience

    def assess(self, intent: Intent, context: dict) -> RiskAssessment:
        """评估一个意图的风险"""
        risks = []

        # 1. 文件风险：是核心文件吗？
        if self.project.is_core_file(intent.target_file):
            risks.append(Risk("核心文件修改", level="high"))

        # 2. 影响范围：有多少文件依赖它？
        impact = self.project.get_impact(intent.target_file)
        if impact.risk_level == "high":
            risks.append(Risk(f"影响{len(impact.direct_impact)}个文件", level="high"))

        # 3. 历史风险：类似操作以前出过错吗？
        similar_failures = self.experience.get_similar_failures(intent)
        if similar_failures:
            risks.append(Risk(f"类似操作曾失败{len(similar_failures)}次", level="medium"))

        # 4. 改动规模风险
        if intent.change_size == "large":
            risks.append(Risk("大规模改动", level="medium"))

        return RiskAssessment(
            risks=risks,
            overall_level=max(r.level for r in risks) if risks else "low",
            recommendation=self._recommend(risks, intent),
        )

    def _recommend(self, risks: list[Risk], intent: Intent) -> str:
        """基于风险给出建议"""
        if any(r.level == "high" for r in risks):
            return "建议：先备份，增量编辑，改完验证"
        elif any(r.level == "medium" for r in risks):
            return "建议：增量编辑，改完检查"
        else:
            return "正常执行"
```

### 3.5 reflection/reflector.py — 反思器

```python
class Reflector:
    """行动后反思，从错误中学习"""

    def __init__(self, experience):
        self.experience = experience

    def reflect(self, action: str, result: dict) -> Verification:
        """反思一次行动"""
        checks = []

        # 1. 语法检查
        if result.get("file_written"):
            syntax_ok = self._check_syntax(result["file_path"])
            checks.append(Check("语法", syntax_ok))

        # 2. 功能检查（如果有的话）
        if result.get("test_output"):
            test_ok = result["test_output"].get("passed", False)
            checks.append(Check("测试", test_ok))

        # 3. 对比检查：改动是否符合意图？
        if result.get("diff"):
            intent_match = self._check_intent_match(result["diff"], result.get("intent"))
            checks.append(Check("意图匹配", intent_match))

        success = all(c.passed for c in checks)

        return Verification(
            success=success,
            checks=checks,
            error=next((c.error for c in checks if not c.passed), None),
            fix=self._suggest_fix(checks) if not success else None,
        )
```

---

## 四、集成方式

### 4.1 和现有工具的关系

```
用户指令
    ↓
SoulBrain.think() → 意图理解 → 风险评估 → 策略决策
    ↓
工具执行（file_editor / str_replace_editor / terminal）
    ↓
SoulBrain.verify() → 语法检查 → 功能检查 → 反思学习
```

**SoulBrain不是替代工具，是工具的"大脑"。**

### 4.2 和现有防护的关系

```
规则防护（12层）→ 保留作为最后防线
SoulBrain → 在规则防护之前，先用智能判断
```

规则防护是兜底，SoulBrain是第一道防线。

### 4.3 使用示例

```python
from soul.brain import SoulBrain

brain = SoulBrain(repo_root="/home/climbing/openmate")

# 用户说"改一下登录逻辑"
decision = await brain.think(
    user_input="改一下登录逻辑",
    context={"current_file": "src/auth/login.ts"}
)

# decision: {
#   "intent": "修改登录逻辑",
#   "target": "src/auth/login.ts",
#   "strategy": "incremental",  # 增量编辑
#   "risks": ["核心文件", "影响3个文件"],
#   "recommendation": "先备份，增量编辑，改完验证"
# }

# 执行后验证
verification = await brain.verify(
    action="修改了login.ts的validate函数",
    result={"file_path": "src/auth/login.ts", "diff": "..."}
)

# verification: {
#   "success": True,
#   "checks": [语法✓, 测试✓, 意图✓],
#   "learning": "login.ts的validate函数修改成功，模式已记录"
# }
```

---

## 五、实现计划

### Phase 1：记忆系统（基础）
- [ ] ProjectMemory — 扫描项目，建立文件索引和依赖图
- [ ] ExperienceMemory — 成功/失败模式记录和检索
- [ ] UserMemory — 用户偏好记录

### Phase 2：上下文模型（核心）
- [ ] ProjectModel — 动态维护项目状态
- [ ] TaskContext — 当前任务的状态跟踪
- [ ] 文件关联分析 — import/require关系

### Phase 3：风险意识（关键）
- [ ] RiskAssessor — 意图理解 + 风险判断
- [ ] 影响范围分析 — 修改一个文件会影响什么
- [ ] 历史风险参考 — 类似操作以前出过错吗

### Phase 4：反思学习（闭环）
- [ ] Reflector — 行动后反思
- [ ] 自动学习 — 从成功/失败中提取模式
- [ ] 经验应用 — 下次遇到类似情况自动参考

### Phase 5：集成（落地）
- [ ] 集成到soulmate_agent — 替代规则防护作为第一道防线
- [ ] 集成到evolution引擎 — 智能判断是否安全
- [ ] 测试验证 — 100个场景

---

## 六、关键设计原则

1. **大脑不是规则引擎** — 不写if/else判断，用LLM理解意图
2. **记忆不是缓存** — 要有语义检索能力，不是简单的key-value
3. **风险不是阈值** — 不是"行数减少30%"，而是"这个文件被5个模块依赖"
4. **反思不是日志** — 不是记录做了什么，而是理解为什么成功/失败
5. **学习不是记忆** — 不是记住所有事，而是提取可复用的模式
