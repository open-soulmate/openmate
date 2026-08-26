"""ACP Proxy — standalone service for OpenMate chat.

Manages hermes acp subprocess, handles WebSocket chat,
and provides ACP HTTP API. Separated from OpenSoul (memory kernel).

Port: 8092 (configurable via ACP_PROXY_PORT env var)
"""

import os
import uvicorn

PORT = int(os.environ.get("ACP_PROXY_PORT", "8092"))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)
