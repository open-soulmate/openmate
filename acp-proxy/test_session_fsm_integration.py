#!/usr/bin/env python3
"""
Session FSM 集成测试
测试 session_fsm.py 的核心功能是否正常工作
"""

import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent.session_fsm import SessionStateMachine, SessionState, SessionEvent

def test_basic_transitions():
    """测试基本状态转换"""
    print("\n=== 测试基本状态转换 ===")
    fsm = SessionStateMachine()
    
    # 创建会话
    session_id = "test-session-001"
    ctx = fsm.create_session(session_id)
    print(f"✓ 创建会话: {session_id}, 初始状态: {ctx.state.value}")
    
    # IDLE -> PROCESSING (用户消息)
    result = fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    print(f"✓ USER_MESSAGE: IDLE -> {result.value}")
    assert result == SessionState.PROCESSING
    
    # PROCESSING -> LISTENING (LLM完成)
    result = fsm.transition(session_id, SessionEvent.LLM_COMPLETE)
    print(f"✓ LLM_COMPLETE: PROCESSING -> {result.value}")
    assert result == SessionState.LISTENING
    
    # LISTENING -> PROCESSING (再次用户消息)
    result = fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    print(f"✓ USER_MESSAGE: LISTENING -> {result.value}")
    assert result == SessionState.PROCESSING
    
    # PROCESSING -> TOOL_EXECUTING (工具调用)
    result = fsm.transition(session_id, SessionEvent.TOOL_CALL)
    print(f"✓ TOOL_CALL: PROCESSING -> {result.value}")
    assert result == SessionState.TOOL_EXECUTING
    
    # TOOL_EXECUTING -> PROCESSING (工具完成)
    result = fsm.transition(session_id, SessionEvent.TOOL_COMPLETE)
    print(f"✓ TOOL_COMPLETE: TOOL_EXECUTING -> {result.value}")
    assert result == SessionState.PROCESSING
    
    # PROCESSING -> STREAMING (流式输出)
    result = fsm.transition(session_id, SessionEvent.STREAM_START)
    print(f"✓ STREAM_START: PROCESSING -> {result.value}")
    assert result == SessionState.STREAMING
    
    # STREAMING -> LISTENING (流式结束)
    result = fsm.transition(session_id, SessionEvent.STREAM_END)
    print(f"✓ STREAM_END: STREAMING -> {result.value}")
    assert result == SessionState.LISTENING
    
    print("✓ 基本状态转换测试通过!")

def test_invalid_transitions():
    """测试非法转换被拒绝"""
    print("\n=== 测试非法转换拒绝 ===")
    fsm = SessionStateMachine()
    
    session_id = "test-invalid-001"
    fsm.create_session(session_id)
    
    # IDLE -> TOOL_CALL 应该被拒绝
    result = fsm.transition(session_id, SessionEvent.TOOL_CALL)
    print(f"✓ IDLE + TOOL_CALL = {result} (应该是 None)")
    assert result is None
    
    # 检查拒绝计数
    stats = fsm.get_stats()
    print(f"✓ 被拒绝的转换数: {stats['rejected_transitions']}")
    assert stats["rejected_transitions"] == 1
    
    print("✓ 非法转换拒绝测试通过!")

def test_error_recovery():
    """测试错误恢复流程"""
    print("\n=== 测试错误恢复 ===")
    fsm = SessionStateMachine()
    
    session_id = "test-error-001"
    fsm.create_session(session_id)
    
    # 进入 PROCESSING
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    
    # 进入 ERROR
    result = fsm.transition(session_id, SessionEvent.ERROR)
    print(f"✓ ERROR: PROCESSING -> {result.value}")
    assert result == SessionState.ERROR
    
    # ERROR -> IDLE (重置)
    result = fsm.transition(session_id, SessionEvent.RESET)
    print(f"✓ RESET: ERROR -> {result.value}")
    assert result == SessionState.IDLE
    
    # ERROR -> PROCESSING (用户消息)
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    fsm.transition(session_id, SessionEvent.ERROR)
    result = fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    print(f"✓ USER_MESSAGE: ERROR -> {result.value}")
    assert result == SessionState.PROCESSING
    
    print("✓ 错误恢复测试通过!")

def test_confirmation_flow():
    """测试确认流程"""
    print("\n=== 测试确认流程 ===")
    fsm = SessionStateMachine()
    
    session_id = "test-confirm-001"
    fsm.create_session(session_id)
    
    # 进入 TOOL_EXECUTING
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    fsm.transition(session_id, SessionEvent.TOOL_CALL)
    
    # 用户消息触发等待确认
    result = fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    print(f"✓ USER_MESSAGE: TOOL_EXECUTING -> {result.value}")
    assert result == SessionState.WAITING_CONFIRMATION
    
    # 确认
    result = fsm.transition(session_id, SessionEvent.CONFIRM)
    print(f"✓ CONFIRM: WAITING_CONFIRMATION -> {result.value}")
    assert result == SessionState.PROCESSING
    
    # 取消
    fsm.transition(session_id, SessionEvent.TOOL_CALL)
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    result = fsm.transition(session_id, SessionEvent.CANCEL)
    print(f"✓ CANCEL: WAITING_CONFIRMATION -> {result.value}")
    assert result == SessionState.LISTENING
    
    print("✓ 确认流程测试通过!")

