# OpenMate 常见问题 (FAQ)

> 开发过程中遇到的问题和解决方案，持续更新。

---

## 环境搭建

### Q: pnpm install 报错 node-gyp 编译失败

**原因**：缺少系统编译工具

**解决**：
```bash
# Ubuntu/Debian
sudo apt install build-essential python3

# Arch Linux
sudo pacman -S base-devel
```

### Q: Python 依赖安装失败

**原因**：某些包需要 Python 3.11+

**解决**：
```bash
python3 --version  # 确认版本 >= 3.11
pip install --upgrade pip
```

---

## ACP Proxy

### Q: ACP WebSocket 连接后 session/new 超时

**原因**：PTY 模式下 echo 导致响应重复

**解决**：在 `ws_acp.py` 中禁用 PTY echo：
```python
import termios
attrs = termios.tcgetattr(slave_fd)
attrs[3] &= ~termios.ECHO  # 禁用 echo
termios.tcsetattr(slave_fd, termios.TCSANOW, attrs)
```

### Q: ACP Proxy 启动报错端口被占用

**解决**：
```bash
lsof -i :8092 | awk 'NR>1 {print $2}' | xargs kill
```

### Q: hermes acp 命令卡住不响应

**原因**：Hermes ACP 有 asyncio pipe bug

**解决**：必须用 PTY 模式，参考 `ws_acp.py` 的 `pty.openpty()` 实现

---

## 前端

### Q: Next.js 改完代码页面不更新

**解决**：
```bash
rm -rf .next
pnpm dev
```

### Q: 切换主题后样式错乱

**原因**：旧的 CSS 变量残留

**解决**：`applyTheme()` 函数会先移除所有主题类再添加新的，确保没有残留

### Q: 消息气泡样式和 AI 消息分不清

**原因**：用户消息和 AI 消息用了相似的颜色

**解决**：消息气泡必须用完全不同的色系区分，不能只调透明度

---

## OpenSoul 后端

### Q: OpenSoul API 返回 404

**原因**：OpenSoul 服务没启动

**解决**：
```bash
cd opensoul
PYTHONPATH=. python3 src/main.py
```

### Q: 群组 API PATCH 更新 agents 无效

**原因**：PATCH /api/ai-groups/{id} 只接受 name 和 description，不接受 agents

**解决**：添加成员用独立端点：
- 添加：`POST /api/ai-groups/{id}/agents`
- 删除：`DELETE /api/ai-groups/{id}/agents/{agent_id}`
- 更新：`PATCH /api/ai-groups/{id}/agents/{agent_id}`

---

## Tauri 桌面端

### Q: Tauri dev 报错找不到 WebView

**解决**：
```bash
# Arch Linux
sudo pacman -S webkit2gtk-4.1

# Ubuntu
sudo apt install libwebkit2gtk-4.1-dev
```

---

## 部署

### Q: 服务启动顺序

**正确顺序**：
1. OpenSoul（:8090）— 后端 API
2. ACP Proxy（:8092）— Agent 通信代理
3. Next.js（:3002）— 前端

### Q: 如何检查所有服务是否正常

```bash
curl -s http://localhost:8090/api/ai-groups/health  # OpenSoul
curl -s http://localhost:8092/api/model-router/config  # ACP Proxy
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002  # Next.js
```

---

*持续更新中。遇到新问题请补充到此文件。*
