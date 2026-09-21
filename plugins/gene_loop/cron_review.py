"""gene-loop cron入口 — Hermes定时审核 / 确定性digest

用法（Hermes cron与人工均可调用）:
  python plugins/gene_loop/cron_review.py --digest
      确定性摘要JSON（无时间戳，供cron monitor变更检测）
  python plugins/gene_loop/cron_review.py --run [--reviewer hermes]
      执行审核：自动promote+escalation，输出人话摘要（微信端可读）
  python plugins/gene_loop/cron_review.py --approve gp-xxx --reviewer user
      用户拍板：通过并promote
  python plugins/gene_loop/cron_review.py --reject gp-xxx --reviewer user --reason "..."
      用户拍板：驳回
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[0]))  # 本文件在gene_loop/根：parents[0]=gene_loop/
from schema import connect, migrate  # noqa: E402
from tools import review_queue  # noqa: E402
from tools.promote import promote  # noqa: E402
from tools.review import ESCALATION_PATH, process_queue  # noqa: E402


def digest() -> str:
    """确定性digest：排序+无时间戳——queue/DB未变化时输出逐字节一致。"""
    conn = connect(None)
    migrate(conn)
    try:
        counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) n FROM gene_proposals GROUP BY status")}
        rows = [dict(r) for r in conn.execute(
            "SELECT proposal_id,status,type,governance,confidence "
            "FROM gene_proposals ORDER BY proposal_id")]
    finally:
        conn.close()
    queue = review_queue.load_queue()
    pending = sorted(e["proposal_id"] for e in queue
                     if e.get("reviewed") is None)
    try:
        esc = sorted(e["proposal_id"] for e in
                     json.loads(ESCALATION_PATH.read_text(encoding="utf-8"))
                     if not e.get("resolved"))
    except (FileNotFoundError, json.JSONDecodeError):
        esc = []
    return json.dumps(
        {"counts": counts, "proposals": rows,
         "pending_review": pending, "open_escalations": esc},
        ensure_ascii=False, sort_keys=True)


def run(reviewer: str = "hermes") -> str:
    result = process_queue(reviewer=reviewer)
    lines: list[str] = []
    if not result["promoted"] and not result["escalated"]:
        lines.append("gene-loop审核：无新提案待处理。")
    if result["promoted"]:
        lines.append(f"✅ 已自动入库Gene（{len(result['promoted'])}条）：")
        for p in result["promoted"]:
            lines.append(f"  · {p['proposal_id']}: {p['content'][:80]} → {p['promoted_to']}")
    if result["escalated"]:
        lines.append(f"⚠️ 需要你拍板（{len(result['escalated'])}条）：")
        lines.append("  微信回复指令：通过 gp-xxx / 驳回 gp-xxx 理由")
        for p in result["escalated"]:
            lines.append(f"  · {p['proposal_id']} [{p['why']}]: {p['content'][:80]}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="gene-loop cron/review CLI")
    ap.add_argument("--digest", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--approve", metavar="PROPOSAL_ID")
    ap.add_argument("--reject", metavar="PROPOSAL_ID")
    ap.add_argument("--reviewer", default="user")
    ap.add_argument("--reason", default="")
    args = ap.parse_args()

    if args.digest:
        print(digest())
        return
    if args.approve:
        r = promote(args.approve, reviewer=args.reviewer,
                    reason=args.reason or "用户拍板通过")
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return
    if args.reject:
        conn = connect(None)
        migrate(conn)
        conn.execute(
            "UPDATE gene_proposals SET status='rejected', review_reviewer=?, "
            "review_reason=?, review_at=CAST(strftime('%s','now') AS INTEGER) "
            "WHERE proposal_id=?",
            (args.reviewer, args.reason or "用户驳回", args.reject))
        conn.commit()
        conn.close()
        review_queue.mark_reviewed(args.reject, "rejected", args.reviewer,
                                   args.reason or "用户驳回")
        print(json.dumps({"ok": True, "proposal_id": args.reject,
                          "status": "rejected"}, ensure_ascii=False))
        return
    if args.run:
        print(run(args.reviewer))
        return
    ap.print_help()


if __name__ == "__main__":
    main()
