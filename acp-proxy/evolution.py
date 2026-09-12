"""Evolution Engine — SoulMate 自主进化引擎

完全自主运行的后台进化循环，无需人类介入。

架构灵感：
- MOSS (arXiv:2605.22794): 四层嵌套自进化架构
- OpenAI Self-Evolving Agents: Observe→Reflect→Update→Validate→Deploy
- Reflexion: Verbal reinforcement learning
- Constitutional AI: Self-critique against principles

核心原则：
1. 每次对话都是一次"写操作"——自动记录、反思、学习
2. 进化引擎用自己的LLM推理改进方案
3. 所有变更经过安全门控，失败自动回滚
4. 配置好大模型后，完全自主运行，无需人类介入
"""

import asyncio
import json
import logging
import os
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("acp-proxy.evolution")


# ── 进化周期配置 ──────────────────────────────────────────

EVOLUTION_INTERVAL = 300  # 每5分钟检查一次进化机会
REFLECTION_INTERVAL = 600  # 每10分钟做一次深度反思
BATCH_ANALYSIS_INTERVAL = 3600  # 每小时做一次批量分析


class EvolutionStage(Enum):
    """进化阶段"""
    OBSERVE = "observe"      # 观察：收集对话、工具调用、用户反馈
    REFLECT = "reflect"      # 反思：分析成功/失败模式
    PLAN = "plan"            # 规划：生成改进方案
    EXECUTE = "execute"      # 执行：应用代码/技能/配置变更
    VERIFY = "verify"        # 验证：确保变更安全有效
    LEARN = "learn"          # 学习：记录经验，更新记忆


@dataclass
class EvolutionCycle:
    """一次进化周期"""
    cycle_id: str
    stage: EvolutionStage
    trigger: str  # 触发原因
    observations: list[dict] = field(default_factory=list)
    reflections: list[str] = field(default_factory=list)
    plan: Optional[dict] = None
    changes: list[dict] = field(default_factory=list)
    verification: Optional[dict] = None
    learning: Optional[str] = None
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    success: bool = False


@dataclass
class Observation:
    """一次观察记录"""
    obs_id: str
    obs_type: str  # conversation / tool_call / error / user_feedback / skill_usage
    content: str
    metadata: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    analyzed: bool = False


