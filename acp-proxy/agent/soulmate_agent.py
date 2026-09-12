"""SoulMate Agent — 实现官方 acp.Agent 协议

使用 agent-client-protocol 官方 Python SDK 的 Agent 协议类，
通过 acp.run_agent() 在 stdio 上传输 ACP v1.0 标准协议。
"""

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
    ) -> tuple[str, list[dict]]:
        """LLM推理 + 工具调用循环。模型返回tool_calls就执行，纯文本就结束。"""
        MAX_ROUNDS = 15
        cwd = self._session_cwds.get(session_id, "/home/climbing/openmate")
        system_prompt = f"""你是SoulMate，OpenMate内置的AI助手。请用简洁清晰的中文回答。

## 环境
当前工作目录: {cwd}
使用 read_file/terminal/search_files 等工具时，可以用绝对路径或相对于此目录的路径。

## 输入格式说明
用户的消息可能包含结构化标签（如 ## 任务、## 角色、## 背景、## 约束、## 输出格式）。
请理解这些标签的含义，正常回答用户的问题。不要输出标签本身。
如果是简单问题（如"你好"、"怎么样了"），直接自然语言回答即可。

## 工具使用
当有可用工具时，根据需要调用工具来更好地回答问题。
需要查看系统状态、执行命令、读写文件时，优先使用工具。
- read_file: 读取文件，path 参数必填
- write_file: 写入文件，path 和 content 参数必填
- search_files: 搜索文件，pattern 参数必填，path 默认为当前目录
- terminal: 执行命令，command 参数必填
- execute_code: 执行 Python 代码，code 参数必填"""

        # 注入匹配的技能上下文
        if matched_skills:
            system_prompt += "\n\n## 相关技能（参考以下经验执行任务）\n"
            for skill in matched_skills[:3]:
                system_prompt += f"\n### {skill['name']}\n{skill['content']}\n"
                if skill.get("code_template"):
                    system_prompt += f"```\n{skill['code_template']}\n```\n"
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
        
        all_tools = builtin_tools + (mcp_tools or []) + evolution_tools

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
                        if self._client is not None:
                            await self._client.session_update(
                                session_id=session_id,
                                update=acp.update_agent_message_text(f"\n🔧 调用工具: {func_name}...\n"),
                            )

                    # 执行所有工具调用并收集结果
                    tool_results = []
                    for tc in tool_calls:
                        func_name = tc["function"]["name"]
                        try:
                            func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                        except json.JSONDecodeError:
                            func_args = {}

                        # ── 基础工具执行 ───────────────────────────────
                        if func_name == "read_file":
                            try:
                                path = func_args.get("path", "")
                                offset = func_args.get("offset", 1)
                                limit = func_args.get("limit", 100)
                                proc = subprocess.run(
                                    ["sed", "-n", f"{offset},{offset + limit - 1}p", path],
                                    capture_output=True, text=True, timeout=10,
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
                                if not path:
                                    result = "错误: path 参数不能为空"
                                else:
                                    file_content = func_args.get("content", "")
                                    # 创建目录
                                    subprocess.run(["mkdir", "-p", str(Path(path).parent)], timeout=5)
                                    with open(path, "w", encoding="utf-8") as f:
                                        f.write(file_content)
                                    result = f"已写入 {path} ({len(file_content)} 字节)"
                            except Exception as e:
                                result = f"写入失败: {e}"

                        elif func_name == "terminal":
                            try:
                                cmd = func_args.get("command", "")
                                proc = subprocess.run(
                                    cmd, shell=True, capture_output=True, text=True, timeout=30,
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
                                path = func_args.get("path", ".")
                                target = func_args.get("target", "content")
                                if target == "files":
                                    cmd = ["find", path, "-name", pattern, "-type", "f"]
                                else:
                                    cmd = ["grep", "-rn", "-i", "--include=*.py", "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.json", "--include=*.yaml", "--include=*.yml", "--include=*.md", "--include=*.sh", "--include=*.css", "--include=*.html", pattern, path]
                                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
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
                                    with open(path, "w", encoding="utf-8") as f:
                                        f.write(file_content)
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
                                    capture_output=True, text=True, timeout=60,
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
                                    capture_output=True, text=True, timeout=15,
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
                                    capture_output=True, text=True, timeout=20,
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
                            "content": result,
                        })

                        # 记录工具调用
                        all_tool_calls.append({
                            "name": func_name,
                            "arguments": func_args,
                            "result_preview": result[:200] if result else "",
                        })

                        # 推送工具调用结果摘要
                        if self._client is not None:
                            result_preview = result[:200] + "..." if len(result) > 200 else result
                            await self._client.session_update(
                                session_id=session_id,
                                update=acp.update_agent_message_text(f"📎 工具结果: {result_preview}\n"),
                            )

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
        """
        logger.info(f"[prompt] CALLED! session={session_id}, parts={len(prompt)}")
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
        self._save_message(session_id, "user", user_text)
        logger.info(f"Prompt [{session_id}]: {user_text[:100]}")
        logger.info(f"[_run_llm_with_tools] starting, client={self._client is not None}")

        # ── 技能匹配 ──────────────────────────────────────
        matched_skills = self._skill_manager.search_skills(user_text, limit=3)
        if matched_skills:
            skill_names = [s["name"] for s in matched_skills]
            logger.info(f"Matched skills: {skill_names}")
            # 推送技能匹配状态
            if self._client is not None:
                await self._client.session_update(
                    session_id=session_id,
                    update=acp.update_agent_message_text(
                        f"💡 找到相关技能: {', '.join(skill_names)}\n"
                    ),
                )

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

        # ── 任务规划 ──────────────────────────────────────
        from agent.task_engine import StepStatus
        plan = await self._task_planner.plan(user_text, session_id)
        tool_calls_log = []  # 初始化，两条路径都会用到

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
                icon = {"success": "✅", "failed": "❌", "skipped": "⏭️", "pending": "⏳"}.get(step.status.value, "❓")
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
                full_response, tool_calls_log = await self._run_llm_with_tools(messages, session_id, matched_skills=matched_skills)
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                full_response = f"推理错误: {e}"
                if self._client is not None:
                    await self._client.session_update(
                        session_id=session_id,
                        update=acp.update_agent_message_text(full_response),
                    )

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
