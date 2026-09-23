"""
kilocode supplement3 #17（overflow.ts reserved buffer + 输入限额优先）行为验证。

覆盖：
1. reserved_tokens：默认min(20k,最大输出)/显式预留优先（含0）
2. max_output_tokens：min(limits) || cap回退（JS `||` 对0回退语义）
3. usable_input：context=0→0 / **输入限额优先**（input分支只减reserved）/
   单窗口分支减全量输出（两分支减法对象不同的不对称语义）/ 负值钳0
4. model_history_target：默认env推导 / 输入限额优先端到端 / 显式reserved透传 /
   output_cap≠output_limit / 配置失真fail-safe回退8000（不裁到只剩最后一条）
5. manage()集成：派生预算真实裁剪 / 大预算不裁剪 / 无max_tokens默认行为不变
6. token_manager.get_input_limit：默认0 / 缓存值
7. budget_snapshot：推导链完整 / 与真实调用路径同源一致 / 异常→{"error"}不反噬
8. 接线断言：soulmate真实消息路径调用model_history_target且硬编码8000绝迹；
   ws_chat.ws_chat_health+app.py health含budget_snapshot（防死代码）
"""
import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.context_budget import (  # noqa: E402
    COMPACTION_BUFFER,
    DEFAULT_HISTORY_TARGET_TOKENS,
    ContextBudgetManager,
    budget_snapshot,
    max_output_tokens,
    reserved_tokens,
    usable_input,
)
from utils import token_manager  # noqa: E402


def _mk_msgs(n: int, content: str = "x" * 400, role: str = "user") -> list:
    """每条canonical估算≈100 tokens（400字符/4，estimate_tokens公式）"""
    return [{"role": role, "content": content} for _ in range(n)]


class TestMaxOutputTokens:
    """kilocode ProviderTransform.maxOutputTokens：min(model.limit.output, cap) || cap"""

    def test_min_of_limits(self):
        assert max_output_tokens(4096, 65536) == 4096
        assert max_output_tokens(65536, 8192) == 8192

    def test_zero_model_limit_falls_back_to_cap(self):
        # JS `||`：min(0, cap)=0为falsy→回退cap
        assert max_output_tokens(0, 65536) == 65536

    def test_both_zero_returns_zero(self):
        assert max_output_tokens(0, 0) == 0


class TestReservedTokens:
    """kilocode overflow.ts reserved：cfg.compaction.reserved ?? min(COMPACTION_BUFFER, maxOutputTokens)"""

    def test_default_is_min_buffer_vs_maxout(self):
        # 输出≥20k → 预留顶到COMPACTION_BUFFER
        assert reserved_tokens(65536, 65536) == COMPACTION_BUFFER == 20_000

    def test_default_small_output_caps_reserved(self):
        # 输出<20k → 预留=最大输出（不能预留超过输出本身）
        assert reserved_tokens(8192, 8192) == 8192

    def test_explicit_override_wins(self):
        assert reserved_tokens(65536, 65536, reserved=5_000) == 5_000

    def test_explicit_zero_override_respected(self):
        # cfg.compaction.reserved=0是合法显式配置，不得被默认值顶掉（??语义非||）
        assert reserved_tokens(65536, 65536, reserved=0) == 0


class TestUsableInput:
    """kilocode overflow.ts usable()——输入限额优先的不对称减法是核心语义"""

    def test_context_zero_returns_zero(self):
        assert usable_input(0, 65536, 65536, input_limit=100_000) == 0

    def test_input_limit_first_subtracts_reserved_only(self):
        # 双限额模型：input分支只减reserved（输出不占输入窗口）→ 100k−20k=80k
        assert usable_input(131072, 65536, 65536, input_limit=100_000) == 80_000

    def test_single_window_subtracts_full_output(self):
        # 单窗口模型：context分支减**全量最大输出**（输出从同一窗口出）→ 131072−65536
        assert usable_input(131072, 65536, 65536) == 65_536

    def test_asymmetry_is_real(self):
        # 同一组限额下两分支结果不同——勿"统一"简化（本测试锁死不对称语义）
        with_input = usable_input(131072, 65536, 65536, input_limit=131072)
        without_input = usable_input(131072, 65536, 65536)
        assert with_input == 131072 - 20_000
        assert without_input == 131072 - 65_536
        assert with_input != without_input

    def test_negative_clamped_to_zero(self):
        assert usable_input(8192, 65536, 65536) == 0
        assert usable_input(131072, 65536, 65536, input_limit=1_000) == 0

    def test_explicit_reserved_propagates(self):
        assert usable_input(131072, 65536, 65536, input_limit=100_000, reserved=30_000) == 70_000


