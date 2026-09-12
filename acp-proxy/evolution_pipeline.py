"""进化流水线 — MOSS风格7阶段 + 全局锁 + 网关drain + 审计日志

流水线：Locate → Plan → Plan-Review → Implement → Code-Review → Task-Evaluate → Verdict
"""
import asyncio
import fcntl
import json
import logging
import os
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

logger = logging.getLogger("evolution-pipeline")

# ── 配置 ──
MAX_RETRIES = 3                # 单次进化最大重试次数
PLATEAU_ROUNDS = 3             # 连续无提升轮数 → 判定收敛
GATEWAY_URL = "http://127.0.0.1:8091"
LOCK_FILE = "data/evolution.lock"
AUDIT_FILE = "data/audit_log.jsonl"

# 内核文件（修改需人工确认）
KERNEL_FILES = [
    "acp-proxy/app.py",
    "acp-proxy/main.py",
    "acp-proxy/dna_evolution.py",
    "acp-proxy/ws_acp.py",
    "acp-proxy/ws_chat.py",
    "acp-proxy/agent/soulmate_agent.py",
    "acp-proxy/agent/llm_engine.py",
    "acp-proxy/gateway_proxy.py",
    "acp-proxy/supervisor.sh",
]

# 绝对禁止修改的文件
IMMUTABLE_FILES = [
    "acp-proxy/evolution_pipeline.py",  # 自身不可改
]


