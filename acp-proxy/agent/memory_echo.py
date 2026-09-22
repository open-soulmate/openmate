# -*- coding: utf-8 -*-
"""kilocode recalledMemory 防记忆回声——真实聊天路径客户端接线层。

调研来源：kilocode-source-supplement3.md #5（recalledMemory()，15行）：
"本轮若跑过kilo_memory_recall且count>0→跳过digest"——
"答案来自记忆的回合不能再蒸馏回记忆"（记忆自我污染闭环的阻断器）。

此前OpenSoul侧已有 DreamDistiller.mark_recall/should_skip_digest +
/api/hippo/ltm/dream/recall-mark|reset-turn 端点，但真实消息路径
（soulmate_agent._prompt_inner，OpenMate聊天页实际使用路径）零调用——
回声阻断器是死代码。本模块是调用侧的薄封装：

- collect_recalled_ids：汇总本回合所有召回源（本地记忆引擎 + OpenSoul LTM）
- reset_turn：回合边界清零（kilocode TurnOpen语义）
- mark_recall：把召回到的记忆id上报给OpenSoul（此后本回合的digest被跳过）
- build_digest_payload：回合digest写入显式带echo_guard=True（服务端二次闸）
- is_echo_blocked：识别服务端跳过结果（mem0：跳过必须可见，不静默）

所有HTTP调用经传入的client（httpx.AsyncClient），2s超时，调用方容错——
回声标记失败不破坏聊天主流程，但必须打日志可见。
"""

import logging

logger = logging.getLogger("acp.memory_echo")

# OpenSoul hippo echo-guard 端点（DreamDistiller回合回声状态）
TURN_RESET_URL = "http://127.0.0.1:8090/api/hippo/ltm/dream/reset-turn"
RECALL_MARK_URL = "http://127.0.0.1:8090/api/hippo/ltm/dream/recall-mark"

TIMEOUT = 2


def collect_recalled_ids(local_memories=None, ltm_data=None) -> list[str]:
    """汇总本回合召回的记忆id（去重保序）。

    Args:
        local_memories: 本地MemoryRetrievalEngine.retrieve()结果（MemoryEntry列表，
                        带memory_id属性）；也可传id字符串列表
        ltm_data: OpenSoul /api/hippo/ltm/context响应dict（memory_ids字段）

    Returns:
        去重后的记忆id列表；空=本回合无召回（digest照常）
    """
    ids: list[str] = []
    for m in local_memories or []:
        mid = m if isinstance(m, str) else getattr(m, "memory_id", None) or getattr(m, "id", None)
        if mid:
            ids.append(str(mid))
    for mid in (ltm_data or {}).get("memory_ids") or []:
        if mid:
            ids.append(str(mid))
    # 去重保序
    seen: set[str] = set()
    out: list[str] = []
    for mid in ids:
        if mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


async def reset_turn(client) -> bool:
    """回合边界清零回声状态（kilocode TurnOpen）。返回是否成功。"""
    try:
        resp = await client.post(TURN_RESET_URL, json={}, timeout=TIMEOUT)
        return resp.status_code == 200
    except Exception as e:
        logger.debug(f"[memory-echo] reset_turn failed (non-fatal): {e}")
        return False


async def mark_recall(client, memory_ids: list[str]) -> dict | None:
    """上报本回合召回的记忆id（此后digest应被跳过）。失败返回None不打断主流程。"""
    if not memory_ids:
        return None
    try:
        resp = await client.post(
            RECALL_MARK_URL, json={"memory_ids": memory_ids}, timeout=TIMEOUT
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info(
                f"[memory-echo] recall marked: {len(memory_ids)} memories, "
                f"echo_stats={data.get('echo_stats')}"
            )
            return data
        logger.warning(f"[memory-echo] recall-mark HTTP {resp.status_code}")
    except Exception as e:
        logger.debug(f"[memory-echo] mark_recall failed (non-fatal): {e}")
    return None


def build_digest_payload(
    content: str,
    memory_type: str = "episodic",
    importance: float = 0.5,
    session_id: str = "",
    echo_guard: bool = True,
) -> dict:
    """回合digest的/ltm/add请求体——echo_guard显式声明（服务端回声闸二次防线）。"""
    return {
        "content": content,
        "memory_type": memory_type,
        "importance": importance,
        "session_id": session_id,
        "echo_guard": echo_guard,
    }


def is_echo_blocked(resp_json) -> bool:
    """识别服务端回声拦截结果（跳过必须可见——mem0禁止静默降级）。"""
    if not isinstance(resp_json, dict):
        return False
    return resp_json.get("outcome") == "echo_blocked" or bool(resp_json.get("echo_blocked"))
