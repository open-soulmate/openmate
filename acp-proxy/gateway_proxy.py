"""轻量级反向代理 — 双实例健康感知网关 + 流量摘除

固定端口8091，前端只需连这一个地址。
支持：健康检查、流量摘除（drain）、进化锁
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path

import aiohttp
from aiohttp import web, ClientSession, ClientTimeout

logger = logging.getLogger("gateway")

BACKENDS = {
    "a": "http://127.0.0.1:8092",
    "b": "http://127.0.0.1:8095",
}

GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "8091"))
HEALTH_INTERVAL = 3
DATA_DIR = Path(__file__).parent / "data"


class HealthTracker:
    """跟踪后端实例健康状态 + 流量摘除"""

    def __init__(self):
        self.healthy: dict[str, bool] = {k: False for k in BACKENDS}
        # drain状态：True=该实例正在进化，不分配新流量
        self.draining: dict[str, bool] = {k: False for k in BACKENDS}

    async def check_loop(self, session: ClientSession):
        """定期健康检查"""
        while True:
            for bid, url in BACKENDS.items():
                try:
                    async with session.get(
                        f"{url}/health",
                        timeout=ClientTimeout(total=2),
                    ) as resp:
                        was = self.healthy[bid]
                        self.healthy[bid] = resp.status == 200
                        if not was and self.healthy[bid]:
                            logger.info(f"✅ Backend {bid} ({url}) online")
                        elif was and not self.healthy[bid]:
                            logger.warning(f"❌ Backend {bid} ({url}) offline")
                except Exception:
                    if self.healthy[bid]:
                        logger.warning(f"❌ Backend {bid} ({url}) unreachable")
                    self.healthy[bid] = False
            await asyncio.sleep(HEALTH_INTERVAL)

    def pick_backend(self) -> str | None:
        """选择一个健康的、未被摘除的后端"""
        for bid in ["a", "b"]:
            if self.healthy[bid] and not self.draining[bid]:
                return bid
        # 如果两个都在drain，返回健康但drain的（紧急情况）
        for bid in ["a", "b"]:
            if self.healthy[bid]:
                return bid
        return None

    def drain(self, instance_id: str):
        """标记实例为drain（进化开始前调用）"""
        self.draining[instance_id] = True
        logger.info(f"🔴 Instance {instance_id} DRAINED (evolution mode)")

    def undrain(self, instance_id: str):
        """恢复实例为可用"""
        self.draining[instance_id] = False
        logger.info(f"🟢 Instance {instance_id} AVAILABLE (back in pool)")

    def status(self) -> dict:
        return {
            "backends": {
                bid: {
                    "healthy": self.healthy[bid],
                    "draining": self.draining[bid],
                    "available": self.healthy[bid] and not self.draining[bid],
                    "url": BACKENDS[bid],
                }
                for bid in BACKENDS
            }
        }


health = HealthTracker()


# ── API端点（供进化引擎调用） ──

async def drain_handler(request: web.Request) -> web.Response:
    """POST /admin/drain/{instance_id} — 摘除流量"""
    iid = request.match_info["instance_id"]
    if iid not in BACKENDS:
        return web.json_response({"error": f"unknown instance {iid}"}, status=400)
    health.drain(iid)
    return web.json_response({"ok": True, "draining": iid})


async def undrain_handler(request: web.Request) -> web.Response:
    """POST /admin/undrain/{instance_id} — 恢复流量"""
    iid = request.match_info["instance_id"]
    if iid not in BACKENDS:
        return web.json_response({"error": f"unknown instance {iid}"}, status=400)
    health.undrain(iid)
    return web.json_response({"ok": True, "available": iid})


async def gw_status_handler(request: web.Request) -> web.Response:
    """GET /admin/status — 网关状态"""
    return web.json_response(health.status())


# ── 代理处理 ──

async def proxy_handler(request: web.Request) -> web.StreamResponse:
    """代理HTTP请求"""
    backend_id = health.pick_backend()
    if not backend_id:
        return web.json_response({"error": "All backends unavailable"}, status=503)

    backend_url = BACKENDS[backend_id]
    target_url = f"{backend_url}{request.path_qs}"
    session: ClientSession = request.app["client_session"]

    try:
        body = await request.read()
        headers = dict(request.headers)
        headers.pop("Host", None)

        async with session.request(
            method=request.method, url=target_url,
            headers=headers, data=body,
            timeout=ClientTimeout(total=300),
        ) as resp:
            resp_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() not in ("transfer-encoding", "content-encoding")
            }
            response = web.StreamResponse(status=resp.status, headers=resp_headers)
            await response.prepare(request)
            async for chunk in resp.content.iter_any():
                await response.write(chunk)
            await response.write_eof()
            return response
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        return web.json_response({"error": f"Backend {backend_id}: {e}"}, status=502)


async def ws_proxy_handler(request: web.Request) -> web.WebSocketResponse:
    """代理WebSocket"""
    backend_id = health.pick_backend()
    if not backend_id:
        return web.Response(status=503, text="All backends unavailable")

    backend_url = BACKENDS[backend_id].replace("http://", "ws://")
    target_url = f"{backend_url}{request.path}"
    if request.query_string:
        target_url += f"?{request.query_string}"

    session: ClientSession = request.app["client_session"]
    try:
        client_ws = await session.ws_connect(target_url, timeout=ClientTimeout(total=10))
    except Exception as e:
        logger.error(f"WS backend connect failed: {e}")
        return web.Response(status=502, text=f"Backend {backend_id} unavailable")

    server_ws = web.WebSocketResponse()
    await server_ws.prepare(request)

    async def forward(src, dst, label):
        try:
            async for msg in src:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    await dst.send_str(msg.data)
                elif msg.type == aiohttp.WSMsgType.BINARY:
                    await dst.send_bytes(msg.data)
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING):
                    break
        except Exception:
            pass
        finally:
            try:
                await dst.close()
            except Exception:
                pass

    await asyncio.gather(
        forward(server_ws, client_ws, "f→b"),
        forward(client_ws, server_ws, "b→f"),
        return_exceptions=True,
    )
    return server_ws


async def health_handler(request: web.Request) -> web.Response:
    """网关自身健康检查"""
    return web.json_response({"status": "ok", "service": "gateway", **health.status()})


async def on_startup(app: web.Application):
    app["client_session"] = ClientSession()
    app["health_task"] = asyncio.create_task(health.check_loop(app["client_session"]))
    os.makedirs(DATA_DIR, exist_ok=True)
    logger.info(f"🌐 Gateway on port {GATEWAY_PORT}")


async def on_cleanup(app: web.Application):
    app["health_task"].cancel()
    await app["client_session"].close()


def create_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    # 管理API
    app.router.add_get("/health", health_handler)
    app.router.add_get("/admin/status", gw_status_handler)
    app.router.add_post("/admin/drain/{instance_id}", drain_handler)
    app.router.add_post("/admin/undrain/{instance_id}", undrain_handler)

    # WebSocket
    app.router.add_get("/ws/acp", ws_proxy_handler)
    app.router.add_get("/ws/a2a", ws_proxy_handler)
    app.router.add_get("/ws/mcp", ws_proxy_handler)

    # 通用代理
    app.router.add_route("*", "/{path_info:.*}", proxy_handler)

    return app


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    web.run_app(create_app(), host="0.0.0.0", port=GATEWAY_PORT, print=None)


if __name__ == "__main__":
    main()
