"""SoulMate Agent — 实现官方 acp.Agent 协议

使用 agent-client-protocol 官方 Python SDK 的 Agent 协议类，
通过 acp.run_agent() 在 stdio 上传输 ACP v1.0 标准协议。
"""

import logging
import time
import uuid
from typing import Any

import acp
from acp.schema import (
    AgentCapabilities,
    AgentMessageChunk,
    CloseSessionResponse,
    ForkSessionResponse,
    Implementation,
    ListSessionsResponse,
    PromptCapabilities,
    PromptResponse,
    ResumeSessionResponse,
    SessionCapabilities,
    SessionForkCapabilities,
    SessionInfo,
    SessionListCapabilities,
    SessionResumeCapabilities,
    TextContentBlock,
)

from agent.llm_engine import LLMEngine

logger = logging.getLogger("acp-agent.soulmate")


class SoulMateAgent:
    """SoulMate Agent — 实现官方 acp.Agent 协议

    通过 acp.run_agent() 运行，处理 initialize/newSession/prompt 等标准 ACP 方法。
    内部使用 LLMEngine 进行推理，通过 AgentSideConnection.session_update() 推送流式事件。
    """

    def __init__(self, llm_engine: LLMEngine):
        self.llm_engine = llm_engine
        self.sessions: dict[str, dict] = {}  # session_id -> session state
        self._client = None  # AgentSideConnection，由 on_connect 设置

    # ── ACP 协议方法 ──────────────────────────────────────────────

    async def initialize(
        self,
        protocol_version: int,
        client_capabilities=None,
        client_info=None,
        **kwargs,
    ) -> acp.InitializeResponse:
        """ACP initialize 握手 — 协议版本协商"""
        logger.info(f"ACP initialize: protocol_version={protocol_version}, client={client_info}")
        return acp.InitializeResponse(
            protocol_version=acp.PROTOCOL_VERSION,
            agent_info=Implementation(name="soulmate-agent", version="0.1.0"),
            agent_capabilities=AgentCapabilities(
                prompt_capabilities=PromptCapabilities(),
                session_capabilities=SessionCapabilities(
                    list=SessionListCapabilities(),
                    fork=SessionForkCapabilities(),
                    resume=SessionResumeCapabilities(),
                ),
            ),
        )

    async def new_session(self, cwd: str = "/", mcp_servers=None, **kwargs) -> acp.NewSessionResponse:
        """创建新会话"""
        sid = f"om-{uuid.uuid4().hex[:12]}"
        self.sessions[sid] = {
            "session_id": sid,
            "cwd": cwd,
            "messages": [],
            "created_at": time.time(),
            "state": "active",
        }
        logger.info(f"New session: {sid}, cwd={cwd}")
        return acp.NewSessionResponse(session_id=sid)

    async def prompt(
        self,
        prompt: list,
        session_id: str,
        message_id: str | None = None,
        **kwargs,
    ) -> PromptResponse:
        """处理用户 prompt — 调用 LLM 推理并流式返回结果

        流式推送：通过 AgentSideConnection.session_update() 发送 AgentMessageChunk，
        客户端收到 session_update 通知即可实时显示生成内容。
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.error(f"Session not found: {session_id}")
            return PromptResponse(stop_reason="refusal")

        # 提取文本内容 — prompt 是 TextContentBlock | ImageContentBlock | ... 列表
        user_text = ""
        for block in prompt:
            if hasattr(block, "text"):
                user_text += block.text
            elif isinstance(block, dict):
                if block.get("type") == "text":
                    user_text += block.get("text", "")

        if not user_text.strip():
            return PromptResponse(stop_reason="end_turn")

        session["messages"].append({"role": "user", "content": user_text})
        logger.info(f"Prompt [{session_id}]: {user_text[:100]}")

        # 构建上下文消息
        messages = session["messages"].copy()

        # 调用 LLM 推理并流式推送
        full_response = ""
        try:
            async for chunk_text in self.llm_engine.chat_stream(
                messages=messages,
                system_prompt="你是SoulMate，OpenMate内置的AI助手。请用简洁清晰的中文回答。",
            ):
                # chat_stream 直接 yield 纯文本 delta
                if not chunk_text:
                    continue
                full_response += chunk_text

                # 通过 AgentSideConnection.session_update 推送流式内容
                # content 必须是 TextContentBlock（不是裸字符串）
                if self._client is not None:
                    await self._client.session_update(
                        session_id=session_id,
                        update=acp.update_agent_message_text(chunk_text),
                    )

        except Exception as e:
            logger.error(f"LLM error: {e}", exc_info=True)
            full_response = f"推理错误: {e}"
            # 推送错误信息
            if self._client is not None:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(full_response),
                )

        session["messages"].append({"role": "assistant", "content": full_response})
        logger.info(f"Response [{session_id}]: {full_response[:100]}")

        return PromptResponse(stop_reason="end_turn")

    async def cancel(self, session_id: str, **kwargs) -> None:
        """取消当前操作"""
        logger.info(f"Cancel: {session_id}")

    async def load_session(
        self, cwd: str, session_id: str, mcp_servers=None, **kwargs
    ) -> acp.LoadSessionResponse | None:
        """加载已有会话"""
        session = self.sessions.get(session_id)
        if not session:
            return None
        logger.info(f"Loaded session: {session_id}")
        return acp.LoadSessionResponse()

    async def list_sessions(self, cursor=None, cwd=None, **kwargs) -> ListSessionsResponse:
        """列出所有会话"""
        session_list = [
            SessionInfo(
                session_id=s["session_id"],
                cwd=s.get("cwd", ""),
                title=f"Session {s['session_id']}",
            )
            for s in self.sessions.values()
        ]
        return ListSessionsResponse(sessions=session_list)

    async def resume_session(
        self, cwd: str, session_id: str, mcp_servers=None, **kwargs
    ) -> ResumeSessionResponse | None:
        """恢复会话"""
        session = self.sessions.get(session_id)
        if not session:
            return None
        logger.info(f"Resumed session: {session_id}")
        return ResumeSessionResponse()

    async def close_session(self, session_id: str, **kwargs) -> CloseSessionResponse | None:
        """关闭会话"""
        session = self.sessions.pop(session_id, None)
        if session:
            logger.info(f"Closed session: {session_id}")
            return CloseSessionResponse()
        return None

    async def fork_session(self, cwd: str, session_id: str, mcp_servers=None, **kwargs) -> ForkSessionResponse:
        """Fork 会话 — 复制会话历史到新会话"""
        original = self.sessions.get(session_id)
        if not original:
            new_sid = f"om-{uuid.uuid4().hex[:12]}"
            self.sessions[new_sid] = {
                "session_id": new_sid,
                "cwd": cwd,
                "messages": [],
                "created_at": time.time(),
                "state": "active",
            }
            return ForkSessionResponse(session_id=new_sid)

        new_sid = f"om-{uuid.uuid4().hex[:12]}"
        self.sessions[new_sid] = {
            "session_id": new_sid,
            "cwd": cwd,
            "messages": original["messages"].copy(),
            "created_at": time.time(),
            "state": "active",
        }
        logger.info(f"Forked session {session_id} -> {new_sid}")
        return ForkSessionResponse(session_id=new_sid)

    async def authenticate(self, method_id: str, **kwargs):
        """认证（暂不实现）"""
        return None

    async def set_session_mode(self, mode_id: str, session_id: str, **kwargs):
        """设置会话模式"""
        pass

    async def set_session_model(self, model_id: str, session_id: str, **kwargs):
        """设置会话模型"""
        pass

    async def set_config_option(self, config_id: str, session_id: str, value=None, **kwargs):
        """设置配置选项"""
        pass

    async def ext_method(self, method: str, params: dict, **kwargs):
        """扩展方法"""
        return {}

    async def ext_notification(self, method: str, params: dict, **kwargs):
        """扩展通知"""
        pass

    def on_connect(self, conn) -> None:
        """客户端连接回调 — 保存 AgentSideConnection 引用用于 session_update

        注意：此方法是同步的，由 AgentSideConnection.__init__ 直接调用。
        conn 是 AgentSideConnection 实例，实现了 Client 协议的 session_update 方法。
        """
        self._client = conn
        logger.info("ACP client connected — on_connect called")
