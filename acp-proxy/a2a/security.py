"""A2A 安全层 — 鉴权中间件。

提供请求鉴权能力：
- Bearer Token 验证
- 通过 A2A_SKIP_AUTH=true 环境变量跳过鉴权（开发模式默认跳过）
- 返回 None 表示通过，返回 JSONResponse 表示拒绝
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from a2a.models import JSONRPC_INVALID_REQUEST

logger = logging.getLogger("a2a.security")

# 开发模式默认跳过鉴权
_SKIP_AUTH = os.environ.get("A2A_SKIP_AUTH", "true").lower() in ("true", "1", "yes")

# 预置Token集合（生产环境应替换为数据库/外部认证服务）
_VALID_TOKENS: set[str] = set()
_tokens_env = os.environ.get("A2A_AUTH_TOKENS", "")
if _tokens_env:
    _VALID_TOKENS = {t.strip() for t in _tokens_env.split(",") if t.strip()}


def _unauthorized(request_id: object, message: str) -> JSONResponse:
    """构造鉴权失败的 JSON-RPC 错误响应。"""
    from a2a.server import _error_response
    return _error_response(request_id, JSONRPC_INVALID_REQUEST, message)


async def verify_auth(request: Request, request_id: object = None) -> Optional[JSONResponse]:
    """验证请求鉴权。

    Args:
        request: FastAPI Request 对象
        request_id: JSON-RPC 请求ID（用于构造错误响应）

    Returns:
        None — 鉴权通过
        JSONResponse — 鉴权失败的错误响应
    """
    if _SKIP_AUTH:
        return None

    auth_header = request.headers.get("Authorization", "")

    if not auth_header:
        logger.warning("A2A鉴权失败: 缺少Authorization头")
        return _unauthorized(request_id, "缺少Authorization头，请提供Bearer Token")

    if not auth_header.startswith("Bearer "):
        logger.warning("A2A鉴权失败: Authorization格式错误")
        return _unauthorized(request_id, "Authorization格式错误，需要Bearer Token")

    token = auth_header[7:]  # 去掉 "Bearer " 前缀

    if not token:
        logger.warning("A2A鉴权失败: Token为空")
        return _unauthorized(request_id, "Token为空")

    if _VALID_TOKENS and token not in _VALID_TOKENS:
        logger.warning("A2A鉴权失败: 无效Token")
        return _unauthorized(request_id, "无效的Token")

    logger.debug("A2A鉴权通过")
    return None
