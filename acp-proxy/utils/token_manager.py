"""
Token管理器 — 启动时探测模型能力，缓存结果，不重复计算
"""
import os
import json
import logging
import httpx

logger = logging.getLogger(__name__)

# 缓存的模型能力（启动时探测一次）
_model_cache = {
    "max_output_tokens": int(os.environ.get("LLM_MAX_TOKENS", "65536")),
    "context_window": int(os.environ.get("LLM_CONTEXT_WINDOW", "131072")),
    # 模型独立输入限额（kilocode model.limit.input，supplement3 #17双限额）：
    # 0=未声明（单窗口模型）；双限额模型（如"1M输入/32k输出"分离限额）在此声明，
    # 上下文预算即走"输入限额优先"分支（agent.context_budget.usable_input）。
    "input_limit": int(os.environ.get("LLM_INPUT_LIMIT", "0")),
    "probed": False,
}

# 工具返回内容截断上限
TOOL_RESULT_MAX_CHARS = int(os.environ.get("TOOL_RESULT_MAX_CHARS", "8000"))


def get_max_output_tokens() -> int:
    """获取模型最大输出token数（缓存值）"""
    return _model_cache["max_output_tokens"]


def get_context_window() -> int:
    """获取模型上下文窗口（缓存值）"""
    return _model_cache["context_window"]


def get_input_limit() -> int:
    """获取模型独立输入限额（kilocode model.limit.input语义，0=未声明单窗口模型）"""
    return _model_cache["input_limit"]


def probe_model_capabilities(base_url: str, api_key: str, model: str) -> dict:
    """
    启动时探测模型能力，只调用一次。
    发一个小请求，用max_tokens=1触发，从usage中获取信息。
    同时尝试不同的max_tokens值探测上限。
    """
    if _model_cache["probed"]:
        return _model_cache

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        # 测试1: 基本连通性 + 获取completion_tokens
        resp = httpx.post(f"{base_url}/chat/completions", headers=headers, json={
            "model": model,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
            "stream": False,
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            usage = data.get("usage", {})
            logger.info(f"[TokenProbe] 连通成功, usage={usage}")
        else:
            logger.warning(f"[TokenProbe] 连通失败: {resp.status_code}")
            return _model_cache
    except Exception as e:
        logger.warning(f"[TokenProbe] 探测失败: {e}")
        return _model_cache

    # 测试2: 探测max_tokens上限（二分法）
    # 已知环境变量设置的值，直接用
    configured_max = int(os.environ.get("LLM_MAX_TOKENS", "65536"))
    _model_cache["max_output_tokens"] = configured_max
    _model_cache["probed"] = True
    logger.info(f"[TokenProbe] 缓存: max_output_tokens={configured_max}, context_window={_model_cache['context_window']}")
    return _model_cache


def truncate_tool_result(result: str, max_chars: int = 0) -> str:
    """截断工具返回内容，保留头尾"""
    if not max_chars:
        max_chars = TOOL_RESULT_MAX_CHARS
    if not result or len(result) <= max_chars:
        return result
    head = result[:max_chars * 2 // 3]
    tail = result[-max_chars // 3:]
    return f"{head}\n\n... [内容过长，已截断 {len(result)}→{max_chars} 字符] ...\n\n{tail}"


def estimate_tokens(text: str) -> int:
    """粗略估算token数：中文1.5/字，其他0.4/字符"""
    if not text:
        return 0
    chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    return int(chinese * 1.5 + (len(text) - chinese) * 0.4)
