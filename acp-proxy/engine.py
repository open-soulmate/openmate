"""Agent引擎总入口 — 串联LLM、MCP、Artifact、权限审批

当ACP Server收到session.prompt时，由本模块驱动完整的Agent任务流程：
构建上下文 → 流式调用LLM → 实时推送 → 检测工具调用 → 审批 → 应用变更 → 复盘

ACP v1.0: 所有事件统一走 session.event，通过 event_type 区分类型。
"""

import asyncio
import json
import logging
import os
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
        3. 实时推送session.event(event_type=message, content_delta)
        4. LLM完成后推送session.event(event_type=completed)
        5. 出错推送session.event(event_type=failed)

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
                last_content = messages[-1]["content"]
                # 兼容str和list两种content格式
                if isinstance(last_content, list):
                    # list格式: [{"type":"text","text":"..."}]
                    last_content = "".join(
                        p.get("text", "") for p in last_content if isinstance(p, dict)
                    )
                messages = messages[:-1] + [{
                    "role": "user",
                    "content": last_content + workspace_info,
                }]

            # 进入Agent工具调用循环（支持多轮function calling）
            logger.info(f"[{session.id}] Starting agent loop with function calling")
            full_response = await self._agent_loop(session, messages, ctx)

            # 发送完成通知
            elapsed = time.time() - start_time
            summary = await self._generate_review(session, full_response, elapsed)
            session.state = SessionState.COMPLETED
            await self.acp_server.emit_completed(session, summary=summary)
            logger.info(f"[{session.id}] Task completed in {elapsed:.1f}s")

        except asyncio.CancelledError:
            session.state = SessionState.COMPLETED
            await self.acp_server.emit_completed(session, summary="任务已取消")
            raise
        except Exception as e:
            logger.error(f"[{session.id}] Task failed: {e}", exc_info=True)
            session.state = SessionState.FAILED
            await self.acp_server.emit_failed(session, error=str(e))

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
            await self.acp_server.emit_message(session, content=full_response, content_delta=delta)
        logger.debug(f"[{session.id}] Streamed {chunk_count} chunks, {len(full_response)} chars")
        return full_response

    async def _agent_loop(
        self, session: Session, messages: list[dict], ctx: SessionContext
    ) -> str:
        """Agent工具调用循环 — LLM流式调用 + 自动执行tool_calls

        核心循环：
        1. 流式调用LLM（带tools定义）
        2. 收集文本delta和tool_calls
        3. 如果有tool_calls → 执行工具 → 结果加入上下文 → 回到步骤1
        4. 如果无tool_calls → 返回完整文本响应

        最多循环MAX_TOOL_ROUNDS轮，防止死循环。

        Args:
            session: ACP会话对象
            messages: LLM消息列表
            ctx: 会话上下文（用于追加工具调用消息）

        Returns:
            最终的完整文本响应
        """
        MAX_TOOL_ROUNDS = 10
        ws = session.ws
        tools = self._get_tool_definitions()
        full_response = ""

        for round_num in range(MAX_TOOL_ROUNDS):
            logger.info(f"[{session.id}] Agent loop round {round_num + 1}")

            # 流式调用LLM（带tools）
            text_parts: list[str] = []
            tool_calls: list[dict] | None = None

            async for item in self.llm_engine.chat_stream_with_tools(
                messages, tools=tools, cancel_event=session.cancel_event
            ):
                if isinstance(item, str):
                    # 普通文本delta — 实时推送给客户端
                    text_parts.append(item)
                    await self.acp_server.emit_message(session, content="".join(text_parts), content_delta=item)
                elif isinstance(item, dict) and "tool_calls" in item:
                    # 完整的tool_calls列表
                    tool_calls = item["tool_calls"]

            assistant_text = "".join(text_parts)
            full_response += assistant_text

            # 如果没有tool_calls，LLM已给出最终回复，结束循环
            if not tool_calls:
                logger.info(f"[{session.id}] Agent loop finished after {round_num + 1} round(s), no tool calls")
                break

            # 记录assistant消息（含tool_calls）到上下文
            ctx.add_message_raw({
                "role": "assistant",
                "content": assistant_text or None,
                "tool_calls": tool_calls,
            })

            # 逐个执行tool_calls，结果加入上下文
            for tc in tool_calls:
                tc_id = tc.get("id", "")
                func_name = tc.get("function", {}).get("name", "")
                func_args_str = tc.get("function", {}).get("arguments", "{}")

                # 解析参数JSON
                try:
                    func_args = json.loads(func_args_str)
                except json.JSONDecodeError:
                    func_args = {}

                logger.info(f"[{session.id}] Executing tool: {func_name}({func_args})")

                # 通知客户端正在执行工具
                await self.acp_server.emit_tool_call(session, tool_name=func_name, arguments=func_args, call_id=tc_id)

                # 执行工具并获取结果
                tool_result = await self._execute_tool(
                    func_name, func_args, session.workspace
                )

                # 工具结果消息加入上下文
                ctx.add_message_raw({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": tool_result,
                })

                # 将工具结果推送给客户端
                tool_summary = f"[工具结果]: {tool_result[:500]}{'...' if len(tool_result) > 500 else ''}\n"
                await self.acp_server.emit_message(session, content=tool_summary)
        else:
            # 循环达到上限
            logger.warning(f"[{session.id}] Agent loop reached max rounds ({MAX_TOOL_ROUNDS})")
            full_response += f"\n\n[已达最大工具调用轮次({MAX_TOOL_ROUNDS})，停止执行]"

        return full_response

    async def _execute_tool(
        self, name: str, args: dict, workspace: str
    ) -> str:
        """执行单个工具调用 — 根据工具名分发到具体实现

        当前支持的工具：
        - read_file: 读取本地文件（需路径安全验证）

        Args:
            name: 工具名称
            args: 工具参数字典
            workspace: 工作目录路径（用于路径安全验证）

        Returns:
            工具执行结果文本
        """
        if name == "read_file":
            return await self._tool_read_file(args, workspace)
        else:
            return f"错误：未知工具 '{name}'"

    async def _tool_read_file(self, args: dict, workspace: str) -> str:
        """read_file工具实现 — 读取指定路径的文件内容

        安全验证：解析真实路径，确保在workspace目录内，防止路径穿越攻击。

        Args:
            args: 工具参数，需包含 path 字段
            workspace: 工作目录路径

        Returns:
            文件内容文本，或错误信息
        """
        rel_path = args.get("path", "")
        if not rel_path:
            return "错误：缺少必填参数 'path'"

        # 拼接绝对路径
        abs_path = os.path.join(workspace, rel_path)

        # 安全验证：解析真实路径，确保在workspace内
        real_path = os.path.realpath(abs_path)
        real_workspace = os.path.realpath(workspace)
        if not real_path.startswith(real_workspace + os.sep) and real_path != real_workspace:
            return f"错误：路径安全验证失败 — '{rel_path}' 解析后不在工作目录内"

        # 读取文件
        try:
            with open(real_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            # 限制返回长度，防止超大文件撑爆上下文
            if len(content) > 50000:
                content = content[:50000] + f"\n\n... [文件过大，已截断，共 {len(content)} 字符]"
            return content
        except FileNotFoundError:
            return f"错误：文件不存在 — '{rel_path}'"
        except PermissionError:
            return f"错误：无权限读取 — '{rel_path}'"
        except Exception as e:
            return f"错误：读取文件失败 — {e}"

    def _get_tool_definitions(self) -> list[dict]:
        """返回OpenAI function calling格式的工具定义列表

        定义Agent可调用的所有工具，供LLM在流式响应中选择调用。
        当前仅包含read_file工具，后续可扩展write_file、run_command等。

        Returns:
            工具定义列表，符合OpenAI tools参数格式
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "读取工作目录下的指定文件内容。用于查看源代码、配置文件、文档等。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "相对于工作目录的文件路径，如 'src/main.py' 或 'README.md'",
                            },
                        },
                        "required": ["path"],
                    },
                },
            },
        ]

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