class TestModelHistoryTarget:
    def test_derived_default_env_values(self):
        # 现网env（LLM_CONTEXT_WINDOW默认131072 / LLM_MAX_TOKENS=65536）：
        # usable=131072−65536=65536，历史目标=usable−system_reserve(8000)=57536
        mgr = ContextBudgetManager()
        assert mgr.model_history_target(131072, 65536) == 57_536

    def test_input_limit_first_end_to_end(self):
        mgr = ContextBudgetManager()
        # input=100k → usable=100k−20k=80k → 目标=80k−8k=72k
        assert mgr.model_history_target(131072, 65536, input_limit=100_000) == 72_000

    def test_explicit_reserved_propagates(self):
        mgr = ContextBudgetManager()
        assert mgr.model_history_target(
            131072, 65536, input_limit=100_000, reserved=30_000
        ) == 62_000

    def test_output_cap_distinct_from_model_limit(self):
        mgr = ContextBudgetManager()
        # 模型输出上限32k但调用方cap 8k → maxOutputTokens=min=8k → usable=131072−8192
        assert mgr.model_history_target(131072, 32768, output_cap=8192) == 131072 - 8192 - 8000

    def test_inconsistent_config_falls_back(self):
        # context<输出上限的自相矛盾配置 → usable=0 → fail-safe回退8000（不裁到只剩最后一条）
        mgr = ContextBudgetManager()
        assert mgr.model_history_target(8192, 65536) == DEFAULT_HISTORY_TARGET_TOKENS == 8000

    def test_usable_smaller_than_system_reserve_falls_back(self):
        mgr = ContextBudgetManager()
        # context=12000 out=8000 → usable=4000 < system_reserve 8000 → 目标<=0 → 回退
        assert mgr.model_history_target(12_000, 8_000) == DEFAULT_HISTORY_TARGET_TOKENS

    def test_custom_fallback(self):
        mgr = ContextBudgetManager()
        assert mgr.model_history_target(0, 0, fallback=1234) == 1234


class TestManageIntegration:
    def test_derived_target_trims_in_manage(self):
        mgr = ContextBudgetManager()
        target = mgr.model_history_target(12_000, 2_000)  # usable 10k − 8k = 2k
        assert target == 2_000
        msgs = _mk_msgs(30)  # 30×100=3000 tokens > 2000
        out = mgr.manage(msgs, max_tokens=target)
        assert len(out) == 20  # last(100)+次新往旧19条=2000 tokens
        assert out[-1] is msgs[-1]
        assert out[0] is msgs[10]

    def test_derived_target_large_no_trim(self):
        mgr = ContextBudgetManager()
        target = mgr.model_history_target(131072, 65536)  # 57536，远大于3000
        msgs = _mk_msgs(30)
        out = mgr.manage(msgs, max_tokens=target)
        assert out == msgs and mgr._compression_count == 0

    def test_manage_default_without_max_tokens_unchanged(self):
        # 无max_tokens路径仍走legacy available_for_history（112000）——行为零漂移
        mgr = ContextBudgetManager()
        msgs = _mk_msgs(5)
        out = mgr.manage(msgs)
        assert out == msgs and mgr._compression_count == 0

    def test_usable_input_tokens_property(self):
        from agent.context_budget import TokenBudget

        b = TokenBudget(input_limit=100_000, model_output_limit=65536, output_cap=65536)
        assert b.usable_input_tokens == 80_000
        legacy = TokenBudget()
        assert legacy.usable_input_tokens == 128000  # 未声明限额→context−0


