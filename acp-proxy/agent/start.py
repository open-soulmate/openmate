"""OpenMate内置Agent启动入口

组装ACP Server + LLM Engine + Agent Engine，启动WebSocket服务。
独立于现有的acp-proxy HTTP服务，可以单独运行。

用法：
    cd acp-proxy && python -m agent.start
    # 或
    python agent/start.py
"""

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv

# 加载.env配置
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from agent.acp_server import ACPServer
from agent.llm_engine import LLMEngine
from engine import AgentEngine

logger = logging.getLogger("acp-agent")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/tmp/acp-agent.log", encoding="utf-8"),
    ],
)


def load_llm_config() -> dict:
    """从环境变量或.env文件加载LLM配置

    优先级：环境变量 > .env文件 > 默认值
    """
    config = {
        "api_key": os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        "base_url": os.environ.get("LLM_BASE_URL", os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")),
        "model": os.environ.get("LLM_MODEL", os.environ.get("OPENAI_MODEL", "qwen3:8b")),
    }
    logger.info(f"LLM config: base_url={config['base_url']}, model={config['model']}")
    return config


async def main():
    """启动OpenMate内置Agent服务

    1. 加载LLM配置
    2. 创建ACP Server（默认端口8787）
    3. 创建LLM Engine
    4. 创建Agent Engine并绑定到Server
    5. 启动服务
    """
    host = os.environ.get("ACP_AGENT_HOST", "0.0.0.0")
    port = int(os.environ.get("ACP_AGENT_PORT", "8787"))

    # 加载LLM配置
    llm_config = load_llm_config()

    # 创建各组件
    acp_server = ACPServer(host=host, port=port)
    llm_engine = LLMEngine(**llm_config)
    agent_engine = AgentEngine(acp_server, llm_engine)

    # 注册引擎回调到ACP Server
    acp_server.set_engine_callback(agent_engine.run_task)

    logger.info(f"OpenMate Agent Engine starting on ws://{host}:{port}")

    try:
        await acp_server.serve()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await agent_engine.shutdown()
        await acp_server.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
