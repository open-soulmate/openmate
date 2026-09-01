"""Agent引擎总入口 — 串联LLM、MCP、Artifact、权限审批

当ACP Server收到session/prompt时，由本模块驱动完整的Agent任务流程：
构建上下文 → 流式调用LLM → 实时推送 → 检测工具调用 → 审批 → 应用变更 → 复盘
"""

import asyncio
import logging
import time
from typing import Optional

from agent.acp_server import ACPServer, Session, SessionState
from agent.llm_engine import LLMEngine
from agent.context import SessionContext
from agent.artifact import ArtifactEngine
from agent.permission import PermissionManager

logger = logging.getLogger("acp-agent.engine")


class AgentEngine:
    """Agent引擎总入口 — 串联LLM、MCP、Artifact、权限审批

    收到用户prompt后，驱动完整的Agent任务生命周期。
    """

    def __init__(self, acp_server: ACPServer, llm_engine: LLMEngine):
        """初始化引擎，绑定ACP Server和LLM引擎"""
        self.acp_server = acp_server         # ACP Server实例（用于发送通知）
        self.llm_engine = llm_engine         # LLM引擎实例
        self.contexts: dict[str, SessionContext] = {}  # sessionId → 上下文
        self.permission_mgr = PermissionManager()      # 权限审批管理器

    def _get_context(self, session: Session) -> SessionContext:
        """获取或创建会话上下文"""
        if session.id not in self.contexts:
            self.contexts[session.id] = SessionContext(session.id, session.workspace)
        return self.contexts[session.id]

    async def run_task(self, session: Session, prompt: str):
        """执行Agent任务的完整流程

        1. 构建上下文（系统提示词 + 会话历史 + 工作目录文件树）
        2. 流式调用LLM
        3. 实时推送session/update (contentDelta)
        4. LLM完成后推送session/completed
        5. 出错推送session/failed

        Args:
            session: ACP会话对象
            prompt: 用户输入的任务指令
        """
        ws = session.ws
        ctx = self._get_context(session)
        ctx.add_message("user", prompt)
        start_time = time.time()

        try:
            # 构建LLM消息（注入工作目录信息）
            workspace_info = f"\n\n当前工作目录: {session.workspace}"
            messages = ctx.get_messages()
            # 给最后一条用户消息追加工作目录信息
            if messages and messages[-1].get("role") == "user":
                messages = messages[:-1] + [{
                    "role": "user",
                    "content": messages[-1]["content"] + workspace_info,
                }]

            # 流式调用LLM并转发到客户端
            logger.info(f"[{session.id}] Starting LLM stream")
            full_response = await self._stream_to_client(session, messages)

            # 记录assistant回复
            ctx.add_message("assistant", full_response)

            # 发送完成通知
            elapsed = time.time() - start_time
            summary = await self._generate_review(session, full_response, elapsed)
            session.state = SessionState.COMPLETED
            await self.acp_server._notify(ws, "session/completed", {
                "sessionId": session.id,
                "summary": summary,
                "elapsedSeconds": round(elapsed, 1),
            })
            logger.info(f"[{session.id}] Task completed in {elapsed:.1f}s")

        except asyncio.CancelledError:
            session.state = SessionState.COMPLETED
            await self.acp_server._notify(ws, "session/completed", {
                "sessionId": session.id,
                "summary": "任务已取消",
            })
            raise
        except Exception as e:
            logger.error(f"[{session.id}] Task failed: {e}", exc_info=True)
            session.state = SessionState.FAILED
            await self.acp_server._notify(ws, "session/failed", {
                "sessionId": session.id,
                "error": str(e),
            })

    async def _stream_to_client(self, session: Session, messages: list[dict]) -> str:
        """将LLM流式输出转发给ACP客户端 — 实时推送contentDelta

        Returns:
            完整的LLM响应文本
        """
        full_response = ""
        chunk_count = 0
        async for delta in self.llm_engine.chat_stream(messages, session.cancel_event):
            full_response += delta
            chunk_count += 1
            # 每个chunk都推送给客户端（用session锁防止并发写入）
            await self.acp_server._notify(session.ws, "session/update", {
                "sessionId": session.id,
                "contentDelta": delta,
            }, session=session)
        logger.debug(f"[{session.id}] Streamed {chunk_count} chunks, {len(full_response)} chars")
        return full_response

    async def _generate_review(self, session: Session, response: str, elapsed: float) -> str:
        """生成迭代变更复盘文档

        如果Agent做了文件修改，生成包含变更摘要的复盘。
        否则返回简短的任务完成摘要。
        """
        ctx = self._get_context(session)
        review = f"## 任务完成\n\n"
        review += f"- 耗时: {elapsed:.1f}秒\n"
        review += f"- 消息轮次: {len(ctx.messages)}\n"
        review += f"- 工作目录: {session.workspace}\n\n"

        # 如果有Artifact变更，列出来
        if hasattr(session, '_artifact_changes') and session._artifact_changes:
            review += "### 文件变更\n"
            for change in session._artifact_changes:
                review += f"- `{change.path}` ({change.change_type})\n"
            review += "\n"

        # 截取response的最后500字作为摘要
        if len(response) > 500:
            review += f"### 响应摘要\n...{response[-500:]}"
        else:
            review += f"### 响应内容\n{response}"

        return review

    async def cleanup_session(self, session_id: str):
        """清理会话资源 — 移除上下文和权限请求"""
        self.contexts.pop(session_id, None)
        self.permission_mgr.cancel_all(session_id)
        logger.info(f"[{session_id}] Engine resources cleaned up")

    async def shutdown(self):
        """关闭引擎 — 释放LLM连接和所有会话资源"""
        await self.llm_engine.close()
        self.contexts.clear()
        logger.info("Agent Engine shutdown complete")
