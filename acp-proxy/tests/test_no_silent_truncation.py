"""禁止静默截断 + 工具审计真实接线 回归测试（live E2E发现的P0级接线缺陷）

发现经过（本轮live E2E实证）：
1. 真实消息路径terminal/search_files/execute_code结果被[:3000]静默切尾——
   - 数据在到达P0-2溢出层（_process_tool_output，8000字符阈值）之前就被砍到3000，
     溢出层永不触发（"写了≠接线了"：P0-2对最大宗工具输出是死的）
   - AIHawk SHOWN/SENT双预算失真（sent_chars记的是被砍后大小）
   - 无任何[TRUNCATED]显式标记（违反AIHawk"截断必须显式标记"铁律）
2. ToolAuditor.audit_call调用点kwarg（result_preview/duration_s）与签名
   （result/duration_ms）不匹配→每次TypeError被DEBUG吞掉→工具审计从未落库，
   且同一try块里的tool_cache.put被连带跳过。
"""
import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.tool_auditor import ToolAuditor


def _src(rel):
    return (Path(__file__).parent.parent / rel).read_text(encoding="utf-8")


# ══════════════ 守护1：静默截断绝迹 ══════════════

def test_no_silent_3000_slice_in_soulmate():
    raw = _src("agent/soulmate_agent.py")
    # 守护只看代码（剔除注释行——注释里引用反面教材模式是允许的）
    src = "\n".join(l for l in raw.splitlines() if not l.strip().startswith("#"))
    assert "[:3000]" not in src, "发现[:3000]静默截断回归——禁止，必须走溢出层显式标记"
    assert "stdout[:3000]" not in src
    assert "output[:3000]" not in src


def test_full_output_reaches_spill_layer():
    """完整输出必须到达_process_tool_output溢出层（含code_mode批量化内层两个分支）。"""
    src = _src("agent/soulmate_agent.py")
    # 定义1处 + 拒绝1处 + 成功1处 + MCP 1处 + code_mode 2处 = 6处
    assert src.count("self._process_tool_output(") >= 5, (
        f"_process_tool_output调用点不足，疑有分支绕过溢出层: "
        f"{src.count('self._process_tool_output(')}")
    # code_mode内层terminal/search_files结果过溢出层（批内可read_file_segment读回）
    assert '"terminal", f"cm_' in src
    assert '"search_files", f"cm_' in src


# ══════════════ 守护2：工具审计真实接线 ══════════════

def test_audit_call_site_matches_signature():
    """调用点kwarg必须与ToolAuditor.audit_call签名一致（错误kwarg=每次TypeError=审计死）。"""
    sig = inspect.signature(ToolAuditor.audit_call)
    params = set(sig.parameters)
    assert {"session_id", "tool_name", "arguments", "result", "duration_ms", "success"} <= params
    src = _src("agent/soulmate_agent.py")
    # 旧的错误kwarg绝迹
    assert "result_preview=str(result)[:200]" not in src
    assert "duration_s=tool_duration" not in src
    # 新的正确kwarg在场
    assert "arguments=func_args, result=str(result)," in src
    assert "duration_ms=tool_duration * 1000" in src


def test_audit_call_real_behavior(tmp_path):
    """按调用点的真实kwarg形状调用——必须成功落库（不是只验证import成功）。"""
    auditor = ToolAuditor(db_path=str(tmp_path / "audit.db"))
    entry = auditor.audit_call(
        session_id="om-test", tool_name="terminal",
        arguments={"command": "seq 1 3000"}, result="1\n2\n3",
        duration_ms=1250.0, success=True,
    )
    assert entry.tool_name == "terminal"
    assert entry.result_summary.startswith("1\n2\n3")  # 内部自切200字符存summary
    stats = auditor.get_stats()
    assert stats["total_entries"] == 1
    report = auditor.get_risk_report()
    assert "terminal" in report["by_tool"]


def test_audit_failure_is_warning_not_debug():
    """mem0 §1.1失败必须可见：审计失效禁止DEBUG级静默。"""
    src = _src("agent/soulmate_agent.py")
    assert 'logger.warning(f"[tool-audit]' in src
    assert 'logger.debug(f"[tool-audit]' not in src
