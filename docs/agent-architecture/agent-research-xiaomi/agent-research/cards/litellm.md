# LiteLLM

## 一句话定位
开源 AI Gateway：Python SDK + Proxy，用 OpenAI 格式统一 100+ LLM，含成本/负载/护栏。

## 核心架构（4点）
1. **统一 completion API**：`model="provider/xxx"` 一套代码切多厂商
2. **Proxy/Gateway**：virtual keys、花费追踪、路由、dashboard
3. **Rust core + Python SDK**：强调低延迟网关路径
4. **MCP / A2A 桥**：MCP 工具进 chat completions；A2A Agent 可挂网关

## 稳定性亮点
- 模型价格与上下文窗口表随仓维护
- 负载均衡与故障转移在网关层完成，业务代码无感
- 公开 benchmark 宣称 1k RPS 下 P95 约 8ms（网关路径）

## 对 openmate 借鉴
1. **Provider 归一化层外置**：openmate 应先把多模型适配收成一层 gateway，再谈路由与预算
2. **Virtual Key + spend tracking**：个人助手也应有 per-session 成本上限

## 链接
https://github.com/BerriAI/litellm
