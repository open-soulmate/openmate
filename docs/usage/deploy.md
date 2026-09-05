# 部署手册

> 面向运维人员和二次开发者：如何部署 OpenMate

---

## 部署方式

### 方式一：本地部署（推荐开发）

参考 `docs/usage/dev-env.md` 的快速启动章节。

### 方式二：Docker 部署（推荐生产）

```bash
# 构建镜像
docker build -t openmate .

# 启动
docker run -d \
  -p 3002:3002 \
  -p 8090:8090 \
  -p 8092:8092 \
  -v ./data:/app/data \
  -v ./.env.local:/app/.env.local \
  openmate
```

### 方式三：Tauri 桌面端打包

```bash
pnpm tauri build
# 输出：src-tauri/target/release/openmate
```

---

## 端口配置

| 服务 | 默认端口 | 环境变量 |
|---|---|---|
| 前端 | 3002 | `PORT` |
| OpenSoul | 8090 | `PORT`（OpenSoul .env） |
| ACP Proxy | 8092 | `ACP_PROXY_PORT` |

> **注意**：ACP Proxy 端口 8092 是硬编码在前端 `.env.local` 中的，修改需要同步更新 `NEXT_PUBLIC_API_URL`。

---

## 环境变量

### 前端 (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8090
```

### ACP Proxy

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4o
JWT_SECRET=your-secret-key
```

### OpenSoul

```env
PORT=8090
DATABASE_URL=sqlite:///data/openmate.db
JWT_SECRET=your-secret-key
```

---

## 服务启停

### 启动

```bash
# 1. OpenSoul
cd opensoul && PYTHONPATH=. python3 src/main.py &

# 2. ACP Proxy
cd openmate/acp-proxy && python3 main.py &

# 3. 前端
cd openmate && pnpm dev &
```

### 停止

```bash
# 按端口停止
lsof -i :8090 | awk 'NR>1 {print $2}' | xargs kill
lsof -i :8092 | awk 'NR>1 {print $2}' | xargs kill
lsof -i :3002 | awk 'NR>1 {print $2}' | xargs kill
```

### 健康检查

```bash
curl http://localhost:8090/api/ai-groups/health  # OpenSoul
curl http://localhost:8092/api/model-router/config  # ACP Proxy
curl -o /dev/null -w "%{http_code}" http://localhost:3002  # 前端
```

---

## 数据目录

| 数据 | 位置 | 说明 |
|---|---|---|
| OpenSoul 数据库 | `opensoul/data/` | SQLite 数据库 |
| 用户上传文件 | `opensoul/uploads/` | 用户上传的文件 |
| 日志 | `opensoul/logs/` | 应用日志 |

---

## 反向代理（Nginx）

如果需要通过域名访问：

```nginx
server {
    listen 80;
    server_name openmate.example.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws/ {
        proxy_pass http://localhost:8092;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api/ {
        proxy_pass http://localhost:8090;
    }
}
```

---

*详细问题请查阅 `docs/FAQ.md`*
