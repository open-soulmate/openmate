#!/usr/bin/env python3
"""DNA Strand Runner - 独立进程运行单条进化链"""
import asyncio
import signal
import sys
import os
import json
import glob
import subprocess
import logging
import argparse
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("strand-runner")

shutdown_event = asyncio.Event()


def handle_signal(sig, frame):
    logger.info(f"Received signal {sig}, shutting down...")
    shutdown_event.set()

# ── 可配置周期参数 ──────────────────────────────────
OBSERVE_INTERVAL = 120  # 自省/观察频率（秒），可通过API动态修改


async def self_observe(strand, loop_interval):
    """自观察：每loop_interval秒扫描系统状态，生成观察数据注入进化引擎"""
    import dna_strand_runner as _self
    while True:
        # 每次循环读取最新配置（支持API动态修改）
        await asyncio.sleep(_self.OBSERVE_INTERVAL)
        try:
            repo_root = Path(__file__).parent.parent.parent
            acp_dir = repo_root / "acp-proxy"

            # 观察1: 文件数量变化
            py_files = list(acp_dir.rglob("*.py"))
            ts_files = list((repo_root / "src").rglob("*.ts")) if (repo_root / "src").exists() else []
            strand.observe("self_scan", f"System scan: {len(py_files)} Python files, {len(ts_files)} TypeScript files in project")

            # 观察2: 技能目录状态
            skills_dir = acp_dir / "skills"
            if skills_dir.exists():
                skill_files = list(skills_dir.glob("*.json"))
                strand.observe("self_scan", f"Skills directory has {len(skill_files)} registered skills: {[f.stem for f in skill_files]}")

            # 观察3: 最近git变更
            try:
                result = subprocess.run(["git", "log", "--oneline", "-5"], capture_output=True, text=True, cwd=str(acp_dir))
                if result.returncode == 0 and result.stdout.strip():
                    strand.observe("self_scan", f"Recent git changes:\n{result.stdout.strip()}")
            except Exception:
                pass

            # 观察4: 项目结构感知
            try:
                main_files = []
                for f in acp_dir.glob("*.py"):
                    if f.stat().st_size > 500:
                        main_files.append(f"{f.name} ({f.stat().st_size} bytes)")
                strand.observe("self_scan", f"Core modules: {', '.join(main_files[:10])}")
            except Exception:
                pass

            # 观察5: 进化引擎自身的状态自省
            status = strand.get_status()
            strand.observe("self_introspect", f"My status: cycle_count={status['cycle_count']}, memories={status['memories']}, observations_unanalyzed={status['observations_unanalyzed']}")

        except Exception as e:
            logger.warning(f"[{strand.strand_id}] Self-observe error: {e}")


async def run_strand(strand_id: str, strategy: str):
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info(f"Starting {strand_id} strand ({strategy})")

    # PID文件
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)
    pid_file = data_dir / f"dna_{strand_id}.pid"
    pid_file.write_text(str(os.getpid()))

    # 创建strand
    from dna_evolution import DNAStrand, StrandRole
    strand = DNAStrand(
        strand_id=strand_id,
        role=StrandRole.PRIMARY if strand_id == "strand_a" else StrandRole.SHADOW,
        repo_root=str(Path(__file__).parent.parent),
        llm_base_url="https://token-plan-cn.xiaomimimo.com/v1",
        strategy=strategy,
        llm_api_key=os.environ.get("MIMO_API_KEY", ""),
        llm_model="xiaomi/mimo-v2.5-pro",
    )

    partner_id = "strand_b" if strand_id == "strand_a" else "strand_a"

    try:
        # 启动进化循环
        evo_task = asyncio.create_task(strand.run(partner_id))

        # 启动自观察循环（使用OBSERVE_INTERVAL，可通过API动态修改）
        observe_task = asyncio.create_task(self_observe(strand, OBSERVE_INTERVAL))

        # 等待关闭信号
        await shutdown_event.wait()

        strand.stop()
        evo_task.cancel()
        observe_task.cancel()
        for t in [evo_task, observe_task]:
            try:
                await t
            except asyncio.CancelledError:
                pass

    except Exception as e:
        logger.error(f"[{strand_id}] Fatal error: {e}", exc_info=True)
    finally:
        if pid_file.exists():
            pid_file.unlink()
        logger.info(f"[{strand_id}] Strand stopped")


def main():
    parser = argparse.ArgumentParser(description="DNA Strand Runner")
    parser.add_argument("--strand", required=True, choices=["strand_a", "strand_b"])
    parser.add_argument("--strategy", required=True, choices=["conservative", "aggressive"])
    args = parser.parse_args()

    asyncio.run(run_strand(args.strand, args.strategy))


if __name__ == "__main__":
    main()
