"""
权限审批模块 — 拦截敏感操作（文件写入、命令执行），等待人工确认。
使用asyncio.Future实现异步等待，带超时自动拒绝机制。
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("acp-agent.permission")

# 默认审批超时时间（秒）
DEFAULT_TIMEOUT = 300  # 5分钟


@dataclass
class PermissionRequest:
    """权限审批请求，包含请求元数据和等待审批结果的Future"""
    request_id: str         # UUID，唯一标识
    session_id: str         # 所属会话ID
    description: str        # 人类可读的描述
    action_type: str        # "file_write" | "file_delete" | "command_exec"
    target: str             # 文件路径或命令内容
    preview: str            # diff预览或命令详情
    future: asyncio.Future  # 等待审批结果的Future


class PermissionManager:
    """权限审批管理器 — 拦截敏感操作，等待人工确认。确保所有等待都有超时，防止死锁"""

    def __init__(self, timeout: int = DEFAULT_TIMEOUT):
        """初始化，pending请求列表为空，设置默认超时时间"""
        self.pending: dict[str, PermissionRequest] = {}
        self.timeout = timeout

    async def request_file_write(self, session: Any, ws: Any, path: str, diff: str) -> bool:
        """请求文件写入权限。通过WebSocket发送审批请求，阻塞直到用户approve或deny

        Args:
            session: 当前会话对象
            ws: WebSocket连接对象
            path: 要写入的文件路径
            diff: 文件变更的unified diff预览

        Returns:
            bool: True表示用户批准，False表示拒绝或超时
        """
        return await self._request_approval(
            session=session,
            ws=ws,
            action_type="file_write",
            target=path,
            description=f"请求写入文件: {path}",
            preview=diff,
        )

    async def request_file_delete(self, session: Any, ws: Any, path: str) -> bool:
        """请求文件删除权限。通过WebSocket发送审批请求，等待用户确认

        Args:
            session: 当前会话对象
            ws: WebSocket连接对象
            path: 要删除的文件路径

        Returns:
            bool: True表示用户批准，False表示拒绝或超时
        """
        return await self._request_approval(
            session=session,
            ws=ws,
            action_type="file_delete",
            target=path,
            description=f"请求删除文件: {path}",
            preview=f"将删除文件: {path}",
        )

    async def request_command_exec(self, session: Any, ws: Any, command: str) -> bool:
        """请求终端命令执行权限。通过WebSocket发送审批请求，等待用户确认

        Args:
            session: 当前会话对象
            ws: WebSocket连接对象
            command: 要执行的终端命令

        Returns:
            bool: True表示用户批准，False表示拒绝或超时
        """
        return await self._request_approval(
            session=session,
            ws=ws,
            action_type="command_exec",
            target=command,
            description=f"请求执行命令: {command}",
            preview=command,
        )

    async def _request_approval(
        self,
        session: Any,
        ws: Any,
        action_type: str,
        target: str,
        description: str,
        preview: str,
    ) -> bool:
        """通用审批请求流程：创建请求→发送到客户端→等待审批结果（带超时）"""
        request_id = str(uuid.uuid4())
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        request = PermissionRequest(
            request_id=request_id,
            session_id=getattr(session, "session_id", "unknown"),
            description=description,
            action_type=action_type,
            target=target,
            preview=preview,
            future=future,
        )

        self.pending[request_id] = request
        logger.info("创建权限审批请求 [%s]: %s", request_id[:8], description)

        # 通过WebSocket发送审批请求到客户端
        try:
            approval_msg = json.dumps({
                "type": "session/request_permission",
                "requestId": request_id,
                "sessionId": request.session_id,
                "actionType": action_type,
                "target": target,
                "description": description,
                "preview": preview[:5000],  # 限制预览长度
            })
            if hasattr(ws, "send"):
                await ws.send(approval_msg)
        except Exception as e:
            logger.error("发送审批请求失败: %s", e)
            self.pending.pop(request_id, None)
            return False

        # 等待审批结果（带超时）
        try:
            result = await asyncio.wait_for(future, timeout=self.timeout)
            logger.info("审批结果 [%s]: %s", request_id[:8], "批准" if result else "拒绝")
            return result
        except asyncio.TimeoutError:
            logger.warning("审批超时 [%s]: %s，自动拒绝", request_id[:8], description)
            self.pending.pop(request_id, None)
            return False

    def resolve(self, request_id: str, approved: bool) -> None:
        """处理客户端返回的审批结果。找到对应请求并resolve其Future

        Args:
            request_id: 审批请求的UUID
            approved: 是否批准
        """
        request = self.pending.pop(request_id, None)
        if not request:
            logger.warning("未找到审批请求: %s", request_id[:8])
            return

        if not request.future.done():
            request.future.set_result(approved)
            logger.info("已处理审批 [%s]: %s", request_id[:8], "批准" if approved else "拒绝")

    def cancel_all(self, session_id: str) -> None:
        """取消某个会话的所有pending请求（会话结束时调用），全部按拒绝处理"""
        cancelled = []
        for req_id, request in list(self.pending.items()):
            if request.session_id == session_id:
                if not request.future.done():
                    request.future.set_result(False)
                self.pending.pop(req_id, None)
                cancelled.append(req_id)

        if cancelled:
            logger.info("已取消会话 %s 的 %d 个pending审批请求", session_id[:8], len(cancelled))