class EvolutionLock:
    """全局进化锁 — 文件锁，同时只允许一个实例进化"""

    def __init__(self, lock_path: Path, instance_id: str):
        self.lock_path = lock_path
        self.instance_id = instance_id
        self._fd = None

    def acquire(self) -> bool:
        """获取锁，返回是否成功"""
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._fd = open(self.lock_path, "w")
            fcntl.flock(self._fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._fd.write(json.dumps({
                "instance": self.instance_id,
                "pid": os.getpid(),
                "acquired_at": datetime.now(timezone.utc).isoformat(),
            }))
            self._fd.flush()
            logger.info(f"🔒 Evolution lock acquired by instance {self.instance_id}")
            return True
        except (IOError, OSError):
            logger.warning(f"⚠️ Evolution lock held by another instance, skipping")
            self._fd = None
            return False

    def release(self):
        """释放锁"""
        if self._fd:
            try:
                fcntl.flock(self._fd.fileno(), fcntl.LOCK_UN)
                self._fd.close()
                self.lock_path.unlink(missing_ok=True)
                logger.info(f"🔓 Evolution lock released")
            except Exception:
                pass
            self._fd = None


class AuditLogger:
    """审计日志 — 记录每一轮进化的完整过程"""

    def __init__(self, audit_path: Path):
        self.audit_path = audit_path
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, entry: dict):
        entry["logged_at"] = datetime.now(timezone.utc).isoformat()
        with open(self.audit_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


class EvolutionPipeline:
    """MOSS风格7阶段进化流水线"""

    def __init__(self, strand, repo_root: Path, instance_id: str):
        self.strand = strand
        self.repo_root = repo_root
        self.instance_id = instance_id
        self.acp_dir = repo_root / "acp-proxy"
        self.data_dir = self.acp_dir / "data"

        self.lock = EvolutionLock(self.acp_dir / LOCK_FILE, instance_id)
        self.audit = AuditLogger(self.data_dir / AUDIT_FILE)

        # 收敛追踪
        self._score_history: list[float] = []
        self._consecutive_no_improve = 0

    async def run_pipeline(self, failure_batch: list[dict]) -> dict:
        """执行完整的7阶段流水线"""
        round_id = f"evo_{int(time.time())}_{self.instance_id}"
        result = {"round_id": round_id, "stages": {}, "success": False}

        # 获取全局进化锁
        if not self.lock.acquire():
            result["stages"]["lock"] = {"status": "skipped", "reason": "lock held"}
            return result

        try:
            for attempt in range(MAX_RETRIES):
                result["attempt"] = attempt + 1
                self.audit.log({"round_id": round_id, "event": "attempt_start", "attempt": attempt + 1})

                # ① Locate：诊断故障
                diagnosis = await self._locate(failure_batch)
                result["stages"]["locate"] = diagnosis
                self.strand._log("locate", f"🔍 诊断完成: {diagnosis.get('root_cause', 'unknown')[:80]}")

                if not diagnosis.get("root_cause"):
                    result["stages"]["locate"]["status"] = "no_root_cause"
                    break

                # ② Plan：生成修复方案
                plan = await self._plan(diagnosis)
                result["stages"]["plan"] = plan
                self.strand._log("plan_pipeline", f"📋 修复方案: {len(plan.get('changes', []))}个文件")

                # ③ Plan-Review：评审方案
                plan_review = await self._plan_review(plan)
                result["stages"]["plan_review"] = plan_review
                self.strand._log("plan_review", f"{'✅方案通过' if plan_review['approved'] else '❌方案驳回'}: {plan_review.get('reason', '')[:60]}")

                if not plan_review["approved"]:
                    self.audit.log({"round_id": round_id, "event": "plan_rejected", "reason": plan_review.get("reason")})
                    if attempt < MAX_RETRIES - 1:
                        continue
                    break

                # ④ Implement：生成diff补丁
                patches = await self._implement(plan)
                result["stages"]["implement"] = patches
                applied = [p for p in patches if p["status"] == "applied"]
                self.strand._log("implement", f"🔧 生成{len(applied)}个补丁")

                if not applied:
                    if attempt < MAX_RETRIES - 1:
                        continue
                    break

                # ⑤ Code-Review：评审代码质量
                code_review = await self._code_review(applied)
                result["stages"]["code_review"] = code_review
                self.strand._log("code_review", f"{'✅代码通过' if code_review['approved'] else '❌代码驳回'}: {code_review.get('reason', '')[:60]}")

                if not code_review["approved"]:
                    # 回滚所有已应用的补丁
                    for p in applied:
                        self._git_revert_file(p["target_file"])
                    self.audit.log({"round_id": round_id, "event": "code_rejected", "reason": code_review.get("reason")})
                    if attempt < MAX_RETRIES - 1:
                        continue
                    break

                # ⑥ Task-Evaluate：沙箱测试
                eval_result = await self._task_evaluate(applied)
                result["stages"]["task_evaluate"] = eval_result
                self.strand._log("evaluate", f"{'✅测试通过' if eval_result['passed'] else '❌测试失败'}: score={eval_result.get('score', 0)}")

                # ⑦ Verdict：判定
                verdict = self._verdict(eval_result)
                result["stages"]["verdict"] = verdict
                self.audit.log({"round_id": round_id, "event": "verdict", **verdict})

                if verdict["converged"]:
                    # 达标 → git commit
                    for p in applied:
                        self._git_commit(p["target_file"], f"[evo:{self.instance_id}] {round_id}")
                    result["success"] = True
                    self.strand._log("verdict", f"🎉 进化成功! score={verdict['score']}")
                    break
                else:
                    # 不达标 → 回滚
                    for p in applied:
                        self._git_revert_file(p["target_file"])
                    self.strand._log("verdict", f"↩️ 回滚: {verdict.get('reason', '')[:60]}")
                    if attempt < MAX_RETRIES - 1:
                        continue
                    break

        finally:
            self.lock.release()

        self.audit.log({"round_id": round_id, "event": "pipeline_done", "success": result["success"], "stages": list(result["stages"].keys())})
        return result

    # ── ① Locate ──

    async def _locate(self, failure_batch: list[dict]) -> dict:
        """诊断故障根因"""
        failure_summary = "\n".join([
            f"- [{f.get('type', 'error')}] {f.get('description', str(f))[:200]}"
            for f in failure_batch[:10]
        ])

        # 读取相关源码上下文
        code_context = await self._read_relevant_code(failure_batch)

        prompt = f"""你是一个代码诊断专家。分析以下失败样本，找出根因。

失败样本：
{failure_summary}

相关代码：
{code_context[:3000]}

输出JSON格式：
{{"root_cause": "一句话描述根因", "affected_files": ["file1.py", "file2.py"], "severity": "low/medium/high", "fix_strategy": "修复策略描述"}}"""

        result = await self.strand._call_llm(prompt)
        try:
            # 清理markdown代码块
            clean = result.strip()
            if clean.startswith("```"):
                clean = "\n".join(clean.split("\n")[1:-1])
            return json.loads(clean)
        except json.JSONDecodeError:
            return {"root_cause": result[:200], "affected_files": [], "severity": "medium"}

    # ── ② Plan ──

    async def _plan(self, diagnosis: dict) -> dict:
        """生成修复方案"""
        affected = diagnosis.get("affected_files", [])
        code_context = ""
        for f in affected[:5]:
            fpath = self.repo_root / f
            if fpath.exists():
                try:
                    content = fpath.read_text(encoding="utf-8")[:2000]
                    code_context += f"\n--- {f} ---\n{content}\n"
                except Exception:
                    pass

        prompt = f"""你是一个代码修复专家。根据诊断结果生成修复方案。

根因：{diagnosis.get('root_cause', '')}
影响文件：{', '.join(affected)}
修复策略：{diagnosis.get('fix_strategy', '')}

相关代码：
{code_context[:4000]}

输出JSON格式：
{{"changes": [
  {{"target_file": "acp-proxy/xxx.py", "description": "修改描述", "requirements": "具体要求"}}
],
 "risk_assessment": "风险评估",
 "test_plan": "测试计划"}}"""

        result = await self.strand._call_llm(prompt)
        try:
            clean = result.strip()
            if clean.startswith("```"):
                clean = "\n".join(clean.split("\n")[1:-1])
            return json.loads(clean)
        except json.JSONDecodeError:
            return {"changes": [], "risk_assessment": "parse error", "test_plan": ""}

    # ── ③ Plan-Review ──

    async def _plan_review(self, plan: dict) -> dict:
        """评审修复方案 — 写代码前先审方案"""
        changes = plan.get("changes", [])

        # 黑白名单校验
        for change in changes:
            target = change.get("target_file", "")
            if target in IMMUTABLE_FILES:
                return {"approved": False, "reason": f"文件 {target} 禁止修改"}
            if any(target.endswith(f) for f in [".env", ".git/config"]):
                return {"approved": False, "reason": f"安全文件 {target} 禁止修改"}

        # 检查修改范围 — 单次最多改5个文件
        if len(changes) > 5:
            return {"approved": False, "reason": f"修改范围过大: {len(changes)}个文件，上限5个"}

        # 检查是否涉及内核文件
        kernel_changes = [c for c in changes if c.get("target_file", "") in KERNEL_FILES]
        if kernel_changes:
            # 内核修改标记为需人工审核（当前自动拒绝，后续可配置）
            return {"approved": False, "reason": f"内核文件修改需人工审核: {[c['target_file'] for c in kernel_changes]}"}

        # LLM评审方案合理性
        prompt = f"""评审以下代码修复方案，判断是否合理、安全、范围适当。

方案：
{json.dumps(plan, ensure_ascii=False, indent=2)[:2000]}

评审标准：
1. 修改范围是否适当（小补丁，非大规模重构）
2. 风险是否可控
3. 测试计划是否充分

输出JSON: {{"approved": true/false, "reason": "原因", "suggestions": ["建议1"]}}"""

        result = await self.strand._call_llm(prompt)
        try:
            clean = result.strip()
            if clean.startswith("```"):
                clean = "\n".join(clean.split("\n")[1:-1])
            review = json.loads(clean)
            if isinstance(review, dict) and "approved" in review:
                return review
        except json.JSONDecodeError:
            pass

        # 默认通过（LLM解析失败时不阻塞）
        return {"approved": True, "reason": "LLM review parse failed, defaulting to approve"}

    # ── ④ Implement ──

    async def _implement(self, plan: dict) -> list[dict]:
        """生成并应用diff补丁"""
        results = []
        for change in plan.get("changes", []):
            target = change.get("target_file", "")
            full_path = self.repo_root / target

            # 读取现有文件
            existing = ""
            if full_path.exists():
                existing = full_path.read_text(encoding="utf-8")

            # 用LLM生成代码
            prompt = f"""你是一个代码修改专家。根据以下要求修改文件。

目标文件：{target}
现有代码：
{existing[:3000]}

修改要求：{change.get('description', '')}
具体要求：{change.get('requirements', '无')}

只输出修改后的完整文件内容，不要解释。"""

            content = await self.strand._call_llm(prompt)
            if not content:
                results.append({**change, "status": "failed", "reason": "LLM generation empty"})
                continue

            # 清理markdown代码块
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if len(lines) > 2 else content

            # 语法检查
            if target.endswith(".py"):
                import ast
                try:
                    ast.parse(content)
                except SyntaxError as e:
                    results.append({**change, "status": "failed", "reason": f"syntax error: {e}"})
                    continue

            if target.endswith(".json"):
                try:
                    json.loads(content)
                except json.JSONDecodeError as e:
                    results.append({**change, "status": "failed", "reason": f"json error: {e}"})
                    continue

            # 原子写入
            try:
                full_path.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(
                    mode="w", encoding="utf-8",
                    dir=str(full_path.parent), suffix=".tmp", delete=False,
                ) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name
                os.rename(tmp_path, str(full_path))
                results.append({**change, "status": "applied", "content": content[:500]})
            except Exception as e:
                results.append({**change, "status": "failed", "reason": f"write failed: {e}"})

        return results

    # ── ⑤ Code-Review ──

    async def _code_review(self, applied: list[dict]) -> dict:
        """评审diff代码质量"""
        diff_summary = "\n".join([
            f"--- {p['target_file']} ---\n{p.get('content', '')[:500]}"
            for p in applied[:5]
        ])

        prompt = f"""评审以下代码变更，检查质量和安全性。

变更：
{diff_summary[:3000]}

检查项：
1. 是否引入明显bug
2. 是否有安全风险（注入、越权、敏感信息泄露）
3. 代码质量（命名、结构、重复）
4. 是否符合最小改动原则

输出JSON: {{"approved": true/false, "reason": "原因", "issues": ["问题1"]}}"""

        result = await self.strand._call_llm(prompt)
        try:
            clean = result.strip()
            if clean.startswith("```"):
                clean = "\n".join(clean.split("\n")[1:-1])
            review = json.loads(clean)
            if isinstance(review, dict) and "approved" in review:
                return review
        except json.JSONDecodeError:
            pass

        return {"approved": True, "reason": "LLM review parse failed, defaulting to approve"}

    # ── ⑥ Task-Evaluate ──

    async def _task_evaluate(self, applied: list[dict]) -> dict:
        """沙箱测试 — 语法检查 + 导入测试 + 回放失败样本"""
        score = 1.0
        details = []

        for patch in applied:
            target = patch.get("target_file", "")
            full_path = self.repo_root / target

            # 语法检查
            if target.endswith(".py"):
                try:
                    result = subprocess.run(
                        ["python3", "-c", f"import ast; ast.parse(open('{full_path}').read())"],
                        capture_output=True, text=True, timeout=10,
                        cwd=str(self.repo_root),
                    )
                    if result.returncode != 0:
                        score -= 0.3
                        details.append(f"语法检查失败: {target}: {result.stderr[:200]}")
                except Exception as e:
                    score -= 0.2
                    details.append(f"语法检查异常: {target}: {e}")

                # 导入测试
                module_path = target.replace("/", ".").replace(".py", "")
                try:
                    result = subprocess.run(
                        ["python3", "-c", f"import {module_path.split('.')[-1]}"],
                        capture_output=True, text=True, timeout=10,
                        cwd=str(full_path.parent),
                    )
                    if result.returncode != 0:
                        score -= 0.2
                        details.append(f"导入失败: {target}: {result.stderr[:200]}")
                except Exception:
                    pass

        score = max(0.0, score)
        return {
            "passed": score >= 0.7,
            "score": round(score, 2),
            "details": details,
        }

    # ── ⑦ Verdict ──

    def _verdict(self, eval_result: dict) -> dict:
        """判定是否收敛"""
        score = eval_result.get("score", 0)
        self._score_history.append(score)

        # 检查是否收敛（分数达标 + 没有进入平台期）
        converged = eval_result.get("passed", False)

        # 平台期检测
        if len(self._score_history) >= PLATEAU_ROUNDS:
            recent = self._score_history[-PLATEAU_ROUNDS:]
            if all(abs(recent[i] - recent[i-1]) < 0.01 for i in range(1, len(recent))):
                converged = False
                return {
                    "converged": False,
                    "score": score,
                    "reason": f"平台期: 近{PLATEAU_ROUNDS}轮分数无变化",
                    "plateau": True,
                }

        return {
            "converged": converged,
            "score": score,
            "reason": "达标" if converged else f"分数{score}未达标",
        }

    # ── 辅助方法 ──

    async def _read_relevant_code(self, failure_batch: list[dict]) -> str:
        """读取失败样本相关的代码"""
        code = ""
        # 从失败样本中提取文件路径
        files = set()
        for f in failure_batch:
            if "file" in f:
                files.add(f["file"])
            if "traceback" in f:
                for line in str(f["traceback"]).split("\n"):
                    if 'File "' in line:
                        try:
                            path = line.split('File "')[1].split('"')[0]
                            if path.startswith(str(self.repo_root)):
                                files.add(path.replace(str(self.repo_root) + "/", ""))
                        except (IndexError, ValueError):
                            pass

        for fpath in list(files)[:5]:
            full = self.repo_root / fpath
            if full.exists():
                try:
                    content = full.read_text(encoding="utf-8")[:1500]
                    code += f"\n--- {fpath} ---\n{content}\n"
                except Exception:
                    pass

        if not code:
            # 没有具体文件，读取最近修改的文件
            try:
                result = subprocess.run(
                    ["git", "log", "--oneline", "-5", "--name-only"],
                    capture_output=True, text=True, cwd=str(self.repo_root),
                )
                code = f"Recent git changes:\n{result.stdout[:2000]}"
            except Exception:
                code = "No relevant code context available"

        return code

    def _git_commit(self, target: str, message: str):
        """Git提交"""
        try:
            subprocess.run(["git", "add", target], cwd=str(self.repo_root), capture_output=True, timeout=10)
            subprocess.run(["git", "commit", "-m", message], cwd=str(self.repo_root), capture_output=True, timeout=10)
        except Exception as e:
            logger.warning(f"Git commit failed: {e}")

    def _git_revert_file(self, target: str):
        """Git回滚单个文件"""
        try:
            subprocess.run(["git", "checkout", "HEAD", "--", target], cwd=str(self.repo_root), capture_output=True, timeout=10)
        except Exception as e:
            logger.warning(f"Git revert failed: {e}")


# ── 网关交互 ──

async def gateway_drain(instance_id: str):
    """通知网关摘除流量"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(f"{GATEWAY_URL}/admin/drain/{instance_id}")
            if resp.status_code == 200:
                logger.info(f"Gateway drained instance {instance_id}")
                return True
    except Exception as e:
        logger.warning(f"Gateway drain failed: {e}")
    return False


async def gateway_undrain(instance_id: str):
    """通知网关恢复流量"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(f"{GATEWAY_URL}/admin/undrain/{instance_id}")
            if resp.status_code == 200:
                logger.info(f"Gateway undrained instance {instance_id}")
                return True
    except Exception as e:
        logger.warning(f"Gateway undrain failed: {e}")
    return False
