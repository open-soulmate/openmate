"""Tool Output Handler 测试 — P0-2 溢出处理验证

参照goose large_response_handler.rs的测试模式 + deepagents stub验证 + AIHawk显式标记验证
"""
import os
import sys
import tempfile
from pathlib import Path

# 确保acp-proxy在path上
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.tool_output_handler import ToolOutputHandler, SpillResult


def make_handler(**kwargs) -> ToolOutputHandler:
    """创建带临时目录的handler实例"""
    tmpdir = tempfile.mkdtemp(prefix="test_spill_")
    kwargs.setdefault("spill_dir", tmpdir)
    kwargs.setdefault("char_threshold", 1000)
    kwargs.setdefault("line_threshold", 50)
    kwargs.setdefault("preview_chars", 200)
    return ToolOutputHandler(**kwargs)


def test_small_output_passes_through():
    """小输出不溢出，原样传递"""
    h = make_handler()
    result = h.process("read_file", "tc_001", "Hello, this is small.")
    assert not result.spilled
    assert result.processed_text == "Hello, this is small."
    assert result.original_size == 21
    assert result.shown_size == 21
    assert result.spill_path == ""
    print("  ✓ test_small_output_passes_through")


def test_large_char_output_spills():
    """超字符阈值 → 落盘 + stub"""
    h = make_handler(char_threshold=100)
    large_text = "A" * 500
    result = h.process("terminal", "tc_002", large_text)
    assert result.spilled
    assert result.spill_path != ""
    assert "[TRUNCATED" in result.processed_text
    assert "500" in result.processed_text  # 原始大小
    assert result.spill_path in result.processed_text  # 文件路径在stub中
    assert result.original_size == 500
    # stub包含教学文本，对小输入可能比原文长；关键属性是stub大小有界
    # 验证：stub中包含文件路径引用和预览
    assert "read_file_segment" in result.processed_text
    # 验证文件确实存在且内容完整
    assert os.path.exists(result.spill_path)
    with open(result.spill_path, "r") as f:
        assert f.read() == large_text
    print("  ✓ test_large_char_output_spills")


def test_large_line_output_spills():
    """超行数阈值 → 落盘 + stub（即使字符数不超）"""
    h = make_handler(char_threshold=10000, line_threshold=20)
    many_lines = "\n".join(f"line {i}" for i in range(50))
    result = h.process("read_file", "tc_003", many_lines)
    assert result.spilled
    assert "50" in result.processed_text  # 行数在stub中
    print("  ✓ test_large_line_output_spills")


def test_stub_contains_head_and_tail_preview():
    """stub包含head+tail预览"""
    h = make_handler(char_threshold=100, preview_chars=40)
    text = "HEAD_MARKER" + "X" * 400 + "TAIL_MARKER"
    result = h.process("test", "tc_004", text)
    assert result.spilled
    assert "HEAD_MARKER" in result.processed_text
    assert "TAIL_MARKER" in result.processed_text
    print("  ✓ test_stub_contains_head_and_tail_preview")


def test_stub_tells_model_how_to_read_back():
    """stub教模型如何分段读回（deepagents模式）"""
    h = make_handler(char_threshold=100)
    large_text = "B" * 300
    result = h.process("test", "tc_005", large_text)
    assert result.spilled
    assert "read_file_segment" in result.processed_text
    assert "start_line" in result.processed_text
    print("  ✓ test_stub_tells_model_how_to_read_back")


def test_read_segment_basic():
    """分段读回基础功能"""
    h = make_handler(char_threshold=100)
    # 创建一个溢出
    lines = [f"line_{i}" for i in range(1, 101)]
    large_text = "\n".join(lines)
    result = h.process("test", "tc_006", large_text)
    assert result.spill_path
    
    # 分段读回
    segment = h.read_segment(result.spill_path, start_line=1, end_line=10)
    assert "line_1" in segment
    assert "line_10" in segment
    assert "line_11" not in segment
    assert "行 1-10" in segment
    assert "100" in segment  # 总行数
    print("  ✓ test_read_segment_basic")


def test_read_segment_continuation():
    """分段读回 — 续读"""
    h = make_handler(char_threshold=100)
    lines = [f"row_{i}" for i in range(1, 201)]
    large_text = "\n".join(lines)
    result = h.process("test", "tc_007", large_text)
    
    segment = h.read_segment(result.spill_path, start_line=101, end_line=110)
    assert "row_101" in segment
    assert "row_110" in segment
    assert "row_111" not in segment
    print("  ✓ test_read_segment_continuation")


