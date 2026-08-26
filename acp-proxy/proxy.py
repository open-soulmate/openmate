"""ACP proxy with hermes -z fallback.

Architecture: background reader task continuously consumes stdout from
the hermes acp process, dispatching responses to waiting callers via
asyncio Futures. This prevents stale event accumulation.
"""

import asyncio
import base64
import json
import logging
import os
import tempfile
import time
from typing import Any

logger = logging.getLogger(__name__)


class ACPProcess:
    def __init__(self):
        self._proc: asyncio.subprocess.Process | None = None
        self._msg_id: int = 0
        self._initialized: bool = False
        self._default_session_id: str | None = None
        self._reader_task: asyncio.Task | None = None
        # Pending RPC/prompt futures, keyed by msg_id
        self._pending: dict[str, asyncio.Future] = {}
        # Current prompt chunk collector
        self._prompt_chunks: list[str] = []
        self._prompt_done: asyncio.Event | None = None
        self._prompt_response: dict = {}

    @property
    def is_running(self) -> bool:
        if self._proc is None or self._proc.returncode is not None:
            return False
        if self._proc.stdin and self._proc.stdin.is_closing():
            return False
        return True

    async def start(self):
        if self.is_running:
            return self._get_agent_info()

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        self._proc = await asyncio.create_subprocess_exec(
            "hermes", "acp", "--accept-hooks",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        print(f"ACP: started pid={self._proc.pid}", flush=True)

        # Start background reader
        self._reader_task = asyncio.create_task(self._read_loop())

        await self._rpc(
            "initialize",
            {"protocolVersion": 1, "clientInfo": {"name": "OpenMate", "version": "1.0.0"}},
        )
        self._initialized = True
        print("ACP: initialized", flush=True)

        await self.new_session()
        print(f"ACP: default session={self._default_session_id}", flush=True)

        return self._get_agent_info()

    async def stop(self):
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
            self._reader_task = None
        # Cancel pending futures
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()
        self._pending.clear()
        if self._proc:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except Exception:
                self._proc.kill()
            self._proc = None
        self._initialized = False
        self._default_session_id = None

    async def _restart(self):
        print("ACP: restarting due to broken pipe / stale process", flush=True)
        logger.warning("ACP: restarting due to broken pipe / stale process")
        await self.stop()
        await self.start()

    async def _read_loop(self):
        """Background task: continuously read stdout, dispatch to pending futures."""
        try:
            while self._proc and self._proc.returncode is None:
                try:
                    raw = await asyncio.wait_for(self._proc.stdout.readline(), timeout=1.0)
                except (asyncio.TimeoutError, OSError):
                    continue
                if not raw:
                    break

                msg = self._parse(raw)
                if not msg:
                    continue

                msg_id = str(msg.get("id", ""))
                method = msg.get("method", "")

                # RPC response (has matching id in _pending)
                if msg_id and msg_id in self._pending:
                    fut = self._pending.pop(msg_id)
                    if not fut.done():
                        if "error" in msg:
                            fut.set_exception(Exception(msg["error"]))
                        else:
                            fut.set_result(msg.get("result", {}))
                    continue

                # Prompt chunk event
                if method == "session/update":
                    update = msg.get("params", {}).get("update", {})
                    su = update.get("sessionUpdate", "")
                    if su == "agent_message_chunk":
                        content = update.get("content", {})
                        if isinstance(content, dict) and content.get("type") == "text" and content.get("text"):
                            self._prompt_chunks.append(content["text"])
                    elif su == "usage_update" and self._prompt_done and self._prompt_response:
                        print(f"ACP reader: usage_update, setting prompt_done", flush=True)
                        self._prompt_done.set()

                # Prompt response (id matches current prompt)
                if msg_id and self._prompt_done and not self._prompt_done.is_set():
                    self._prompt_response = msg.get("result", {})
                    if "error" in msg:
                        self._prompt_response = {"error": msg["error"]}
                    print(f"ACP reader: prompt response id={msg_id}, stopReason={self._prompt_response.get('stopReason')}", flush=True)
                    # Set done immediately — don't wait for usage_update (may not come)
                    self._prompt_done.set()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"ACP read loop error: {e}")
            print(f"ACP: read loop error: {e}", flush=True)

    async def send_message(self, text: str, session_id: str | None = None) -> dict[str, Any]:
        if not self.is_running or not self._initialized:
            await self.start()
        sid = session_id or self._default_session_id or "default"
        if sid and len(sid) < 36 and sid != "default":
            sid = self._default_session_id or "default"
        for attempt in range(2):
            try:
                result = await self._prompt(text, sid)
                if result.get("response_text"):
                    return result
                print("ACP: no chunks captured, using hermes -z", flush=True)
            except (BrokenPipeError, OSError) as e:
                print(f"ACP: pipe error {e}, restarting (attempt {attempt+1})", flush=True)
                if attempt == 0:
                    await self._restart()
                    continue
            except Exception as e:
                print(f"ACP: error {e}, falling back to hermes -z", flush=True)
            break
        return await self._cli(text)

    async def send_message_with_image(
        self, text: str, image_data: str, mime_type: str = "image/png", session_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.is_running or not self._initialized:
            await self.start()
        sid = session_id or self._default_session_id or "default"
        if sid and len(sid) < 36 and sid != "default":
            sid = self._default_session_id or "default"
        for attempt in range(2):
            try:
                parts = []
                if text:
                    parts.append({"type": "text", "text": text})
                b64 = image_data.split(",")[-1] if "," in image_data else image_data
                parts.append({"type": "image", "data": b64, "mimeType": mime_type})
                result = await self._prompt_parts(parts, sid)
                if result.get("response_text"):
                    return result
            except (BrokenPipeError, OSError) as e:
                print(f"ACP: image pipe error {e}, restarting (attempt {attempt+1})", flush=True)
                if attempt == 0:
                    await self._restart()
                    continue
            except Exception as e:
                print(f"ACP: image error {e}", flush=True)
            break
        # Fallback: save image to temp file
        tmp_path = None
        try:
            b64_clean = image_data.split(",")[-1] if "," in image_data else image_data
            ext = mime_type.split("/")[-1].split(";")[0] or "png"
            fd, tmp_path = tempfile.mkstemp(suffix=f".{ext}", prefix="openmate_img_")
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(b64_clean))
            prompt = f"{text or '用户发送了一张图片'}\n\n[图片已保存到: {tmp_path}]"
            return await self._cli(prompt)
        except Exception as e:
            print(f"ACP: image fallback error {e}", flush=True)
            return await self._cli(text or "用户发送了一张图片")
        finally:
            if tmp_path:
                asyncio.get_event_loop().call_later(300, lambda: os.unlink(tmp_path) if os.path.exists(tmp_path) else None)

    async def list_sessions(self) -> list[dict]:
        if not self.is_running or not self._initialized:
            await self.start()
        resp = await self._rpc("session/list", {})
        return resp.get("sessions", [])

    async def new_session(self, cwd: str = "/home/climbing") -> dict:
        if not self.is_running or not self._initialized:
            await self.start()
        resp = await self._rpc("session/new", {"cwd": cwd, "mcpServers": []})
        sid = resp.get("sessionId") or resp.get("session_id")
        if sid:
            self._default_session_id = sid
        return resp

    # ---- Internal ----

    async def _rpc(self, method: str, params: dict) -> dict:
        """Send RPC, wait for matching response via background reader."""
        self._msg_id += 1
        msg_id = str(self._msg_id)
        request = {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params}

        fut: asyncio.Future[dict] = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = fut

        self._proc.stdin.write((json.dumps(request) + "\n").encode())
        await self._proc.stdin.drain()

        try:
            return await asyncio.wait_for(fut, timeout=30)
        except asyncio.TimeoutError:
            self._pending.pop(msg_id, None)
            raise TimeoutError(f"ACP timeout: {method}")

    async def _prompt(self, text: str, session_id: str) -> dict:
        return await self._prompt_parts([{"type": "text", "text": text}], session_id)

    async def _prompt_parts(self, parts: list[dict], session_id: str) -> dict:
        """Send prompt, collect chunks via background reader."""
        self._msg_id += 1
        msg_id = str(self._msg_id)
        request = {
            "jsonrpc": "2.0", "id": msg_id,
            "method": "session/prompt",
            "params": {"prompt": parts, "sessionId": session_id},
        }

        # Set up chunk collector
        self._prompt_chunks = []
        self._prompt_response = {}
        self._prompt_done = asyncio.Event()

        self._proc.stdin.write((json.dumps(request) + "\n").encode())
        await self._proc.stdin.drain()

        # Wait for usage_update (signaled by _read_loop) or timeout
        try:
            await asyncio.wait_for(self._prompt_done.wait(), timeout=60)
        except asyncio.TimeoutError:
            pass

        # Clean up
        self._prompt_done = None

        response = self._prompt_response
        collected = self._prompt_chunks

        if "error" in response:
            raise Exception(response["error"])

        print(f"ACP: {len(collected)} chunks", flush=True)
        response["response_text"] = "".join(collected)
        response["source"] = "acp"
        return response

    async def _cli(self, text: str) -> dict:
        try:
            proc = await asyncio.create_subprocess_exec(
                "hermes", "-z", text,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
            return {
                "stopReason": "end_turn",
                "response_text": stdout.decode("utf-8", errors="replace").strip(),
                "source": "hermes-cli",
            }
        except TimeoutError:
            return {"stopReason": "timeout", "response_text": "请求超时", "source": "hermes-cli"}
        except Exception as e:
            return {"stopReason": "error", "response_text": f"错误: {e}", "source": "hermes-cli"}

    @staticmethod
    def _parse(raw: bytes) -> dict | None:
        try:
            return json.loads(raw.decode().strip())
        except Exception:
            return None

    def _get_agent_info(self) -> dict:
        return {"agentInfo": {"name": "hermes-agent", "version": "0.20.0"}, "protocolVersion": 1}


_acp: ACPProcess | None = None


def get_acp_process() -> ACPProcess:
    global _acp
    if _acp is None:
        _acp = ACPProcess()
    return _acp
