"""进化引擎 REST API — 支持DNA双螺旋架构

路由前缀: /api/evolution
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

router = APIRouter(prefix="/api/evolution", tags=["evolution"])

# DNAEvolutionEngine 实例由 app.py 注入
_engine = None


def set_engine(engine):
    global _engine
    _engine = engine


def get_engine():
    return _engine


@router.get("/status")
async def evolution_status():
    """获取DNA双螺旋进化引擎状态"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    
    # 从心跳文件读取实时strand状态
    import json as _json
    import time as _time
    from pathlib import Path as _Path
    data_root = _Path(engine.repo_root) / "acp-proxy" / "data"
    now_ts = _time.time()
    
    # 先读所有心跳
    heartbeats = {}
    for sid in ["strand_a", "strand_b"]:
        hb_file = data_root / f"dna_heartbeat_{sid}.json"
        if hb_file.exists():
            try:
                heartbeats[sid] = _json.loads(hb_file.read_text())
            except Exception:
                pass
    
    # 更新strand状态
    for strand, sid in [(engine.strand_a, "strand_a"), (engine.strand_b, "strand_b")]:
        hb = heartbeats.get(sid)
        if hb:
            elapsed = now_ts - hb.get("timestamp", 0)
            strand._running = elapsed < 120  # 120秒内有心跳=运行中
            strand._cycle_count = hb.get("cycle_count", strand._cycle_count)
        
        # partner_alive: 检查对方心跳是否在60秒内
        partner_id = "strand_b" if sid == "strand_a" else "strand_a"
        partner_hb = heartbeats.get(partner_id)
        if partner_hb:
            partner_elapsed = now_ts - partner_hb.get("timestamp", 0)
            strand._partner_alive = partner_elapsed < 60
            strand._partner_cycle_count = partner_hb.get("cycle_count", 0)
        else:
            strand._partner_alive = False
    
    return engine.get_status()


@router.get("/strands")
async def evolution_strands():
    """获取两条进化链的详细状态"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {
        "strand_a": engine.strand_a.get_status(),
        "strand_b": engine.strand_b.get_status(),
    }


@router.post("/observe")
async def observe(request: dict):
    """手动注入观察数据（同时注入两条链）"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    obs_type = request.get("type", "manual")
    content = request.get("content", "")
    metadata = request.get("metadata", {})

    engine.observe(obs_type, content, metadata)
    return {"ok": True, "message": "Observation injected to both strands"}


@router.post("/trigger")
async def trigger_evolution():
    """手动触发一次进化周期（在两条链上同时触发）"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    # 触发两条链的进化
    import asyncio
    results = await asyncio.gather(
        engine.strand_a._evolve(),
        engine.strand_b._evolve(),
        return_exceptions=True,
    )

    return {
        "ok": True,
        "strand_a_result": "success" if results[0] is None else str(results[0]),
        "strand_b_result": "success" if results[1] is None else str(results[1]),
    }


@router.get("/checkpoint")
async def get_checkpoint():
    """获取共享检查点（成功的进化经验）"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    checkpoint_file = Path(engine.repo_root) / "acp-proxy" / "data" / "dna_checkpoint.json"
    if checkpoint_file.exists():
        import json
        with open(checkpoint_file, "r") as f:
            return json.load(f)
    return {"message": "No checkpoint yet"}


@router.get("/results")
async def get_results(limit: int = 10):
    """获取最近的进化结果"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {"results": engine.get_recent_results(limit)}


@router.get("/skills")
async def get_created_skills():
    """获取进化引擎创建的技能列表"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {"skills": engine.get_created_skills()}


@router.get("/memory")
async def get_memory():
    """获取进化引擎的学习记忆"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {
        "strand_a_memories": engine.strand_a._memory[-10:],
        "strand_b_memories": engine.strand_b._memory[-10:],
    }


@router.get("/dashboard")
async def get_dashboard():
    """获取进化引擎仪表盘数据"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    import json
    from pathlib import Path

    # 检查点
    checkpoint_file = Path(engine.repo_root) / "acp-proxy" / "data" / "dna_checkpoint.json"
    checkpoint = None
    if checkpoint_file.exists():
        try:
            with open(checkpoint_file, "r") as f:
                checkpoint = json.load(f)
        except Exception:
            pass

    return {
        "status": engine.get_status(),
        "recent_results": engine.get_recent_results(5),
        "created_skills": engine.get_created_skills(),
        "checkpoint": checkpoint,
        "strand_a_memories": len(engine.strand_a._memory),
        "strand_b_memories": len(engine.strand_b._memory),
        "quality": engine.get_evolution_quality(),
    }


@router.get("/history")
async def get_history(limit: int = 50):
    """获取进化历史（最近N个周期）"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {"history": engine.get_history(limit)}


@router.get("/goals")
async def get_goals():
    """获取进化目标列表"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    return {"goals": engine.get_goals()}


class AddGoalRequest(BaseModel):
    title: str
    description: str
    priority: str = "medium"


@router.post("/goals")
async def add_goal(req: AddGoalRequest):
    """添加新的进化目标"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    goal = engine.add_goal(req.title, req.description, req.priority)
    return {"ok": True, "goal": goal}


class UpdateGoalRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    progress: float | None = None


@router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, req: UpdateGoalRequest):
    """更新进化目标"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    result = engine.update_goal(goal_id, updates)
    if not result:
        return {"error": "Goal not found"}
    return {"ok": True, "goal": result}


