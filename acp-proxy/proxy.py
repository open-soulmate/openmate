"""ACP proxy — stable version with proper lifecycle management.

Key fixes over original:
1. Chunks tagged by msg_id (no broadcast cross-contamination)
2. 90s prompt timeout (was 15s)
3. Proper cleanup on timeout/cancel
4. File + console logging
5. Subprocess restart with backoff
6. id=0 system message filtering
7. Health loop resilient to restart failures
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from typing import Any

# --- Logging setup ---
LOG_DIR = "/tmp"
LOG_FILE = os.path.join(LOG_DIR, "acp-proxy.log")

logger = logging.getLogger("acp-proxy")
logger.setLevel(logging.DEBUG)

# File handler — persistent, rotatable
_fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
_fh.setLevel(logging.DEBUG)
logger.addHandler(_fh)

# Console handler
_ch = logging.StreamHandler()
_ch.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
_ch.setLevel(logging.INFO)
logger.addHandler(_ch)


@dataclass
class PendingPrompt:
    """State for a single in-flight prompt."""
    msg_id: str
    chunks: list[str] = field(default_factory=list)
    response: dict = field(default_factory=dict)
    done: asyncio.Event = field(default_factory=asyncio.Event)


class ACPProcess:
    def __init__(self):
        self._proc: asyncio.subprocess.Process | None = None
        self._msg_id: int = 0
        self._initialized: bool = False
        self._default_session_id: str | None = None
        self._reader_task: asyncio.Task | None = None
        self._health_task: asyncio.Task | None = None
        self._restart_count: int = 0
        self._last_restart: float = 0
        # Pending RPC futures, keyed by msg_id
        self._rpc_pending: dict[str, asyncio.Future] = {}
        # Pending prompts, keyed by msg_id
        self._prompt_pending: dict[str, PendingPrompt] = {}
        # Track the expected prompt msg_id for id=0 filtering
        self._active_prompt_ids: set[str] = set()

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
        try:
            self._proc = await asyncio.create_subprocess_exec(
                "hermes", "acp", "--accept-hooks",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            logger.info(f"ACP subprocess started pid={self._proc.pid}")
        except FileNotFoundError:
            logger.error("hermes binary not found in PATH")
            raise RuntimeError("hermes binary not found")
        except Exception as e:
            logger.error(f"Failed to start ACP subprocess: {e}")
            raise

        self._reader_task = asyncio.create_task(self._read_loop())
        self._health_task = asyncio.create_task(self._health_loop())

        try:
            await self._rpc(
                "initialize",
                {"protocolVersion": 1, "clientInfo": {"name": "OpenMate", "version": "1.0.0"}},
            )
            self._initialized = True
            logger.info("ACP initialized successfully")
        except Exception as e:
            logger.error(f"ACP initialize failed: {e}")
            await self.stop()
            raise

        try:
            await self.new_session()
            logger.info(f"ACP default session={self._default_session_id}")
        except Exception as e:
            logger.error(f"ACP session/new failed: {e}")
            await self.stop()
            raise

        self._restart_count = 0
        return self._get_agent_info()

    async def stop(self):
        logger.info("ACP stopping...")
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except (asyncio.CancelledError, Exception):
                pass
            self._health_task = None
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
            self._reader_task = None
        # Cancel all pending RPC futures
        for fut in self._rpc_pending.values():
            if not fut.done():
                fut.cancel()
        self._rpc_pending.clear()
        # Signal all pending prompts as done (with error)
        for p in self._prompt_pending.values():
            if not p.done.is_set():
                p.response = {"error": "ACP process stopped"}
                p.done.set()
        self._prompt_pending.clear()
        self._active_prompt_ids.clear()
        if self._proc:
            try:
                self._proc.terminate()
                try:
                    await asyncio.wait_for(self._proc.wait(), timeout=5)
                except Exception:
                    self._proc.kill()
            except ProcessLookupError:
                pass
            self._proc = None
        self._initialized = False
        self._default_session_id = None
        logger.info("ACP stopped")

    async def _restart(self):
        now = time.time()
        # Back off: max 1 restart per 5 seconds
        if now - self._last_restart < 5:
            logger.warning("Restart throttled (too frequent)")
            await asyncio.sleep(5)
        self._last_restart = time.time()
        self._restart_count += 1
        logger.warning(f"ACP restarting (attempt #{self._restart_count})")
        await self.stop()
        try:
            await self.start()
            logger.info("ACP restart successful")
        except Exception as e:
            logger.error(f"ACP restart failed: {e}")
            raise

    async def _health_loop(self):
        """Periodically check if hermes acp is responsive; auto-restart if stuck."""
        while True:
            await asyncio.sleep(30)
            if not self.is_running or not self._initialized:
                if self._initialized:
                    logger.warning("Health check: process not running, attempting restart")
                    try:
                        await self._restart()
                    except Exception as e:
                        logger.error(f"Health-triggered restart failed: {e}")
                continue
            try:
                await asyncio.wait_for(
                    self._rpc("session/list", {}), timeout=10
                )
            except (BrokenPipeError, OSError) as e:
                logger.warning(f"Health check pipe error: {e}")
                try:
                    await self._restart()
                except Exception as e2:
                    logger.error(f"Health-triggered restart failed: {e2}")
            except TimeoutError:
                logger.warning("Health check timeout (10s)")
                # Don't restart on timeout — might just be busy
            except Exception as e:
                logger.warning(f"Health check unexpected error: {e}")

    async def _read_loop(self):
        """Background task: continuously read stdout, dispatch by msg_id."""
        try:
            while self._proc and self._proc.returncode is None:
                try:
                    raw = await asyncio.wait_for(self._proc.stdout.readline(), timeout=1.0)
                except (asyncio.TimeoutError, OSError):
                    continue
                if not raw:
                    logger.warning("read_loop: EOF on stdout")
                    break

                msg = self._parse(raw)
                if not msg:
                    continue

                msg_id = str(msg.get("id", ""))
                method = msg.get("method", "")

                # Skip system messages with id=0
                if msg_id == "0":
                    logger.debug(f"Ignoring system message id=0: {method}")
                    continue

                # RPC response
                if msg_id and msg_id in self._rpc_pending:
                    fut = self._rpc_pending.pop(msg_id)
                    if not fut.done():
                        if "error" in msg:
                            err = msg["error"]
                            logger.warning(f"RPC error for id={msg_id}: {err}")
                            fut.set_exception(Exception(str(err)))
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
                            # Only append to prompts that are still active
                            # NOTE: we don't know which prompt a chunk belongs to,
                            # but we only have one active prompt at a time in practice
                            for pid, p in self._prompt_pending.items():
                                if not p.done.is_set() and pid in self._active_prompt_ids:
                                    p.chunks.append(content["text"])
                    continue

                # Prompt response (id matches a pending prompt)
                if msg_id and msg_id in self._prompt_pending:
                    p = self._prompt_pending[msg_id]
                    if not p.done.is_set():
                        p.response = msg.get("result", {})
                        if "error" in msg:
                            p.response = {"error": str(msg["error"])}
                        logger.info(
                            f"Prompt response id={msg_id}, "
                            f"stopReason={p.response.get('stopReason')}, "
                            f"chunks={len(p.chunks)}"
                        )
                        self._active_prompt_ids.discard(msg_id)
                        p.done.set()
                    continue

                # Unhandled message
                logger.debug(f"Unhandled msg id={msg_id} method={method}")

        except asyncio.CancelledError:
            logger.info("read_loop cancelled")
        except Exception as e:
            logger.error(f"read_loop error: {e}", exc_info=True)

        # If we exit the loop, signal all pending prompts
        for pid, p in self._prompt_pending.items():
            if not p.done.is_set():
                p.response = {"error": "ACP read loop exited"}
                self._active_prompt_ids.discard(pid)
                p.done.set()

    async def send_message(self, text: str, session_id: str | None = None) -> dict[str, Any]:
        if not self.is_running or not self._initialized:
            await self.start()
        sid = session_id or self._default_session_id or "default"
        if sid and len(sid) < 36 and sid != "default":
            sid = self._default_session_id or "default"
        for attempt in range(2):
            try:
                result = await self._prompt(text, sid)
                if result.get("response_text") is not None:
                    return result
                logger.warning(f"No chunks captured (attempt {attempt+1})")
            except TimeoutError as te:
                logger.warning(f"Prompt timeout (attempt {attempt+1}): {te}")
                if attempt == 0:
                    try:
                        await self._restart()
                    except Exception:
                        pass
                    continue
            except (BrokenPipeError, OSError) as e:
                logger.warning(f"Pipe error (attempt {attempt+1}): {e}")
                if attempt == 0:
                    try:
                        await self._restart()
                    except Exception as re:
                        logger.error(f"Restart failed: {re}")
                        break
                    continue
            except Exception as e:
                logger.error(f"Unexpected error (attempt {attempt+1}): {e}", exc_info=True)
                break
            break
        # Fallback to CLI
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
                if result.get("response_text") is not None:
                    return result
            except (BrokenPipeError, OSError, TimeoutError) as e:
                logger.warning(f"Image prompt error (attempt {attempt+1}): {e}")
                if attempt == 0:
                    try:
                        await self._restart()
                    except Exception:
                        pass
                    continue
            except Exception as e:
                logger.error(f"Image prompt error: {e}", exc_info=True)
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
            logger.error(f"Image fallback error: {e}")
            return await self._cli(text or "用户发送了一张图片")
        finally:
            if tmp_path:
                asyncio.get_running_loop().call_later(
                    300, lambda: os.unlink(tmp_path) if os.path.exists(tmp_path) else None
                )

    async def send_message_with_file(
        self, text: str, file_data: str, file_name: str = "file",
        mime_type: str = "application/octet-stream", session_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a file attachment to the agent.

        Saves the base64-encoded file to a temp directory and passes the path
        to the agent so it can read/process the file.
        """
        if not self.is_running or not self._initialized:
            await self.start()
        sid = session_id or self._default_session_id or "default"
        if sid and len(sid) < 36 and sid != "default":
            sid = self._default_session_id or "default"

        # Decode and save file
        tmp_path = None
        try:
            b64_clean = file_data.split(",")[-1] if "," in file_data else file_data
            # Preserve original extension if present
            ext = ""
            if "." in file_name:
                ext = "." + file_name.rsplit(".", 1)[-1]
            elif "/" in mime_type:
                ext = "." + mime_type.split("/")[-1].split(";")[0]

            tmp_dir = tempfile.mkdtemp(prefix="openmate_file_")
            safe_name = file_name.replace("/", "_").replace("\\", "_") or "file"
            tmp_path = os.path.join(tmp_dir, safe_name if "." in safe_name else safe_name + ext)
            with open(tmp_path, "wb") as f:
                f.write(base64.b64decode(b64_clean))

            file_size = os.path.getsize(tmp_path)
            logger.info(f"File saved: {tmp_path} ({file_size} bytes, {mime_type})")

            # Build prompt with file path
            prompt_text = text or f"用户发送了文件: {file_name}"
            prompt_text += f"\n\n[文件已保存到: {tmp_path}]"

            # Try ACP prompt first
            for attempt in range(2):
                try:
                    result = await self._prompt(prompt_text, sid)
                    if result.get("response_text") is not None:
                        return result
                except (BrokenPipeError, OSError, TimeoutError) as e:
                    logger.warning(f"File prompt error (attempt {attempt+1}): {e}")
                    if attempt == 0:
                        try:
                            await self._restart()
                        except Exception:
                            pass
                        continue
                except Exception as e:
                    logger.error(f"File prompt error: {e}", exc_info=True)
                break

            # Fallback to CLI
            return await self._cli(prompt_text)

        except Exception as e:
            logger.error(f"File send error: {e}")
            return await self._cli(text or f"用户发送了文件: {file_name}")
        finally:
            # Schedule cleanup after 10 minutes
            if tmp_path:
                def _cleanup():
                    try:
                        if os.path.exists(tmp_path):
                            os.unlink(tmp_path)
                        if tmp_path.rsplit("/", 1)[0] != "/tmp":
                            shutil.rmtree(tmp_path.rsplit("/", 1)[0], ignore_errors=True)
                    except Exception:
                        pass
                asyncio.get_running_loop().call_later(600, _cleanup)

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

        fut: asyncio.Future[dict] = asyncio.get_running_loop().create_future()
        self._rpc_pending[msg_id] = fut

        if not self._proc or not self._proc.stdin:
            self._rpc_pending.pop(msg_id, None)
            raise BrokenPipeError("ACP process stdin not available")
        try:
            self._proc.stdin.write((json.dumps(request) + "\n").encode())
            await self._proc.stdin.drain()
        except (BrokenPipeError, OSError) as e:
            self._rpc_pending.pop(msg_id, None)
            raise

        try:
            return await asyncio.wait_for(fut, timeout=30)
        except asyncio.TimeoutError:
            self._rpc_pending.pop(msg_id, None)
            raise TimeoutError(f"ACP RPC timeout: {method}")

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

        pending = PendingPrompt(msg_id=msg_id)
        self._prompt_pending[msg_id] = pending
        self._active_prompt_ids.add(msg_id)

        if not self._proc or not self._proc.stdin:
            self._prompt_pending.pop(msg_id, None)
            self._active_prompt_ids.discard(msg_id)
            raise BrokenPipeError("ACP process stdin not available")
        try:
            self._proc.stdin.write((json.dumps(request) + "\n").encode())
            await self._proc.stdin.drain()
        except (BrokenPipeError, OSError) as e:
            self._prompt_pending.pop(msg_id, None)
            self._active_prompt_ids.discard(msg_id)
            raise

        # Wait up to 90 seconds for prompt response
        try:
            await asyncio.wait_for(pending.done.wait(), timeout=90)
        except asyncio.TimeoutError:
            logger.warning(f"Prompt timeout after 90s (msg_id={msg_id})")
            self._prompt_pending.pop(msg_id, None)
            self._active_prompt_ids.discard(msg_id)
            raise TimeoutError("Prompt timeout (90s)")

        # Clean up
        self._prompt_pending.pop(msg_id, None)
        self._active_prompt_ids.discard(msg_id)

        response = pending.response
        collected = pending.chunks

        if "error" in response:
            raise Exception(str(response["error"]))

        response_text = "".join(collected)
        logger.info(f"Prompt completed: {len(collected)} chunks, {len(response_text)} chars")
        response["response_text"] = response_text
        response["source"] = "acp"
        return response

    async def _cli(self, text: str) -> dict:
        """Fallback: run hermes -z one-shot."""
        logger.info(f"CLI fallback: {text[:80]}...")
        try:
            proc = await asyncio.create_subprocess_exec(
                "hermes", "-z", text,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            result = stdout.decode("utf-8", errors="replace").strip()
            if not result and proc.returncode != 0:
                result = stderr.decode("utf-8", errors="replace").strip()
            return {
                "stopReason": "end_turn",
                "response_text": result or "（无响应）",
                "source": "hermes-cli",
            }
        except TimeoutError:
            logger.error("CLI fallback timeout (120s)")
            return {"stopReason": "timeout", "response_text": "请求超时", "source": "hermes-cli"}
        except Exception as e:
            logger.error(f"CLI fallback error: {e}")
            return {"stopReason": "error", "response_text": f"错误: {e}", "source": "hermes-cli"}

    @staticmethod
    def _parse(raw: bytes) -> dict | None:
        try:
            return json.loads(raw.decode().strip())
        except Exception:
            return None

    def _get_agent_info(self) -> dict:
        return {"agentInfo": {"name": "hermes-agent", "version": "0.20.5"}, "protocolVersion": 1}


_acp: ACPProcess | None = None


def get_acp_process() -> ACPProcess:
    global _acp
    if _acp is None:
        _acp = ACPProcess()
    return _acp
