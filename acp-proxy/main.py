"""ACP Proxy — standalone service for OpenMate chat.

Manages hermes acp subprocess, handles WebSocket chat,
and provides ACP HTTP API. Separated from OpenSoul (memory kernel).

Port: 8092 (configurable via ACP_PROXY_PORT env var)
"""

import logging
import os
import uvicorn

# Configure root logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/tmp/acp-proxy.log", encoding="utf-8"),
    ],
)

PORT = int(os.environ.get("ACP_PROXY_PORT", "8092"))

if __name__ == "__main__":
    logging.getLogger("acp-proxy").info(f"Starting ACP Proxy on port {PORT}")
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False, log_level="info")
