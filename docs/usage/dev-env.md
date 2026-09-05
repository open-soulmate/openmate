# 开发环境搭建指南

> 面向开发者：如何搭建 OpenMate 本地开发环境

---

## 系统要求

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Node.js | >= 20 | 前端运行时 |
| pnpm | >= 8 | 包管理器（推荐） |
| Python | >= 3.11 | 后端运行时 |
| Rust | latest | Tauri 桌面端（可选） |
| Git | >= 2.30 | 版本控制 |

---

## 快速启动

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/openmate.git
cd openmate
```

### 2. 安装前端依赖

```bash
pnpm install
```

### 3. 安装后端依赖

```bash
# OpenSoul 后端
cd ../opensoul
pip install -r requirements.txt

# ACP Proxy
cd ../openmate/acp-proxy
pip install -r requirements.txt
```

### 4. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：
```env
# OpenSoul API
NEXT_PUBLIC_API_URL=http://localhost:8090

# LLM 配置
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4o
```

### 5. 启动服务

```bash
# 终端1：启动 OpenSoul 后端
cd ../opensoul
PYTHONPATH=. python3 src/main.py

# 终端2：启动 ACP Proxy
cd ../openmate/acp-proxy
python3 main.py

# 终端3：启动前端
cd ../openmate
pnpm dev
```

### 6. 访问

浏览器打开 `http://localhost:3002`

---

## 端口说明

| 服务 | 端口 | 说明 |
|---|---|---|
| 前端 (Next.js) | 3002 | Web UI |
| OpenSoul | 8090 | 后端 API（用户认证、Agent管理、会话存储） |
| ACP Proxy | 8092 | Agent 通信代理（ACP/A2A/MCP/模型路由） |

---

## 常用命令

```bash
# 前端
pnpm dev              # 开发模式
pnpm build            # 构建
pnpm lint             # 代码检查

# Tauri 桌面端
pnpm tauri dev        # 桌面端开发模式
pnpm tauri build      # 打包桌面端

# ACP Proxy
python3 acp-proxy/main.py          # 启动
python3 -c "import ws_acp"         # 检查导入
```

---

## 目录结构

```
openmate/
├── src/                    # 前端源码
│   ├── app/                # Next.js App Router
│   ├── components/         # 通用组件
│   ├── stores/             # Zustand 状态管理
│   ├── lib/                # 工具函数
│   └── locales/            # 国际化
├── acp-proxy/              # ACP 代理
│   ├── agent/              # Agent 实现
│   ├── mcp/                # MCP Server
│   ├── a2a/                # A2A 协议
│   └── main.py             # 启动入口
├── src-tauri/              # Tauri 桌面端
├── docs/                   # 项目文档
├── public/                 # 静态资源
└── .env.local              # 环境变量
```

---

## 调试技巧

### 查看 ACP Proxy 日志

```bash
# ACP Proxy 日志输出到 stderr
python3 acp-proxy/main.py 2>&1 | tee proxy.log
```

### 查看 OpenSoul 日志

```bash
# OpenSoul 日志
tail -f opensoul/logs/app.log
```

### 测试 WebSocket 连接

```bash
# 测试 ACP WebSocket
python3 -c "
import asyncio, websockets
async def test():
    ws = await websockets.connect('ws://localhost:8092/ws/acp?token=xxx')
    print('Connected!')
    await ws.close()
asyncio.run(test())
"
```

---

*详细问题请查阅 `docs/FAQ.md`*
