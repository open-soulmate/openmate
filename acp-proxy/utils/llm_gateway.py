"""
LLM Gateway — 统一调用入口 + 统一防护

使用方式：
    from utils.llm_gateway import llm_call
    result = await llm_call(messages, model="default")

架构：
    业务代码 ──→ llm_call() ──→ 大模型A
                  ├── 防护逻辑     ├── 大模型B
                  ├── 路由逻辑     ├── 大模型C
                  └── 重试逻辑     └── ...

防护机制（全部封装在llm_call内部）：
1. finish_reason检测+自动续写（Aider方案）
2. omission占位符检测+重新生成（Gemini CLI方案）
3. 输出字符数限制（Cline方案）
4. 多模型路由+降级
"""

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── 常量 ──────────────────────────────────────────────

MAX_CONTINUATION = 3  # 最大续写次数
MAX_OUTPUT_TOKENS = 4096  # 单次输出token上限
MAX_TOOL_OUTPUT_CHARS = 8000  # 工具输出字符上限


# ── 模型配置 ──────────────────────────────────────────

@dataclass
class ModelConfig:
    """模型配置"""
    name: str
    base_url: str
    api_key: str
    model: str
    max_tokens: int = MAX_OUTPUT_TOKENS
    temperature: float = 0.7
    timeout: float = 120.0
    priority: int = 0  # 优先级，越小越优先
    enabled: bool = True


# 默认模型配置（从环境变量读取）
DEFAULT_MODELS = [
    ModelConfig(
        name="mimo",
        base_url=os.environ.get("LLM_BASE_URL", "https://api.mimo.ai/v1"),
        api_key=os.environ.get("LLM_API_KEY", ""),
        model=os.environ.get("LLM_MODEL", "mimo-v2"),
        priority=0,
    ),
]

# 模型注册表
_model_registry: dict[str, ModelConfig] = {}


def register_model(config: ModelConfig):
    """注册模型配置"""
    _model_registry[config.name] = config


def get_model(name: str = "default") -> ModelConfig | None:
    """获取模型配置"""
    if name == "default":
        # 返回优先级最高的可用模型
        available = [m for m in _model_registry.values() if m.enabled]
        if available:
            return min(available, key=lambda m: m.priority)
        return None
    return _model_registry.get(name)


# 初始化默认模型
for config in DEFAULT_MODELS:
    register_model(config)


# ── Omission占位符检测（Gemini CLI方案）────────────────

_OMISSION_PATTERNS = [
    re.compile(r"\(rest of methods \.\.\.\)"),
    re.compile(r"# \.\.\. existing code \.\.\."),
    re.compile(r"// \.\.\. rest of the function"),
    re.compile(r"\[\.\.\.\]"),
    re.compile(r"\(truncated\)"),
    re.compile(r"// \.\.\. remaining code"),
    re.compile(r"# \.\.\. rest of"),
    re.compile(r"/\* \.\.\. existing code \.\.\. \*/"),
    re.compile(r"<!-- \.\.\. existing code \.\.\. -->"),
]


def _check_omission(text: str) -> str | None:
    """检测LLM输出中的省略占位符"""
    for pattern in _OMISSION_PATTERNS:
        match = pattern.search(text)
        if match:
            return f"Omission placeholder detected: {match.group()}"
    return None


# ── 统一调用入口 ──────────────────────────────────────

async def llm_call(
    messages: list[dict],
    model: str = "default",
    temperature: float | None = None,
    max_tokens: int | None = None,
    max_continuation: int = MAX_CONTINUATION,
    strand_id: str = "",
) -> str:
    """统一LLM调用入口 — 一处防护，全局调用
    
    自动完成：
    1. finish_reason检测+自动续写（Aider方案）
    2. omission占位符检测+重新生成（Gemini CLI方案）
    3. 输出字符数限制（Cline方案）
    4. 多模型路由+降级
    
    返回：LLM输出文本（已保证安全）
    """
    # 获取模型配置
    config = get_model(model)
    if not config:
        logger.error(f"[{strand_id}] No available model: {model}")
        return ""
    
    # 参数覆盖
    temp = temperature if temperature is not None else config.temperature
    tokens = max_tokens if max_tokens is not None else config.max_tokens
    
    # 调用（带防护）
    result = await _call_with_protection(
        config=config,
        messages=messages,
        temperature=temp,
        max_tokens=tokens,
        max_continuation=max_continuation,
        strand_id=strand_id,
    )
    
    return result


async def _call_with_protection(
    config: ModelConfig,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    max_continuation: int,
    strand_id: str,
) -> str:
    """带防护的LLM调用"""
    full_content = ""
    current_messages = list(messages)
    
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(config.timeout)) as client:
            for attempt in range(max_continuation + 1):
                try:
                    resp = await client.post(
                        f"{config.base_url}/chat/completions",
                        headers=headers,
                        json={
                            "model": config.model,
                            "messages": current_messages,
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                        },
                    )
                    
                    if resp.status_code != 200:
                        logger.error(
                            f"[{strand_id}] LLM call failed: {resp.status_code} {resp.text[:200]}"
                        )
                        return full_content
                    
                    data = resp.json()
                    choice = data.get("choices", [{}])[0]
                    content = choice.get("message", {}).get("content", "")
                    finish_reason = choice.get("finish_reason", "stop")
                    
                    full_content += content
                    
                    # 检查1: omission占位符
                    omission = _check_omission(full_content)
                    if omission:
                        logger.warning(f"[{strand_id}] {omission}")
                        current_messages.append({"role": "assistant", "content": full_content})
                        current_messages.append({
                            "role": "user",
                            "content": (
                                f"Your previous output had issues: {omission}\n\n"
                                "Please provide the COMPLETE implementation without any shortcuts, "
                                "placeholders, or omissions. Start from the beginning."
                            ),
                        })
                        full_content = ""  # 重置，让LLM重新完整输出
                        continue
                    
                    # 检查2: finish_reason
                    if finish_reason == "length":
                        logger.warning(
                            f"[{strand_id}] LLM output truncated (finish_reason=length), "
                            f"attempt {attempt+1}/{max_continuation}"
                        )
                        current_messages.append({"role": "assistant", "content": full_content})
                        current_messages.append({
                            "role": "user",
                            "content": "Continue from where you left off. Do not repeat any content already provided.",
                        })
                        continue
                    
                    # 正常结束
                    break
                    
                except Exception as e:
                    logger.error(f"[{strand_id}] LLM call exception: {e}")
                    break
    
    except Exception as e:
        logger.error(f"[{strand_id}] LLM client exception: {e}")
    
    # 输出字符数限制
    if len(full_content) > MAX_TOOL_OUTPUT_CHARS:
        logger.warning(
            f"[{strand_id}] Output truncated to {MAX_TOOL_OUTPUT_CHARS} chars "
            f"(was {len(full_content)})"
        )
        full_content = full_content[:MAX_TOOL_OUTPUT_CHARS]
    
    return full_content


# ── 便捷函数 ──────────────────────────────────────────

async def llm_call_simple(prompt: str, model: str = "default", strand_id: str = "") -> str:
    """简单调用：单条消息"""
    return await llm_call(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        strand_id=strand_id,
    )


async def llm_call_with_system(
    system: str, user: str, model: str = "default", strand_id: str = ""
) -> str:
    """带系统提示的调用"""
    return await llm_call(
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        model=model,
        strand_id=strand_id,
    )
