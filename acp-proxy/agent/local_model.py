"""
统一本地模型客户端抽象层 — 借鉴Hermes multi-provider架构
支持：llama.cpp / vLLM / Ollama / LM Studio / 任何OpenAI兼容端点
核心思想：本地和远程模型用同一接口，透明切换
"""

import logging
import json
import time
import aiohttp
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

logger = logging.getLogger("acp-proxy.local-model")


class LocalBackend(str, Enum):
    OLLAMA = "ollama"
    LLAMACPP = "llamacpp"
    VLLM = "vllm"
    LMSTUDIO = "lmstudio"
    OPENAI_COMPAT = "openai_compat"


@dataclass
class LocalModelConfig:
    backend: LocalBackend = LocalBackend.OLLAMA
    base_url: str = "http://localhost:11434"
    model: str = ""
    api_key: str = ""
    max_tokens: int = 4096
    temperature: float = 0.7
    context_window: int = 8192


@dataclass
class LocalModelStats:
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_tokens_generated: int = 0
    avg_response_time: float = 0.0
    _response_times: list = field(default_factory=list)

    def record(self, success: bool, tokens: int, response_time: float):
        self.total_requests += 1
        if success:
            self.successful_requests += 1
            self.total_tokens_generated += tokens
        else:
            self.failed_requests += 1
        self._response_times.append(response_time)
        if len(self._response_times) > 100:
            self._response_times = self._response_times[-100:]
        self.avg_response_time = sum(self._response_times) / len(self._response_times)


class UnifiedLocalClient:
    """统一本地模型客户端 — 一个接口对接所有本地推理后端"""

    def __init__(self, config: LocalModelConfig):
        self.config = config
        self.stats = LocalModelStats()
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120)
            )

    async def chat(self, messages: list, **kwargs) -> str:
        """统一chat接口 — 自动适配不同后端的API格式"""
        await self._ensure_session()
        start = time.time()
        try:
            if self.config.backend == LocalBackend.OLLAMA:
                result = await self._chat_ollama(messages, **kwargs)
            elif self.config.backend in (LocalBackend.LLAMACPP, LocalBackend.VLLM,
                                          LocalBackend.LMSTUDIO, LocalBackend.OPENAI_COMPAT):
                result = await self._chat_openai_compat(messages, **kwargs)
            else:
                result = await self._chat_openai_compat(messages, **kwargs)

            elapsed = time.time() - start
            tokens = len(result.split()) * 1.3  # rough estimate
            self.stats.record(True, int(tokens), elapsed)
            return result

        except Exception as e:
            elapsed = time.time() - start
            self.stats.record(False, 0, elapsed)
            logger.error(f"Local model chat failed ({self.config.backend}): {e}")
            raise

    async def _chat_ollama(self, messages: list, **kwargs) -> str:
        """Ollama API格式"""
        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": kwargs.get("max_tokens", self.config.max_tokens),
                "temperature": kwargs.get("temperature", self.config.temperature),
            }
        }
        assert self._session
        async with self._session.post(
            f"{self.config.base_url}/api/chat",
            json=payload
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Ollama returned {resp.status}: {await resp.text()}")
            data = await resp.json()
            return data.get("message", {}).get("content", "")

    async def _chat_openai_compat(self, messages: list, **kwargs) -> str:
        """OpenAI兼容API格式（llama.cpp server / vLLM / LM Studio）"""
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        payload = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "temperature": kwargs.get("temperature", self.config.temperature),
            "stream": False,
        }

        assert self._session
        async with self._session.post(
            f"{self.config.base_url}/v1/chat/completions",
            json=payload,
            headers=headers
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Backend returned {resp.status}: {await resp.text()}")
            data = await resp.json()
            return data["choices"][0]["message"]["content"]

    async def health_check(self) -> dict:
        """健康检查 — 自动探测后端是否可用"""
        await self._ensure_session()
        try:
            if self.config.backend == LocalBackend.OLLAMA:
                url = f"{self.config.base_url}/api/tags"
            else:
                url = f"{self.config.base_url}/v1/models"

            assert self._session
            async with self._session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if self.config.backend == LocalBackend.OLLAMA:
                        models = [m["name"] for m in data.get("models", [])]
                    else:
                        models = [m["id"] for m in data.get("data", [])]
                    return {
                        "healthy": True,
                        "backend": self.config.backend.value,
                        "available_models": models[:10],
                        "configured_model": self.config.model,
                        "model_available": self.config.model in models if self.config.model else None,
                    }
                return {"healthy": False, "error": f"HTTP {resp.status}"}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    async def list_models(self) -> list[str]:
        """列出可用模型"""
        health = await self.health_check()
        return health.get("available_models", [])

    def get_stats(self) -> dict:
        return {
            "backend": self.config.backend.value,
            "base_url": self.config.base_url,
            "model": self.config.model,
            "total_requests": self.stats.total_requests,
            "success_rate": (
                self.stats.successful_requests / max(self.stats.total_requests, 1)
            ),
            "avg_response_time": f"{self.stats.avg_response_time:.2f}s",
            "total_tokens_generated": self.stats.total_tokens_generated,
        }

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()


class LocalModelRouter:
    """本地模型路由器 — 自动选择最佳本地后端，支持fallback"""

    def __init__(self):
        self._clients: dict[str, UnifiedLocalClient] = {}
        self._fallback_order: list[str] = []

    def register(self, name: str, config: LocalModelConfig):
        self._clients[name] = UnifiedLocalClient(config)
        self._fallback_order.append(name)
        logger.info(f"Registered local model backend: {name} ({config.backend.value})")

    async def chat(self, messages: list, preferred: str = "", **kwargs) -> str:
        """带fallback的chat — 首选后端失败自动切换"""
        order = []
        if preferred and preferred in self._clients:
            order.append(preferred)
        order.extend([n for n in self._fallback_order if n != preferred])

        last_error = None
        for name in order:
            try:
                return await self._clients[name].chat(messages, **kwargs)
            except Exception as e:
                last_error = e
                logger.warning(f"Local backend {name} failed: {e}, trying next")

        raise RuntimeError(f"All local backends failed. Last error: {last_error}")

    async def health_check_all(self) -> dict:
        results = {}
        for name, client in self._clients.items():
            results[name] = await client.health_check()
        return results

    def get_stats(self) -> dict:
        return {name: client.get_stats() for name, client in self._clients.items()}

    async def close_all(self):
        for client in self._clients.values():
            await client.close()
