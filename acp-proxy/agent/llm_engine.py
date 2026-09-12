"""LLM推理层 — 流式SSE调用OpenAI兼容API

支持Ollama、通义千问、OpenAI等兼容接口的流式和非流式调用。
自动注入系统提示词（SOUL规则），管理上下文窗口裁剪。
集成ModelRouter智能路由，根据任务复杂度自动选择最优模型。
"""

import asyncio
import json
import logging
import os
from typing import AsyncGenerator, Optional, TYPE_CHECKING

import httpx

# 避免循环导入: TYPE_CHECKING下导入类型，运行时用字符串
if TYPE_CHECKING:
    from model_router import ModelRouter

logger = logging.getLogger("acp-agent.llm")

# 默认系统提示词 — 包含SOUL强制注释规则和迭代复盘规则
DEFAULT_SYSTEM_PROMPT = """你是OpenMate内置Vibe Coding Agent，一个专业的AI编程助手。

## 最高优先级：强制注释铁律
1. 任何代码输出，哪怕仅一行，必须附带注释
2. 注释说明业务目的和作用，不写重复代码字面含义的无效注释
3. 函数/类/接口必须有头部文档注释（Docstring/TSDoc）
4. 修改旧代码时同步更新注释，删除代码时清理失效注释

## 文件操作规范
- 优先使用增量diff，不要输出完整文件
- 修改前先读取原始文件
- 每次变更生成unified diff格式

## 迭代复盘规则
每次任务完成后，自动输出复盘：
1. 修改了哪些文件，每个文件做了什么改动
2. 核心新增逻辑的关键代码片段
3. 新增依赖和配置
4. 数据流：输入→输出
5. 未来容易出什么bug，排查看哪些日志"""


