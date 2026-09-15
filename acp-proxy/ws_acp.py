"""ACP WebSocket端点 — 所有Agent统一通过stdio子进程连接

传输层：WebSocket(前端) ↔ ACP Proxy ↔ stdio子进程(Agent)
- SoulMate: python -m agent.start --stdio
- Hermes: hermes acp
- OpenClaw: openclaw acp

ACP Proxy只做消息转发，不做任何协议转换。
"""

import asyncio
import json
import logging
import os
import re
from uuid import UUID

import jwt
import websockets
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = logging.getLogger("acp-proxy.ws_acp")

# JWT配置
_OPSOUL_ENV = {}
_env_path = "/home/climbing/opensoul/.env"
try:
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                _OPSOUL_ENV[k.strip()] = v.strip().strip('"').strip("'")
except FileNotFoundError:
    pass

JWT_SECRET = os.getenv("JWT_SECRET", _OPSOUL_ENV.get("JWT_SECRET", "openmate-jwt-secret"))
JWT_ALGORITHM = "HS256"

# Agent路由配置：agent_id → subprocess命令
AGENT_ROUTES = {
    "soulmate": {"cmd": ["python", "-m", "agent.start", "--stdio"], "cwd": "/home/climbing/openmate/acp-proxy"},
    "hermes": {"cmd": ["hermes", "acp"], "cwd": "/home/climbing"},
    "openclaw": {"cmd": ["openclaw", "acp"], "cwd": "/home/climbing"},
    "opencode": {"cmd": ["opencode", "acp"], "cwd": "/home/climbing"},
    "mimo": {"cmd": ["mimo", "acp"], "cwd": "/home/climbing"},
}

# 默认路由
DEFAULT_ROUTE = {"cmd": ["python", "-m", "agent.start", "--stdio"], "cwd": "/home/climbing/openmate/acp-proxy"}


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub") or payload.get("user_id")
        if uid:
            try:
                return str(UUID(uid))
            except ValueError:
                return uid
        return None
    except jwt.ExpiredSignatureError:
        logger.warning("[ACP] Token expired")
        return None
    except jwt.InvalidTokenError:
        logger.warning("[ACP] Invalid token")
        return None


async def _send_acp(ws: WebSocket, data: dict):
    await ws.send_text(json.dumps(data, ensure_ascii=False))


