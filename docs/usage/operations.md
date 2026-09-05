# 运维手册

> 面向运维人员：日常运维操作、故障排查

---

## 日常操作

### 查看日志

```bash
# OpenSoul 日志
tail -f opensoul/logs/app.log

# ACP Proxy 日志（输出到 stderr）
python3 acp-proxy/main.py 2>&1 | tee proxy.log

# Next.js 日志
# 终端输出，无独立日志文件
```

### 数据库备份

```bash
# SQLite 备份
cp opensoul/data/openmate.db opensoul/data/openmate.db.backup.$(date +%Y%m%d)
```

### 数据库重置

```bash
# ⚠️ 危险操作：会丢失所有数据
rm opensoul/data/openmate.db
# 重启 OpenSoul 会自动重建数据库
```

---

## 故障排查清单

### 服务无法启动

| 症状 | 检查 | 解决 |
|---|---|---|
| 端口被占用 | `lsof -i :端口号` | `kill` 占用进程 |
| Python 依赖缺失 | `pip list \| grep 包名` | `pip install -r requirements.txt` |
| Node 依赖缺失 | `ls node_modules/` | `pnpm install` |
| 环境变量未配置 | `cat .env.local` | 检查并补充配置 |

### WebSocket 连接失败

| 症状 | 检查 | 解决 |
|---|---|---|
| 连接被拒绝 | ACP Proxy 是否启动 | 启动 ACP Proxy |
| 认证失败 | Token 是否有效 | 重新登录获取 Token |
| 连接后断开 | 查看 ACP Proxy 日志 | 检查 Agent 进程是否正常 |

### Agent 无响应

| 症状 | 检查 | 解决 |
|---|---|---|
| 消息发送后无回复 | LLM API Key 是否配置 | 检查 `.env.local` 的 `LLM_API_KEY` |
| 回复很慢 | LLM API 是否可达 | `curl $LLM_BASE_URL/models` 测试 |
| Agent 进程崩溃 | ACP Proxy 日志 | 检查 Agent 代码是否有语法错误 |

### 前端页面异常

| 症状 | 检查 | 解决 |
|---|---|---|
| 页面空白 | 浏览器控制台 | 检查 JS 错误 |
| 样式错乱 | 主题是否正确 | 清除 localStorage 重新设置主题 |
| API 请求失败 | 网络面板 | 检查后端服务是否启动 |

---

## 性能监控

### 关键指标

```bash
# CPU 和内存
htop

# 磁盘使用
df -h

# 端口连接数
ss -tlnp | grep -E "3002|8090|8092"
```

### 数据库大小

```bash
ls -lh opensoul/data/openmate.db
```

---

## 升级流程

```bash
# 1. 备份数据
cp opensoul/data/openmate.db opensoul/data/openmate.db.backup.$(date +%Y%m%d)

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
pnpm install
pip install -r acp-proxy/requirements.txt
pip install -r ../opensoul/requirements.txt

# 4. 重新构建
pnpm build

# 5. 重启服务
# 按启动顺序重启
```

---

*详细问题请查阅 `docs/FAQ.md`*
