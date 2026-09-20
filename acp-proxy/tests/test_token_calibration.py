"""d439f163遗留#3：estimate_tokens公式校准闭环 — acp-proxy侧测试。

镜像契约：opensoul/tests/test_token_calibration.py以相同的字面量断言同一公式/同一
校准值（两侧compute_calibration与build_context_usage(calibration_factor=...)输出
必须一致——镜像关系见agent/token_attribution.py模块docstring）。

覆盖：
1. compute_calibration：样本不足fail-safe / 正常3样本 / 无效样本剔除 / 夹限
2. build_context_usage：calibrated_*字段（raw字段不动）/ 默认factor=1.0 / hard_limit
3. AttributionLedger.get_stats：summary["calibration"]从账本backfill行配对计算
4. AttributionLedger.calibration_factor：未校准1.0 / 已校准取factor / TTL缓存+force_refresh
5. ContextBudgetManager.manage（P0静默死路径修复的行为验证）：
   预算内不裁剪 / 超预算丢最旧 / system+最后一条必保留 / 校准因子收紧裁剪 / 空输入
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.context_budget import ContextBudgetManager  # noqa: E402
from agent.token_attribution import (  # noqa: E402
    AttributionLedger,
    ContextItem,
    build_context_usage,
    compute_calibration,
    estimate_tokens,
)

# 镜像值（两侧测试断言同一组数字）：
# pairs: est 3528+1000+2000=6528, actual 3787+1200+2100=7087
# raw_factor=7087/6528=1.085631...→round4=1.0856; avg_gap=(7087-6528)//3=186
MIRROR_PAIRS = [
    {"estimated": 3528, "actual": 3787},
    {"estimated": 1000, "actual": 1200},
    {"estimated": 2000, "actual": 2100},
]
MIRROR_FACTOR = 1.0856
MIRROR_AVG_GAP = 186


class TestComputeCalibration:
    def test_insufficient_samples_fail_safe(self):
        cal = compute_calibration(MIRROR_PAIRS[:2])
        assert cal["sample_count"] == 2
        assert cal["calibrated"] is False
        assert cal["factor"] == 1.0
        assert cal["avg_estimate_gap"] == (3787 - 3528 + 1200 - 1000) // 2

    def test_no_samples(self):
        cal = compute_calibration([])
        assert cal == {"sample_count": 0, "calibrated": False,
                       "factor": 1.0, "avg_estimate_gap": None}

    def test_mirror_values_three_samples(self):
        cal = compute_calibration(MIRROR_PAIRS)
        assert cal["sample_count"] == 3
        assert cal["calibrated"] is True
        assert cal["factor"] == MIRROR_FACTOR
        assert cal["raw_factor"] == MIRROR_FACTOR
        assert cal["avg_estimate_gap"] == MIRROR_AVG_GAP
        assert cal["sum_estimated"] == 6528
        assert cal["sum_actual"] == 7087

    def test_invalid_pairs_excluded(self):
        pairs = MIRROR_PAIRS + [
            {"estimated": 0, "actual": 100},      # estimated≤0剔除
            {"estimated": 500, "actual": None},   # actual为None剔除
            None,                                   # 脏行剔除
        ]
        cal = compute_calibration(pairs)
        assert cal["sample_count"] == 3
        assert cal["factor"] == MIRROR_FACTOR

    def test_factor_clamped_bounds(self):
        low = [{"estimated": 1000, "actual": 10}] * 3    # raw=0.01 → clamp 0.5
        cal = compute_calibration(low)
        assert cal["calibrated"] is True
        assert cal["factor"] == 0.5
        assert cal["raw_factor"] == 0.01
        high = [{"estimated": 100, "actual": 10000}] * 3  # raw=100 → clamp 4.0
        cal2 = compute_calibration(high)
        assert cal2["factor"] == 4.0


def _items():
    return [
        ContextItem(kind="system_prompt", name="sys", source="s", tokens=3000),
        ContextItem(kind="message", name="conv", source="session", tokens=2400),
    ]


class TestBuildContextUsageCalibration:
    def test_raw_fields_untouched_calibrated_parallel(self):
        u = build_context_usage(_items(), max_tokens=10000,
                                compaction_tokens=6000, calibration_factor=1.2)
        # raw侧不变
        assert u["total_tokens"] == 5400
        assert u["percentage"] == 54.0
        assert u["over_limit"] is None
        # 校准侧：5400*1.2=6480 > 6000 → compaction_window
        assert u["calibration_factor"] == 1.2
        assert u["calibrated_total_tokens"] == 6480
        assert u["calibrated_percentage"] == 64.8
        assert u["calibrated_over_limit"] == {
            "tokens_over": 480, "kind": "compaction_window"}

    def test_calibrated_hard_limit(self):
        u = build_context_usage(_items(), max_tokens=10000,
                                compaction_tokens=6000, calibration_factor=2.0)
        assert u["over_limit"] is None  # raw 5400 未超限
        assert u["calibrated_total_tokens"] == 10800
        assert u["calibrated_over_limit"] == {
            "tokens_over": 800, "kind": "hard_limit"}

    def test_default_factor_schema_stable(self):
        u = build_context_usage(_items(), max_tokens=10000,
                                compaction_tokens=6000)
        assert u["calibration_factor"] == 1.0
        assert u["calibrated_total_tokens"] == u["total_tokens"]
        assert u["calibrated_over_limit"] == u["over_limit"]


def _write_ledger(d: Path, triples):
    """写入合成账本：每对(estimated, actual) → 一条record + 一条backfill行。"""
    d.mkdir(parents=True, exist_ok=True)
    p = d / "attribution_ledger.jsonl"
    with open(p, "w", encoding="utf-8") as f:
        for i, (est, act) in enumerate(triples):
            f.write(json.dumps({
                "ts": 1000.0 + i, "session_id": f"s{i}", "model": "m",
                "usage": {"total_tokens": est, "over_limit": None},
            }) + "\n")
            f.write(json.dumps({
                "backfill": True, "ts": 2000.0 + i, "session_id": f"s{i}",
                "actual_prompt_tokens": act, "estimate_gap": act - est,
            }) + "\n")
    return d


class TestLedgerCalibration:
    def test_stats_summary_calibration(self, tmp_path):
        _write_ledger(tmp_path / "led", [(3528, 3787), (1000, 1200), (2000, 2100)])
        s = AttributionLedger(ledger_dir=str(tmp_path / "led")).get_stats()["summary"]
        cal = s["calibration"]
        assert cal["calibrated"] is True
        assert cal["sample_count"] == 3
        assert cal["factor"] == MIRROR_FACTOR

    def test_calibration_factor_uncalibrated_returns_1(self, tmp_path):
        _write_ledger(tmp_path / "led2", [(3528, 3787)])  # 1样本 < MIN=3
        led = AttributionLedger(ledger_dir=str(tmp_path / "led2"))
        assert led.calibration_factor() == 1.0

    def test_calibration_factor_ttl_cache_and_force_refresh(self, tmp_path):
        d = tmp_path / "led3"
        _write_ledger(d, [(3528, 3787), (1000, 1200), (2000, 2100)])
        led = AttributionLedger(ledger_dir=str(d))
        f1 = led.calibration_factor()
        assert f1 == MIRROR_FACTOR
        # 账本被改写成完全不同的样本：TTL缓存内返回旧值
        _write_ledger(d, [(1000, 2000)] * 3)  # factor=2.0
        assert led.calibration_factor() == f1  # 缓存命中，不重读
        assert led.calibration_factor(force_refresh=True) == 2.0

    def test_production_ledger_shape(self):
        """生产账本真实数据回读（存在时）：calibration字段形状正确、factor被夹限。"""
        import os
        prod = Path.home() / ".hermes" / "soulmate" / "token_attribution"
        if not (prod / "attribution_ledger.jsonl").exists():
            return  # 生产账本不存在时跳过（CI环境）
        s = AttributionLedger().get_stats()["summary"]
        cal = s.get("calibration") or {}
        assert "sample_count" in cal and "calibrated" in cal and "factor" in cal
        lo, hi = 0.5, 4.0
        assert lo <= cal["factor"] <= hi


class _Msg(dict):
    pass


def _mk_msgs(n, tokens_each_content):
    return [_Msg(role="user", content=tokens_each_content) for _ in range(n)]


class TestContextBudgetManage:
    """P0静默死路径修复的行为验证：manage()真实存在且按校准估算裁剪。"""

    def test_manage_method_exists(self):
        m = ContextBudgetManager()
        assert hasattr(m, "manage") and callable(m.manage)
        assert m.calibration_factor == 1.0

    def test_under_budget_returns_copy(self):
        mgr = ContextBudgetManager()
        msgs = _mk_msgs(5, "x" * 400)  # 每条canonical估算=100 tokens
        out = mgr.manage(msgs, max_tokens=1000)
        assert out == msgs and out is not msgs
        assert mgr._compression_count == 0  # 未裁剪不计数

    def test_over_budget_drops_oldest_keeps_last(self):
        mgr = ContextBudgetManager()
        msgs = _mk_msgs(25, "x" * 400)  # 25×100=2500 > 1000
        out = mgr.manage(msgs, max_tokens=1000)
        # last必保留(100) + 从次新往旧加9条(9×100) → 共10条 = msgs[15:25]
        assert len(out) == 10
        assert out[-1] is msgs[-1]
        assert out[0] is msgs[15]
        assert mgr._compression_count == 1

    def test_system_and_last_always_kept(self):
        mgr = ContextBudgetManager()
        msgs = _mk_msgs(25, "x" * 400)
        msgs[0] = _Msg(role="system", content="x" * 400)
        out = mgr.manage(msgs, max_tokens=200)  # 只够system+last
        assert len(out) == 2
        assert out[0] is msgs[0] and out[1] is msgs[-1]

    def test_calibration_factor_tightens_trimming(self):
        mgr = ContextBudgetManager()
        msgs = _mk_msgs(25, "x" * 400)
        baseline = mgr.manage(msgs, max_tokens=1000)
        mgr2 = ContextBudgetManager()
        mgr2.calibration_factor = 2.0  # provider视角估算×2 → 提前裁剪
        calibrated = mgr2.manage(msgs, max_tokens=1000)
        assert len(calibrated) < len(baseline)
        # factor=2.0：每条校准后200；last 200 + 4×200=1000 → 5条
        assert len(calibrated) == 5
        assert calibrated[-1] is msgs[-1]

    def test_canonical_estimator_used(self):
        """manage用canonical estimate_tokens（CJK 1token/字），非ManagedMessage的len//2。"""
        mgr = ContextBudgetManager()
        msgs = [_Msg(role="user", content="好" * 100) for _ in range(11)]
        assert estimate_tokens(msgs[0]["content"]) == 100  # canonical公式
        # len//2旧公式会算成50/条（总量550不触发裁剪）；canonical=100/条=1100>1000触发
        out = mgr.manage(msgs, max_tokens=1000)
        assert len(out) == 10  # last 100 + 9×100 = 1000
        assert out[-1] is msgs[-1]

    def test_empty_input(self):
        assert ContextBudgetManager().manage([], max_tokens=1000) == []