async def ws_acp_endpoint(client_ws: WebSocket):
    """//ws/acp WebSocket入口 — ACP JSON-RPC 2.0多Agent路由

    流程（ACP v1.0）：
    1. JWT鉴权
    2. 等待 initialize + session/new 消息提取agent_id
    3. 启动对应agent的stdio子进程
    4. 双向透传：WebSocket ↔ subprocess stdin/stdout
    """
    await client_ws.accept()

    token = client_ws.query_params.get("token", "")
    if not token:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Missing token"}})
        await client_ws.close()
        return

    user_id = decode_token(token)
    if not user_id:
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid token"}})
        await client_ws.close()
        return

    logger.info(f"[ACP] user {user_id} connected")

    # 收集客户端消息，等newSession来确定agent_id
    init_msg = None
    session_msg = None
    agent_id = None
    route = None

    # 先等initialize
    try:
        init_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=10)
    except Exception as e:
        logger.warning(f"[ACP] Failed to receive initialize: {e}")
        await client_ws.close()
        return

    if init_msg.get("method") != "initialize":
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": init_msg.get("id"), "error": {"code": -32600, "message": "First message must be initialize"}})
        await client_ws.close()
        return

    # 立即回复 initialize（代理响应，不含具体 agent 信息）
    await _send_acp(client_ws, {
        "jsonrpc": "2.0",
        "id": init_msg.get("id"),
        "result": {
            "protocolVersion": 1,
            "agentInfo": {"name": "openmate-proxy", "version": "0.1.0"},
            "agentCapabilities": {
                "promptCapabilities": {},
                "sessionCapabilities": {"fork": {}, "list": {}, "resume": {}}
            },
        }
    })
    logger.info(f"[ACP] initialize handshake OK for user {user_id}")

    # 初始化消息暂存，等session/new到了一起发
    buffered_msgs = [init_msg]
    
    # 等session/new（或newSession兼容旧前端）
    try:
        session_msg = await asyncio.wait_for(client_ws.receive_json(), timeout=30)
        buffered_msgs.append(session_msg)
    except Exception as e:
        logger.warning(f"[ACP] Failed to receive newSession: {e}")
        await client_ws.close()
        return

    # 提取agent_id
    params = session_msg.get("params", {})
    logger.info(f"[ACP] session/new raw params: {json.dumps(params, ensure_ascii=False)[:200]}")
    agent_id = params.get("agent_id") or params.get("agentId") or "soulmate"
    route = AGENT_ROUTES.get(agent_id)
    if route is None:
        # 未知agent自动尝试 {agent_id} acp，fallback到soulmate
        import shutil
        if shutil.which(agent_id):
            route = {"cmd": [agent_id, "acp"], "cwd": "/home/climbing"}
            logger.info(f"Dynamic route for '{agent_id}': {route['cmd']}")
        else:
            route = DEFAULT_ROUTE
            logger.warning(f"Agent '{agent_id}' not found, falling back to soulmate")
    logger.info(f"[ACP] user {user_id} → agent {agent_id} → {route['cmd']}")

    # 启动Agent子进程（Hermes需要用pty模式，因为hermes acp的asyncio不支持非TTY stdin）
    proc = None
    use_pty = agent_id == "hermes"
    try:
        if use_pty:
            import pty, termios, tty as tty_mod
            master_fd, slave_fd = pty.openpty()
            # 禁用 echo 和行缓冲，防止输入被回显到 stdout
            attrs = termios.tcgetattr(slave_fd)
            attrs[3] &= ~termios.ECHO & ~termios.ICANON  # lflag: 关闭 ECHO 和 CANONICAL
            termios.tcsetattr(slave_fd, termios.TCSANOW, attrs)
            proc = await asyncio.create_subprocess_exec(
                *route["cmd"],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                cwd=route.get("cwd"),
            )
            os.close(slave_fd)  # 子进程已fork，关闭slave端
        else:
            # 传递进化引擎API地址给子进程
            import os
            env = dict(os.environ)
            env["EVOLUTION_API_URL"] = "http://127.0.0.1:8092"
            proc = await asyncio.create_subprocess_exec(
                *route["cmd"],
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=route.get("cwd"),
                env=env,
            )
            # 增大 readline 限制（某些 agent 输出超长单行，如 opencode）
            proc.stdout._limit = 1024 * 1024  # 1MB
        logger.info(f"[ACP] Started {agent_id} subprocess (pid={proc.pid}, pty={use_pty})")
    except Exception as e:
        logger.error(f"[ACP] Failed to start {agent_id}: {e}")
        await _send_acp(client_ws, {"jsonrpc": "2.0", "id": session_msg.get("id"), "error": {"code": -32603, "message": f"Agent {agent_id} unavailable: {e}"}})
        await client_ws.close()
        return

    # 转发所有缓冲消息到子进程（initialize + session/new）
    # 注意：子进程（ACP SDK）期望 initialize params 里有 protocolVersion
    try:
        for msg in buffered_msgs:
            if msg.get("method") == "initialize":
                msg.setdefault("params", {})["protocolVersion"] = 1
            # session/new 的 agent_id 是给proxy路由用的，子进程不认识，去掉
            if msg.get("method") == "session/new":
                msg.setdefault("params", {}).pop("agent_id", None)
                msg.get("params", {}).pop("agentId", None)
                # 注入子进程需要的必填字段（cwd, mcpServers）
                p = msg["params"]
                if "cwd" not in p:
                    p["cwd"] = route.get("cwd", "/home/climbing")
                if "mcpServers" not in p:
                    p["mcpServers"] = []
            _msg = json.dumps(msg, ensure_ascii=False)
            if use_pty:
                os.write(master_fd, (_msg + "\n").encode())
            else:
                proc.stdin.write((_msg + "\n").encode())
                await proc.stdin.drain()
    except Exception as e:
        logger.error(f"[ACP] Failed to forward initial messages: {e}")
        proc.terminate()
        await client_ws.close()
        return

    # 双向透传：WebSocket ↔ subprocess
    async def ws_to_stdin():
        """WebSocket → subprocess stdin"""
        try:
            while True:
                raw = await client_ws.receive_text()
                # 过滤心跳ping消息，不传给子进程
                if '"method":"ping"' in raw or '"method": "ping"' in raw:
                    continue
                logger.info(f"[{user_id}] ws_to_stdin: forwarding {len(raw)} chars")
                if use_pty:
                    os.write(master_fd, (raw + "\n").encode())
                else:
                    proc.stdin.write((raw + "\n").encode())
                    await proc.stdin.drain()
        except (WebSocketDisconnect, ConnectionError):
            pass
        except Exception as e:
            logger.info(f"[{user_id}] ws_to_stdin ERROR: {e}")
        finally:
            try:
                if use_pty:
                    os.close(master_fd)
                else:
                    proc.stdin.close()
            except Exception:
                pass

    # ANSI 转义码清理正则
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\r')

    async def _process_line(msg: str, init_ids: set, agent_id: str, ws: WebSocket):
        """解析单行 JSON-RPC 消息并转发给客户端"""
        # 跳过非 JSON 行（某些 agent 的 banner/版本信息）
        try:
            parsed = json.loads(msg)
        except (json.JSONDecodeError, ValueError):
            logger.debug(f"[{agent_id}] skip non-JSON: {msg[:100]}")
            return
        # 过滤 subprocess 的 initialize 响应（Proxy 已经回复过）
        if parsed.get("id") in init_ids and "result" in parsed:
            logger.debug(f"[{agent_id}] skip subprocess initialize response (id={parsed['id']})")
            init_ids.discard(parsed["id"])
            return
        # 记录并转发给客户端
        logger.info(f"[{agent_id}] → client: id={parsed.get('id')} method={parsed.get('method')} has_result={'result' in parsed}")
        await ws.send_text(msg)

    async def stdout_to_ws():
        """subprocess stdout → WebSocket（过滤掉 subprocess 的 initialize 响应）"""
        # 只跟踪 initialize 的 request id（不包括 session/new 等其他 buffered 消息）
        init_ids: set = set()  # type: ignore
        for m in buffered_msgs:
            if m.get("method") == "initialize":
                init_ids.add(m.get("id"))
        logger.info(f"[{agent_id}] initialize request ids to filter: {init_ids}")
        loop = asyncio.get_event_loop()
        line_buf = ""  # pty 模式下的行缓冲
        try:
            while True:
                if use_pty:
                    # pty模式：用run_in_executor避免阻塞
                    raw = await loop.run_in_executor(None, os.read, master_fd, 65536)
                    if not raw:
                        break
                    # 清理 ANSI 转义码和 \r
                    decoded = ansi_escape.sub("", raw.decode(errors="replace"))
                    line_buf += decoded
                    # 按行分割，最后一段可能不完整，保留在 buffer 里
                    while "\n" in line_buf:
                        line, line_buf = line_buf.split("\n", 1)
                        msg = line.strip()
                        if msg:
                            await _process_line(msg, init_ids, agent_id, client_ws)
                else:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    msg = line.decode().strip()
                    if msg:
                        await _process_line(msg, init_ids, agent_id, client_ws)
        except (WebSocketDisconnect, ConnectionError):
            pass
        except Exception as e:
            logger.debug(f"[{user_id}] stdout_to_ws: {e}")

    async def stderr_drain():
        """subprocess stderr → log"""
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                logger.info(f"[{agent_id}] stderr: {line.decode().strip()}")
        except Exception:
            pass

    t1 = asyncio.create_task(ws_to_stdin())
    t2 = asyncio.create_task(stdout_to_ws())
    t3 = asyncio.create_task(stderr_drain())

    try:
        # 等待任一任务完成（WebSocket断开或子进程退出）
        done, pending = await asyncio.wait(
            [t1, t2], return_when=asyncio.FIRST_COMPLETED
        )
        # 判断是WebSocket断开还是子进程退出
        ws_disconnected = t1 in done and not t2.done()
        if ws_disconnected:
            # WebSocket断开但子进程还在跑 — 给宽限期完成当前工作
            logger.info(f"[ACP] WebSocket disconnected, giving subprocess 30s grace period")
            try:
                await asyncio.wait_for(asyncio.shield(t2), timeout=30)
                logger.info(f"[ACP] subprocess finished naturally during grace period")
            except asyncio.TimeoutError:
                logger.warning(f"[ACP] grace period expired, killing subprocess")
            except Exception:
                pass
        for t in pending:
            t.cancel()
    finally:
        t3.cancel()
        if proc.returncode is None:  # 子进程还活着才杀
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=5)
            except Exception:
                proc.kill()
        logger.info(f"[ACP] user {user_id} session with {agent_id} ended (exit={proc.returncode})")
