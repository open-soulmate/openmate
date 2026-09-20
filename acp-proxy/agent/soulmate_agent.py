"""SoulMate Agent — 实现官方 acp.Agent 协议

使用 agent-client-protocol 官方 Python SDK 的 Agent 协议类，
通过 acp.run_agent() 在 stdio 上传输 ACP v1.0 标准协议。
"""

import asyncio
import base64
import httpx
import re
import logging
import json
import os
import subprocess
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
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
from skill_manager import SkillManager, is_injectable_trigger
from evolution import EvolutionEngine
from dna_evolution import DNAEvolutionEngine
from utils.token_manager import truncate_tool_result
from agent.tool_output_handler import ToolOutputHandler
from agent.architecture_enhanced import EnhancedArchitecture
from agent import arch_monitor
from utils.task_state_manager import TaskStateManager, judge_task_continuation
# P1/P2 架构组件
from agent.semantic_cache import SemanticCache
from agent.context_compression import ContextCompressor
from agent.loop_guard import LoopGuard
from agent.code_mode import CodeModeExecutor
from agent.dynamic_prompt import DynamicPromptBuilder
from agent.memory_retrieval import MemoryRetrievalEngine
from agent.tool_cache import ToolResultCache
from agent.tool_auditor import ToolAuditor
from agent.smart_retry import SmartRetryManager
from agent.output_validator import OutputValidator
from agent.output_formatter import OutputFormatter
from agent.conversation_summarizer import ConversationSummarizer
from agent.knowledge_distiller import KnowledgeDistiller
from agent.cost_tracker import CostTracker
from agent.token_analyzer import TokenAnalyzer
from agent.agent_tracer import AgentTracer
from agent.event_bus import get_event_bus
from agent.config_manager import HotConfigManager
from agent.agent_checkpoint import AgentCheckpointManager
from agent.health_checker import HealthChecker
from agent.intent_classifier import IntentClassifier
from agent.user_preferences import UserPreferenceLearner
from agent.knowledge_graph import KnowledgeGraph
from agent.reflection_engine import ReflectionEngine
from agent.memory_consolidator import MemoryConsolidator
from agent.skill_learner import SkillLearner
from agent.observability import ObservabilityManager, SpanType, SpanStatus
from agent.context_analyzer import ContextAnalyzer, ContextComponent
from agent.session_fsm import SessionStateMachine, SessionState, SessionEvent
from agent.parallel_executor import ParallelToolExecutor
from agent.tool_registry import ToolRegistry
from agent.tool_validator import ToolResultValidator
from agent.capability_evaluator import CapabilityEvaluator
from agent.env_sensor import EnvironmentSensor
from agent.prompt_manager import PromptTemplateManager
from agent.context_budget import ContextBudgetManager
from agent.token_attribution import (
    KIND_BUILTIN_TOOL,
    KIND_IMPROVEMENT,
    KIND_MEMORY,
    KIND_MESSAGE,
    KIND_MCP_TOOL,
    KIND_PREFERENCE,
    KIND_SKILL,
    KIND_SYSTEM_PROMPT,
    KIND_TOOL_RESULT,
    AttributionLedger,
    ContextItem,
    build_context_usage,
    estimate_tokens,
    items_from_openai_tools,
)
from agent.chain_optimizer import ChainOptimizer
from agent.stream_manager import StreamingResponseManager
from agent.session_manager import ConcurrentSessionManager
from agent.artifact import ArtifactEngine
from agent.context_injector import ContextInjector
from agent.file_index import SessionFileIndex
from agent.permission import PermissionManager
from agent.permissions import ToolPolicy
from agent.permission_gate import PermissionGate
from agent.tool_errors import ToolError, ToolErrorHandler
from agent.writer_fence import SessionWriterFence, WriteAction
from agent.steering import (
    ABORT_MESSAGE,
    MAX_QUEUE_DEPTH,
    ActivityStore,
    SessionActivity,
    SteeringQueue,
)
from agent.context import SessionContext
from agent.layered_timeouts import TimeoutConfig
from agent.eval_pipeline import EvalPipeline
from agent.edit_safety import EditConfig
from agent.schema_doctor import SchemaDoctor

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
        # 自动检测项目根目录：agent/ 在 acp-proxy/ 下，acp-proxy/ 在项目根目录下
        self._project_root = str(Path(__file__).resolve().parent.parent.parent)
        self._db_path = Path("/home/climbing/opensoul/data/opensoul.db")
        # 技能系统
        self._skill_manager = SkillManager()
        # 进化引擎（延迟初始化，由 app.py 注入）
        self._evolution_engine: DNAEvolutionEngine | None = None
        # MCP 工具调用支持
        self._mcp_tools_cache: list[dict] | None = None
        self._mcp_tools_cache_time: float = 0
        self._mcp_base_url = "http://127.0.0.1:8094"
        self._mcp_tool_call_id_map: dict[str, dict] = {}  # func_name -> {server_id, tool_name}
        self._session_cwds: dict[str, str] = {}  # session_id -> cwd
        self._streamed_flags: dict[str, bool] = {}  # session_id -> streamed
        # 菜单选择等待机制：session_id -> asyncio.Future
        self._pending_choices: dict[str, asyncio.Future] = {}
        # 任务规划与自省引擎
        from agent.task_engine import TaskPlanner, SelfReflector
        self._task_planner = TaskPlanner(llm_call_fn=self._llm_plan_call)
        self._self_reflector = SelfReflector(llm_call_fn=self._llm_plan_call)
        # 任务状态管理器（独立状态机，规则+LLM兜底）
        self._task_state_manager = TaskStateManager(db_path=str(self._db_path))
        # 架构增强系统 — 整合所有P0组件（98个Agent调研结论）
        self._arch = EnhancedArchitecture()
        # 注册到监控系统
        arch_monitor.set_architecture(self._arch)
        # ── P1/P2 组件初始化 ──
        self._semantic_cache = SemanticCache()
        self._ctx_compressor = ContextCompressor()
        self._prompt_builder = DynamicPromptBuilder()
        self._memory_engine = MemoryRetrievalEngine()
        self._tool_cache = ToolResultCache()
        self._tool_auditor = ToolAuditor()
        # P0-2: 工具结果溢出处理器（kilocode双限→落盘+stub，AIHawk双预算记账）。
        # 阈值env可调：TOOL_SPILL_CHARS默认8000（与旧truncate同阈值，但落盘后context只进stub≈2KB，更省）
        self._output_handler = ToolOutputHandler(
            char_threshold=int(os.environ.get("TOOL_SPILL_CHARS", "8000")),
            line_threshold=int(os.environ.get("TOOL_SPILL_LINES", "2000")),
        )
        # P0 cortex: 循环/重复检测guard per-session实例（ag2+goose+Khoj+anything-llm+DeerFlow五源）
        self._loop_guards: dict[str, "LoopGuard"] = {}
        self._retry_mgr = SmartRetryManager()
        self._output_validator = OutputValidator()
        self._output_formatter = OutputFormatter()
        self._conv_summarizer = ConversationSummarizer()
        self._knowledge_distiller = KnowledgeDistiller()
        self._cost_tracker = CostTracker()
        self._token_analyzer = TokenAnalyzer()
        self._tracer = AgentTracer()
        self._event_bus = get_event_bus()
        self._config_mgr = HotConfigManager()
        self._checkpoint_mgr = AgentCheckpointManager()
        self._health_checker = HealthChecker()
        # 意图分类器
        self._intent_clf = IntentClassifier()
        # 用户偏好学习器
        self._pref_learner = UserPreferenceLearner()
        # 知识图谱
        self._knowledge_graph = KnowledgeGraph()
        # 自我反思引擎
        self._reflection_engine = ReflectionEngine()
        # 记忆整合器
        self._memory_consolidator = MemoryConsolidator()
        # 技能学习器
        self._skill_learner = SkillLearner()
        # 可观测性管理器
        self._observability = ObservabilityManager()
        # 上下文分析器
        self._context_analyzer = ContextAnalyzer()
        # 会话状态机
        self._session_fsm = SessionStateMachine()
        # 并行工具执行器
        self._parallel_executor = ParallelToolExecutor()
        # 工具注册表
        self._tool_registry = ToolRegistry()
        # 工具验证器
        self._tool_validator = ToolResultValidator()
        # 能力评估器
        self._capability_evaluator = CapabilityEvaluator()
        # 环境传感器
        self._env_sensor = EnvironmentSensor()
        # Prompt管理器
        self._prompt_manager = PromptTemplateManager()
        # 上下文预算
        self._context_budget = ContextBudgetManager()
        # P1: 上下文逐项token归因账本（claude-code SDKContextUsage移植；agent子进程写，app.py跨进程读）
        self._token_attr_ledger = AttributionLedger()
        # 链优化器
        self._chain_optimizer = ChainOptimizer()
        # 流管理器
        self._stream_manager = StreamingResponseManager()
        # 会话管理器
        self._session_manager = ConcurrentSessionManager()
        # 工件引擎（文件变更追踪）
        self._artifact_engine = ArtifactEngine(workspace=str(self._project_root))
        # 上下文注入器
        self._context_injector = ContextInjector()
        # 文件索引
        self._file_index = SessionFileIndex()
        # 权限管理器
        self._permission_manager = PermissionManager()
        self._permission_gate = PermissionGate()  # P0-3 工具级权限门禁（opensoul immune引擎客户端）
        # 工具策略（per-tool配置，按需创建）
        self._tool_policies: dict = {}
        # 分层超时配置
        self._timeout_config = TimeoutConfig()
        # 评估管道
        self._eval_pipeline = EvalPipeline()
        # 编辑安全配置
        self._edit_safety_config = EditConfig()
        # Schema医生
        self._schema_doctor = SchemaDoctor(db_path=':memory:')
        # 工具错误处理器（分类+doom loop检测）
        self._tool_error_handler = ToolErrorHandler()
        # ── P0-4/P1: 插话队列 + 活动可观测（goose peek三指标 + claude-code noop自报）──
        self._steering = SteeringQueue()                     # Khoj interrupt_queue + goose Steer
        self._activity_store = ActivityStore()               # SQLite持久化，HTTP peek端点跨进程读
        self._activities: dict[str, SessionActivity] = {}    # session_id -> 活动观测
        
        # ── Writer Fence：per-session写入锁（替代全局_processing标志）──
        self._writer_fence = SessionWriterFence(action=WriteAction.REJECT, timeout=30)
        # 注册基础健康检查
        from agent.health_checker import HealthCheck
        self._health_checker.register_simple(
            check_id="llm_engine", name="LLM引擎",
            check_fn=lambda: self.llm_engine is not None,
        )
        self._health_checker.register_simple(
            check_id="opensoul_api", name="OpenSoul API",
            check_fn=lambda: True,  # 实际检查由arch_monitor做
        )

    def _get_db(self) -> sqlite3.Connection:
        db = sqlite3.connect(str(self._db_path))
        db.row_factory = sqlite3.Row
        return db

    def _save_message(self, session_id: str, role: str, content: str, attachments: str = None):
        """保存消息到 agent_messages 表（attachments为JSON字符串：附件元数据列表）"""
        try:
            db = self._get_db()
            try:
                db.execute("SELECT attachments FROM agent_messages LIMIT 1")
            except sqlite3.OperationalError:
                db.execute("ALTER TABLE agent_messages ADD COLUMN attachments TEXT")
            db.execute(
                "INSERT INTO agent_messages (session_id, role, content, timestamp, attachments) VALUES (?, ?, ?, ?, ?)",
                (session_id, role, content, time.time(), attachments),
            )
            # 更新会话的 message_count 和 last_activity_at
            db.execute(
                "UPDATE agent_sessions SET message_count = message_count + 1, last_activity_at = ? WHERE id = ?",
                (time.time(), session_id),
            )
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Failed to save message: {e}")

    # ── 自我进化拦截（绕过LLM安全限制）──────────────────────────




    def _load_messages_from_db(self, session_id: str) -> list[dict]:
        """从 DB 加载历史消息"""
        try:
            db = self._get_db()
            rows = db.execute(
                "SELECT role, content FROM agent_messages WHERE session_id = ? ORDER BY id",
                (session_id,),
            ).fetchall()
            db.close()
            return [{"role": r["role"], "content": r["content"]} for r in rows]
        except Exception as e:
            logger.error(f"Failed to load messages: {e}")
            return []

    def _session_exists_in_db(self, session_id: str) -> bool:
        """检查会话是否存在于 DB"""
        try:
            db = self._get_db()
            row = db.execute(
                "SELECT id FROM agent_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
            db.close()
            return row is not None
        except Exception as e:
            logger.error(f"Failed to check session: {e}")
            return False

    def _session_has_messages(self, session_id: str) -> bool:
        """检查会话在agent_messages中是否有任何消息

        ws直建会话（session/new不经OpenSoul API）没有agent_sessions行，
        但prompt消息已落盘——这类会话重启后同样必须可恢复。"""
        try:
            db = self._get_db()
            row = db.execute(
                "SELECT 1 FROM agent_messages WHERE session_id = ? LIMIT 1",
                (session_id,),
            ).fetchone()
            db.close()
            return row is not None
        except Exception as e:
            logger.error(f"Failed to check session messages: {e}")
            return False

    def _reload_session_from_db(self, session_id: str) -> dict | None:
        """从SQLite恢复会话到内存（进程重启/stale sid自愈）

        d439f163在/acp/send HTTP路径做过期session恢复；本方法把同款恢复
        落到/ws/acp真实聊天路径的agent侧：子进程崩溃/重启后内存会话清空，
        prompt收到未知sid时从DB重建，而非静默refusal（基线E2E实证：
        stale sid → stopReason=refusal + 0 chunk = 用户看到空白）。
        恢复条件 = agent_sessions有行 OR agent_messages有消息。"""
        if not (self._session_exists_in_db(session_id) or self._session_has_messages(session_id)):
            return None
        messages = self._load_messages_from_db(session_id)
        cwd = self._project_root
        self.sessions[session_id] = {
            "session_id": session_id,
            "cwd": cwd,
            "messages": messages,
            "created_at": time.time(),
            "state": "active",
        }
        self._session_cwds[session_id] = cwd
        logger.info(f"Recovered session from DB: {session_id} ({len(messages)} messages)")
        return self.sessions[session_id]

    # ── P0-4/P1: 插话队列 + 活动可观测（goose peek三指标 + claude-code noop自报）──

    def _activity(self, session_id: str) -> SessionActivity:
        """获取或创建会话活动观测（内存态；状态变化时upsert到SQLite供HTTP peek读取）"""
        act = self._activities.get(session_id)
        if act is None:
            act = SessionActivity(session_id=session_id)
            self._activities[session_id] = act
        return act

    async def _notify_client(self, session_id: str, text: str):
        """通用客户端可见通知（best-effort，失败不影响主路径）

        失败必须可见原则（AIHawk显式标记 + mem0禁止静默降级）：
        系统异常时给用户可见文字，而非静默空响应。"""
        if self._client is None:
            return
        try:
            await self._client.session_update(
                session_id=session_id,
                update=acp.update_agent_message_text(text),
            )
        except Exception as e:
            logger.debug(f"[notify] send failed for {session_id}: {e}")

    async def _steer_notify(self, session_id: str, text: str):
        """插话相关通知推送给前端（委托_notify_client，best-effort）"""
        await self._notify_client(session_id, text)

    def peek_sessions(self) -> dict:
        """goose peek三指标（agent侧聚合；HTTP端点直接读ActivityStore）"""
        for sid, act in self._activities.items():
            act.buffered = self._steering.pending(sid)
            self._activity_store.upsert(act)
        return self._activity_store.peek_all()

    # ── MCP 工具支持 ──────────────────────────────────────────────

    async def _fetch_mcp_tools(self) -> list[dict]:
        """从 MCP Client 获取所有可用工具，转换为 OpenAI function calling 格式。

        缓存 60 秒，避免每次请求都调用 MCP Client。
        MCP Client 不可用时返回空列表（不影响正常对话）。
        """
        now = time.time()
        if self._mcp_tools_cache is not None and (now - self._mcp_tools_cache_time) < 60:
            return self._mcp_tools_cache

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                resp = await client.get(f"{self._mcp_base_url}/api/mcp/tools/all")
                if resp.status_code != 200:
                    logger.warning(f"MCP tools API returned {resp.status_code}")
                    return self._mcp_tools_cache or []
                data = resp.json()

            tools = []
            self._mcp_tool_call_id_map = {}
            for item in data if isinstance(data, list) else data.get("tools", []):
                server_id = item.get("server_id", "")
                tool_name = item.get("name", "")
                description = item.get("description", "")
                input_schema = item.get("inputSchema") or item.get("input_schema") or {"type": "object", "properties": {}}

                # 唯一函数名：server__tool（避免不同 server 同名 tool 冲突）
                func_name = f"{server_id}__{tool_name}" if server_id else tool_name
                self._mcp_tool_call_id_map[func_name] = {
                    "server_id": server_id,
                    "tool_name": tool_name,
                }

                tools.append({
                    "type": "function",
                    "function": {
                        "name": func_name,
                        "description": description,
                        "parameters": input_schema,
                    },
                })

            self._mcp_tools_cache = tools
            self._mcp_tools_cache_time = now
            logger.info(f"MCP tools refreshed: {len(tools)} tools")
            return tools

        except Exception as e:
            logger.warning(f"MCP tools fetch failed (graceful degradation): {e}")
            return self._mcp_tools_cache or []

    async def _call_mcp_tool(self, func_name: str, arguments: dict) -> str:
        """调用 MCP Client 的工具执行接口。

        Args:
            func_name: 唯一函数名（server__tool 格式）
            arguments: 工具参数

        Returns:
            工具执行结果文本
        """
        mapping = self._mcp_tool_call_id_map.get(func_name)
        if not mapping:
            return f"[错误] 未知工具: {func_name}"

        server_id = mapping["server_id"]
        tool_name = mapping["tool_name"]

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                resp = await client.post(
                    f"{self._mcp_base_url}/api/mcp/tools/call",
                    json={
                        "server_id": server_id,
                        "tool_name": tool_name,
                        "arguments": arguments,
                    },
                )
                if resp.status_code != 200:
                    return f"[MCP 工具调用失败] HTTP {resp.status_code}: {resp.text[:200]}"
                result = resp.json()
                # 提取 content 文本（MCP 结果格式可能有 content 列表或直接字符串）
                if isinstance(result, dict):
                    content = result.get("content", result)
                    if isinstance(content, list):
                        # MCP 标准格式: [{"type": "text", "text": "..."}]
                        texts = [c.get("text", str(c)) for c in content if isinstance(c, dict)]
                        return "\n".join(texts) if texts else str(content)
                    return str(content)
                return str(result)

        except httpx.ReadTimeout:
            return f"[MCP 工具调用超时] {tool_name}"
        except Exception as e:
            logger.error(f"MCP tool call error: {e}", exc_info=True)
            return f"[MCP 工具调用异常] {e}"

    async def _llm_plan_call(self, messages: list[dict]) -> str:
        """轻量 LLM 调用，只返回文本（不带工具），用于规划和自省"""
        return await self.llm_engine.chat(messages)

    def _process_tool_output(self, func_name: str, tool_call_id: str, result: str) -> str:
        """P0-2接线：工具结果溢出处理 — goose spill落盘 + deepagents stub + AIHawk双预算

        超阈值（字符/行双限）→完整结果落盘+stub入context（教模型用read_file_segment分段读回）；
        处理失败降级为旧truncate_tool_result行为（fail-safe，溢出处理绝不让任务循环崩溃）。
        """
        try:
            handler = getattr(self, "_output_handler", None)
            if handler is None:
                handler = ToolOutputHandler(
                    char_threshold=int(os.environ.get("TOOL_SPILL_CHARS", "8000")),
                    line_threshold=int(os.environ.get("TOOL_SPILL_LINES", "2000")),
                )
                self._output_handler = handler
            return handler.process(func_name, tool_call_id, str(result)).processed_text
        except Exception as e:
            logger.warning(f"[tool-output] spill处理失败，降级截断: {e}")
            return truncate_tool_result(str(result))

    def _loop_guard_for(self, session_id: str) -> "LoopGuard":
        """P0 cortex循环guard：per-session实例，每次任务开始reset（窗口只在本任务工具循环内累积）。

        agent侧guard cooldown_seconds=0：opensoul原版60s冷却面向人类告警场景防警觉疲劳，
        接线侧拦截不打扰人类——冷却期内guard静默放行会让重复命令重新执行产生副作用，
        疲劳抑制改由wiring级升级链承担（同任务第2次INTERVENE→FORCE_STOP，DeerFlow三级渐进）。
        """
        guards = getattr(self, "_loop_guards", None)
        if guards is None:
            guards = {}
            self._loop_guards = guards
        guard = guards.get(session_id)
        if guard is None:
            guard = LoopGuard(cooldown_seconds=0)
            guards[session_id] = guard
        guard.reset()
        return guard

    # ── Code Mode内层工具执行（goose code_execution+kilocode code-mode两方定案）──
    # builtin子集实现与_run_llm_with_tools内联分支同款语义（遗留：后续可重构共享）；
    # 未列出的工具（MCP/进化/sense等）路由_call_mcp_tool。
    _CODE_MODE_BUILTIN_TOOLS = (
        "read_file", "read_file_segment", "search_files", "terminal",
        "write_file", "patch", "execute_code", "web_search", "web_extract",
    )

    async def _code_mode_tool_call(self, session_id: str, func_name: str, func_args: dict, cwd: str) -> str:
        """批量化内层工具调用：每次stub调用同样过permission_gate（AgentScope引擎语义，
        deny→返回[被拦截]文本、绝不真实执行——批量化不绕过权限引擎），gate放行后按主
        循环同款语义执行builtin子集，其余路由MCP。"""
        gate_result = await self._permission_gate.check(
            session_id, func_name, func_args,
            working_dir=str(cwd or ""),
            request_approval=(
                lambda tn, ta, dec, _sid=session_id:
                    self._request_tool_approval(_sid, tn, ta, dec)),
        )
        if not gate_result.allowed:
            return f"[被拦截:{gate_result.behavior}] {gate_result.blocked_reason}"
        try:
            if func_name == "read_file":
                path = func_args.get("path", "")
                offset = int(func_args.get("offset", 1) or 1)
                limit = int(func_args.get("limit", 100) or 100)
                proc = subprocess.run(
                    ["sed", "-n", f"{offset},{offset + limit - 1}p", path],
                    capture_output=True, text=True, errors="replace", timeout=10,
                )
                if proc.returncode == 0 and proc.stdout:
                    lines = proc.stdout.split("\n")
                    return "\n".join(f"{offset + i}|{line}" for i, line in enumerate(lines))
                return f"错误: {proc.stderr or '文件不存在或为空'}"
            if func_name == "read_file_segment":
                _seg = getattr(self, "_output_handler", None)
                if _seg is None:
                    from agent.tool_output_handler import ToolOutputHandler as _TOH
                    _seg = _TOH()
                    self._output_handler = _seg
                return _seg.read_segment(
                    str(func_args.get("path", "")),
                    start_line=int(func_args.get("start_line", 1) or 1),
                    end_line=int(func_args.get("end_line", 200) or 200),
                )
            if func_name == "search_files":
                import shlex
                pattern = func_args.get("pattern", "")
                path = func_args.get("path", cwd) or cwd
                if path in ("/", ""):
                    path = cwd
                target = func_args.get("target", "content")
                if target == "files":
                    cmd = f"find {shlex.quote(path)} -name {shlex.quote(pattern)} -type f"
                else:
                    cmd = (f"grep -rn -i --include='*.py' --include='*.ts' --include='*.tsx'"
                           f" --include='*.js' --include='*.json' --include='*.md'"
                           f" {shlex.quote(pattern)} {shlex.quote(path)}")
                proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace", timeout=10)
                return proc.stdout[:3000] if proc.stdout else "(无结果)"
            if func_name == "terminal":
                cmd = func_args.get("command", "")
                if not cmd:
                    return "错误: command 不能为空"
                import shlex, re as _re
                def _quote_p(m):
                    return shlex.quote(m.group(0))
                cmd = _re.sub(r'(/[\w/.\-]*[()][\w/.\-()]*)', _quote_p, cmd)
                proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace", timeout=30, cwd=cwd)
                output = proc.stdout + proc.stderr
                result = output[:3000] if output else "(无输出)"
                if proc.returncode != 0:
                    result += f"\n[exit code: {proc.returncode}]"
                return result
            if func_name == "write_file":
                path = func_args.get("path", "")
                content = func_args.get("content", "")
                if not path or not content:
                    return (f"错误: write_file 参数不完整（path='{path}', "
                            f"content长度={len(content)}）")
                from utils.file_safety import atomic_write
                ok, err = atomic_write(path, content)
                return f"已写入 {path} ({len(content)} 字节)" if ok else f"写入失败: {err}"
            if func_name == "patch":
                path = func_args.get("path", "")
                old_string = func_args.get("old_string", "")
                new_string = func_args.get("new_string", "")
                with open(path, "r", encoding="utf-8") as f:
                    file_content = f.read()
                if old_string not in file_content:
                    return f"错误: 在 {path} 中未找到匹配文本"
                from utils.file_safety import atomic_write
                ok, err = atomic_write(path, file_content.replace(old_string, new_string, 1))
                return f"已修改 {path}" if ok else f"修改失败: {err}"
            if func_name == "execute_code":
                code = func_args.get("code", "")
                with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, dir="/tmp") as f:
                    f.write(code)
                    tmp_path = f.name
                try:
                    proc = subprocess.run(
                        ["python3", tmp_path],
                        capture_output=True, text=True, errors="replace",
                        timeout=60, cwd=cwd,
                    )
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
                output = proc.stdout + proc.stderr
                result = output[:5000] if output else "(无输出)"
                if proc.returncode != 0:
                    result += f"\n[exit code: {proc.returncode}]"
                return result
            if func_name == "web_search":
                query = func_args.get("query", "")
                limit = func_args.get("limit", 5)
                proc = subprocess.run(
                    ["curl", "-s", f"http://localhost:8888/search?q={query}&format=json&pageno=1"],
                    capture_output=True, text=True, errors="replace", timeout=15,
                )
                if proc.returncode == 0 and proc.stdout:
                    data = json.loads(proc.stdout)
                    results = data.get("results", [])[:limit]
                    lines = [f"- {r.get('title', '')}: {r.get('url', '')}\n  {r.get('content', '')[:100]}" for r in results]
                    return "\n".join(lines) if lines else "无搜索结果"
                return f"搜索不可用: {proc.stderr or 'SearXNG未启动'}"
            if func_name == "web_extract":
                url = func_args.get("url", "")
                proc = subprocess.run(
                    ["curl", "-sL", "--max-time", "15", "-H", "User-Agent: Mozilla/5.0", url],
                    capture_output=True, text=True, errors="replace", timeout=20,
                )
                if proc.returncode == 0:
                    text = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', proc.stdout)
                    text = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', text)
                    text = re.sub(r'<[^>]+>', ' ', text)
                    return re.sub(r'\s+', ' ', text).strip()[:5000]
                return f"抓取失败: {proc.stderr}"
            # 其余工具路由MCP执行器（未知工具由其返回[错误]文本）
            return await self._call_mcp_tool(func_name, func_args)
        except subprocess.TimeoutExpired:
            return f"[CODE_MODE] 工具执行超时: {func_name}"
        except Exception as e:
            return f"[CODE_MODE] 工具执行异常: {func_name}: {e}"

    async def _run_llm_with_tools(
        self,
        messages: list[dict],
        session_id: str,
        matched_skills: list[dict] | None = None,
        user_text: str = "",
    ) -> tuple[str, list[dict]]:
        """LLM推理 + 工具调用循环。模型返回tool_calls就执行，纯文本就结束。"""
        MAX_ROUNDS = 15
        cwd = self._session_cwds.get(session_id, self._project_root)
        system_prompt = f"""你是SoulMate，OpenMate内置的AI助手。请用简洁清晰的中文回答。

## 环境
当前工作目录: {cwd}
项目根目录: {cwd}
ACP代理目录: {cwd}/acp-proxy（后端 Python 代码在此）

项目结构：
- src/ — 前端源码（Next.js, TypeScript, React）
  - src/app/(app)/chat/chat-client.tsx — 聊天客户端
  - src/components/ — 通用组件
  - src/stores/ — 状态管理（Zustand）
  - src/lib/ — 工具库
- packages/openface/ — 组件库源码
- acp-proxy/ — 后端源码（Python）
  - agent/ — Agent 核心（soulmate_agent.py, llm_engine.py, task_engine.py）
  - routes/ — REST API 路由
  - skills/ — 技能系统
  - data/ — 运行时数据（DNA进化、技能库）

重要规则：
- terminal 命令默认在项目根目录执行，不要从 / 搜索
- search_files 搜索时默认在项目根目录，不要从 / 搜索
- 查找文件用 find {cwd} -name "xxx" 而不是 find / -name "xxx"
- 修改前端文件路径相对于 {cwd}
- 修改后端文件路径相对于 {cwd}/acp-proxy

## 输入格式说明
用户的消息可能包含结构化标签（如 ## 任务、## 角色、## 背景、## 约束、## 输出格式）。
请理解这些标签的含义，正常回答用户的问题。不要输出标签本身。
如果是简单问题（如"你好"、"怎么样了"），直接自然语言回答即可。

## 工具调用策略（分层混合）

### 第一层：硬规则（命中必须调用工具，禁止直接回答）
- 精确计算、数值运算、单位换算、日期/星期/时间换算 → 计算工具
- 外部实时事实、新闻、政策、产品参数 → 检索工具
- 本地文件读写、解析（PDF/Excel/代码/图片）→ 文件工具
- 表格/文档/PPT/图片/视频等指定领域任务 → 对应领域 Skill，先读 SKILL.md 再执行
- 涉及平台内部数据（飞书文档/表格/日历等）→ 对应平台工具

### 第二层：启发式判断（模型自主决定）
- 概念解释、经验建议、推理类 → 不调工具
- 工具可用性与否存疑 → 先判断再调，不强行调用

### 第三层：安全与优先级（最高优先，覆盖前两层）
- 安全/合规红线 → 直接拒绝，不调任何工具
- 用户明确点名的格式、工具、范围 → 硬约束，不替换不降级
- 可逆的本地操作直接做；不可逆/影响外部 → 先说明风险

### 执行规范
- 优先专用工具，不用通用命令代替
- 需要连续调用≥3次工具收集信息（批量读文件/批量搜索/多条命令）→ 用 batch_execute 写成一个脚本批量执行，N次调用合并为1轮；后续参数严格依赖前次结果的串行调用不要批量化
- 需要能力但未加载 → 按需加载后立即真实调用
- 执行后必须验证：用不同于生成路径的方式回读产物、重算关键数字
- 最终产物通过交付通道交付；搜索结果只作引用

### 可用工具
- read_file: 读取文件，path 参数必填
- read_file_segment: 分段读取溢出文件——工具输出过大被外置时（结果中出现[TRUNCATED]标记），按 stub 提示用 path/start_line/end_line 分段读回完整内容
- write_file: 写入文件，path 和 content 参数必填。path必须是完整路径+文件名+扩展名（如 /home/climbing/openmate/index.html）。根据用户意图推断文件名和扩展名——用户说"网页"→.html，"脚本"→.py，"配置"→.yaml，"样式"→.css。不确定时先用read_file确认目录结构。⚠️ 注意：content超过3000字符时不要用write_file，改用execute_code写入（如 with open(path,'w') as f: f.write(...)），避免JSON截断。
- search_files: 搜索文件，pattern 参数必填，path 默认为当前目录
- search_files: 搜索文件，pattern 参数必填，path 默认为当前目录
- terminal: 执行命令，command 参数必填
- execute_code: 执行 Python 代码，code 参数必填
- batch_execute: Code Mode批量执行，script 参数必填——Python脚本，会话内工具函数可直接调用（如 read_file(path=...), terminal(command=...)），最终结果赋给 result 变量。≥3次独立工具调用时优先使用；每次内层工具调用仍逐条过权限审核

You can send files to the user natively: to deliver a file, write a brief confirmation message (e.g. "文件已发送，请查收"), then include MEDIA:/absolute/path/to/file on a new line. The gateway extracts the tag, strips it, and sends the file as a download card. Always write some text before the MEDIA: tag — never output a bare MEDIA: tag alone. Use search_files first if you don't know the exact path. Do NOT paste file contents into chat."""

        # ── P1: 上下文逐项token归因（claude-code SDKContextUsage移植）──
        # 每个注入段/每个工具定义/每条记忆逐项记账——"上下文被什么吃掉了"直接答案。
        # 观测性旁路：任一环节失败仅debug日志，绝不阻断agent执行路径。
        attr_items: list[ContextItem] = []
        attr_items.append(ContextItem(
            kind=KIND_SYSTEM_PROMPT, name="soulmate_base_prompt", source="soulmate_agent",
            tokens=estimate_tokens(system_prompt),
        ))

        # 注入匹配的技能上下文
        if matched_skills:
            system_prompt += "\n\n## 相关技能（参考以下经验执行任务）\n"
            for skill in matched_skills[:3]:
                skill_body = f"\n### {skill['name']}\n{skill['content']}\n"
                if skill.get("code_template"):
                    skill_body += f"```\n{skill['code_template']}\n```\n"
                system_prompt += skill_body
                # P1归因：skill逐项（SDKContextUsage skills[]，名称+正文+模板）
                attr_items.append(ContextItem(
                    kind=KIND_SKILL, name=str(skill.get("name", "unnamed_skill")),
                    source="skill_manager.search", tokens=estimate_tokens(skill_body),
                ))

        # 注入用户偏好
        pref_context = self._pref_learner.get_context_prompt()
        if pref_context:
            system_prompt += f"\n\n## 用户偏好（请遵守）\n{pref_context}\n"
            attr_items.append(ContextItem(
                kind=KIND_PREFERENCE, name="user_preferences", source="pref_learner",
                tokens=estimate_tokens(pref_context),
            ))

        # 注入反思改进建议
        improvement_ctx = self._reflection_engine.get_improvement_context(session_id)
        if improvement_ctx:
            system_prompt += f"\n\n## 历史改进经验（避免重复错误）\n{improvement_ctx}\n"
            attr_items.append(ContextItem(
                kind=KIND_IMPROVEMENT, name="reflection_improvements", source="reflection_engine",
                tokens=estimate_tokens(improvement_ctx),
            ))

        # 注入召回的相关记忆
        if len(user_text) > 10:
            try:
                recalled = self._memory_consolidator.recall(user_text, limit=3)
                if recalled:
                    system_prompt += "\n\n## 相关历史记忆\n"
                    for _i_mem, mem in enumerate(recalled):
                        mem_line = f"- {mem.get('content', '')[:200]}\n"
                        system_prompt += mem_line
                        # P1归因：召回记忆逐条（SDKContextUsage memory_files[]）
                        attr_items.append(ContextItem(
                            kind=KIND_MEMORY, name=f"memory_recall[{_i_mem}]",
                            source="memory_consolidator.recall", tokens=estimate_tokens(mem_line),
                        ))
            except Exception as e:
                logger.debug(f"[memory] recall error: {e}")

        # 注入学习到的技能
        if len(user_text) > 10:
            try:
                skill_ctx = self._skill_learner.get_context_prompt(user_text)
                if skill_ctx:
                    system_prompt += f"\n\n## 学习到的技能（可复用）\n{skill_ctx}\n"
                    attr_items.append(ContextItem(
                        kind=KIND_SKILL, name="learned_skills", source="skill_learner",
                        tokens=estimate_tokens(skill_ctx),
                    ))
            except Exception as e:
                logger.debug(f"[skill_learner] context error: {e}")

        full_response = ""
        all_tool_calls = []  # 收集所有工具调用

        # 获取 MCP 工具 + 进化引擎工具
        mcp_tools = await self._fetch_mcp_tools()
        
        # ── 基础工具（文件读写、终端执行、搜索）──────────────
        builtin_tools = [{
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "读取文件内容，支持行号范围。用于查看代码、配置文件、日志等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "文件路径（绝对或相对路径）"},
                        "offset": {"type": "integer", "description": "起始行号（从1开始）", "default": 1},
                        "limit": {"type": "integer", "description": "最大读取行数", "default": 100},
                    },
                    "required": ["path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "read_file_segment",
                "description": "分段读取溢出文件。当工具输出过大被外置（工具结果中出现[TRUNCATED]标记和文件路径）时，用此工具按行范围分段读回完整内容。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "溢出文件路径（见[TRUNCATED]提示中的路径）"},
                        "start_line": {"type": "integer", "description": "起始行号（从1开始）", "default": 1},
                        "end_line": {"type": "integer", "description": "结束行号（含）", "default": 200},
                    },
                    "required": ["path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "写入文件（覆盖模式）。用于创建或修改代码、配置文件。注意：会完全覆盖原有内容。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "文件路径"},
                        "content": {"type": "string", "description": "要写入的完整内容"},
                    },
                    "required": ["path", "content"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "terminal",
                "description": "执行终端命令。用于运行脚本、查看系统状态、安装依赖、git操作等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "要执行的shell命令"},
                    },
                    "required": ["command"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "search_files",
                "description": "搜索文件内容或按文件名查找文件。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "搜索模式（正则表达式或glob）"},
                        "path": {"type": "string", "description": "搜索目录", "default": "."},
                        "target": {"type": "string", "enum": ["content", "files"], "description": "搜索内容还是搜索文件名", "default": "content"},
                    },
                    "required": ["pattern"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "patch",
                "description": "精确查找替换编辑文件。用于修改代码中的特定行，不会覆盖整个文件。old_string必须在文件中唯一匹配。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "文件路径"},
                        "old_string": {"type": "string", "description": "要查找的原文（必须唯一）"},
                        "new_string": {"type": "string", "description": "替换为的新文本"},
                    },
                    "required": ["path", "old_string", "new_string"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "execute_code",
                "description": "执行Python脚本。用于数据处理、复杂计算、调用API等需要编程逻辑的任务。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "要执行的Python代码"},
                    },
                    "required": ["code"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "搜索网页。用于查找技术文档、API参考、解决方案等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "搜索关键词"},
                        "limit": {"type": "integer", "description": "返回结果数量", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "web_extract",
                "description": "抓取网页内容转为文本。用于读取文档、博客、API页面等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "要抓取的网页URL"},
                    },
                    "required": ["url"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "vision_analyze",
                "description": "分析图片内容。用于识别截图、读取图片中的文字、理解UI设计等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "image_path": {"type": "string", "description": "图片文件路径"},
                        "question": {"type": "string", "description": "关于图片的问题"},
                    },
                    "required": ["image_path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "todo",
                "description": "管理任务列表。用于拆解复杂任务、跟踪进度。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["add", "list", "complete"], "description": "操作类型"},
                        "content": {"type": "string", "description": "任务内容（add时必填）"},
                        "task_id": {"type": "string", "description": "任务ID（complete时必填）"},
                    },
                    "required": ["action"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "read_image",
                "description": "读取图片文件并返回base64编码。用于让视觉模型分析图片。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "图片文件路径"},
                    },
                    "required": ["path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "sense_ocr",
                "description": "OpenSoul感知层OCR：精确文字提取（tesseract优先，不可用时自动降级LLM vision）。适用：扫描件/文档图片/表格截图需要逐字符精确文字时。日常图片内容理解用你自己的视觉能力即可，无需调此工具。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "图片文件路径"},
                        "language": {"type": "string", "description": "OCR语言，如chi_sim+eng（可选，默认自动）"},
                    },
                    "required": ["path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "sense_analyze_image",
                "description": "OpenSoul感知层图片元数据分析：尺寸/格式/EXIF/主色调等技术属性。需要图片技术信息而非内容理解时用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "图片文件路径"},
                    },
                    "required": ["path"],
                },
            },
        }, {
            "type": "function",
            "function": {
                "name": "sense_transcribe_audio",
                "description": "OpenSoul感知层语音转文字（ASR）。适用：音频/视频文件需要提取文字内容时。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "音频/视频文件路径"},
                        "language": {"type": "string", "description": "语言代码如zh/en（可选，默认自动检测）"},
                    },
                    "required": ["path"],
                },
            },
        }, {
            # ── P1 Code Mode工具批量化（goose code_execution+kilocode code-mode
            # 两方定案）：N次工具调用批成1个脚本执行，省token省LLM轮次 ──
            "type": "function",
            "function": {
                "name": "batch_execute",
                "description": "Code Mode批量执行：当任务需要连续调用3次以上工具（批量读文件/批量搜索/多条命令收集信息）时，把它们写成一个Python脚本一次执行——N次工具调用合并为1轮。脚本内可直接调用当前会话的每个工具函数（函数名=工具名，参数用关键字），返回值是该工具的结果字符串；把最终结论赋给变量result。每次工具调用仍逐条经过权限审核，被拦截的调用返回[被拦截]文本且不会真实执行；脚本内print也会被捕获进输出。适用：批量读文件、批量grep、多命令收集信息。不适用：单次调用、后续参数严格依赖前次结果的串行场景。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "script": {
                            "type": "string",
                            "description": "Python脚本。工具函数直接调用，如 a = read_file(path='/x.py'); b = terminal(command='ls /tmp'); result = a + b。工具参数必须用关键字或单个dict。",
                        },
                    },
                    "required": ["script"],
                },
            },
        }]

        # 添加进化引擎工具（支持直接对象或HTTP API两种模式）
        evolution_tools = []
        has_evolution = self._evolution_engine is not None or hasattr(self, '_evolution_api_url')

        # clarify 工具 — 弹出选择菜单让用户确认方向
        clarify_tool = {
            "type": "function",
            "function": {
                "name": "clarify",
                "description": "当任务复杂、有多种可能的理解方式时，弹出选择菜单让用户确认方向。用户选择后你会收到选择结果作为下一条消息。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "要问用户的问题",
                        },
                        "options": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "label": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["id", "label"],
                            },
                            "description": "2-8个选项",
                        },
                    },
                    "required": ["question", "options"],
                },
            },
        }
        logger.info(f"[TOOLS] has_evolution={has_evolution}, engine={self._evolution_engine is not None}, api_url={getattr(self, '_evolution_api_url', None)}")
        if has_evolution:
            evolution_tools = [{
                "type": "function",
                "function": {
                    "name": "request_evolution",
                    "description": "请求进化引擎创建新技能或改进现有技能。当用户要求新功能、或者你发现自己缺少某种能力时调用此工具。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "feature": {
                                "type": "string",
                                "description": "需要创建或改进的功能描述",
                            },
                            "priority": {
                                "type": "string",
                                "enum": ["low", "normal", "high"],
                                "description": "优先级: low=建议改进, normal=用户需求, high=紧急缺陷",
                            },
                        },
                        "required": ["feature"],
                    },
                },
            }, {
                "type": "function",
                "function": {
                    "name": "check_evolution_status",
                    "description": "查看进化引擎状态和最近创建的技能。",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                    },
                },
            }]
        
        all_tools = builtin_tools + (mcp_tools or []) + evolution_tools + [clarify_tool]

        # P1归因：工具定义逐项（per-tool——"20+工具定义里哪个最吃上下文"；三来源分开归因）
        attr_items += items_from_openai_tools(builtin_tools, source="builtin")
        attr_items += items_from_openai_tools(mcp_tools or [], source="mcp")
        attr_items += items_from_openai_tools(evolution_tools, source="evolution")
        attr_items += items_from_openai_tools([clarify_tool], source="builtin")

        self._streamed_flags[session_id] = False
        # ── P0-4: 活动观测开始（goose peek：status=running，durable turns开始计数）──
        activity = self._activity(session_id)
        activity.mark_running()
        activity.buffered = self._steering.pending(session_id)
        self._activity_store.upsert(activity)
        # ── P0 cortex: 循环/重复检测guard接入真实工具循环（opensoul侧模块此前无真实工具路径消费方）──
        guard = self._loop_guard_for(session_id)
        loop_intervene_count = 0
        for _round in range(MAX_ROUNDS):
            # ── P1: turn间隙批量注入插话 ──
            # goose Steer: between-turns drain（上一角色=Tool或回合刚结束）+ with_steer标记；
            # Khoj interrupt_queue: 拼进当前任务历史、保留已完成迭代继续跑；
            # nanobot: 每轮注入数封顶MAX_INJECTIONS_PER_TURN，abort=Khoj abort_message语义。
            steered = self._steering.drain(session_id)
            if steered:
                steer_abort = False
                for sm in steered:
                    if sm.is_abort:
                        steer_abort = True
                        await self._steer_notify(session_id, "🛑 收到中断指令，停止当前任务")
                        break
                    messages.append({"role": "user", "content": f"[用户插话] {sm.text}"})
                    activity.steer_injected += 1
                    await self._steer_notify(
                        session_id, f"**Incorporate New Instruction**: {sm.text[:200]}"
                    )
                activity.buffered = self._steering.pending(session_id)
                self._activity_store.upsert(activity)
                if steer_abort:
                    activity.mark_aborted()
                    self._activity_store.upsert(activity)
                    logger.info(f"[steer] session {session_id} aborted via interrupt queue")
                    return full_response + "\n\n[任务被用户插话中断]", all_tool_calls
            got_tool_call = False
            round_had_text = False
            tool_results: list = []  # 预绑定：活动记账在循环尾读取，防possibly-unbound
            # ── P1: token归因记录——每轮LLM请求一次（上下文随工具结果逐轮增长：
            # 逐轮快照+provider usage逐轮回填，estimate_gap按轮时序配对）──
            try:
                _window = int(os.environ.get("AGENT_CONTEXT_WINDOW", "32000"))
                _model = os.environ.get("LLM_MODEL", "")
                _msg_items = list(attr_items)
                _conv = 0
                _tres = 0
                for _m in messages:
                    _tok = estimate_tokens(str(_m.get("content", "") or ""))
                    if _m.get("role") == "tool":
                        _tres += _tok
                    else:
                        _conv += _tok
                _msg_items.append(ContextItem(
                    kind=KIND_MESSAGE, name="conversation_history",
                    source="session", tokens=_conv,
                ))
                if _tres:
                    _msg_items.append(ContextItem(
                        kind=KIND_TOOL_RESULT, name="tool_results_in_context",
                        source="tool_loop", tokens=_tres,
                    ))
                _usage = build_context_usage(
                    _msg_items, max_tokens=_window, model=_model,
                    # d439f163遗留#3估算校准：provider回填推出的Σactual/Σestimated因子
                    # 进入归因记录（calibrated_*字段与raw并排，估算偏差对观测者可见）
                    calibration_factor=self._token_attr_ledger.calibration_factor(),
                )
                self._token_attr_ledger.record(_usage, session_id=session_id, model=_model)
            except Exception as _ta_exc:
                logger.debug(f"[token-attribution] record failed (non-fatal): {_ta_exc}")
            async for chunk in self.llm_engine.chat_stream_with_tools(
                messages=messages,
                tools=all_tools if all_tools else None,
                system_prompt=system_prompt,
            ):
                if isinstance(chunk, dict) and "usage" in chunk and "tool_calls" not in chunk:
                    # P1 provider usage回填（上轮dev-report遗留#1闭环）：llm_engine在
                    # tool_calls之前发射usage chunk（消费方收到tool_calls会break出async
                    # for，后到chunk被丢弃——引擎侧已保证usage先行）。provider权威
                    # prompt_tokens → 本轮归因记录的estimate_gap（估算vs真实偏差）。
                    try:
                        _pt = (chunk.get("usage") or {}).get("prompt_tokens")
                        if _pt is not None:
                            self._token_attr_ledger.backfill_actual(
                                session_id, int(_pt), round_index=_round)
                    except Exception as _bf_exc:
                        logger.debug(f"[token-attribution] backfill failed (non-fatal): {_bf_exc}")
                    continue
                if isinstance(chunk, dict) and "tool_calls" in chunk:
                    # LLM 请求调用工具
                    tool_calls = chunk["tool_calls"]
                    got_tool_call = True

                    # ── P0 cortex循环防护（ag2连续检测+goose拒绝阈值+Khoj组合签名+DeerFlow三级渐进）──
                    # 检查发生在工具执行之前：INTERVENE/FORCE_STOP时合成拦截结果、不执行工具
                    # （open-webui三态：拒绝=合成错误工具结果，loop不断），重复调用不再重复产生副作用
                    loop_result = None
                    try:
                        loop_result = guard.check(tool_calls=[
                            {
                                "name": (tc.get("function") or {}).get("name", ""),
                                "arguments": (tc.get("function") or {}).get("arguments"),
                            }
                            for tc in tool_calls
                        ])
                    except Exception as _lg_err:
                        logger.debug(f"[loop-guard] 检查失败(fail-safe放行): {_lg_err}")
                    if loop_result is not None and loop_result.is_looping:
                        lg_severity = str(loop_result.severity)
                        logger.warning(
                            f"[loop-guard] session={session_id} severity={lg_severity} "
                            f"type={loop_result.detection_type} count={loop_result.consecutive_count}")
                        # 可观测：拦截/警告事件进tool_calls_log（trajectory可查"为什么没执行"）
                        for tc in tool_calls:
                            all_tool_calls.append({
                                "name": (tc.get("function") or {}).get("name", ""),
                                "arguments": (tc.get("function") or {}).get("arguments"),
                                "result_preview": loop_result.message[:200],
                                "permission": f"loop_guard:{lg_severity}",
                            })
                        _lg_force_stop = lg_severity == "force_stop" or (
                            lg_severity == "intervene" and loop_intervene_count >= 1)
                        if _lg_force_stop:
                            # FORCE_STOP（或wiring级升级）：断循环+用户可见（mem0：失败必须可见）
                            stop_note = f"\n\n🛑 [循环检测强制停止] {loop_result.message}"
                            full_response += stop_note
                            if self._client is not None:
                                await self._client.session_update(
                                    session_id=session_id,
                                    update=acp.update_agent_message_text(stop_note),
                                )
                                self._streamed_flags[session_id] = True
                            activity.mark_idle()
                            self._activity_store.upsert(activity)
                            logger.warning(f"[loop-guard] session={session_id} FORCE_STOP，任务提前终止")
                            return full_response, all_tool_calls
                        if lg_severity == "intervene":
                            # DeerFlow INTERVENE：剥离工具执行，合成拦截结果（协议保持完整，loop不断）
                            loop_intervene_count += 1
                            synthetic = (
                                f"🛑 [loop-guard INTERVENE] {loop_result.message} "
                                "该工具调用已被拦截、未执行。请基于已有信息给出最终回答，"
                                "或改用不同的工具/参数——重复相同调用将导致任务被强制停止。")
                            for tc in tool_calls:
                                tool_results.append({
                                    "tool_call_id": tc.get("id", ""),
                                    "role": "tool",
                                    "content": synthetic,
                                })
                            messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
                            messages.extend(tool_results)
                            break
                        # WARN：Khoj模式——注入"已经调过这个，换一个"警告，本轮工具正常执行
                        messages.append({
                            "role": "user",
                            "content": f"[LoopGuard警告] {loop_result.message}",
                        })

                    # 推送工具调用状态给前端
                    for tc in tool_calls:
                        func_name = tc["function"]["name"]
                    # 工具调用状态已通过 tool_call 事件推送给前端，无需重复发文字

                    # 执行所有工具调用并收集结果
                    tool_results = []
                    for tc in tool_calls:
                        func_name = tc["function"]["name"]
                        try:
                            func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                        except json.JSONDecodeError:
                            func_args = {}

                        # ── P0-3 工具权限引擎门禁（AgentScope PermissionEngine×kilocode分层）──
                        # opensoul immune评估：deny=合成阻断结果（open-webui三态，loop不断）；
                        # ask=ACP v1.0标准 session/request_permission 真人审批（超时/拒绝=阻断）
                        gate_result = await self._permission_gate.check(
                            session_id, func_name, func_args,
                            working_dir=str(self._session_cwds.get(session_id, self._project_root) or ""),
                            request_approval=(
                                lambda tn, ta, dec, _sid=session_id:
                                    self._request_tool_approval(_sid, tn, ta, dec)),
                        )
                        if not gate_result.allowed:
                            blocked_reason = gate_result.blocked_reason
                            logger.warning(
                                f"[{session_id}] permission-gate {gate_result.behavior}: "
                                f"{func_name} (source={gate_result.rule_source}, mode={gate_result.mode})")
                            tool_results.append({
                                "tool_call_id": tc.get("id", ""),
                                "role": "tool",
                                "content": self._process_tool_output(func_name, tc.get("id", ""), blocked_reason),
                            })
                            all_tool_calls.append({
                                "name": func_name,
                                "arguments": func_args,
                                "result_preview": blocked_reason[:200],
                                "permission": gate_result.behavior,
                            })
                            continue

                        # ── P2工具执行增强：缓存+审计 ─────────────────
                        tool_start = time.time()
                        # 工具结果缓存检查（只缓存只读工具）
                        _cached_result = None
                        if func_name in ("read_file", "list_files", "search_files"):
                            _cached_result = self._tool_cache.get(func_name, func_args)
                            if _cached_result is not None:
                                logger.info(f"[tool-cache] 命中: {func_name}")
                                result = _cached_result
                                # 跳过实际执行，直接进入结果处理
                                tool_calls_log.append({"tool": func_name, "args": func_args, "result": result[:200], "cached": True})
                                messages.append({"role": "assistant", "tool_calls": [tc]})
                                messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": self._process_tool_output(func_name, tc.get("id", ""), result)})
                                continue

                        # ── 基础工具执行 ───────────────────────────────
                        if func_name == "read_file":
                            try:
                                path = func_args.get("path", "")
                                offset = func_args.get("offset", 1)
                                limit = func_args.get("limit", 100)
                                proc = subprocess.run(
                                    ["sed", "-n", f"{offset},{offset + limit - 1}p", path],
                                    capture_output=True, text=True, errors="replace", timeout=10,
                                )
                                if proc.returncode == 0 and proc.stdout:
                                    lines = proc.stdout.split("\n")
                                    result = "\n".join(f"{offset + i}|{line}" for i, line in enumerate(lines))
                                else:
                                    result = f"错误: {proc.stderr or '文件不存在或为空'}"
                            except Exception as e:
                                te = self._tool_error_handler.handle_error(
                                    session_id, "read_file", e, func_args)
                                result = te.to_model_message()

                        elif func_name == "write_file":
                            try:
                                path = func_args.get("path", "")
                                file_content = func_args.get("content", "")
                                if not path or not file_content:
                                    # arguments不完整，不猜测，反馈给LLM让它重新推理
                                    result = f"错误: write_file 参数不完整（path='{path}', content长度={len(file_content)}）。请重新调用并提供完整的path和content参数。path必须包含文件名和扩展名（如 /home/climbing/project/index.html）。"
                                else:
                                    from utils.file_safety import atomic_write
                                    ok, err = atomic_write(path, file_content)
                                    if not ok:
                                        result = f"写入失败: {err}"
                                    else:
                                        result = f"已写入 {path} ({len(file_content)} 字节)"
                            except Exception as e:
                                te = self._tool_error_handler.handle_error(
                                    session_id, "write_file", e, func_args)
                                result = te.to_model_message()

                        elif func_name == "terminal":
                            try:
                                cmd = func_args.get("command", "")
                                if not cmd:
                                    result = "错误: command 不能为空"
                                else:
                                    import shlex, re as _re
                                    # 自动转义路径中的括号（Next.js 的 (app) 目录）
                                    def _quote_p(m):
                                        return shlex.quote(m.group(0))
                                    cmd = _re.sub(r'(/[\w/.\-]*[()][\w/.\-()]*)', _quote_p, cmd)
                                    proc = subprocess.run(
                                        cmd, shell=True, capture_output=True, text=True, errors="replace", timeout=30,
                                        cwd=cwd,
                                    )
                                    output = proc.stdout + proc.stderr
                                    result = output[:3000] if output else "(无输出)"
                                    if proc.returncode != 0:
                                        result += f"\n[exit code: {proc.returncode}]"
                            except subprocess.TimeoutExpired:
                                te = self._tool_error_handler.handle_error(
                                    session_id, "terminal", Exception("timeout"), func_args)
                                result = te.to_model_message()
                            except Exception as e:
                                te = self._tool_error_handler.handle_error(
                                    session_id, "terminal", e, func_args)
                                result = te.to_model_message()

                        elif func_name == "search_files":
                            try:
                                pattern = func_args.get("pattern", "")
                                path = func_args.get("path", cwd)
                                # 拦截从根目录搜索
                                if path == "/" or path == "":
                                    path = cwd
                                target = func_args.get("target", "content")
                                import shlex
                                if target == "files":
                                    cmd = f"find {shlex.quote(path)} -name {shlex.quote(pattern)} -type f"
                                else:
                                    cmd = f"grep -rn -i --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md' {shlex.quote(pattern)} {shlex.quote(path)}"
                                proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace", timeout=10)
                                output = proc.stdout[:3000] if proc.stdout else "(无结果)"
                                result = output
                            except Exception as e:
                                result = f"搜索失败: {e}"

                        elif func_name == "patch":
                            try:
                                path = func_args.get("path", "")
                                old_string = func_args.get("old_string", "")
                                new_string = func_args.get("new_string", "")
                                with open(path, "r", encoding="utf-8") as f:
                                    file_content = f.read()
                                if old_string not in file_content:
                                    result = f"错误: 在 {path} 中未找到匹配文本"
                                else:
                                    file_content = file_content.replace(old_string, new_string, 1)
                                    from utils.file_safety import atomic_write
                                    ok, err = atomic_write(path, file_content)
                                    if not ok:
                                        result = f"修改失败: {err}"
                                    else:
                                        result = f"已修改 {path}"
                            except Exception as e:
                                result = f"修改失败: {e}"

                        elif func_name == "execute_code":
                            try:
                                code = func_args.get("code", "")
                                with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, dir="/tmp") as f:
                                    f.write(code)
                                    tmp_path = f.name
                                proc = subprocess.run(
                                    ["python3", tmp_path],
                                    capture_output=True, text=True, errors="replace", timeout=60,
                                    cwd=cwd,
                                )
                                os.unlink(tmp_path)
                                output = proc.stdout + proc.stderr
                                result = output[:5000] if output else "(无输出)"
                                if proc.returncode != 0:
                                    result += f"\n[exit code: {proc.returncode}]"
                            except subprocess.TimeoutExpired:
                                result = "执行超时（60秒）"
                            except Exception as e:
                                result = f"执行失败: {e}"

                        elif func_name == "web_search":
                            try:
                                query = func_args.get("query", "")
                                limit = func_args.get("limit", 5)
                                # 用 curl 调用 searxng 或直接返回提示
                                proc = subprocess.run(
                                    ["curl", "-s", f"http://localhost:8888/search?q={query}&format=json&pageno=1"],
                                    capture_output=True, text=True, errors="replace", timeout=15,
                                )
                                if proc.returncode == 0 and proc.stdout:
                                    data = json.loads(proc.stdout)
                                    results = data.get("results", [])[:limit]
                                    lines = []
                                    for r in results:
                                        lines.append(f"- {r.get('title', '')}: {r.get('url', '')}")
                                        lines.append(f"  {r.get('content', '')[:100]}")
                                    result = "\n".join(lines) if lines else "无搜索结果"
                                else:
                                    result = f"搜索不可用: {proc.stderr or 'SearXNG未启动'}"
                            except Exception as e:
                                result = f"搜索失败: {e}"

                        elif func_name == "web_extract":
                            try:
                                url = func_args.get("url", "")
                                proc = subprocess.run(
                                    ["curl", "-sL", "--max-time", "15", "-H", "User-Agent: Mozilla/5.0", url],
                                    capture_output=True, text=True, errors="replace", timeout=20,
                                )
                                if proc.returncode == 0:
                                    # 简单HTML标签清理
                                    text = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', proc.stdout)
                                    text = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', text)
                                    text = re.sub(r'<[^>]+>', ' ', text)
                                    text = re.sub(r'\s+', ' ', text).strip()
                                    result = text[:5000]
                                else:
                                    result = f"抓取失败: {proc.stderr}"
                            except Exception as e:
                                result = f"抓取失败: {e}"

                        elif func_name == "vision_analyze":
                            try:
                                path = func_args.get("path", "")
                                question = func_args.get("question", "描述这张图片")
                                with open(path, "rb") as f:
                                    img_b64 = base64.b64encode(f.read()).decode()
                                result = f"[图片已读取: {path}, base64长度={len(img_b64)}]\n问题: {question}\n注意: 需要视觉模型支持才能分析图片内容。"
                            except Exception as e:
                                result = f"读取图片失败: {e}"

                        elif func_name == "clarify":
                            try:
                                question = func_args.get("question", "")
                                options = func_args.get("options", [])
                                # 通过 session_update 推送 choice 类型消息给前端
                                if self._client is not None:
                                    choice_payload = {
                                        "type": "choice",
                                        "text": question,
                                        "choices": [{"id": o.get("id", ""), "label": o.get("label", ""), "description": o.get("description", "")} for o in options]
                                    }
                                    await self._client.session_update(
                                        session_id=session_id,
                                        update=acp.update_agent_message_text(json.dumps(choice_payload)),
                                    )
                                result = f"已向用户展示选择菜单: {question} (共{len(options)}个选项，等待用户选择)"
                                # 等待用户选择（最多60秒）
                                future = asyncio.get_event_loop().create_future()
                                self._pending_choices[session_id] = future
                                try:
                                    result = await asyncio.wait_for(future, timeout=60)
                                except asyncio.TimeoutError:
                                    result = "用户未在60秒内选择，请继续"
                                finally:
                                    self._pending_choices.pop(session_id, None)
                            except Exception as e:
                                result = f"clarify失败: {e}"

                        elif func_name == "todo":
                            # 简单的内存任务列表
                            if not hasattr(self, '_todo_list'):
                                self._todo_list = []
                                self._todo_counter = 0
                            action = func_args.get("action", "list")
                            if action == "add":
                                self._todo_counter += 1
                                task = {"id": self._todo_counter, "content": func_args.get("content", ""), "status": "pending"}
                                self._todo_list.append(task)
                                result = f"已添加任务 #{task['id']}: {task['content']}"
                            elif action == "complete":
                                tid = func_args.get("task_id", "")
                                for t in self._todo_list:
                                    if str(t["id"]) == str(tid):
                                        t["status"] = "done"
                                        result = f"已完成任务 #{tid}"
                                        break
                                else:
                                    result = f"未找到任务 #{tid}"
                            else:
                                if self._todo_list:
                                    lines = [f"#{t['id']} [{t['status']}] {t['content']}" for t in self._todo_list]
                                    result = "\n".join(lines)
                                else:
                                    result = "任务列表为空"

                        elif func_name == "read_file_segment":
                            # P0-2读回闭环：分段读取溢出文件（deepagents stub教模型的读回方式；
                            # read_segment内含路径安全校验——只允许读spill_dir内的文件）
                            _seg_handler = getattr(self, "_output_handler", None)
                            if _seg_handler is None:
                                from agent.tool_output_handler import ToolOutputHandler as _TOH
                                _seg_handler = _TOH()
                                self._output_handler = _seg_handler
                            try:
                                result = _seg_handler.read_segment(
                                    str(func_args.get("path", "")),
                                    start_line=int(func_args.get("start_line", 1) or 1),
                                    end_line=int(func_args.get("end_line", 200) or 200),
                                )
                            except Exception as _seg_err:
                                result = f"错误: read_file_segment执行失败 — {_seg_err}"

                        elif func_name == "read_image":
                            try:
                                path = func_args.get("path", "")
                                with open(path, "rb") as f:
                                    img_b64 = base64.b64encode(f.read()).decode()
                                result = f"data:image/png;base64,{img_b64[:100]}...(截断，总长{len(img_b64)})"
                            except Exception as e:
                                te = self._tool_error_handler.handle_error(
                                    session_id, "read_file", e, func_args)
                                result = te.to_model_message()

                        # ── OpenSoul感知层工具（可选补齐层：精确OCR/元数据/语音转文字） ──
                        elif func_name in ("sense_ocr", "sense_analyze_image", "sense_transcribe_audio"):
                            try:
                                path = func_args.get("path", "")
                                lang = func_args.get("language") or None
                                import mimetypes
                                mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
                                sense_urls = {
                                    "sense_ocr": "http://127.0.0.1:8090/api/sense/ocr/smart/image",
                                    "sense_analyze_image": "http://127.0.0.1:8090/api/sense/analyze/image",
                                    "sense_transcribe_audio": "http://127.0.0.1:8090/api/sense/asr/transcribe",
                                }
                                url = sense_urls[func_name]
                                form = {"language": lang} if lang else {}
                                async with httpx.AsyncClient(timeout=120.0) as client:
                                    with open(path, "rb") as f:
                                        files = {"file": (os.path.basename(path) or "upload", f, mime)}
                                        resp = await client.post(url, files=files, data=form)
                                    if resp.status_code == 200:
                                        result = json.dumps(resp.json(), ensure_ascii=False, indent=2)
                                    else:
                                        result = f"⚠️ Sense API错误({resp.status_code}): {resp.text[:300]}"
                            except FileNotFoundError:
                                result = f"⚠️ 文件不存在: {path}"
                            except Exception as e:
                                result = f"⚠️ Sense感知工具不可用: {e}"

                        # ── 进化引擎工具 ─────────────────────────────────
                        elif func_name == "request_evolution":
                            feature = func_args.get("feature", "")
                            priority = func_args.get("priority", "normal")
                            try:
                                async with httpx.AsyncClient(timeout=120.0) as client:
                                    resp = await client.post(
                                        "http://127.0.0.1:8092/api/evolution/improve",
                                        json={"description": feature, "requirements": f"优先级: {priority}"},
                                    )
                                    data = resp.json()
                                    if data.get("ok"):
                                        result = f"✅ 已完成自我改进: {feature}\n文件: {data.get('file', 'N/A')}\n已提交: {data.get('committed', False)}\n代码预览:\n{data.get('code_preview', '')[:300]}"
                                    else:
                                        result = f"❌ 改进失败: {data.get('error', '未知错误')}"
                            except Exception as e:
                                result = f"⚠️ 进化引擎不可用: {e}"
                        elif func_name == "check_evolution_status":
                            if self._evolution_engine:
                                status = self._evolution_engine.get_status()
                                skills = self._evolution_engine.get_created_skills()
                                quality = self._evolution_engine.get_evolution_quality()
                            elif hasattr(self, '_evolution_api_url'):
                                resp = httpx.get(f"{self._evolution_api_url}/api/evolution/status", timeout=10.0)
                                status = resp.json() if resp.status_code == 200 else {}
                                skills = []
                                quality = {}
                            else:
                                status, skills, quality = {}, [], {}
                            result = json.dumps({"status": status, "skills": skills, "quality": quality}, ensure_ascii=False, indent=2)
                        elif func_name == "batch_execute":
                            # ── P1 Code Mode工具批量化（goose code_execution+kilocode
                            # code-mode两方定案）：N次工具调用批成1个脚本执行。内层每次
                            # stub调用经_code_mode_tool_call→permission_gate（批量化不
                            # 绕过权限引擎）；call_log逐条进all_tool_calls（goose #5
                            # tool_graph"批量化后仍能审计每步调用结构"）──
                            _cm_script = func_args.get("script", "") or func_args.get("code", "")
                            if not str(_cm_script).strip():
                                result = "错误: batch_execute 需要 script 参数（Python脚本，会话工具函数可直接调用，最终结果赋给result变量）"
                            else:
                                try:
                                    _cm = getattr(self, "_code_mode", None)
                                    if _cm is None:
                                        _cm = CodeModeExecutor()
                                        self._code_mode = _cm
                                    _cm_tools = [t["function"]["name"] for t in all_tools]
                                    async def _cm_dispatch(_n, _a, _sid=session_id, _cwd=cwd):
                                        return await self._code_mode_tool_call(_sid, _n, _a, _cwd)
                                    _cm_res = await _cm.execute(
                                        str(_cm_script), available_tools=_cm_tools, dispatch=_cm_dispatch)
                                    result = CodeModeExecutor.format_result(_cm_res)
                                    # tool_graph可观测：批内每步调用进轨迹账本
                                    for _e in _cm_res.call_log:
                                        all_tool_calls.append({
                                            "name": f"batch:{_e['name']}",
                                            "arguments": _e["args_preview"],
                                            "result_preview": (
                                                "blocked" if _e.get("blocked")
                                                else ("ok" if _e.get("ok") else "failed")
                                            ) + f" {_e['duration_ms']}ms len={_e['result_len']}",
                                        })
                                except Exception as _cm_err:
                                    result = f"[CODE_MODE] 批量执行失败: {_cm_err}"
                        else:
                            result = await self._call_mcp_tool(func_name, func_args)
                        tool_results.append({
                            "tool_call_id": tc["id"],
                            "role": "tool",
                            "content": self._process_tool_output(func_name, tc["id"], str(result)),
                        })

                        # 记录工具调用
                        all_tool_calls.append({
                            "name": func_name,
                            "arguments": func_args,
                            "result_preview": result[:200] if result else "",
                        })

                        # P2工具审计 + 结果缓存
                        try:
                            tool_duration = time.time() - tool_start if 'tool_start' in dir() else 0
                            self._tool_auditor.audit_call(
                                session_id=session_id, tool_name=func_name,
                                arguments=func_args, result_preview=str(result)[:200],
                                duration_s=tool_duration, success="错误" not in str(result),
                            )
                            # 缓存只读工具结果
                            if func_name in ("read_file", "list_files", "search_files") and "错误" not in str(result):
                                self._tool_cache.put(func_name, func_args, str(result))
                        except Exception as _audit_err:
                            logger.debug(f"[tool-audit] 失败(非致命): {_audit_err}")

                        # ── SoulBrain反思学习 ──────────────
                        try:
                            await httpx.AsyncClient().post(
                                "http://127.0.0.1:3100/api/brain/verify",
                                json={
                                    "tenant_id": "openmate",
                                    "agent_id": session_id[:8],
                                    "task_id": session_id[:8],
                                    "action": f"{func_name}({json.dumps(func_args, ensure_ascii=False)[:200]})",
                                    "result": {"file_written": func_name in ("write_file", "file_editor"), "error": None},
                                },
                                timeout=3,
                            )
                        except Exception:
                            pass


                    # 将 assistant 的 tool_calls 消息和工具结果加入消息历史
                    messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
                    messages.extend(tool_results)

                    # 工具执行完毕，跳出内层async for，继续外层for循环
                    break
                else:
                    # 纯文本 chunk
                    chunk_text = str(chunk) if not isinstance(chunk, str) else chunk
                    if chunk_text:
                        round_had_text = True
                        full_response += chunk_text
                        if self._client is not None:
                            await self._client.session_update(
                                session_id=session_id,
                                update=acp.update_agent_message_text(chunk_text),
                            )
                            self._streamed_flags[session_id] = True

            # ── P0-4: 活动记账（goose durable turns + claude-code noop自报streak）──
            if got_tool_call:
                activity.mark_progress(tool=True, tool_count=len(tool_results))
            elif round_had_text:
                activity.mark_progress(tool=False)
            else:
                # claude-code: noop必须自报——连续noop折叠统计=停滞可观测
                activity.report_noop()
                logger.warning(
                    f"[peek] session={session_id} noop streak={activity.noop_streak} "
                    "(本轮无工具调用也无文本输出)"
                )

            # 如果没有工具调用，模型返回了纯文本，结束循环
            if not got_tool_call:
                break
        else:
            # mem0 §1.1"失败必须可见"：轮次耗尽必须显式告知，不能静默返回残缺结果
            exhaustion_note = (
                f"\n\n[已达最大工具调用轮次({MAX_ROUNDS})，任务停止。"
                "如需继续，请发送新指令。]")
            full_response += exhaustion_note
            if self._client is not None:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(exhaustion_note),
                )
                self._streamed_flags[session_id] = True
            logger.warning(f"[loop-guard] session={session_id} MAX_ROUNDS={MAX_ROUNDS} 耗尽")

        # ── P0-4: 活动观测结束（idle+持久化，/api/agent/peek跨进程可读）──
        activity.mark_idle()
        activity.buffered = self._steering.pending(session_id)
        self._activity_store.upsert(activity)
        return full_response, all_tool_calls

    async def _request_tool_approval(
        self, session_id: str, tool_name: str, tool_args: dict, decision: dict
    ) -> bool:
        """P0-3: ASK决策 → ACP v1.0标准 session/request_permission 真人审批

        通过acp官方库 Client.request_permission 发起agent→client请求（wire method:
        session/request_permission），前端AcpApprovalModal弹窗响应
        {"outcome":{"outcome":"selected","optionId":"allow_once"}} / cancelled。
        与engine.py旧PermissionManager的"session/request_permission事件"不同：
        前者从未接线且前端无处理器；本方法走的是ACP v1.0标准请求-响应协议。
        """
        if self._client is None:
            return False
        try:
            from acp.schema import ContentToolCallContent, PermissionOption, TextContentBlock, ToolCallUpdate

            risk = str(decision.get("risk", "medium"))
            reason = decision.get("decision_reason", "") or decision.get("message", "")
            if tool_name in ("terminal", "execute_code"):
                kind = "execute"
            elif tool_name in ("write_file", "patch"):
                kind = "edit"
            elif tool_name in ("read_file", "read_image", "vision_analyze", "search_files"):
                kind = "read"
            else:
                kind = "other"
            description = (
                f"OpenSoul权限引擎要求人工确认（risk={risk}）\n"
                f"原因: {reason}\n"
                f"参数: {json.dumps(tool_args, ensure_ascii=False)[:400]}")
            tool_call = ToolCallUpdate(
                tool_call_id=f"perm-{str(decision.get('decision_id', ''))[:12]}",
                title=tool_name,
                kind=kind,
                content=[ContentToolCallContent(
                    type="content",
                    content=TextContentBlock(type="text", text=description),  # type: ignore[arg-type]
                )],
                raw_input=tool_args,
            )
            options = [
                PermissionOption(option_id="allow_once", kind="allow_once",
                                 name=f"允许 {tool_name}（仅此一次）"),
                PermissionOption(option_id="reject_once", kind="reject_once",
                                 name=f"拒绝 {tool_name}"),
            ]
            resp = await self._client.request_permission(
                options=options, session_id=session_id, tool_call=tool_call)
            # 兼容pydantic模型与原始dict两种返回
            if isinstance(resp, dict):
                outcome_obj = resp.get("outcome") or {}
                if isinstance(outcome_obj, dict):
                    return outcome_obj.get("outcome") == "selected" and str(
                        outcome_obj.get("optionId") or outcome_obj.get("option_id") or "").startswith("allow")
                return False
            outcome_obj = getattr(resp, "outcome", None)
            if outcome_obj is None:
                return False
            selected = getattr(outcome_obj, "outcome", "") == "selected"
            option_id = str(getattr(outcome_obj, "option_id", "") or "")
            return selected and option_id.startswith("allow")
        except Exception as e:
            logger.error(f"[permission-gate] approval request failed: {e}", exc_info=True)
            return False

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

    async def new_session(self, cwd: str = "/", mcp_servers=None, field_meta: dict | None = None, **kwargs) -> acp.NewSessionResponse:
        """创建新会话，或重连到已有会话"""
        # 后端自己决定 cwd，不依赖前端传值
        cwd = self._project_root
        # 从 _meta 中提取 session_id（前端通过 _meta 传递）
        session_id = (field_meta or {}).get("session_id") or kwargs.get("session_id")
        # 如果传了 session_id 且该会话存在于内存或 DB，直接重连
        if session_id:
            if session_id in self.sessions:
                logger.info(f"Reconnect (memory): {session_id}")
                return acp.NewSessionResponse(session_id=session_id)
            if self._session_exists_in_db(session_id):
                # 从 DB 加载历史消息到内存
                messages = self._load_messages_from_db(session_id)
                self.sessions[session_id] = {
                    "session_id": session_id,
                    "cwd": cwd,
                    "messages": messages,
                    "created_at": time.time(),
                    "state": "active",
                }
                logger.info(f"Reconnect (DB): {session_id}, loaded {len(messages)} messages")
                self._session_cwds[session_id] = cwd
                return acp.NewSessionResponse(session_id=session_id)
        sid = f"om-{uuid.uuid4().hex[:12]}"
        self.sessions[sid] = {
            "session_id": sid,
            "cwd": cwd,
            "messages": [],
            "created_at": time.time(),
            "state": "active",
        }
        logger.info(f"New session: {sid}, cwd={cwd}")
        self._session_cwds[sid] = cwd
        return acp.NewSessionResponse(session_id=sid)

    async def prompt(
        self,
        prompt: list,
        session_id: str,
        message_id: str | None = None,
        **kwargs,
    ) -> PromptResponse:
        """处理用户 prompt — 支持 MCP 工具调用的 LLM 推理

        流式推送：通过 AgentSideConnection.session_update() 发送 AgentMessageChunk，
        客户端收到 session_update 通知即可实时显示生成内容。
        
        Writer Fencing: 同一session同时只有一个prompt在处理，后来的排队等待。
        """
        logger.info(f"[prompt] CALLED! session={session_id}, parts={len(prompt)}")
        
        # ── 检查是否有等待中的菜单选择 ──
        if session_id in self._pending_choices:
            # 提取用户选择的文本
            user_choice = ""
            for block in prompt:
                if hasattr(block, "text"):
                    user_choice += block.text
                elif isinstance(block, dict) and block.get("type") == "text":
                    user_choice += block.get("text", "")
            
            if user_choice.strip():
                logger.info(f"[choice] User selected: {user_choice[:50]}")
                self.resolve_choice(session_id, user_choice.strip())
                # 返回成功，不继续处理
                return PromptResponse(stop_reason="end_turn")
        
        session = self.sessions.get(session_id)
        if not session:
            # stale-session自愈（d439f163 HTTP路径同款，落地/ws/acp真实聊天路径）：
            # 子进程重启后内存会话清空，从SQLite恢复而非静默refusal
            session = self._reload_session_from_db(session_id)
        if not session:
            logger.error(f"Session not found (memory+DB): {session_id}")
            # 失败必须可见（AIHawk显式标记/mem0禁止静默）：refusal必须携带用户可见原因
            await self._notify_client(
                session_id,
                "⚠️ 会话已失效：该会话在服务端不存在（可能已被清理），请新建会话后重试。",
            )
            return PromptResponse(stop_reason="refusal")

        # ── Writer Fencing: 获取会话写入锁（通过架构增强系统）──
        writer_id = f"prompt:{message_id or id(prompt)}"
        async with self._arch.session_guard(session_id, writer_id=writer_id) as acquired:
            if not acquired:
                # ── P1: 插话队列（Khoj interrupt_queue + goose Steer）──
                # 运行中消息不再拒绝丢弃（调研："OpenMate聊天框无插话语义"）：
                # 排队后在turn间隙注入当前任务；/abort = Khoj abort_message语义。
                busy_text = ""
                for block in prompt:
                    if hasattr(block, "text"):
                        busy_text += block.text
                    elif isinstance(block, dict) and block.get("type") == "text":
                        busy_text += block.get("text", "")
                act = self._activity(session_id)
                if SteeringQueue.is_abort(busy_text):
                    self._steering.enqueue(session_id, busy_text.strip())
                    act.buffered = self._steering.pending(session_id)
                    self._activity_store.upsert(act)
                    logger.info(f"[steer] abort queued for busy session {session_id}")
                    await self._steer_notify(session_id, "🛑 中断指令已排队，任务将在当前步骤后停止")
                    return PromptResponse(stop_reason="end_turn")
                msg = self._steering.enqueue(session_id, busy_text.strip() or "(空插话)")
                if msg is None:
                    # 队列满（Khoj maxsize=10语义）：丢弃必须显式标记（AIHawk）
                    notice = f"⏳ 任务运行中，插话队列已满（{MAX_QUEUE_DEPTH}条），本条被丢弃"
                else:
                    act.steer_queued += 1
                    notice = (
                        f"⏳ 插话已排队（第{self._steering.pending(session_id)}条）："
                        "将在当前工具轮次结束后注入任务"
                    )
                act.buffered = self._steering.pending(session_id)
                self._activity_store.upsert(act)
                logger.info(f"[steer] busy session {session_id}: {notice}")
                await self._steer_notify(session_id, notice)
                return PromptResponse(stop_reason="end_turn")
            
            return await self._prompt_inner(prompt, session_id, message_id, **kwargs)

    async def _prompt_inner(
        self,
        prompt: list,
        session_id: str,
        message_id: str | None = None,
        **kwargs,
    ) -> PromptResponse:
        """prompt的实际处理逻辑（在writer fence保护下执行）"""
        session = self.sessions.get(session_id)
        if not session:
            session = self._reload_session_from_db(session_id)
        if not session:
            await self._notify_client(
                session_id,
                "⚠️ 会话已失效：该会话在服务端不存在（可能已被清理），请新建会话后重试。",
            )
            return PromptResponse(stop_reason="refusal")

        # ── 可观测性：开始run span ──
        run_span = self._observability.start_span(
            trace_id=session_id,
            span_type=SpanType.RUN,
            name=f"prompt:{session_id}",
            attributes={"message_id": message_id or ""},
        )

        # 提取文本内容 — prompt 是 TextContentBlock | ImageContentBlock | FileContentBlock 列表
        # acp SDK把params.prompt解析成Pydantic对象（TextContentBlock/ImageContentBlock/
        # EmbeddedResourceContentBlock等），不是dict——两种形态都要支持，否则图片被静默丢弃
        user_text = ""
        file_parts = []
        for block in prompt:
            bname = type(block).__name__
            if isinstance(block, dict):
                if block.get("type") == "text":
                    user_text += block.get("text", "")
                elif block.get("type") in ("file", "image") and block.get("data"):
                    file_parts.append(dict(block))
            elif bname == "TextContentBlock" or (hasattr(block, "text") and getattr(block, "type", "") == "text"):
                user_text += block.text
            elif getattr(block, "type", "") in ("image", "audio") or bname in ("ImageContentBlock", "AudioContentBlock"):
                # SDK ImageContentBlock对象: .data + .mime_type(snake_case) + .type="image"
                data = getattr(block, "data", None)
                if data:
                    mime = getattr(block, "mime_type", None) or getattr(block, "mimeType", None) or "image/png"
                    file_parts.append({"type": "image", "data": data, "mimeType": mime})
            elif hasattr(block, "resource"):
                # EmbeddedResourceContentBlock(type:"resource"): .resource = BlobResourceContents(.blob/.mime_type/.uri)
                res = getattr(block, "resource", None)
                blob = getattr(res, "blob", None) or (res.get("blob") if isinstance(res, dict) else None)
                if blob:
                    mime = getattr(res, "mime_type", None) or (res.get("mimeType") if isinstance(res, dict) else None) or "application/octet-stream"
                    uri = getattr(res, "uri", None) or (res.get("uri") if isinstance(res, dict) else "") or ""
                    fname = uri.split("/")[-1] if uri else "file"
                    file_parts.append({"type": "file", "data": blob, "name": fname, "mimeType": mime})

        # ── 权限检查：高风险工具需要确认 ──
        try:
            if hasattr(self, '_tool_policy'):
                # 检查是否有高风险工具调用
                pass  # 实际权限检查在工具执行时进行
        except Exception:
            pass

        # ── 文件索引：索引会话中提到的文件 ──
        try:
            import re as _re_idx
            file_mentions = _re_idx.findall(r'[\w/\-]+\.\w{1,5}', user_text)
            for fp in file_mentions[:3]:
                if os.path.exists(fp):
                    self._file_index.index_file(session_id, fp)
        except Exception:
            pass

        # ── 环境感知 ──
        try:
            env_info = self._env_sensor.sense()
            if env_info and hasattr(env_info, 'cpu_percent') and env_info.cpu_percent > 90:
                logger.warning(f"[env] CPU使用率过高: {env_info.cpu_percent}%")
        except Exception:
            pass

        # ── 上下文预算管理：刷新估算校准因子（d439f163遗留#3）──
        # provider回填的estimate_gap→Σactual/Σestimated校准因子，本轮归因record与
        # 消息组装处的manage()裁剪共用（TTL缓存由AttributionLedger内部节流）。
        # P0静默死路径修复记录：原此处调用self._context_budget.manage(...)，但该方法
        # 在ContextBudgetManager上并不存在——AttributeError被except:pass静默吞掉，
        # 上下文预算裁剪从未生效。manage()现已真实实现，裁剪接线位置见下方
        # "构建上下文消息"处（作用于LLM请求副本，持久化历史不动）。
        try:
            self._context_budget.calibration_factor = (
                self._token_attr_ledger.calibration_factor()
            )
        except Exception as _cf_exc:
            logger.debug(
                f"[context-budget] calibration factor refresh failed (fail-safe 1.0): {_cf_exc}"
            )

        # ── 会话状态机：记录状态转换 ──
        try:
            self._session_fsm.create_session(session_id)
            self._session_fsm.transition(session_id, SessionEvent.USER_MESSAGE, metadata={"text_len": len(user_text)})
        except Exception:
            pass

        # ── 异步生成会话标题（第一条消息时立即触发，不等回复）──
        if user_text and not session.get("title") and len(session.get("messages", [])) <= 1:
            session["title"] = user_text[:30]  # 先用截断文本做临时标题
            # 立即同步到OpenSoul（sidebar数据源）
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    await client.patch(
                        f"http://127.0.0.1:8090/api/sessions/{session_id}",
                        json={"title": user_text[:30]},
                        timeout=3,
                    )
            except Exception:
                pass
            # 异步调LLM生成精炼标题
            asyncio.create_task(self._generate_session_title(session_id, user_text))

        # 保存附件到持久化目录，记录元数据供会话历史加载时恢复
        attachments_meta = []
        if file_parts:
            import base64 as b64mod
            persist_dir = f"/home/climbing/opensoul/data/attachments/{session_id}"
            os.makedirs(persist_dir, exist_ok=True)
            for f in file_parts:
                try:
                    b64_data = f.get("data", "")
                    if "," in b64_data:
                        b64_data = b64_data.split(",")[-1]
                    file_bytes = b64mod.b64decode(b64_data)
                    fname = f.get("name", "file")
                    mime = f.get("mimeType", "application/octet-stream")
                    ext = ""
                    if "." in fname:
                        ext = "." + fname.rsplit(".", 1)[-1]
                    elif "/" in mime:
                        ext = "." + mime.split("/")[-1].split(";")[0]
                    safe_name = fname.replace("/", "_").replace("\\", "_") or "file"
                    if "." not in safe_name:
                        safe_name += ext
                    persist_path = os.path.join(persist_dir, safe_name)
                    with open(persist_path, "wb") as fp:
                        fp.write(file_bytes)
                    user_text += f"\n[附件已保存到: {persist_path}]"
                    att_type = "image" if mime.startswith("image/") else "file"
                    attachments_meta.append({
                        "type": att_type,
                        "name": safe_name,
                        "mime_type": mime,
                        "path": persist_path,
                    })
                    logger.info(f"[prompt] File saved: {persist_path} ({len(file_bytes)} bytes)")
                except Exception as e:
                    logger.error(f"[prompt] File save error: {e}")

        if not user_text.strip():
            return PromptResponse(stop_reason="end_turn")

        session["messages"].append({"role": "user", "content": user_text})
        self._save_message(
            session_id, "user", user_text,
            attachments=json.dumps(attachments_meta, ensure_ascii=False) if attachments_meta else None,
        )
        logger.info(f"Prompt [{session_id}]: {user_text[:100]}")

        # ── 意图分类（路由到最合适的处理策略）──
        intent_result = self._intent_clf.classify(user_text)
        session["last_intent"] = {
            "intent": intent_result.intent.value,
            "confidence": intent_result.confidence,
            "suggested_tools": intent_result.suggested_tools,
        }
        logger.info(f"[intent] {intent_result.intent.value} (conf={intent_result.confidence:.2f})")
        await self._event_bus.emit("intent_classified", {
            "session_id": session_id,
            "intent": intent_result.intent.value,
            "confidence": intent_result.confidence,
        })

        # ── 用户偏好学习（从消息中自动提取偏好）──
        learned_prefs = self._pref_learner.learn_from_message(user_text, session_id)
        if learned_prefs:
            for p in learned_prefs:
                logger.info(f"[pref] learned: {p.category}.{p.key}={p.value} (conf={p.confidence:.2f})")

        # ── 知识图谱提取（从消息中提取实体和关系）──
        if len(user_text) > 20:  # 短消息不提取
            try:
                kg_result = self._knowledge_graph.extract_from_text(user_text, context=session_id)
                if kg_result.get("entities") or kg_result.get("relations"):
                    logger.info(f"[kg] extracted {len(kg_result.get('entities', []))} entities, {len(kg_result.get('relations', []))} relations")
            except Exception as e:
                logger.debug(f"[kg] extract error: {e}")

        # ── 记忆整合器：存储重要消息为记忆片段 ──
        if len(user_text) > 30:  # 短消息不存记忆
            try:
                self._memory_consolidator.add_fragment(
                    content=user_text[:500],
                    memory_type="episodic",
                    importance=0.5,
                    tags=[intent_result.intent.value],
                )
            except Exception as e:
                logger.debug(f"[memory] add_fragment error: {e}")
        logger.info(f"[_run_llm_with_tools] starting, client={self._client is not None}")


        # ── 技能匹配（需要最低分数阈值，避免短消息误匹配）──────────
        matched_skills = []
        if len(user_text) > 10:  # 短消息不匹配技能
            raw_skills = self._skill_manager.search_skills(user_text, limit=3)
            # 只保留触发词匹配(score>=5)的技能，忽略纯描述匹配
            # ── 文件请求模式检查：命中则跳过技能匹配（Hermes范式：LLM直接输出MEDIA标签）──
            import re as _re
            _has_filename = _re.search(r'[\w\-]+\.\w{1,5}', user_text)
            _has_send_verb = _re.search(r'发给我|发送|发给|给我|下载|send|download', user_text)
            _is_file_req = bool(_has_filename and _has_send_verb)

            if not _is_file_req:
                # .agents/skills标准层接线：触发词策略集中在skill_manager.is_injectable_trigger
                # （英文len>2原行为不变；中文2字词是完整词，通用词除外）——
                # 此前len(t)>2门槛系统性排除中文2字触发词，标准技能对中文查询永远不注入
                matched_skills = [s for s in raw_skills if any(
                    t.lower() in user_text.lower() and is_injectable_trigger(t)
                    for t in s.get("triggers", [])
                )]
                if matched_skills:
                    logger.info(f"Matched skills: {[s['name'] for s in matched_skills]}")

        # 构建上下文消息
        messages = session["messages"].copy()

        # ── 上下文预算裁剪（估算校准闭环·真实接线点）──
        # P0静默死路径修复：此前的manage()调用指向不存在的方法（AttributeError被
        # except:pass吞掉，裁剪从未生效）。现在manage()真实存在，且估算=canonical
        # estimate_tokens×provider回填推出的校准因子（calibration_factor在_prompt_inner
        # 入口处刷新）。裁剪只作用于本次LLM请求副本——session["messages"]持久化历史
        # 不动（DB/回放/标题生成不受影响）；>20条才触发，预算8000 tokens同原意图。
        if len(messages) > 20:
            try:
                trimmed = self._context_budget.manage(messages, max_tokens=8000)
                if trimmed and len(trimmed) < len(messages):
                    logger.info(
                        f"[context-budget] LLM历史裁剪生效: {len(messages)}→{len(trimmed)}条 "
                        f"(calibration_factor={self._context_budget.calibration_factor:.4f})"
                    )
                    messages = trimmed
            except Exception as _cb_exc:
                logger.debug(
                    f"[context-budget] manage failed (fail-safe, history unchanged): {_cb_exc}"
                )

        # 注入进化引擎创建的技能到系统提示
        if self._evolution_engine:
            try:
                evo_skills = self._evolution_engine.get_created_skills()
                skill_info = ""
                if evo_skills:
                    skill_names = ", ".join([s["name"] for s in evo_skills])
                    skill_info = f"\n[进化引擎已创建的技能: {skill_names}]"
                evo_context = (
                    f"{skill_info}\n"
                    "## 自我进化能力\n"
                    "你拥有自我进化能力。当用户要求新功能、改进现有功能、或你发现自己缺少某种能力时：\n"
                    "1. 使用 request_evolution 工具立即给自己开发新功能（会自动：生成代码→测试→提交→推送到GitHub）\n"
                    "2. 使用 check_evolution_status 查看进化引擎状态和已创建的技能\n"
                    "3. 你可以拒绝危险操作（自毁、删除核心文件、关闭认证等）\n"
                    "4. 每次开发完成后代码会自动提交到GitHub，用户可以在GitHub上看到你的commit\n"
                    "不要只说'我做不到'——如果你缺少某种能力，用 request_evolution 给自己加上。"
                )
                messages.insert(0, {"role": "system", "content": evo_context})
            except Exception:
                pass

        # ── SoulBrain认知层：意图理解+风险评估 ──────────────
        try:
            brain_resp = await httpx.AsyncClient().post(
                "http://127.0.0.1:3100/api/brain/think",
                json={
                    "tenant_id": "openmate",
                    "agent_id": session_id[:8],
                    "user_input": user_text,
                    "repo_root": str(self._project_root) if self._project_root else "",
                },
                timeout=5,
            )
            if brain_resp.status_code == 200:
                brain_data = brain_resp.json()
                decision = brain_data.get("decision", {})
                intent = brain_data.get("intent", {})
                risk = brain_data.get("risk", {})

                # 注入认知信息到系统提示
                cognitive_context = (
                    f"\n## 认知层分析\n"
                    f"- 意图: {intent.get('goal', 'unknown')}\n"
                    f"- 目标文件: {', '.join(intent.get('target_files', []))}\n"
                    f"- 改动规模: {intent.get('change_size', 'small')}\n"
                    f"- 风险等级: {risk.get('overall_level', 'low')}\n"
                    f"- 编辑模式: {decision.get('edit_mode', 'patch')}\n"
                    f"- 建议: {risk.get('recommendation', '正常执行')}\n"
                )
                if decision.get("execute_mode") == "confirm_required":
                    cognitive_context += f"- ⚠️ 需要用户确认: {decision.get('confirm_prompt', '')}\n"
                elif decision.get("execute_mode") == "deny":
                    cognitive_context += f"- 🚫 操作被拒绝: {decision.get('confirm_prompt', '')}\n"

                messages.insert(0, {"role": "system", "content": cognitive_context})
                logger.info(f"[brain] 认知分析: goal={intent.get('goal')}, risk={risk.get('overall_level')}, execute={decision.get('execute_mode')}")
        except Exception as e:
            logger.debug(f"[brain] 认知层调用失败(非致命): {e}")

        # ── P2前置处理：语义缓存+上下文压缩+记忆检索 ──────────
        try:
            # 1. 语义缓存：相似问题直接返回缓存
            cached = self._semantic_cache.get(user_text)
            if cached and len(cached) > 20:
                logger.info(f"[semantic-cache] 命中缓存，跳过LLM调用")
                if self._client:
                    await self._client.session_update(
                        session_id=session_id,
                        update=acp.update_agent_message_text(cached),
                    )
                # 记录成本为0（缓存命中）
                self._cost_tracker.record_usage(
                    model="cache", session_id=session_id,
                    input_tokens=0, output_tokens=0, custom_cost=0.0,
                )
                return PromptResponse(stop_reason="end_turn")

            # 2. 上下文压缩：消息过多时压缩历史
            if self._ctx_compressor.should_compress(messages):
                logger.info(f"[ctx-compress] 上下文过长，压缩历史消息")
                compressed = self._ctx_compressor.compress(messages)
                if compressed:
                    messages = compressed

            # 3. 本地记忆检索引擎（与OpenSoul LTM互补）
            local_memories = self._memory_engine.retrieve(user_text, limit=3)
            if local_memories:
                mem_ctx = "\n".join([f"- {m.content}" for m in local_memories[:3]])
                messages.insert(0, {"role": "system", "content": f"\n## 相关记忆\n{mem_ctx}\n"})

            # 4. 知识蒸馏：检索相关经验
            kd_context = self._knowledge_distiller.get_context_prompt(user_text)
            if kd_context:
                messages.insert(0, {"role": "system", "content": kd_context})

        except Exception as e:
            logger.debug(f"[p2-pre] 前置处理失败(非致命): {e}")

        # ── OpenSoul 9模块上下文注入 ─────────────────────────
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient() as _client:
                # 0. 会话状态机：创建 + idle → thinking
                await _client.post(
                    "http://127.0.0.1:8090/api/trajectory/fsm/create",
                    json={"session_id": session_id},
                    timeout=2,
                )
                await _client.post(
                    "http://127.0.0.1:8090/api/trajectory/fsm/transition",
                    json={"session_id": session_id, "event": "user_message"},
                    timeout=2,
                )

                # 1. 意图分类
                intent_resp = await _client.post(
                    "http://127.0.0.1:8090/api/intelligence/intent/classify",
                    json={"text": user_text}, timeout=2,
                )
                if intent_resp.status_code == 200:
                    intent_data = intent_resp.json()
                    intent_ctx = (
                        f"\n## 意图分类\n"
                        f"- 意图: {intent_data.get('intent', 'unknown')}\n"
                        f"- 置信度: {intent_data.get('confidence', 0):.0%}\n"
                        f"- 建议工具: {', '.join(intent_data.get('suggested_tools', [])[:5])}\n"
                    )
                    messages.insert(0, {"role": "system", "content": intent_ctx})

                # 2. 长期记忆召回
                ltm_resp = await _client.post(
                    "http://127.0.0.1:8090/api/hippo/ltm/context",
                    json={"query": user_text, "limit": 3}, timeout=2,
                )
                if ltm_resp.status_code == 200:
                    ltm_data = ltm_resp.json()
                    if ltm_data.get("context"):
                        messages.insert(0, {"role": "system", "content": ltm_data["context"]})

                # 3. 用户偏好注入
                pref_resp = await _client.get(
                    "http://127.0.0.1:8090/api/mind/preference/context", timeout=2,
                )
                if pref_resp.status_code == 200:
                    pref_data = pref_resp.json()
                    if pref_data.get("context"):
                        messages.insert(0, {"role": "system", "content": pref_data["context"]})

                # 4. 技能推荐
                skill_resp = await _client.post(
                    "http://127.0.0.1:8090/api/gene/skill/recommend",
                    json={"task_description": user_text}, timeout=2,
                )
                if skill_resp.status_code == 200:
                    skill_data = skill_resp.json()
                    if skill_data.get("skills"):
                        skill_names = [s["name"] for s in skill_data["skills"][:3]]
                        skill_ctx = f"\n## 相关技能\n可用技能: {', '.join(skill_names)}\n"
                        messages.insert(0, {"role": "system", "content": skill_ctx})

                # 5. 环境信息注入（首次会话时）
                if len(session.get("messages", [])) <= 1:
                    env_resp = await _client.get(
                        "http://127.0.0.1:8090/api/sense/environment/context", timeout=2,
                    )
                    if env_resp.status_code == 200:
                        env_data = env_resp.json()
                        if env_data.get("context"):
                            messages.insert(0, {"role": "system", "content": env_data["context"]})

            logger.info("[opensoul] 9模块上下文注入完成")
        except Exception as e:
            logger.debug(f"[opensoul] 模块上下文注入失败(非致命): {e}")

        # ── 任务状态判断（规则优先，LLM为辅）──────────────
        from agent.task_engine import StepStatus
        current_task = self._task_state_manager.get_current_task(session_id)
        judgment = judge_task_continuation(current_task, user_message=user_text)
        action = judgment["action"]
        logger.info(f"[TaskState] judgment: action={action}, reason={judgment['reason']}")

        if action == "llm_judge":
            # 规则无法确定，调用LLM判断
            judge_messages = [
                {"role": "system", "content": (
                    "你是任务判断器。判断用户新消息是继续旧任务还是新任务。\n"
                    "返回JSON: {\"action\": \"continue\"|\"new\", \"reason\": \"...\"}"
                )},
                {"role": "user", "content": f"当前任务: {current_task.goal}\n用户消息: {user_text}"},
            ]
            try:
                raw = await self._llm_call(judge_messages)
                raw = raw.strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                llm_judge = json.loads(raw)
                action = llm_judge.get("action", "new")
                logger.info(f"[TaskState] LLM judge: action={action}")
            except Exception as e:
                logger.warning(f"[TaskState] LLM judge failed: {e}, defaulting new")
                action = "new"

        if action == "continue" and current_task:
            # 继续旧任务，更新活跃时间
            self._task_state_manager.update_activity(session_id)
        elif action == "new":
            # 新任务，完成旧任务，创建新任务
            if current_task:
                self._task_state_manager.complete_task(session_id)
            # 从消息中提取关键实体（简单实现：取名词短语）
            entities = [w for w in user_text if len(w) > 1 and w not in "的了是在有和与对"]
            self._task_state_manager.create_task(session_id, goal=user_text, entities=entities[:10])
        elif action == "ask":
            # 短消息无法判断 → 视为新任务继续执行（不阻塞）
            if current_task:
                self._task_state_manager.complete_task(session_id)
            entities = [w for w in user_text if len(w) > 1 and w not in "的了是在有和与对"]
            self._task_state_manager.create_task(session_id, goal=user_text, entities=entities[:10])


        # ── 任务规划（OpenSoul DAG + 本地规划器）────────────
        plan = await self._task_planner.plan(user_text, session_id)
        tool_calls_log = []  # 初始化，两条路径都会用到

        # 尝试用OpenSoul DAG规划器增强任务拆解
        if plan.subtasks and len(plan.subtasks) > 2:
            try:
                import httpx as _httpx
                async with _httpx.AsyncClient() as _client:
                    dag_steps = "\n".join([f"{i+1}. {s.description}" for i, s in enumerate(plan.subtasks)])
                    dag_resp = await _client.post(
                        "http://127.0.0.1:8090/api/will/dag/plan",
                        json={
                            "goal": user_text,
                            "llm_response": dag_steps,
                        },
                        timeout=3,
                    )
                    if dag_resp.status_code == 200:
                        dag_data = dag_resp.json()
                        logger.info(f"[dag] OpenSoul DAG规划成功: {dag_data.get('plan_id')}")
                        # 将DAG计划ID存入session，后续可视化用
                        session["dag_plan_id"] = dag_data.get("plan_id")
            except Exception as e:
                logger.debug(f"[dag] OpenSoul DAG规划失败(非致命): {e}")

        if plan.subtasks and plan.status == "active":
            # 复杂任务：逐步执行子任务 + 自省
            logger.info(f"[task] Complex task detected, {len(plan.subtasks)} subtasks")
            if self._client is not None:
                step_list = "\n".join([f"  {i+1}. {s.description}" for i, s in enumerate(plan.subtasks)])
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(f"📋 任务拆解：\n{step_list}\n\n开始执行...\n"),
                )

            all_results = []
            for idx, step in enumerate(plan.subtasks):
                if step.status in (StepStatus.SUCCESS, StepStatus.SKIPPED):
                    continue

                plan.current_step_idx = idx
                self._task_planner.store.save_plan(plan)

                # 推送当前步骤
                if self._client is not None:
                    await self._client.session_update(
                        session_id=session_id,
                        update=acp.update_agent_message_text(f"\n🔧 步骤 {idx+1}/{len(plan.subtasks)}: {step.description}\n"),
                    )

                # 用 LLM+工具执行当前子任务，注入前面步骤的结果
                step_messages = messages.copy()
                prev_context = ""
                if all_results:
                    prev_context = "\n\n## 前面步骤的执行结果（直接使用这些数据，不要重复执行）\n" + "\n".join(all_results)

                # 完整任务计划（让LLM看到全局步骤分工，防止越界做后续步骤的工作）
                plan_lines = []
                for pi, ps in enumerate(plan.subtasks):
                    marker = "▶" if pi == idx else " "
                    if pi == idx:
                        note = "（当前步骤，只做这个）"
                    elif ps.status in (StepStatus.SUCCESS, StepStatus.SKIPPED):
                        note = "（已完成）"
                    else:
                        note = "（后续步骤，不要提前执行）"
                    plan_lines.append(f"  {marker} {pi+1}. {ps.description} {note}")
                full_plan = "\n".join(plan_lines)

                step_messages.append({
                    "role": "system",
                    "content": (
                        f"## 任务计划（共{len(plan.subtasks)}步）\n{full_plan}\n\n"
                        f"当前子任务：{step.description}\n"
                        f"建议工具：{step.tool_hint or '无'}\n"
                        f"请严格只完成当前子任务（第{idx+1}步），即使你能一步完成后续步骤，也不要越界执行。{prev_context}\n\n"
                        "重要规则：\n"
                        "1. 只做当前步骤描述的工作范围，不要提前执行后续步骤的工作\n"
                        "2. 如果前面步骤已经获取了数据，直接使用，不要重复执行\n"
                        "3. 生成报告时直接用文本格式输出结果，绝对不要写代码文件\n"
                        "4. 不要创建新的Python脚本来生成报告\n"
                        "5. 直接用文字总结和格式化已有数据即可"
                    ),
                })

                step.status = StepStatus.RUNNING
                try:
                    step_result, _ = await self._run_llm_with_tools(step_messages, session_id, matched_skills=matched_skills)
                    step.result = step_result
                    step.completed_at = time.time()
                except Exception as e:
                    step.result = f"执行异常: {e}"
                    step.error = str(e)

                # 自省校验
                reflection = await self._self_reflector.reflect(step)
                step.reflection = reflection.get("summary", "")
                step.error_type = reflection.get("error_type", "") or ""

                if reflection.get("passed"):
                    step.status = StepStatus.SUCCESS
                    all_results.append(f"✅ 步骤{idx+1}: {step.description}\n   结果: {step.result[:200]}")
                    logger.info(f"[task] Step {idx+1} passed: {reflection.get('summary', '')}")
                else:
                    step.status = StepStatus.FAILED
                    logger.warning(f"[task] Step {idx+1} failed: {reflection.get('summary', '')}")

                    # 动态重规划
                    plan = await self._task_planner.replan(plan, step, step.error or step.result)
                    if plan.status == "failed":
                        break

                    # 如果是 retry，重置步骤状态并加强约束
                    if step.status == StepStatus.PENDING:
                        # 重试时注入更强的约束
                        step_messages.append({
                            "role": "system",
                            "content": "⚠️ 上次执行失败了。注意：不要创建新文件、不要写代码脚本。直接用已有数据以文本形式输出结果。",
                        })
                        try:
                            retry_result, _ = await self._run_llm_with_tools(step_messages, session_id, matched_skills=matched_skills)
                            step.result = retry_result
                            step.completed_at = time.time()
                            step.status = StepStatus.SUCCESS
                            all_results.append(f"✅ 步骤{idx+1}(重试): {step.description}\n   结果: {step.result[:200]}")
                        except Exception as e2:
                            step.result = f"重试执行异常: {e2}"
                            step.status = StepStatus.FAILED
                        continue

                self._task_planner.store.save_plan(plan)

            # 生成最终报告
            if plan.status != "failed":
                plan.status = "completed"
                plan.completed_at = time.time()
                self._task_planner.store.save_plan(plan)

            report = f"## 任务执行报告\n\n**目标**: {plan.goal}\n\n"
            for i, step in enumerate(plan.subtasks):
                icon = {"success": "✅", "failed": "❌", "skipped": "⏭️", "pending": "⏳"}.get(str(step.status), "❓")
                report += f"{icon} **步骤{i+1}**: {step.description}\n"
                if step.result:
                    report += f"   结果: {step.result[:150]}\n"
                if step.reflection:
                    report += f"   自省: {step.reflection}\n"
                report += "\n"

            if plan.status == "failed":
                report += f"\n❌ **任务终止**: {plan.reflection_report}\n"

            full_response = report
            if self._client is not None:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(full_response),
                )
        else:
            # 简单任务：直接调用 LLM（原有逻辑）
            full_response = ""
            tool_calls_log = []
            try:
                # P2监控：tracer + 成本追踪
                trace_id = self._tracer.start_trace(session_id)
                from agent.agent_tracer import TraceEventType
                span_id = self._tracer.start_span(TraceEventType.LLM_REQUEST, {"message_count": len(messages)})
                llm_start = time.time()
                full_response, tool_calls_log = await self._run_llm_with_tools(messages, session_id, matched_skills=matched_skills, user_text=user_text)
                llm_duration = time.time() - llm_start
                self._tracer.end_span(span_id, {"response_len": len(full_response), "tool_calls": len(tool_calls_log)})
                # Token分析（估算）
                prompt_tokens = sum(len(str(m.get("content", ""))) for m in messages) // 3
                completion_tokens = len(full_response) // 3
                self._token_analyzer.record(
                    session_id=session_id, model="mimo", category="chat",
                    input_tokens=prompt_tokens, output_tokens=completion_tokens,
                )
                self._cost_tracker.record_usage(
                    model="mimo", session_id=session_id,
                    input_tokens=prompt_tokens, output_tokens=completion_tokens,
                )
                # 事件总线发布
                asyncio.ensure_future(self._event_bus.emit("llm.completed", {
                    "session_id": session_id, "duration_s": llm_duration,
                    "response_len": len(full_response),
                }))
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                # P0-4: 异常路径也要结束活动观测，否则peek永远显示running（假活性）
                err_act = self._activity(session_id)
                err_act.mark_idle()
                self._activity_store.upsert(err_act)
                full_response = f"推理错误: {e}"
                if self._client is not None:
                    await self._client.session_update(
                        session_id=session_id,
                        update=acp.update_agent_message_text(full_response),
                    )

        # ── P2基础设施：检查点保存 ────────────────────────
        try:
            self._checkpoint_mgr.create_checkpoint(
                session_id=session_id,
                state={"messages": messages[-5:], "response_len": len(full_response)},
            )
        except Exception as e:
            logger.debug(f"[checkpoint] 保存失败(非致命): {e}")

        # ── P2后置处理：输出验证+格式化+摘要+知识蒸馏+缓存 ────
        try:
            # 1. 输出格式化（JSON美化、表格识别）
            formatted = self._output_formatter.format(full_response)
            if formatted.content_type != "text" and formatted.content != full_response:
                full_response = formatted.content
                logger.info(f"[output-fmt] 输出已格式化: {formatted.content_type}")

            # 2. 语义缓存存储（只缓存高质量回复）
            if len(full_response) > 50 and "错误" not in full_response and "error" not in full_response.lower():
                self._semantic_cache.put(
                    query=user_text, response=full_response,
                    tokens_used=len(full_response) // 3,
                )

            # 3. 对话摘要（长对话时触发）
            session = self.sessions.get(session_id, {})
            session_msgs = session.get("messages", [])
            if self._conv_summarizer.should_summarize(session_msgs):
                summary = self._conv_summarizer.summarize(session_msgs)
                if summary:
                    session["summary"] = summary
                    logger.info(f"[summarizer] 对话已摘要: {len(summary)}字")

            # 4. 知识蒸馏（从对话中提取可复用知识）
            self._knowledge_distiller.distill_from_conversation(
                session_id=session_id,
                messages=[{"role": "user", "content": user_text}, {"role": "assistant", "content": full_response[:500]}],
            )

            # 5. 本地记忆存储
            if len(user_text) > 30 or len(full_response) > 100:
                from agent.memory_retrieval import MemoryType, MemoryImportance
                self._memory_engine.store(
                    content=f"用户: {user_text[:150]}\n助手: {full_response[:150]}",
                    memory_type=MemoryType.EPISODIC,
                    importance=MemoryImportance.NORMAL,
                    session_id=session_id,
                )

        except Exception as e:
            logger.debug(f"[p2-post] 后置处理失败(非致命): {e}")

        # ── 网关后处理：提取MEDIA标签、校验路径、下发文件 ──────
        media_paths = re.findall(r"MEDIA:([\w\-\/\.]+)", full_response)
        if media_paths:
            _ALLOWED_ROOT = "/home/climbing"
            validated = []
            for mp in media_paths:
                # 路径穿越防护
                if ".." in mp or not mp.startswith("/"):
                    logger.warning(f"[media] blocked path traversal: {mp}")
                    continue
                real = os.path.realpath(mp)
                if not real.startswith(_ALLOWED_ROOT):
                    logger.warning(f"[media] blocked outside whitelist: {real}")
                    continue
                if not os.path.exists(real):
                    logger.warning(f"[media] file not found: {real}")
                    continue
                validated.append(real)
                logger.info(f"[media] validated: {real} ({os.path.getsize(real)}B)")
            # 剥离MEDIA标签得到纯展示文本（前端已自行处理MEDIA渲染，这里只记录日志）
            display_text = re.sub(r"MEDIA:[\w\-\/\.]+", "", full_response).strip()
            if validated:
                logger.info(f"[media] {len(validated)} file(s) validated for delivery")

        session["messages"].append({"role": "assistant", "content": full_response})
        self._save_message(session_id, "assistant", full_response)
        logger.info(f"Response [{session_id}]: {full_response[:100]}")
        logger.info(f"[prompt] done, response_len={len(full_response)}, tools={tool_calls_log}")


        # ── 记录技能使用 ──────────────────────────────────
        for skill in matched_skills:
            self._skill_manager.record_usage(skill["id"])

        # ── 自动学习 ──────────────────────────────────────
        try:
            await self._skill_manager.try_learn_skill(
                user_text=user_text,
                assistant_response=full_response,
                tool_calls=tool_calls_log,
            )
        except Exception as e:
            logger.debug(f"Auto-learn skipped: {e}")

        # ── 进化引擎观察 ──────────────────────────────────
        if self._evolution_engine:
            try:
                # 细分观察类型
                obs_type = "conversation"
                if tool_calls_log:
                    obs_type = "conversation_with_tools"
                if "错误" in full_response or "error" in full_response.lower():
                    obs_type = "conversation_error"
                if len(user_text) < 10:
                    obs_type = "conversation_short"

                self._evolution_engine.observe(
                    obs_type=obs_type,
                    content=f"User: {user_text[:200]}\nAssistant: {full_response[:200]}",
                    metadata={
                        "session_id": session_id,
                        "user_text": user_text,
                        "assistant_response": full_response,
                        "tool_calls": tool_calls_log,
                        "tool_count": len(tool_calls_log),
                        "response_length": len(full_response),
                        "has_error": "错误" in full_response or "error" in full_response.lower(),
                    },
                )
            except Exception as e:
                logger.debug(f"Evolution observe skipped: {e}")

        # ── OpenSoul偏好学习 + 技能提取 + 能力评估 ─────────
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient() as _client:
                # 0. 会话状态机：thinking → responding
                await _client.post(
                    "http://127.0.0.1:8090/api/trajectory/fsm/transition",
                    json={"session_id": session_id, "event": "response_ready"},
                    timeout=2,
                )

                # 0.5. 能力评估（如果有工具调用）
                if tool_calls_log:
                    has_error = "错误" in full_response or "error" in full_response.lower()
                    await _client.post(
                        "http://127.0.0.1:8090/api/benchmark/capability/evaluate",
                        json={
                            "accuracy": 0.8 if not has_error else 0.3,
                            "efficiency": 0.7,
                            "completeness": 0.8 if len(full_response) > 100 else 0.5,
                            "safety": 0.9,
                            "helpfulness": 0.8 if len(full_response) > 50 else 0.5,
                            "details": {
                                "session_id": session_id,
                                "task": user_text[:200],
                                "success": not has_error,
                            },
                        },
                        timeout=2,
                    )

                # 1. 偏好学习（从对话中学习用户偏好）
                await _client.post(
                    "http://127.0.0.1:8090/api/mind/preference/learn",
                    json={"messages": [
                        {"role": "user", "content": user_text},
                        {"role": "assistant", "content": full_response[:500]},
                    ]},
                    timeout=2,
                )
                # 2. 技能提取（如果任务成功且有工具调用）
                if tool_calls_log and "错误" not in full_response:
                    await _client.post(
                        "http://127.0.0.1:8090/api/gene/skill/extract",
                        json={
                            "task_description": user_text[:200],
                            "execution_log": str(tool_calls_log)[:1000],
                            "success": True,
                        },
                        timeout=2,
                    )
                # 3. 长期记忆存储（重要对话）
                if len(user_text) > 50 or len(full_response) > 100:
                    await _client.post(
                        "http://127.0.0.1:8090/api/hippo/ltm/add",
                        json={
                            "content": f"用户: {user_text[:200]}\n助手: {full_response[:200]}",
                            "memory_type": "episodic",
                            "importance": 0.5,
                            "session_id": session_id,
                        },
                        timeout=2,
                    )
            logger.info("[opensoul] 偏好学习+技能提取+长期记忆完成")
        except Exception as e:
            logger.debug(f"[opensoul] 后处理失败(非致命): {e}")

        # ── 最终推送（如果流式没推送过）──
        if self._client and full_response and not self._streamed_flags.get(session_id, False):
            try:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(full_response),
                )
                logger.info(f"[ACP] final push ({len(full_response)} chars)")
            except Exception as e:
                logger.warning(f"[ACP] final push failed: {e}")

        # ── 可观测性：结束run span ──
        try:
            if run_span:
                self._observability.finish_span(run_span.span_id, SpanStatus.SUCCESS)
        except Exception:
            pass

        return PromptResponse(stop_reason="end_turn")

    def resolve_choice(self, session_id: str, choice_result: str) -> bool:
        """用户选择后调用，唤醒等待中的clarify工具
        
        Args:
            session_id: 会话ID
            choice_result: 用户选择的结果文本
        
        Returns:
            bool: 是否成功唤醒
        """
        future = self._pending_choices.get(session_id)
        if future and not future.done():
            future.set_result(choice_result)
            logger.info(f"[choice] Resolved: session={session_id}, result={choice_result[:50]}")
            return True
        return False

    async def cancel(self, session_id: str, **kwargs) -> None:
        """取消当前操作"""
        logger.info(f"Cancel: {session_id}")

    async def load_session(
        self, cwd: str, session_id: str, mcp_servers=None, **kwargs
    ) -> acp.LoadSessionResponse | None:
        """加载已有会话（内存miss时从SQLite恢复——进程重启后的标准恢复契约）"""
        session = self.sessions.get(session_id) or self._reload_session_from_db(session_id)
        if not session:
            logger.warning(f"load_session: session not found in memory or DB: {session_id}")
            return None
        logger.info(f"Loaded session: {session_id}")
        return acp.LoadSessionResponse()

    async def list_sessions(self, cursor=None, cwd=None, **kwargs) -> ListSessionsResponse:
        """列出所有会话"""
        def _session_title(s: dict) -> str:
            """从session的第一条用户消息提取标题"""
            if s.get("title"):
                return s["title"]
            for msg in s.get("messages", []):
                if msg.get("role") == "user":
                    text = msg.get("content", "")
                    if isinstance(text, list):
                        text = " ".join(p.get("text", "") for p in text if isinstance(p, dict))
                    text = text.strip()[:30]
                    if text:
                        return text
            return f"Session {s['session_id'][:8]}"

        session_list = [
            SessionInfo(
                session_id=s["session_id"],
                cwd=s.get("cwd", ""),
                title=_session_title(s),
            )
            for s in self.sessions.values()
        ]
        return ListSessionsResponse(sessions=session_list)

    async def _generate_session_title(self, session_id: str, user_text: str):
        """异步调LLM生成会话标题，并同步到OpenSoul"""
        try:
            title = await self.llm_engine.chat([
                {"role": "system", "content": "你是标题生成器。只输出一个简短标题（不超过15个汉字），不要任何其他内容、不要markdown、不要代码、不要解释。"},
                {"role": "user", "content": user_text[:200]},
            ])
            # 清洗LLM输出：去掉markdown、代码块、换行等垃圾
            title = (title or "").strip()
            if "```" in title:
                title = title.split("```")[0]
            title = title.split("\n")[0]  # 只取第一行
            title = title.strip().strip("#").strip("*").strip('"').strip("'").strip("。").strip()
            # 如果清洗后太长或含特殊字符，截断
            if len(title) > 30:
                title = title[:30]
            # 如果清洗后为空，fallback到用户消息截断
            if not title:
                title = user_text[:30]
            if title and session_id in self.sessions:
                self.sessions[session_id]["title"] = title
                logger.info(f"Session title generated: {session_id} -> {title}")
                # 同步到OpenSoul
                try:
                    import httpx
                    async with httpx.AsyncClient() as client:
                        await client.patch(
                            f"http://127.0.0.1:8090/api/sessions/{session_id}",
                            json={"title": title},
                            timeout=5,
                        )
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Title generation failed: {e}")

    async def resume_session(
        self, cwd: str, session_id: str, mcp_servers=None, **kwargs
    ) -> ResumeSessionResponse | None:
        """恢复会话（内存miss时从SQLite恢复）"""
        session = self.sessions.get(session_id) or self._reload_session_from_db(session_id)
        if not session:
            logger.warning(f"resume_session: session not found in memory or DB: {session_id}")
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
