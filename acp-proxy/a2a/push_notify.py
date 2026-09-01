"""A2A 推送通知模块。

实现 tasks/pushNotification/set 和 tasks/pushNotification/get 方法，
以及任务事件的异步 HTTP 回调推送。

推送通知是 fire-and-forget 模式，失败静默处理，不影响主流程。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger("a2a.push_notify")

# Task ID → 注册的推送配置
_push_registry: dict[str, dict[str, Any]] = {}


def register_push_config(task_id: str, config: dict[str, Any]) -> None:
    """注册Task的推送通知配置。

    Args:
        task_id: Task ID
        config: 推送配置，包含 url, token 等
    """
    _push_registry[task_id] = config
    logger.info(f"推送通知已注册: task_id={task_id}, url={config.get('url', 'N/A')}")


def get_push_config(task_id: str) -> Optional[dict[str, Any]]:
    """获取Task的推送通知配置。

    Args:
        task_id: Task ID

    Returns:
        推送配置字典，未注册则返回 None
    """
    return _push_registry.get(task_id)


def remove_push_config(task_id: str) -> None:
    """移除Task的推送通知配置。"""
    _push_registry.pop(task_id, None)


async def _send_notification(url: str, payload: dict[str, Any], token: Optional[str] = None) -> None:
    """异步发送 HTTP 推送通知（fire-and-forget）。

    失败静默处理，仅记录日志。
    """
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning(f"推送通知HTTP错误: url={url}, status={resp.status_code}")
            else:
                logger.debug(f"推送通知发送成功: url={url}")
    except Exception as e:
        logger.warning(f"推送通知发送失败（静默忽略）: url={url}, error={e}")


async def push_task_event(task_id: str, event_type: str, event_data: dict[str, Any]) -> None:
    """推送任务事件到已注册的回调URL。

    fire-and-forget 模式，失败不影响主流程。

    Args:
        task_id: Task ID
        event_type: 事件类型（如 statusChanged, messageAppended 等）
        event_data: 事件数据
    """
    config = _push_registry.get(task_id)
    if not config:
        return

    url = config.get("url")
    if not url:
        return

    token = config.get("token")
    payload = {
        "taskId": task_id,
        "eventType": event_type,
        "event": event_data,
    }

    # fire-and-forget: 创建后台任务，不阻塞调用方
    asyncio.create_task(_send_notification(url, payload, token))
