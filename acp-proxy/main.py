"""ACP Proxy — standalone service for OpenMate chat.

双实例交叉进化架构：
- 实例A (port 8092, strand_a, conservative)
- 实例B (port 8095, strand_b, aggressive)
- 由supervisor.sh管理，代码变更后自动重启
"""
import argparse
import logging
import os
import sys
import uvicorn

# Configure root logging
instance_id = os.environ.get("INSTANCE_ID", "")
log_file = f"/tmp/acp-proxy-{instance_id}.log" if instance_id else "/tmp/acp-proxy.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, encoding="utf-8"),
    ],
)

def main():
    parser = argparse.ArgumentParser(description="ACP Proxy")
    parser.add_argument("--port", type=int, default=int(os.environ.get("ACP_PROXY_PORT", "8092")))
    parser.add_argument("--instance", type=str, default=os.environ.get("INSTANCE_ID", "a"),
                        choices=["a", "b"], help="Instance ID (a or b)")
    args = parser.parse_args()

    # 设置环境变量供app.py读取
    os.environ["INSTANCE_ID"] = args.instance
    os.environ["ACP_PROXY_PORT"] = str(args.port)

    logger = logging.getLogger("acp-proxy")
    logger.info(f"Starting ACP Proxy instance {args.instance} on port {args.port}")

    uvicorn.run("app:app", host="0.0.0.0", port=args.port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
