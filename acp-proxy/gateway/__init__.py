"""Gateway 统一接入网关模块 — 对齐 Gateway v1.0 规范。

提供：
- POST /rpc 统一入口，method前缀路由分发
- X-Trace-Id 生成与全链路透传
- 四维限流（全局/项目/Token/IP）
- 熔断降级
- 超时控制
- JWT鉴权
"""

from __future__ import annotations