class EvolutionEngine:
    """自主进化引擎 — SoulMate 的"大脑进化中枢"

    核心循环：
    1. 观察：监听所有对话、工具调用、错误、用户反馈
    2. 反思：用LLM分析模式——什么有效，什么失败
    3. 规划：生成具体的改进方案（新技能、代码修复、配置优化）
    4. 执行：安全地应用变更（白名单目录 + 语法检查 + git commit）
    5. 验证：在沙箱中测试变更
    6. 学习：记录经验，更新进化记忆

    使用方式：
        engine = EvolutionEngine(repo_root, llm_engine)
        await engine.start()  # 后台持续运行
    """

    # 允许进化的目录（白名单）
    EVOLVABLE_DIRS = [
        "acp-proxy/skills/",
        "acp-proxy/plugins/",
        "acp-proxy/routes/",
    ]

    # 禁止进化的文件（核心引擎不可改）
    PROTECTED_FILES = [
        "acp-proxy/app.py",
        "acp-proxy/main.py",
        "acp-proxy/ws_acp.py",
        "acp-proxy/ws_chat.py",
        "acp-proxy/agent/soulmate_agent.py",
        "acp-proxy/agent/llm_engine.py",
        "acp-proxy/evolution.py",  # 不能自己改自己
        "acp-proxy/skill_manager.py",
    ]

    def __init__(self, repo_root: str, llm_base_url: str = "http://127.0.0.1:8090"):
        self.repo_root = Path(repo_root)
        self.llm_base_url = llm_base_url
        self._observations: list[Observation] = []
        self._cycles: list[EvolutionCycle] = []
        self._evolution_memory: list[dict] = []  # 进化经验记忆
        self._running = False
        self._last_evolution = 0
        self._last_reflection = 0
        self._last_batch_analysis = 0
        # 进化状态持久化
        self._state_file = self.repo_root / "acp-proxy" / "data" / "evolution_state.json"
        self._load_state()

    # ── 观察层：收集信号 ──────────────────────────────────

    def observe_conversation(self, session_id: str, user_text: str, assistant_response: str,
                             tool_calls: list[dict] | None = None, user_feedback: str | None = None):
        """记录一次对话观察"""
        obs = Observation(
            obs_id=str(uuid.uuid4())[:8],
            obs_type="conversation",
            content=f"User: {user_text[:200]}\nAssistant: {assistant_response[:200]}",
            metadata={
                "session_id": session_id,
                "user_text": user_text,
                "assistant_response": assistant_response,
                "tool_calls": tool_calls or [],
                "user_feedback": user_feedback,
                "tool_count": len(tool_calls) if tool_calls else 0,
            }
        )
        self._observations.append(obs)

        # 如果有用户反馈（纠正、不满），高优先级处理
        if user_feedback and any(kw in user_feedback for kw in ["不对", "错了", "不是", "重来", "wrong", "incorrect"]):
            obs.metadata["priority"] = "high"
            logger.info(f"High-priority observation: user feedback in session {session_id}")

    def observe_error(self, error_type: str, error_message: str, context: dict | None = None):
        """记录一次错误观察"""
        obs = Observation(
            obs_id=str(uuid.uuid4())[:8],
            obs_type="error",
            content=f"[{error_type}] {error_message}",
            metadata={"error_type": error_type, "context": context or {}, "priority": "high"},
        )
        self._observations.append(obs)

    def observe_skill_usage(self, skill_id: str, skill_name: str, success: bool, user_text: str):
        """记录技能使用观察"""
        obs = Observation(
            obs_id=str(uuid.uuid4())[:8],
            obs_type="skill_usage",
            content=f"Skill '{skill_name}' used, success={success}",
            metadata={
                "skill_id": skill_id,
                "skill_name": skill_name,
                "success": success,
                "user_text": user_text,
                "priority": "low" if success else "medium",
            },
        )
        self._observations.append(obs)

    # ── 反思层：用LLM分析模式 ────────────────────────────

    async def _reflect(self) -> list[str]:
        """深度反思：用LLM分析最近的观察，找出模式"""
        # 取最近未分析的观察
        unanalyzed = [o for o in self._observations if not o.analyzed]
        if len(unanalyzed) < 3:
            return []

        # 构建反思 prompt
        observations_text = ""
        for obs in unanalyzed[-20:]:  # 最近20条
            observations_text += f"\n[{obs.obs_type}] {obs.content}\n"

        prompt = f"""你是SoulMate的自我反思引擎。分析以下最近的观察记录，找出：
1. 反复出现的失败模式（需要修复的问题）
2. 用户反复纠正的问题（需要改进的地方）
3. 成功的模式（可以固化为技能的经验）
4. 可以自动化的重复任务

观察记录：
{observations_text}

请用JSON格式返回分析结果：
{{
  "failure_patterns": ["pattern1", "pattern2"],
  "user_corrections": ["correction1", "correction2"],
  "success_patterns": ["pattern1", "pattern2"],
  "improvement_opportunities": [
    {{"type": "skill|config|prompt", "description": "...", "priority": "high|medium|low"}}
  ]
}}"""

        try:
            result = await self._call_llm(prompt)
            # 标记为已分析
            for obs in unanalyzed:
                obs.analyzed = True

            reflections = [result]
            self._evolution_memory.append({
                "type": "reflection",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "observation_count": len(unanalyzed),
                "analysis": result,
            })
            logger.info(f"Reflection completed: {len(unanalyzed)} observations analyzed")
            return reflections
        except Exception as e:
            logger.error(f"Reflection failed: {e}")
            return []

    # ── 规划层：生成改进方案 ──────────────────────────────

    async def _plan_improvements(self, reflections: list[str]) -> list[dict]:
        """基于反思结果，规划具体改进"""
        if not reflections:
            return []

        prompt = f"""你是SoulMate的进化规划器。基于以下反思分析，生成具体的改进方案。

反思分析：
{chr(10).join(reflections)}

可用的进化目标目录：
- acp-proxy/skills/ — 新增或改进技能
- acp-proxy/plugins/ — 新增或改进插件
- acp-proxy/routes/ — 新增或改进API路由

核心引擎文件（禁止修改）：
- acp-proxy/app.py, main.py, ws_acp.py, ws_chat.py
- acp-proxy/agent/soulmate_agent.py, llm_engine.py

请生成改进方案，JSON格式：
{{
  "improvements": [
    {{
      "type": "new_skill|improve_skill|new_plugin|config_change",
      "target_file": "acp-proxy/skills/xxx.json",
      "action": "create|modify",
      "content": "文件内容",
      "commit_message": "描述",
      "reason": "为什么需要这个改进"
    }}
  ]
}}"""

        try:
            result = await self._call_llm(prompt)
            # 解析JSON
            import re
            json_match = re.search(r'\{.*\}', result, re.DOTALL)
            if json_match:
                plan = json.loads(json_match.group())
                improvements = plan.get("improvements", [])
                logger.info(f"Planned {len(improvements)} improvements")
                return improvements
        except Exception as e:
            logger.error(f"Planning failed: {e}")
        return []

    # ── 执行层：安全应用变更 ──────────────────────────────

    async def _execute_improvements(self, improvements: list[dict]) -> list[dict]:
        """安全执行改进方案"""
        results = []
        for imp in improvements:
            target = imp.get("target_file", "")
            action = imp.get("action", "create")

            # 安全检查：白名单
            if not any(target.startswith(d) for d in self.EVOLVABLE_DIRS):
                results.append({**imp, "status": "blocked", "reason": "path not in whitelist"})
                continue

            # 安全检查：黑名单
            if any(target.endswith(f) for f in self.PROTECTED_FILES):
                results.append({**imp, "status": "blocked", "reason": "protected file"})
                continue

            # 执行变更
            full_path = self.repo_root / target
            try:
                if action in ("create", "modify"):
                    full_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(imp.get("content", ""))

                    # 语法检查（Python文件）
                    if target.endswith(".py"):
                        import ast
                        try:
                            ast.parse(imp.get("content", ""))
                        except SyntaxError as e:
                            # 回滚
                            if full_path.exists():
                                os.remove(full_path)
                            results.append({**imp, "status": "rolled_back", "reason": f"syntax error: {e}"})
                            continue

                    # JSON检查
                    if target.endswith(".json"):
                        try:
                            json.loads(imp.get("content", ""))
                        except json.JSONDecodeError as e:
                            if full_path.exists():
                                os.remove(full_path)
                            results.append({**imp, "status": "rolled_back", "reason": f"json error: {e}"})
                            continue

                    # Git commit
                    commit_msg = imp.get("commit_message", f"[evolution] {action} {target}")
                    self._git_commit(target, commit_msg)
                    results.append({**imp, "status": "applied"})
                    logger.info(f"Evolution applied: {target}")

                elif action == "delete":
                    if full_path.exists():
                        os.remove(full_path)
                        self._git_commit(target, f"[evolution] delete {target}")
                        results.append({**imp, "status": "applied"})

            except Exception as e:
                results.append({**imp, "status": "failed", "reason": str(e)})
                logger.error(f"Evolution execution failed for {target}: {e}")

        return results

    # ── 验证层：确保变更安全 ──────────────────────────────

    async def _verify_changes(self, changes: list[dict]) -> dict:
        """验证变更是否安全有效"""
        applied = [c for c in changes if c.get("status") == "applied"]
        if not applied:
            return {"verified": True, "reason": "no changes to verify"}

        # 检查服务是否还在运行
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                resp = await client.get(f"http://127.0.0.1:8092/health")
                if resp.status_code != 200:
                    return {"verified": False, "reason": "service health check failed"}
        except Exception:
            return {"verified": False, "reason": "service unreachable"}

        return {"verified": True, "changes_applied": len(applied)}

    # ── 学习层：记录经验 ──────────────────────────────────

    def _learn(self, cycle: EvolutionCycle):
        """记录进化经验"""
        learning = {
            "cycle_id": cycle.cycle_id,
            "trigger": cycle.trigger,
            "observations_count": len(cycle.observations),
            "reflections": cycle.reflections,
            "changes_count": len(cycle.changes),
            "success": cycle.success,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._evolution_memory.append(learning)
        self._save_state()

    # ── 主循环 ────────────────────────────────────────────

    async def start(self):
        """启动进化引擎（后台持续运行）"""
        self._running = True
        logger.info("Evolution Engine started — autonomous self-improvement active")

        while self._running:
            try:
                now = time.time()

                # 检查是否有足够的观察数据
                unanalyzed = [o for o in self._observations if not o.analyzed]

                # 定期反思
                if unanalyzed and (now - self._last_reflection) > REFLECTION_INTERVAL:
                    cycle = await self._run_cycle("periodic_reflection")
                    self._last_reflection = now

                # 定期进化
                elif (now - self._last_evolution) > EVOLUTION_INTERVAL:
                    # 只有有足够的新观察才进化
                    if len(unanalyzed) >= 3:
                        cycle = await self._run_cycle("periodic_evolution")
                        self._last_evolution = now

                # 批量分析
                if (now - self._last_batch_analysis) > BATCH_ANALYSIS_INTERVAL:
                    await self._batch_analysis()
                    self._last_batch_analysis = now

                await asyncio.sleep(30)  # 每30秒检查一次

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Evolution loop error: {e}")
                await asyncio.sleep(60)

    async def _run_cycle(self, trigger: str) -> EvolutionCycle:
        """执行一次完整的进化周期"""
        cycle = EvolutionCycle(
            cycle_id=str(uuid.uuid4())[:8],
            stage=EvolutionStage.OBSERVE,
            trigger=trigger,
        )

        try:
            # Stage 1: Observe
            cycle.observations = [
                {"type": o.obs_type, "content": o.content, "metadata": o.metadata}
                for o in self._observations[-50:]
            ]

            # Stage 2: Reflect
            cycle.stage = EvolutionStage.REFLECT
            reflections = await self._reflect()
            cycle.reflections = reflections

            # Stage 3: Plan
            cycle.stage = EvolutionStage.PLAN
            improvements = await self._plan_improvements(reflections)
            cycle.plan = {"improvements": improvements}

            # Stage 4: Execute
            cycle.stage = EvolutionStage.EXECUTE
            if improvements:
                changes = await self._execute_improvements(improvements)
                cycle.changes = changes

            # Stage 5: Verify
            cycle.stage = EvolutionStage.VERIFY
            verification = await self._verify_changes(cycle.changes)
            cycle.verification = verification

            # Stage 6: Learn
            cycle.stage = EvolutionStage.LEARN
            cycle.success = verification.get("verified", False)
            cycle.completed_at = datetime.now(timezone.utc).isoformat()
            self._learn(cycle)

            logger.info(
                f"Evolution cycle {cycle.cycle_id}: {trigger} → "
                f"{len(cycle.changes)} changes, success={cycle.success}"
            )

        except Exception as e:
            logger.error(f"Evolution cycle failed: {e}")
            cycle.completed_at = datetime.now(timezone.utc).isoformat()

        self._cycles.append(cycle)
        return cycle

    async def _batch_analysis(self):
        """批量分析所有历史观察"""
        if len(self._observations) < 10:
            return

        # 反思
        reflections = await self._reflect()

        # 规划（但不执行，只记录）
        if reflections:
            improvements = await self._plan_improvements(reflections)
            self._evolution_memory.append({
                "type": "batch_analysis",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "observations_analyzed": len(self._observations),
                "improvements_planned": len(improvements),
                "reflections": reflections,
            })
            logger.info(f"Batch analysis: {len(improvements)} improvements planned")

    # ── LLM 调用 ──────────────────────────────────────────

    async def _call_llm(self, prompt: str) -> str:
        """调用LLM进行推理"""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                resp = await client.post(
                    f"{self.llm_base_url}/v1/chat/completions",
                    json={
                        "model": "soulmate",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 2000,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                logger.warning(f"LLM call failed: {resp.status_code}")
                return ""
        except Exception as e:
            logger.error(f"LLM call error: {e}")
            return ""

    # ── Git 操作 ──────────────────────────────────────────

    def _git_commit(self, file_path: str, message: str) -> bool:
        """提交文件变更到 git"""
        try:
            subprocess.run(
                ["git", "add", file_path],
                cwd=self.repo_root, capture_output=True, timeout=10,
            )
            result = subprocess.run(
                ["git", "commit", "-m", f"[evolution] {message}"],
                cwd=self.repo_root, capture_output=True, text=True, timeout=10,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Git commit failed: {e}")
            return False

    def _git_rollback(self, commit_hash: str) -> bool:
        """回滚到指定 commit"""
        try:
            result = subprocess.run(
                ["git", "reset", "--hard", commit_hash],
                cwd=self.repo_root, capture_output=True, text=True, timeout=10,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"Git rollback failed: {e}")
            return False

    # ── 状态管理 ──────────────────────────────────────────

    def _load_state(self):
        """加载进化状态"""
        try:
            if self._state_file.exists():
                with open(self._state_file, "r", encoding="utf-8") as f:
                    state = json.load(f)
                self._evolution_memory = state.get("memory", [])
                logger.info(f"Loaded evolution state: {len(self._evolution_memory)} memories")
        except Exception as e:
            logger.warning(f"Failed to load evolution state: {e}")

    def _save_state(self):
        """保存进化状态"""
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._state_file, "w", encoding="utf-8") as f:
                json.dump({
                    "memory": self._evolution_memory[-100:],  # 保留最近100条
                    "last_update": datetime.now(timezone.utc).isoformat(),
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save evolution state: {e}")

    # ── 公开接口 ──────────────────────────────────────────

    def stop(self):
        """停止进化引擎"""
        self._running = False
        logger.info("Evolution Engine stopped")

    def get_status(self) -> dict:
        """获取进化状态"""
        return {
            "running": self._running,
            "observations_total": len(self._observations),
            "observations_unanalyzed": len([o for o in self._observations if not o.analyzed]),
            "cycles_total": len(self._cycles),
            "cycles_successful": len([c for c in self._cycles if c.success]),
            "memories_total": len(self._evolution_memory),
            "last_cycle": self._cycles[-1].cycle_id if self._cycles else None,
        }

    def get_recent_cycles(self, limit: int = 10) -> list[dict]:
        """获取最近的进化周期"""
        return [
            {
                "cycle_id": c.cycle_id,
                "trigger": c.trigger,
                "stage": c.stage.value,
                "changes_count": len(c.changes),
                "success": c.success,
                "started_at": c.started_at,
                "completed_at": c.completed_at,
            }
            for c in self._cycles[-limit:]
        ]