class LLMEngine:
    """LLM推理层 — 流式SSE调用OpenAI兼容API

    支持ModelRouter智能路由: 如果传入router，会根据每次请求的prompt
    动态选择最优模型（如auto模式下简单任务用便宜模型，复杂任务用强模型）。
    """

    def __init__(
        self,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        system_prompt: str = "",
        model_router: Optional["ModelRouter"] = None,
        agent_id: str = "",
    ):
        """初始化LLM引擎，从参数或环境变量读取配置

        Args:
            api_key: API密钥（可选，优先级最高）
            base_url: API基础URL（可选，优先级最高）
            model: 模型名称（可选，优先级最高）
            system_prompt: 系统提示词（可选）
            model_router: ModelRouter实例（可选），启用后每次chat根据prompt选择模型
            agent_id: agent标识符（可选），配合router做agent级模型覆盖
        """
        # 原有逻辑: 从参数或环境变量读取固定配置
        self.api_key = api_key or os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
        self.base_url = base_url or os.environ.get("LLM_BASE_URL", os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1"))
        self.model = model or os.environ.get("LLM_MODEL", os.environ.get("OPENAI_MODEL", "deepseek-r1:latest"))
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT

        # ModelRouter智能路由（可选）
        self.model_router = model_router
        self.agent_id = agent_id

        # 路由模式: 默认auto，可通过环境变量覆盖
        self.route_mode = os.environ.get("MODEL_ROUTER_MODE", "auto")

        logger.info(f"LLM Engine init: base_url={self.base_url}, model={self.model}, router={'enabled' if model_router else 'disabled'}")

    def _make_client(self) -> httpx.AsyncClient:
        """创建新的HTTP客户端实例

        不复用连接池，避免httpx AsyncClient在websockets serve循环内
        因内部anyio task group状态冲突导致流式读取死锁。
        """
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )

    def _resolve_model(self, messages: list[dict]) -> tuple[str, str, str]:
        """通过ModelRouter解析模型 — 返回 (model_name, base_url, api_key)

        如果没有router或router选择失败，回退到原有固定配置。
        从messages中提取最后一条用户消息作为prompt用于复杂度评估。

        Args:
            messages: 对话历史消息

        Returns:
            (model_name, base_url, api_key) 三元组
        """
        if not self.model_router:
            # 没有router，使用原有固定配置
            return self.model, self.base_url, self.api_key

        # 提取最后一条用户消息作为prompt（用于复杂度评估）
        prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                prompt = msg.get("content", "")
                break

        try:
            selection = self.model_router.select_model(
                prompt=prompt,
                mode=self.route_mode,
                agent_id=self.agent_id,
            )
            return selection.model, selection.base_url, selection.api_key
        except Exception as e:
            logger.warning("ModelRouter选择失败，回退到固定配置: %s", e)
            return self.model, self.base_url, self.api_key

    async def chat_stream(
        self, messages: list[dict], cancel_event: Optional[asyncio.Event] = None,
        system_prompt: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """流式输出LLM响应 — 每个yield是一个纯文本delta片段

        如果启用了ModelRouter，每次请求会根据prompt动态选择最优模型。

        Args:
            messages: 对话历史（不含system提示词，会自动注入）
            cancel_event: 取消信号，设置后停止流式输出
            system_prompt: 自定义system prompt，None时使用默认
        """
        # 通过router解析模型（无router时返回固定配置）
        resolved_model, resolved_base_url, resolved_api_key = self._resolve_model(messages)

        # 使用解析后的配置创建客户端
        client = httpx.AsyncClient(
            base_url=resolved_base_url,
            headers={"Authorization": f"Bearer {resolved_api_key}"} if resolved_api_key else {},
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )
        payload = {
            "model": resolved_model,
            "messages": self._build_messages(messages, system_prompt),
            "stream": True,
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        try:
            async with client:
                req = client.build_request("POST", "/chat/completions", json=payload)
                response = await client.send(req, stream=True)
                try:
                    if response.status_code != 200:
                        body = await response.aread()
                        raise RuntimeError(f"LLM API error {response.status_code}: {body.decode()[:200]}")
                    buffer = ""
                    async for chunk in response.aiter_bytes():
                        if cancel_event and cancel_event.is_set():
                            logger.info("LLM stream cancelled by event")
                            return
                        buffer += chunk.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line.startswith("data: "):
                                continue
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                return
                            try:
                                obj = json.loads(data_str)
                                choices = obj.get("choices", [])
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})
                                if delta.get("reasoning_content"):
                                    continue
                                content = delta.get("content")
                                if content:
                                    yield content
                                if choices[0].get("finish_reason") in ("stop", "tool_calls", "length"):
                                    return
                            except json.JSONDecodeError:
                                continue
                finally:
                    await response.aclose()
        except httpx.ReadTimeout:
            logger.warning("LLM stream read timeout")
            yield "\n[LLM响应超时]"
        except Exception as e:
            logger.error(f"LLM stream error: {e}", exc_info=True)
            yield f"\n[LLM错误: {e}]"

    async def chat_stream_with_tools(
        self,
        messages: list[dict],
        tools: Optional[list[dict]] = None,
        cancel_event: Optional[asyncio.Event] = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str | dict, None]:
        """流式输出LLM响应 — 支持function calling工具调用

        如果启用了ModelRouter，每次请求会根据prompt动态选择最优模型。

        与chat_stream的区别：解析SSE中的tool_calls增量数据，
        按index累积arguments字符串，最终yield完整的tool_calls列表。

        Args:
            messages: 对话历史（不含system提示词，会自动注入）
            tools: OpenAI function calling格式的工具定义列表
            cancel_event: 取消信号，设置后停止流式输出

        Yields:
            str: 普通文本delta片段
            dict: {"tool_calls": [...]} 完整的工具调用列表（仅在LLM请求调用工具时）
        """
        # 通过router解析模型（无router时返回固定配置）
        resolved_model, resolved_base_url, resolved_api_key = self._resolve_model(messages)

        # 使用解析后的配置创建客户端
        client = httpx.AsyncClient(
            base_url=resolved_base_url,
            headers={"Authorization": f"Bearer {resolved_api_key}"} if resolved_api_key else {},
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )
        payload = {
            "model": resolved_model,
            "messages": self._build_messages(messages, system_prompt),
            "stream": True,
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        # 如果提供了工具定义，加入payload
        if tools:
            payload["tools"] = tools
            logger.info(f"[LLM] Sending {len(tools)} tools to {resolved_model}")
        else:
            logger.info(f"[LLM] No tools provided to {resolved_model}")

        # 按index累积tool_calls的arguments（SSE中arguments是增量拼接的）
        accumulated_tool_calls: dict[int, dict] = {}  # index → {id, type, function: {name, arguments}}

        try:
            async with client:
                req = client.build_request("POST", "/chat/completions", json=payload)
                response = await client.send(req, stream=True)
                try:
                    if response.status_code != 200:
                        body = await response.aread()
                        raise RuntimeError(f"LLM API error {response.status_code}: {body.decode()[:200]}")
                    buffer = ""
                    async for chunk in response.aiter_bytes():
                        if cancel_event and cancel_event.is_set():
                            logger.info("LLM stream cancelled by event")
                            return
                        buffer += chunk.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line.startswith("data: "):
                                continue
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                # 流结束，如果有累积的tool_calls则yield
                                if accumulated_tool_calls:
                                    yield {"tool_calls": [
                                        accumulated_tool_calls[i]
                                        for i in sorted(accumulated_tool_calls.keys())
                                    ]}
                                return
                            try:
                                obj = json.loads(data_str)
                                choices = obj.get("choices", [])
                                if not choices:
                                    continue
                                choice = choices[0]
                                delta = choice.get("delta", {})
                                if delta.get("reasoning_content"):
                                    continue
                                content = delta.get("content")
                                if content:
                                    yield content
                                tool_calls_delta = delta.get("tool_calls") or []
                                for tc_delta in tool_calls_delta:
                                    idx = tc_delta.get("index", 0)
                                    if idx not in accumulated_tool_calls:
                                        accumulated_tool_calls[idx] = {
                                            "id": tc_delta.get("id", ""),
                                            "type": tc_delta.get("type", "function"),
                                            "function": {
                                                "name": "",
                                                "arguments": "",
                                            },
                                        }
                                    if tc_delta.get("id"):
                                        accumulated_tool_calls[idx]["id"] = tc_delta["id"]
                                    func_delta = tc_delta.get("function", {})
                                    if func_delta.get("name"):
                                        accumulated_tool_calls[idx]["function"]["name"] += func_delta["name"]
                                    if func_delta.get("arguments"):
                                        accumulated_tool_calls[idx]["function"]["arguments"] += func_delta["arguments"]
                                if choice.get("finish_reason") in ("stop", "tool_calls", "length"):
                                    if accumulated_tool_calls:
                                        yield {"tool_calls": [
                                            accumulated_tool_calls[i]
                                            for i in sorted(accumulated_tool_calls.keys())
                                        ]}
                                    return
                            except json.JSONDecodeError:
                                continue
                finally:
                    await response.aclose()
        except httpx.ReadTimeout:
            logger.warning("LLM stream read timeout")
            yield "\n[LLM响应超时]"
        except Exception as e:
            logger.error(f"LLM stream error: {e}", exc_info=True)
            yield f"\n[LLM错误: {e}]"

    async def chat(self, messages: list[dict]) -> str:
        """非流式完整输出 — 等待完整响应后返回

        如果启用了ModelRouter，会根据prompt动态选择最优模型。
        """
        # 通过router解析模型（无router时返回固定配置）
        resolved_model, resolved_base_url, resolved_api_key = self._resolve_model(messages)

        client = httpx.AsyncClient(
            base_url=resolved_base_url,
            headers={"Authorization": f"Bearer {resolved_api_key}"} if resolved_api_key else {},
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )
        payload = {
            "model": resolved_model,
            "messages": self._build_messages(messages),
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        try:
            async with client:
                resp = await client.post("/chat/completions", json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"LLM API error {resp.status_code}: {resp.text[:200]}")
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"LLM chat error: {e}", exc_info=True)
            return f"[LLM错误: {e}]"

    def _build_messages(self, history: list[dict], system_prompt: str = None) -> list[dict]:
        """构建OpenAI格式消息数组 — 注入system提示词

        Args:
            history: 会话历史消息
            system_prompt: 自定义system prompt，None时使用默认
        """
        result = [{"role": "system", "content": system_prompt or self.system_prompt}]
        result.extend(history)
        return result

    def _truncate_context(self, messages: list[dict], max_tokens: int = 32000) -> list[dict]:
        """上下文窗口裁剪 — 保留system+最近10轮，中间做摘要

        简化估算：中文1字≈2token，英文1词≈1.3token
        """
        if not messages:
            return messages

        # 估算总token数
        total_chars = sum(len(m.get("content", "")) for m in messages)
        estimated_tokens = total_chars * 1.5  # 粗略估算

        if estimated_tokens <= max_tokens:
            return messages

        # 保留最近10条消息
        keep_count = 10
        if len(messages) <= keep_count:
            return messages

        old_messages = messages[:-keep_count]
        recent_messages = messages[-keep_count:]

        # 将旧消息压缩为一条摘要
        summary_parts = []
        for m in old_messages:
            role = m.get("role", "unknown")
            content = m.get("content", "")[:100]
            summary_parts.append(f"[{role}]: {content}...")
        summary = "之前的对话摘要：\n" + "\n".join(summary_parts)

        return [{"role": "system", "content": summary}] + recent_messages

    async def close(self):
        """关闭引擎（客户端已不缓存，无需显式关闭）"""
        pass
