"""LLM推理层 — 流式SSE调用OpenAI兼容API

支持Ollama、通义千问、OpenAI等兼容接口的流式和非流式调用。
自动注入系统提示词（SOUL规则），管理上下文窗口裁剪。
"""

import asyncio
import json
import logging
import os
from typing import AsyncGenerator, Optional

import httpx

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
    """LLM推理层 — 流式SSE调用OpenAI兼容API"""

    def __init__(
        self,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        system_prompt: str = "",
    ):
        """初始化LLM引擎，从参数或环境变量读取配置"""
        self.api_key = api_key or os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
        self.base_url = base_url or os.environ.get("LLM_BASE_URL", os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1"))
        self.model = model or os.environ.get("LLM_MODEL", os.environ.get("OPENAI_MODEL", "deepseek-r1:latest"))
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self._client: Optional[httpx.AsyncClient] = None
        logger.info(f"LLM Engine init: base_url={self.base_url}, model={self.model}")

    async def _get_client(self) -> httpx.AsyncClient:
        """获取或创建HTTP客户端（连接池复用）"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
                timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
            )
        return self._client

    async def chat_stream(
        self, messages: list[dict], cancel_event: Optional[asyncio.Event] = None
    ) -> AsyncGenerator[str, None]:
        """流式输出LLM响应 — 每个yield是一个纯文本delta片段

        Args:
            messages: 对话历史（不含system提示词，会自动注入）
            cancel_event: 取消信号，设置后停止流式输出
        """
        client = await self._get_client()
        payload = {
            "model": self.model,
            "messages": self._build_messages(messages),
            "stream": True,
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        try:
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
                            delta = obj.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
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
        """非流式完整输出 — 等待完整响应后返回"""
        client = await self._get_client()
        payload = {
            "model": self.model,
            "messages": self._build_messages(messages),
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        try:
            resp = await client.post("/chat/completions", json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"LLM API error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"LLM chat error: {e}", exc_info=True)
            return f"[LLM错误: {e}]"

    def _build_messages(self, history: list[dict]) -> list[dict]:
        """构建OpenAI格式消息数组 — 注入system提示词"""
        result = [{"role": "system", "content": self.system_prompt}]
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
        """关闭HTTP客户端，释放连接池"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
