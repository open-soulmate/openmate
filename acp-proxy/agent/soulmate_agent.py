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
from skill_manager import SkillManager
from evolution import EvolutionEngine
from dna_evolution import DNAEvolutionEngine
from utils.token_manager import truncate_tool_result
from agent.architecture_enhanced import EnhancedArchitecture
from agent import arch_monitor
from utils.task_state_manager import TaskStateManager, judge_task_continuation
# P1/P2 架构组件
from agent.semantic_cache import SemanticCache
from agent.context_compression import ContextCompressor
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
from agent.chain_optimizer import ChainOptimizer
from agent.stream_manager import StreamingResponseManager
from agent.session_manager import ConcurrentSessionManager

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
        # 链优化器
        self._chain_optimizer = ChainOptimizer()
        # 流管理器
        self._stream_manager = StreamingResponseManager()
        # 会话管理器
        self._session_manager = ConcurrentSessionManager()
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

    def _save_message(self, session_id: str, role: str, content: str):
        """保存消息到 agent_messages 表"""
        try:
            db = self._get_db()
            db.execute(
                "INSERT INTO agent_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                (session_id, role, content, time.time()),
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
- 需要能力但未加载 → 按需加载后立即真实调用
- 执行后必须验证：用不同于生成路径的方式回读产物、重算关键数字
- 最终产物通过交付通道交付；搜索结果只作引用

### 可用工具
- read_file: 读取文件，path 参数必填
- write_file: 写入文件，path 和 content 参数必填。path必须是完整路径+文件名+扩展名（如 /home/climbing/openmate/index.html）。根据用户意图推断文件名和扩展名——用户说"网页"→.html，"脚本"→.py，"配置"→.yaml，"样式"→.css。不确定时先用read_file确认目录结构。⚠️ 注意：content超过3000字符时不要用write_file，改用execute_code写入（如 with open(path,'w') as f: f.write(...)），避免JSON截断。
- search_files: 搜索文件，pattern 参数必填，path 默认为当前目录
- search_files: 搜索文件，pattern 参数必填，path 默认为当前目录
- terminal: 执行命令，command 参数必填
- execute_code: 执行 Python 代码，code 参数必填

You can send files to the user natively: to deliver a file, write a brief confirmation message (e.g. "文件已发送，请查收"), then include MEDIA:/absolute/path/to/file on a new line. The gateway extracts the tag, strips it, and sends the file as a download card. Always write some text before the MEDIA: tag — never output a bare MEDIA: tag alone. Use search_files first if you don't know the exact path. Do NOT paste file contents into chat."""

        # 注入匹配的技能上下文
        if matched_skills:
            system_prompt += "\n\n## 相关技能（参考以下经验执行任务）\n"
            for skill in matched_skills[:3]:
                system_prompt += f"\n### {skill['name']}\n{skill['content']}\n"
                if skill.get("code_template"):
                    system_prompt += f"```\n{skill['code_template']}\n```\n"

        # 注入用户偏好
        pref_context = self._pref_learner.get_context_prompt()
        if pref_context:
            system_prompt += f"\n\n## 用户偏好（请遵守）\n{pref_context}\n"

        # 注入反思改进建议
        improvement_ctx = self._reflection_engine.get_improvement_context(session_id)
        if improvement_ctx:
            system_prompt += f"\n\n## 历史改进经验（避免重复错误）\n{improvement_ctx}\n"

        # 注入召回的相关记忆
        if len(user_text) > 10:
            try:
                recalled = self._memory_consolidator.recall(user_text, limit=3)
                if recalled:
                    system_prompt += "\n\n## 相关历史记忆\n"
                    for mem in recalled:
                        system_prompt += f"- {mem.get('content', '')[:200]}\n"
            except Exception as e:
                logger.debug(f"[memory] recall error: {e}")

        # 注入学习到的技能
        if len(user_text) > 10:
            try:
                skill_ctx = self._skill_learner.get_context_prompt(user_text)
                if skill_ctx:
                    system_prompt += f"\n\n## 学习到的技能（可复用）\n{skill_ctx}\n"
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

        for _round in range(MAX_ROUNDS):
            got_tool_call = False
            async for chunk in self.llm_engine.chat_stream_with_tools(
                messages=messages,
                tools=all_tools if all_tools else None,
                system_prompt=system_prompt,
            ):
                if isinstance(chunk, dict) and "tool_calls" in chunk:
                    # LLM 请求调用工具
                    tool_calls = chunk["tool_calls"]
                    got_tool_call = True

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
                                messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": truncate_tool_result(result)})
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
                                    lines = proc.stdout.split("\\n")
                                    result = "\\n".join(f"{offset + i}|{line}" for i, line in enumerate(lines))
                                else:
                                    result = f"错误: {proc.stderr or '文件不存在或为空'}"
                            except Exception as e:
                                result = f"读取失败: {e}"

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
                                result = f"写入失败: {e}"

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
                                        result += f"\\n[exit code: {proc.returncode}]"
                            except subprocess.TimeoutExpired:
                                result = "命令超时（30秒）"
                            except Exception as e:
                                result = f"执行失败: {e}"

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

                        elif func_name == "read_image":
                            try:
                                path = func_args.get("path", "")
                                with open(path, "rb") as f:
                                    img_b64 = base64.b64encode(f.read()).decode()
                                result = f"data:image/png;base64,{img_b64[:100]}...(截断，总长{len(img_b64)})"
                            except Exception as e:
                                result = f"读取失败: {e}"

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
                        else:
                            result = await self._call_mcp_tool(func_name, func_args)
                        tool_results.append({
                            "tool_call_id": tc["id"],
                            "role": "tool",
                            "content": truncate_tool_result(str(result)),
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
                        full_response += chunk_text
                        if self._client is not None:
                            await self._client.session_update(
                                session_id=session_id,
                                update=acp.update_agent_message_text(chunk_text),
                            )

            # 如果没有工具调用，模型返回了纯文本，结束循环
            if not got_tool_call:
                break

        return full_response, all_tool_calls

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
        session = self.sessions.get(session_id)
        if not session:
            logger.error(f"Session not found: {session_id}")
            return PromptResponse(stop_reason="refusal")

        # ── Writer Fencing: 获取会话写入锁（通过架构增强系统）──
        writer_id = f"prompt:{message_id or id(prompt)}"
        async with self._arch.session_guard(session_id, writer_id=writer_id) as acquired:
            if not acquired:
                logger.warning(f"[fence] Could not acquire write lock for {session_id}")
                # 推送提示给用户
                if self._client:
                    try:
                        await self._client.session_update(
                            session_id=session_id,
                            update=acp.update_agent_message_text("⏳ 上一条消息还在处理中，请稍候..."),
                        )
                    except Exception:
                        pass
                return PromptResponse(stop_reason="refusal")
            
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
            return PromptResponse(stop_reason="refusal")

        # ── 可观测性：开始run span ──
        run_span = self._observability.start_span(
            trace_id=session_id,
            span_type=SpanType.RUN,
            name=f"prompt:{session_id}",
            attributes={"message_id": message_id or ""},
        )

        # 提取文本内容 — prompt 是 TextContentBlock | ImageContentBlock | FileContentBlock 列表
        user_text = ""
        file_parts = []
        for block in prompt:
            if hasattr(block, "text"):
                user_text += block.text
            elif isinstance(block, dict):
                if block.get("type") == "text":
                    user_text += block.get("text", "")
                elif block.get("type") == "file" and block.get("data"):

                    file_parts.append(block)
                elif block.get("type") == "image" and block.get("data"):
                    file_parts.append(block)

        # ── 环境感知 ──
        try:
            env_info = self._env_sensor.sense()
            if env_info and hasattr(env_info, 'cpu_percent') and env_info.cpu_percent > 90:
                logger.warning(f"[env] CPU使用率过高: {env_info.cpu_percent}%")
        except Exception:
            pass

        # ── 上下文预算管理 ──
        try:
            session_msgs = session.get("messages", [])
            if len(session_msgs) > 20:
                managed = self._context_budget.manage(session_msgs, max_tokens=8000)
                if managed and len(managed) < len(session_msgs):
                    logger.info(f"[context-budget] 压缩历史: {len(session_msgs)}→{len(managed)}条")
        except Exception:
            pass

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

        # 保存附件到临时文件，把路径拼到prompt文本里
        if file_parts:
            import base64 as b64mod, tempfile
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
                    tmp_dir = tempfile.mkdtemp(prefix="openmate_file_")
                    safe_name = fname.replace("/", "_").replace("\\", "_") or "file"
                    tmp_path = os.path.join(tmp_dir, safe_name if "." in safe_name else safe_name + ext)
                    with open(tmp_path, "wb") as fp:
                        fp.write(file_bytes)
                    user_text += f"\n[附件已保存到: {tmp_path}]"
                    logger.info(f"[prompt] File saved: {tmp_path} ({len(file_bytes)} bytes)")
                except Exception as e:
                    logger.error(f"[prompt] File save error: {e}")

        if not user_text.strip():
            return PromptResponse(stop_reason="end_turn")

        session["messages"].append({"role": "user", "content": user_text})
        self._save_message(session_id, "user", user_text)
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
                matched_skills = [s for s in raw_skills if any(
                    t.lower() in user_text.lower() and len(t) > 2
                    for t in s.get("triggers", [])
                )]
                if matched_skills:
                    logger.info(f"Matched skills: {[s['name'] for s in matched_skills]}")

        # 构建上下文消息
        messages = session["messages"].copy()

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

                step_messages.append({
                    "role": "system",
                    "content": (
                        f"当前子任务：{step.description}\n"
                        f"建议工具：{step.tool_hint or '无'}\n"
                        f"请专注完成这一个子任务。{prev_context}\n\n"
                        "重要规则：\n"
                        "1. 如果前面步骤已经获取了数据，直接使用，不要重复执行\n"
                        "2. 生成报告时直接用文本格式输出结果，绝对不要写代码文件\n"
                        "3. 不要创建新的Python脚本来生成报告\n"
                        "4. 直接用文字总结和格式化已有数据即可"
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

        # ── 通过ACP session_update推送回复给前端 ──
        if self._client and full_response:
            try:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(full_response),
                )
                logger.info(f"[ACP] pushed response to frontend ({len(full_response)} chars)")
            except Exception as e:
                logger.warning(f"[ACP] Failed to push response: {e}")

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

        # ── 可观测性：结束run span ──
        try:
            if run_span:
                self._observability.finish_span(run_span.span_id, SpanStatus.SUCCESS)
        except Exception:
            pass

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