@router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str):
    """删除进化目标"""
    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}
    engine.delete_goal(goal_id)
    return {"ok": True}


@router.get("/stream")
async def evolution_log_stream(lines: int = 100):
    """SSE实时日志流 — 类似 tail -f"""
    from fastapi.responses import StreamingResponse
    from pathlib import Path
    import asyncio
    import json as _json

    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    data_dir = Path(engine.repo_root) / "acp-proxy" / "data"
    log_files = sorted(data_dir.glob("dna_log_*.jsonl"))

    async def stream_generator():
        # 先发送最近N条历史日志
        for lf in log_files:
            try:
                all_lines = lf.read_text().strip().split("\n")
                for line in all_lines[-lines:]:
                    if line.strip():
                        yield f"data: {line}\n\n"
            except Exception:
                pass

        # 然后持续tail新日志
        sent_counts = {lf.name: 0 for lf in log_files}
        for lf in log_files:
            try:
                sent_counts[lf.name] = len(lf.read_text().strip().split("\n"))
            except Exception:
                pass

        while True:
            await asyncio.sleep(1)
            for lf in log_files:
                try:
                    all_lines = lf.read_text().strip().split("\n")
                    current_count = len(all_lines)
                    if current_count > sent_counts.get(lf.name, 0):
                        for line in all_lines[sent_counts[lf.name]:]:
                            if line.strip():
                                yield f"data: {line}\n\n"
                        sent_counts[lf.name] = current_count
                except Exception:
                    pass

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/timeline")
async def get_timeline(days: int = 7):
    """获取进化时间线数据 — 按进化周期聚合为甘特图任务"""
    import json as _json
    from datetime import datetime, timedelta, timezone

    engine = get_engine()
    if not engine:
        return {"error": "Evolution engine not initialized"}

    data_dir = Path(engine.repo_root) / "acp-proxy" / "data"
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # 读取两条链的日志
    all_entries = []
    for lf in sorted(data_dir.glob("dna_log_*.jsonl")):
        try:
            for line in lf.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                entry = _json.loads(line)
                ts = datetime.fromisoformat(entry["ts"])
                if ts >= cutoff:
                    all_entries.append(entry)
        except Exception:
            pass

    all_entries.sort(key=lambda e: e["ts"])

    # 按 cycle 分组为进化任务
    tasks = {}
    for entry in all_entries:
        cycle = entry.get("cycle", 0)
        strand = entry.get("strand", "unknown")
        task_key = f"{strand}_cycle_{cycle}"
        if task_key not in tasks:
            tasks[task_key] = {
                "taskId": task_key,
                "strand": strand,
                "cycle": cycle,
                "startTime": entry["ts"],
                "endTime": None,
                "status": "running",
                "steps": [],
                "summary": "",
            }
        task = tasks[task_key]
        task["endTime"] = entry["ts"]

        stage = entry.get("stage", "")
        msg = entry.get("msg", "")
        details = entry.get("details", {})

        task["steps"].append({
            "stage": stage,
            "ts": entry["ts"],
            "msg": msg[:200],
            "details": {k: str(v)[:100] for k, v in (details or {}).items()},
        })

        # 推断状态
        if stage == "verdict":
            verdict = details.get("verdict", "") if details else ""
            if verdict == "success" or "success" in str(verdict).lower():
                task["status"] = "success"
            elif verdict == "failed" or "fail" in str(verdict).lower():
                task["status"] = "error"
            else:
                task["status"] = "success"
        elif stage == "error":
            task["status"] = "error"

        # 生成摘要
        if stage == "turn" and not task["summary"]:
            task["summary"] = msg[:100]
        elif stage == "plan" and msg:
            task["summary"] = msg[:100]

    task_list = sorted(tasks.values(), key=lambda t: t["startTime"])

    # 读取目标
    goals = []
    goals_file = data_dir / "dna_goals.json"
    if goals_file.exists():
        try:
            goals = _json.loads(goals_file.read_text())
        except Exception:
            pass

    return {
        "tasks": task_list,
        "goals": goals,
        "totalTasks": len(task_list),
        "successCount": sum(1 for t in task_list if t["status"] == "success"),
        "errorCount": sum(1 for t in task_list if t["status"] == "error"),
    }


# ── 进化间隔配置 ──────────────────────────────────────

@router.get("/config")
async def get_evolution_config():
    """获取进化引擎配置"""
    import dna_evolution
    return {
        "evolution_interval": dna_evolution.EVOLUTION_INTERVAL,
        "heartbeat_interval": dna_evolution.HEARTBEAT_INTERVAL,
        "heartbeat_timeout": dna_evolution.HEARTBEAT_TIMEOUT,
    }


class UpdateConfigRequest(BaseModel):
    evolution_interval: Optional[int] = None


@router.post("/config")
async def update_evolution_config(req: UpdateConfigRequest):
    """动态修改进化引擎配置"""
    import dna_evolution
    changes = {}
    if req.evolution_interval is not None:
        if req.evolution_interval < 1800:
            return {"error": "进化间隔不能小于30分钟（1800秒）"}
        dna_evolution.EVOLUTION_INTERVAL = req.evolution_interval
        changes["evolution_interval"] = req.evolution_interval
    return {"ok": True, "changes": changes}