def test_state_duration():
    """测试状态时长统计"""
    print("\n=== 测试状态时长统计 ===")
    
    fsm = SessionStateMachine()
    session_id = "test-duration-001"
    fsm.create_session(session_id)
    
    # 进入 PROCESSING
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    time.sleep(0.1)  # 模拟处理时间
    
    # 进入 LISTENING
    fsm.transition(session_id, SessionEvent.LLM_COMPLETE)
    
    duration = fsm.get_session_duration(session_id, SessionState.PROCESSING)
    print(f"✓ PROCESSING 状态持续时间: {duration:.3f}s")
    assert duration > 0.05  # 应该至少有 0.05 秒
    
    print("✓ 状态时长统计测试通过!")

def test_stats():
    """测试统计信息"""
    print("\n=== 测试统计信息 ===")
    fsm = SessionStateMachine()
    
    # 创建多个会话并执行转换
    for i in range(3):
        sid = f"session-{i}"
        fsm.create_session(sid)
        fsm.transition(sid, SessionEvent.USER_MESSAGE)
        fsm.transition(sid, SessionEvent.LLM_COMPLETE)
    
    stats = fsm.get_stats()
    print(f"✓ 活跃会话数: {stats['active_sessions']}")
    print(f"✓ 总转换数: {stats['total_transitions']}")
    print(f"✓ 被拒绝转换数: {stats['rejected_transitions']}")
    print(f"✓ 按状态统计: {stats['sessions_by_state']}")
    
    assert stats['active_sessions'] == 3
    assert stats['total_transitions'] == 6
    
    print("✓ 统计信息测试通过!")

def test_state_change_callback():
    """测试状态变化回调"""
    print("\n=== 测试状态变化回调 ===")
    fsm = SessionStateMachine()
    
    callback_called = []
    
    def on_change(session_id, old_state, new_state, event):
        callback_called.append({
            "session_id": session_id,
            "from": old_state.value,
            "to": new_state.value,
            "event": event.value
        })
    
    fsm.on_state_change(on_change)
    
    session_id = "test-callback-001"
    fsm.create_session(session_id)
    fsm.transition(session_id, SessionEvent.USER_MESSAGE)
    fsm.transition(session_id, SessionEvent.LLM_COMPLETE)
    
    print(f"✓ 回调触发次数: {len(callback_called)}")
    for cb in callback_called:
        print(f"  - {cb['from']} -> {cb['to']} ({cb['event']})")
    
    assert len(callback_called) == 2
    print("✓ 状态变化回调测试通过!")

def test_cleanup():
    """测试清理不活跃会话"""
    print("\n=== 测试清理不活跃会话 ===")
    fsm = SessionStateMachine()
    
    # 创建会话并保持 IDLE 状态
    for i in range(5):
        fsm.create_session(f"idle-{i}")
    
    # 创建会话并转换到其他状态
    for i in range(3):
        sid = f"active-{i}"
        fsm.create_session(sid)
        fsm.transition(sid, SessionEvent.USER_MESSAGE)
    
    print(f"清理前会话数: {len(fsm._contexts)}")
    
    # 等待足够时间确保清理生效
    time.sleep(0.02)
    
    # 清理 (设置很短的 max_age 以便测试)
    fsm.cleanup_inactive(max_age_seconds=0.005)
    
    print(f"清理后会话数: {len(fsm._contexts)}")
    # IDLE 状态的应该被清理，PROCESSING 状态的保留
    assert len(fsm._contexts) == 3, f"期望3个会话，实际 {len(fsm._contexts)} 个"
    
    print("✓ 清理不活跃会话测试通过!")

if __name__ == "__main__":
    print("Session FSM 集成测试")
    print("=" * 50)
    
    tests = [
        ("基本状态转换", test_basic_transitions),
        ("非法转换拒绝", test_invalid_transitions),
        ("错误恢复", test_error_recovery),
        ("确认流程", test_confirmation_flow),
        ("状态时长统计", test_state_duration),
        ("统计信息", test_stats),
        ("状态变化回调", test_state_change_callback),
        ("清理不活跃会话", test_cleanup),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"\n❌ 测试 [{name}] 失败: {e}")
            failed += 1
        except Exception as e:
            print(f"\n❌ 测试 [{name}] 出错: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 50)
    print(f"测试结果: {passed} 通过, {failed} 失败 / 共 {len(tests)} 个测试")
    
    if failed == 0:
        print("✅ 所有测试通过！Session FSM 集成正常！")
    else:
        print("❌ 部分测试失败")
        sys.exit(1)
