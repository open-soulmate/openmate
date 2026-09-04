"""OpenMate内置Agent启动入口

支持两种模式：
1. WebSocket模式：python -m agent.start（默认，端口8787）
2. Stdio模式：python -m agent.start --stdio（供ACP Proxy通过spawn_stdio_transport调用）

用法：
    cd acp-proxy && python -m agent.start
    cd acp-proxy && python -m agent.start --stdio
"""

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from agent.llm_engine import LLMEngine

logger = logging.getLogger("acp-agent")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)


def load_llm_config() -> dict:
    config = {
        "api_key": os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        "base_url": os.environ.get("LLM_BASE_URL", os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")),
        "model": os.environ.get("LLM_MODEL", os.environ.get("OPENAI_MODEL", "qwen3:8b")),
    }
    logger.info(f"LLM config: base_url={config['base_url']}, model={config['model']}")
    return config


async def main():
    llm_config = load_llm_config()
    llm_engine = LLMEngine(**llm_config)

    # 检查是否是stdio模式（供ACP Proxy子进程调用）
    if "--stdio" in sys.argv:
        await _run_stdio(llm_engine)
    else:
        await _run_websocket(llm_engine)


async def _run_stdio(llm_engine: LLMEngine):
    """Stdio模式 — 通过stdin/stdout运行官方ACP协议

    供ACP Proxy通过acp.spawn_stdio_transport()调用。
    这是官方ACP的标准传输方式。
    """
    import acp
    from agent.soulmate_agent import SoulMateAgent

    agent = SoulMateAgent(llm_engine=llm_engine)
    logger.info("Starting SoulMate Agent in stdio mode (ACP v1.0)")

    # acp.run_agent 默认使用 sys.stdin/sys.stdout
    await acp.run_agent(agent=agent)


async def _run_websocket(llm_engine: LLMEngine):
    """WebSocket模式 — 启动WebSocket服务器"""
    from agent.acp_server import ACPServer

    host = os.environ.get("ACP_AGENT_HOST", "0.0.0.0")
    port = int(os.environ.get("ACP_AGENT_PORT", "8787"))

    acp_server = ACPServer(host=host, port=port)
    acp_server.llm_engine = llm_engine

    logger.info(f"Starting on ws://{host}:{port} (ACP v1.0 official)")

    try:
        await acp_server.serve()
    except KeyboardInterrupt:
        logger.info("Shutting down...")


if __name__ == "__main__":
    asyncio.run(main())
