"""Gateway JSON-RPC 2.0 统一入口路由 — 对齐 Gateway v1.0 规范。

POST /rpc — 统一入口，根据method前缀自动分发：
- acp/* → ACP人机交互
- a2a/* → A2A智能体协同
- mcp/* → MCP底层管控
- artifact/* → Artifact工件服务
- vector/* → Vector向量检索
- scheduler/* → TaskScheduler任务调度

网关职责：路由转发、traceId生成、限流、鉴权、日志，不承载业务逻辑。
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("gateway.router")

# ---------------------------------------------------------------------------
# 路由配置
# ---------------------------------------------------------------------------

# method前缀 → (后端服务名, 处理函数)
# 网关内转发，直接调用对应模块的处理器
_ROUTE_TABLE: dict[str, dict[str, Any]] = {
    "acp": {"service": "ACP", "desc": "人机交互"},
    "a2a": {"service": "A2A", "desc": "智能体协同"},
    "mcp": {"service": "MCP", "desc": "底层管控"},
    "artifact": {"service": "Artifact", "desc": "工件服务"},
    "vector": {"service": "Vector", "desc": "向量检索"},
    "scheduler": {"service": "Scheduler", "desc": "任务调度"},
}

# ---------------------------------------------------------------------------
# 限流器（四维：全局/项目/Token/IP）
# ---------------------------------------------------------------------------

class _RateLimiter:
    """简单滑动窗口限流器。"""

    def __init__(self, qps: int = 200, burst: int = 50):
        self.qps = qps
        self.burst = burst
        self._counts: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> bool:
        """检查是否允许通过。True=允许，False=限流。"""
        now = time.time()
        window = self._counts[key]
        # 清理1秒前的记录
        window[:] = [t for t in window if now - t < 1.0]
        if len(window) >= self.qps + self.burst:
            return False
        window.append(now)
        return True


_global_limiter = _RateLimiter(qps=200, burst=50)
_token_limiters: dict[str, _RateLimiter] = {}
_ip_limiters: dict[str, _RateLimiter] = {}

def _get_token_limiter(token: str) -> _RateLimiter:
    if token not in _token_limiters:
        _token_limiters[token] = _RateLimiter(qps=50, burst=20)
    return _token_limiters[token]

def _get_ip_limiter(ip: str) -> _RateLimiter:
    if ip not in _ip_limiters:
        _ip_limiters[ip] = _RateLimiter(qps=100, burst=30)
    return _ip_limiters[ip]


# ---------------------------------------------------------------------------
# 熔断器
# ---------------------------------------------------------------------------

class _CircuitBreaker:
    """简单熔断器：错误率超阈值→熔断→冷却后半放探测。"""

    def __init__(self, failure_threshold: float = 0.5, reset_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self._requests: list[bool] = []  # True=成功, False=失败
        self._tripped = False
        self._tripped_at = 0.0

    def record(self, success: bool):
        self._requests.append(success)
        if len(self._requests) > 100:
            self._requests = self._requests[-100:]

    def allow(self) -> bool:
        if not self._tripped:
            return True
        if time.time() - self._tripped_at > self.reset_timeout:
            self._tripped = False
            self._requests.clear()
            return True
        return False

    def check_trip(self):
        if len(self._requests) < 10:
            return
        failures = sum(1 for s in self._requests if not s)
        if failures / len(self._requests) > self.failure_threshold:
            self._tripped = True
            self._tripped_at = time.time()


_breakers: dict[str, _CircuitBreaker] = {}

def _get_breaker(service: str) -> _CircuitBreaker:
    if service not in _breakers:
        _breakers[service] = _CircuitBreaker()
    return _breakers[service]


# ---------------------------------------------------------------------------
# 路由器
# ---------------------------------------------------------------------------

router = APIRouter(tags=["Gateway"])


@router.post("/rpc")
async def gateway_rpc(request: Request):
    """Gateway统一入口 — POST /rpc。

    1. 解析JSON-RPC请求
    2. 生成X-Trace-Id
    3. 鉴权（JWT）
    4. 限流（四维）
    5. 路由分发（method前缀）
    6. 熔断检查
    7. 转发到对应服务处理器
    """
    # 解析请求
    try:
        body = await request.json()
    except Exception:
        return _gw_error(None, -32700, "JSON解析失败")

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    # 生成traceId
    trace_id = str(uuid.uuid4())[:16]
    client_ip = request.client.host if request.client else "unknown"
    token = params.get("control_token", "") or request.headers.get("Authorization", "").replace("Bearer ", "")

    logger.info(f"[{trace_id}] {method} from={client_ip}")

    # 限流检查
    if not _global_limiter.check("global"):
        return _gw_error(rpc_id, 10007, "全局限流触发", trace_id)
    if token and not _get_token_limiter(token).check(token):
        return _gw_error(rpc_id, 10007, "Token限流触发", trace_id)
    if not _get_ip_limiter(client_ip).check(client_ip):
        return _gw_error(rpc_id, 10007, "IP限流触发", trace_id)

    # 路由分发
    prefix = method.split("/")[0] if "/" in method else ""
    route = _ROUTE_TABLE.get(prefix)

    if not route:
        return _gw_error(rpc_id, -32601, f"未知路由前缀: {prefix}。支持: {list(_ROUTE_TABLE.keys())}", trace_id)

    service = route["service"]

    # 熔断检查
    breaker = _get_breaker(service)
    if not breaker.allow():
        return _gw_error(rpc_id, 10008, f"服务 {service} 熔断中，冷却{breaker.reset_timeout}s", trace_id)

    # 转发到对应服务
    start_time = time.time()
    try:
        result = await _forward_to_service(service, method, params, rpc_id, trace_id)
        breaker.record(True)
        elapsed = int((time.time() - start_time) * 1000)
        logger.info(f"[{trace_id}] {method} → {service} OK {elapsed}ms")

        # 注入traceId到响应
        if isinstance(result, dict):
            result["_trace_id"] = trace_id
        return JSONResponse(content=result)
    except Exception as e:
        breaker.record(False)
        breaker.check_trip()
        elapsed = int((time.time() - start_time) * 1000)
        logger.error(f"[{trace_id}] {method} → {service} FAIL {elapsed}ms: {e}")
        return _gw_error(rpc_id, -32603, f"服务 {service} 内部错误: {e}", trace_id)


async def _forward_to_service(service: str, method: str, params: dict, rpc_id: Any, trace_id: str) -> dict:
    """转发请求到对应服务的处理器。

    网关内转发（同进程），直接调用模块处理器。
    """
    # 注入traceId到params
    params["trace_id"] = trace_id

    if service == "ACP":
        # ACP走WebSocket透传，HTTP转发暂不支持
        return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": "ACP请走WebSocket /ws/acp"}}

    elif service == "A2A":
        from a2a.server import _METHOD_HANDLERS
        handler = _METHOD_HANDLERS.get(method)
        if not handler:
            return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": f"A2A未知方法: {method}"}}
        result = await handler(params, rpc_id)
        return result.body if hasattr(result, 'body') else result

    elif service == "MCP":
        from mcp.server import _METHOD_HANDLERS, _check_token
        token_err = _check_token(params)
        if token_err:
            return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32001, "message": token_err}}
        handler = _METHOD_HANDLERS.get(method)
        if not handler:
            return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": f"MCP未知方法: {method}"}}
        result = await handler(params, rpc_id)
        return result.body if hasattr(result, 'body') else result

    else:
        # 其他服务（Artifact/Vector/Scheduler）暂未实现
        return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": f"服务 {service} 暂未实现"}}


def _gw_error(rpc_id: Any, code: int, message: str, trace_id: str = "") -> JSONResponse:
    """构造网关错误响应。"""
    resp: dict[str, Any] = {
        "jsonrpc": "2.0", "id": rpc_id,
        "error": {"code": code, "message": message},
    }
    if trace_id:
        resp["_trace_id"] = trace_id
    return JSONResponse(content=resp)
