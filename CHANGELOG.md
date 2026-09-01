# OpenMate 开发日志

## 2026-09-01 — Sidebar Agent统一 + ACP Proxy修复 + PWA

### 架构变更

**Agent列表统一到Store（单数据源）**
- 之前：`app-shell.tsx`和`chat-client.tsx`各自维护独立的agent列表，导致数据不同步
- 之后：`sidebarAgents`存在zustand store里，app-shell构建后写入，chat-client直接读取
- 删了~133行重复的`initAgents`逻辑

**关键文件职责：**
- `stores/app-store.ts` — `sidebarAgents`(agent列表)、`setSidebarAgents`(更新)、`refreshSidebar`(触发重fetch)
- `components/app-shell.tsx` — `fetchSessions()`构建agent列表 → 存到store
- `chat/chat-client.tsx` — 从store读取，通过`refreshSidebar()`触发刷新
- `components/conversation-tree.tsx` — 纯展示，从props读取agent列表

**Agent分组规则：**
- `SoulMate` — OpenMate平台本身，独立空分组，永远显示在最上面
- `hermes agent` — 独立agent，cli/weixin/acp/tui会话归它
- `cron/unknown/tool/subagent` — 从侧边栏过滤掉

**消息发送规则：**
- SoulMate: `mode: 'openmate'`，不传`agent_id`
- 其他agent: `mode: 'agent_proxy'`，传`agent_id`

### ACP Proxy修复

**问题：** 启动时`session/new` RPC超时30秒
**根因：** `stderr=asyncio.subprocess.PIPE`但没有代码读stderr → stderr缓冲区满 → 阻塞stdout → RPC超时
**修复：** 加了`_drain_stderr()` task持续消费stderr

**文件：** `acp-proxy/proxy.py`

**Proxy支持的mode：** `hermes`、`acp`、`agent_proxy`、`openmate`(=hermes)

### PWA支持

- `public/manifest.json` — 独立APP模式，启动页`/chat`
- `public/sw.js` — Network-first策略，不缓存API
- `public/icons/icon-192.png`、`icon-512.png` — 紫色OM图标
- `src/app/layout.tsx` — `appleWebApp`配置
- `https-proxy.py` — 自签证书HTTPS反代（端口3443→3002），支持手机PWA安装

### RichInput修复

**问题：** 发送后输入框文字不消失
**根因：** `contentEditable`的`useEffect`只在`document.activeElement !== el`时更新DOM，发送后焦点还在输入框
**修复：** 当`value`为空时强制清空DOM，不管焦点状态

### 文件清单

| 文件 | 改动 |
|------|------|
| `stores/app-store.ts` | 新增`sidebarAgents`、`setSidebarAgents`、`sidebarRefreshKey`、`refreshSidebar` |
| `components/app-shell.tsx` | 从store读agent列表，不再用本地useState |
| `chat/chat-client.tsx` | 删除`initAgents`(~120行)，从store读取，`refreshSidebar()`触发刷新 |
| `acp-proxy/ws_chat.py` | 支持`openmate`mode |
| `acp-proxy/proxy.py` | 加`_drain_stderr()`防止缓冲区阻塞 |
| `components/rich-input.tsx` | 发送后强制清空DOM |
| `src/app/layout.tsx` | 加`appleWebApp`配置 |
| `public/manifest.json` | PWA清单 |
| `public/sw.js` | Service Worker |
| `public/icons/` | PWA图标 |
| `https-proxy.py` | HTTPS反代脚本 |
| `certs/` | 自签证书 |

---

## 2026-09-01 — Multi-Agent Session管理架构升级

### 架构决策

**问题**：SoulMate和hermes agent共享同一个后端（ACP Proxy8092），session无法区分归属。

**研究**：分析了AionUi和OpenClaw的多agent架构：
- AionUi：Built-in Agent + 外部CLI Agent共存，通过ACP协议统一管理
- OpenClaw：Gateway中心化架构，所有消息通过一个Gateway路由

**方案演进**：
1. ~~SoulMate直连8090~~ — OpenSoul没有WS chat端点，不可行
2. ~~localStorage标记归属~~ — 换设备丢失，不是正确方案
3. **OpenSoul Session标签系统** — 后端存储，跨设备同步，正确方案

### 最终架构

| Agent | 端口 | session标识 | 路由方式 |
|-------|------|------------|---------|
| SoulMate | 8092（ACP Proxy） | tag: `agent:soulmate` | OpenSoul内置LLM |
| hermes | 8092（ACP Proxy） | tag: `agent:hermes` | hermes CLI进程 |
| hugo/mimo等 | 8092（ACP Proxy） | tag: `agent:{id}` | ACP agent_proxy |

### 技术实现

- Session创建时调用`POST /api/sessions/{id}/tags`打标签
- Sidebar构建时调用`GET /api/sessions/tags/all`获取所有标签做分组
- 不需要localStorage，一切后端驱动

### 参考资料

- [AionUi Multi-Agent Mode](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup)
- [OpenClaw Gateway Architecture](https://openclaw.ai/docs/latest/concepts/gateway/)