def test_read_segment_at_end():
    """分段读回到达文件末尾"""
    h = make_handler(char_threshold=100)
    lines = [f"data_{i}" for i in range(1, 26)]
    result = h.process("test", "tc_008", "\n".join(lines))
    
    segment = h.read_segment(result.spill_path, start_line=21, end_line=30)
    assert "data_21" in segment
    assert "data_25" in segment
    assert "已到达文件末尾" in segment
    print("  ✓ test_read_segment_at_end")


def test_read_segment_beyond_file():
    """分段读回 — 起始行超出文件范围"""
    h = make_handler(char_threshold=100)
    lines = [f"x{i}_{'Z' * 30}" for i in range(5)]
    result = h.process("test", "tc_009", "\n".join(lines))
    assert result.spilled  # 确保发生了溢出
    
    segment = h.read_segment(result.spill_path, start_line=100, end_line=200)
    assert "错误" in segment
    assert "超出" in segment
    print("  ✓ test_read_segment_beyond_file")


def test_read_segment_path_security():
    """分段读回 — 路径穿越防护"""
    h = make_handler()
    result = h.read_segment("/etc/passwd", start_line=1, end_line=10)
    assert "错误" in result
    assert "安全验证" in result
    print("  ✓ test_read_segment_path_security")


def test_read_segment_nonexistent_file():
    """分段读回 — 文件不存在"""
    h = make_handler()
    fake_path = str(Path(h.spill_dir) / "nonexistent.txt")
    result = h.read_segment(fake_path)
    assert "错误" in result
    assert "不存在" in result
    print("  ✓ test_read_segment_nonexistent_file")


def test_spill_file_permissions():
    """溢出文件权限为600（仅owner）"""
    h = make_handler(char_threshold=10)
    result = h.process("test", "tc_perm", "X" * 100)
    assert result.spilled
    mode = os.stat(result.spill_path).st_mode & 0o777
    assert mode == 0o600, f"Expected 0o600, got {oct(mode)}"
    print("  ✓ test_spill_file_permissions")


def test_spill_unique_paths():
    """多次溢出生成不同文件路径"""
    h = make_handler(char_threshold=10)
    r1 = h.process("tool_a", "tc_1", "A" * 100)
    r2 = h.process("tool_b", "tc_2", "B" * 100)
    assert r1.spilled and r2.spilled
    assert r1.spill_path != r2.spill_path
    assert r1.spill_id != r2.spill_id
    print("  ✓ test_spill_unique_paths")


def test_get_stats():
    """统计信息正确"""
    h = make_handler(char_threshold=10)
    h.process("test", "tc_s1", "X" * 100)
    h.process("test", "tc_s2", "Y" * 200)
    stats = h.get_stats()
    assert stats["total_spills"] == 2
    assert stats["total_size_bytes"] > 0
    assert stats["char_threshold"] == 10
    print("  ✓ test_get_stats")


def test_empty_result():
    """空结果不溢出"""
    h = make_handler()
    result = h.process("test", "tc_empty", "")
    assert not result.spilled
    assert result.processed_text == ""
    assert result.original_size == 0
    print("  ✓ test_empty_result")


def test_exact_threshold_not_spilled():
    """恰好等于阈值不溢出"""
    h = make_handler(char_threshold=100)
    exact = "A" * 100
    result = h.process("test", "tc_exact", exact)
    assert not result.spilled
    print("  ✓ test_exact_threshold_not_spilled")


def test_one_over_threshold_spills():
    """超阈值1字符即溢出"""
    h = make_handler(char_threshold=100)
    over = "A" * 101
    result = h.process("test", "tc_over", over)
    assert result.spilled
    print("  ✓ test_one_over_threshold_spills")


if __name__ == "__main__":
    print("Running tool_output_handler tests...")
    test_small_output_passes_through()
    test_large_char_output_spills()
    test_large_line_output_spills()
    test_stub_contains_head_and_tail_preview()
    test_stub_tells_model_how_to_read_back()
    test_read_segment_basic()
    test_read_segment_continuation()
    test_read_segment_at_end()
    test_read_segment_beyond_file()
    test_read_segment_path_security()
    test_read_segment_nonexistent_file()
    test_spill_file_permissions()
    test_spill_unique_paths()
    test_get_stats()
    test_empty_result()
    test_exact_threshold_not_spilled()
    test_one_over_threshold_spills()
    print("\nAll 17 tests PASSED ✓")
