"""架构增强模块 — 将所有P0组件统一集成

这是openmate-rewrite-blueprint的落地实现，整合了98个Agent项目调研的核心结论：

P0组件清单：
1. Writer Claim Fencing (writer_fence.py) — 防并发写坏会话
2. Lane-aware Command Queue (lane_queue.py) — 消息排队+优先级
3. 分层超时体系 (layered_timeouts.py) — runtime/model/provider/wait
4. 工具失败三级 (tool_errors.py) — ignore/warn/raise + doom loop
5. 编辑安全系统 (edit_safety.py) — SEARCH/REPLACE + 原子写入 + 截断检测

Usage:
    from agent.architecture_enhanced import EnhancedArchitecture
    
    # 在SoulMateAgent.__init__中
    self._arch = EnhancedArchitecture()
    
    # 在prompt方法中
    async with self._arch.session_guard(session_id) as guard:
        ...
    
    # 工具调用时
    result = await self._arch.call_tool(session_id, tool_name, fn, **args)
    
    # 文件编辑时
    edit_result = self._arch.edit_file(path, old_string, new_string)
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Callable, Coroutine

from agent.writer_fence import SessionWriterFence, WriteAction
from agent.lane_queue import LaneQueue, Lane
from agent.layered_timeouts import LayeredTimeoutManager, TimeoutConfig, TimeoutLayer
from agent.tool_errors import ToolErrorHandler, FailureAction, ErrorCategory
from agent.edit_safety import EditSafetyGuard, EditConfig, EditResult

logger = logging.getLogger("acp-agent.architecture")


class EnhancedArchitecture:
    """统一的架构增强管理器
    
    整合所有P0组件，提供统一的接口给SoulMateAgent使用。
    """
    
    def __init__(
        self,
        timeout_config: TimeoutConfig | None = None,
        edit_config: EditConfig | None = None,
        max_workers: int = 4,
    ):
        # 1. Writer Fencing
        self.writer_fence = SessionWriterFence(
            action=WriteAction.QUEUE,
            timeout=60.0,
            stale_after=180.0,
        )
        
        # 2. Lane Queue
        self.lane_queue = LaneQueue(
            max_workers=max_workers,
            max_per_session_per_lane=2,
            task_timeout=300.0,
        )
        
        # 3. Layered Timeouts
        self.timeouts = LayeredTimeoutManager(
            config=timeout_config or TimeoutConfig()
        )
        
        # 4. Tool Error Handler
        self.tool_errors = ToolErrorHandler()
        # 注册默认策略
        self.tool_errors.register_tool("read_file", FailureAction.WARN)
        self.tool_errors.register_tool("write_file", FailureAction.RAISE)
        self.tool_errors.register_tool("edit_file", FailureAction.RAISE)
        self.tool_errors.register_tool("delete_file", FailureAction.RAISE)
        self.tool_errors.register_tool("web_search", FailureAction.WARN)
        self.tool_errors.register_tool("web_extract", FailureAction.WARN)
        self.tool_errors.register_tool("execute_code", FailureAction.WARN)
        self.tool_errors.register_tool("terminal", FailureAction.WARN)
        
        # 5. Edit Safety Guard
        self.edit_guard = EditSafetyGuard(
            config=edit_config or EditConfig()
        )
        
        # 统计
        self._start_time = time.time()
        self._operation_count = 0
    
    async def start(self):
        """启动异步组件"""
        await self.lane_queue.start()
        logger.info("[architecture] Enhanced architecture started")
    
    async def stop(self):
        """优雅关闭"""
        await self.lane_queue.stop()
        logger.info("[architecture] Enhanced architecture stopped")
    
    @asynccontextmanager
    async def session_guard(self, session_id: str, writer_id: str = "default"):
        """会话级写入保护
        
        Usage:
            async with self.arch.session_guard(session_id, "prompt") as acquired:
                if not acquired:
                    return error
                ... safe to write ...
        """
        async with self.writer_fence.write(session_id, writer_id=writer_id) as acquired:
            yield acquired
    
    async def call_tool(
        self,
        session_id: str,
        tool_name: str,
        fn: Callable[..., Coroutine],
        *,
        lane: Lane = Lane.NORMAL,
        timeout_layer: TimeoutLayer = TimeoutLayer.PROVIDER,
        **kwargs,
    ) -> Any:
        """统一的工具调用接口
        
        整合了：
        - Lane Queue（优先级排队）
        - Layered Timeout（分层超时+重试）
        - Tool Error Handler（三级错误处理+doom loop检测）
        """
        self._operation_count += 1
        
        try:
            # 通过lane queue调度，带超时
            result = await self.timeouts.call(
                layer=timeout_layer,
                operation=tool_name,
                fn=self.lane_queue.submit,
                session_id=session_id,
                fn_inner=fn,
                lane=lane,
                session_id_inner=session_id,
                **kwargs,
            )
            
            # 记录成功
            self.tool_errors.record_success(session_id, tool_name)
            return result
            
        except Exception as e:
            # 处理错误
            error = self.tool_errors.handle_error(
                session_id=session_id,
                tool_name=tool_name,
                error=e,
                args=kwargs,
            )
            
            if error.action == FailureAction.RAISE:
                raise
            
            # 返回结构化的错误消息（给模型看）
            return error.to_model_message()
    
    def edit_file(
        self,
        path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        """安全的文件编辑"""
        return self.edit_guard.edit_file(
            path=path,
            old_string=old_string,
            new_string=new_string,
            replace_all=replace_all,
        )
    
    def write_file(
        self,
        path: str,
        content: str,
        is_new_file: bool = True,
    ) -> EditResult:
        """安全的文件写入"""
        return self.edit_guard.write_file(
            path=path,
            content=content,
            is_new_file=is_new_file,
        )
    
    def read_file(self, path: str) -> str | None:
        """读取文件（标记为已读）"""
        return self.edit_guard.read_file(path)
    
    def get_full_stats(self) -> dict:
        """获取所有组件的完整统计"""
        return {
            "uptime": f"{time.time() - self._start_time:.0f}s",
            "total_operations": self._operation_count,
            "writer_fence": self.writer_fence.get_stats(),
            "lane_queue": self.lane_queue.get_stats(),
            "timeouts": self.timeouts.get_stats(),
            "tool_errors": self.tool_errors.get_stats(),
            "edit_guard": self.edit_guard.get_stats(),
        }
    
    def get_session_stats(self, session_id: str) -> dict:
        """获取特定会话的统计"""
        return {
            "writer_fence": {
                sid: info
                for sid, info in self.writer_fence.get_stats()["active_claims"].items()
                if sid == session_id
            },
            "tool_errors": self.tool_errors.get_stats(session_id),
        }