class TestTokenManagerInputLimit:
    def test_default_zero_when_unset(self):
        assert token_manager._model_cache["input_limit"] == 0
        assert token_manager.get_input_limit() == 0

    def test_cache_value_honored(self):
        old = token_manager._model_cache["input_limit"]
        try:
            token_manager._model_cache["input_limit"] = 100_000
            assert token_manager.get_input_limit() == 100_000
        finally:
            token_manager._model_cache["input_limit"] = old


class TestBudgetSnapshot:
    def test_snapshot_chain_complete(self):
        old_ctx = token_manager._model_cache["context_window"]
        old_out = token_manager._model_cache["max_output_tokens"]
        old_in = token_manager._model_cache["input_limit"]
        try:
            token_manager._model_cache["context_window"] = 131072
            token_manager._model_cache["max_output_tokens"] = 65536
            token_manager._model_cache["input_limit"] = 0
            snap = budget_snapshot()
            assert snap["context_window"] == 131072
            assert snap["max_output_tokens"] == 65536
            assert snap["input_limit"] == 0
            assert snap["input_limit_first"] is False
            assert snap["reserved"] == 20_000
            assert snap["usable_input_tokens"] == 65_536
            assert snap["history_target"] == 57_536
            assert snap["fallback_target"] == 8000
            assert snap["system_reserve"] == 8000
        finally:
            token_manager._model_cache["context_window"] = old_ctx
            token_manager._model_cache["max_output_tokens"] = old_out
            token_manager._model_cache["input_limit"] = old_in

    def test_snapshot_matches_real_call_path(self):
        # health展示的history_target必须与soulmate调用点同源推导一致（同一真源同一函数）
        old_in = token_manager._model_cache["input_limit"]
        try:
            token_manager._model_cache["input_limit"] = 100_000
            snap = budget_snapshot()
            mgr = ContextBudgetManager()
            expect = mgr.model_history_target(
                token_manager.get_context_window(),
                token_manager.get_max_output_tokens(),
                input_limit=100_000,
            )
            assert snap["history_target"] == expect
            assert snap["input_limit_first"] is True
        finally:
            token_manager._model_cache["input_limit"] = old_in

    def test_snapshot_error_does_not_raise(self, monkeypatch):
        def _boom():
            raise RuntimeError("probe down")

        monkeypatch.setattr(token_manager, "get_context_window", _boom)
        snap = budget_snapshot()
        assert "error" in snap and "probe down" in snap["error"]


class TestWiring:
    """接线断言（防死代码）：新符号必须出现在运行时真实路径"""

    def test_soulmate_uses_model_history_target(self):
        import agent.soulmate_agent as sa

        src = inspect.getsource(sa)
        assert "model_history_target(" in src
        assert "max_tokens=_ctx_target" in src
        # 硬编码预算绝迹（kilocode #17销账的存在性证明）
        assert "manage(messages, max_tokens=8000)" not in src
        # 限额读取走token_manager同一真源
        assert "get_input_limit" in src and "get_context_window" in src

    def test_ws_chat_health_carries_budget_snapshot(self):
        src = (Path(__file__).resolve().parent.parent / "ws_chat.py").read_text()
        fn_src = src[src.index("async def ws_chat_health"):]
        fn_src = fn_src[: fn_src.index("\n@router.")]
        assert "budget_snapshot" in fn_src

    def test_app_health_mirrors_budget_snapshot(self):
        src = (Path(__file__).resolve().parent.parent / "app.py").read_text()
        fn_src = src[src.index("async def health"):]
        fn_src = fn_src[: fn_src.index("\n@app.get(\"/api/file\")")]
        assert "budget_snapshot" in fn_src
