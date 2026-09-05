# 贡献指南

感谢你对 OpenMate 项目的关注！以下是参与贡献的指南。

---

## 开发环境搭建

### 前置依赖

- **Node.js** >= 20
- **Python** >= 3.11
- **Rust**（Tauri 桌面端需要，可选）
- **pnpm**（推荐）或 npm

### 快速启动

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/openmate.git
cd openmate

# 2. 安装前端依赖
pnpm install

# 3. 安装 ACP Proxy 依赖
cd acp-proxy
pip install -r requirements.txt
cd ..

# 4. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 API Key 等配置

# 5. 启动后端（OpenSoul）
cd ../opensoul
pip install -r requirements.txt
python src/main.py &

# 6. 启动 ACP Proxy
cd ../openmate/acp-proxy
python main.py &

# 7. 启动前端
cd ..
pnpm dev
```

### 端口说明

| 服务 | 端口 | 说明 |
|---|---|---|
| 前端 (Next.js) | 3002 | Web UI |
| OpenSoul | 8090 | 后端 API |
| ACP Proxy | 8092 | Agent 通信代理 |

---

## Git 规范

### 分支命名

```
main            — 生产分支
develop         — 开发分支
feature/xxx     — 功能分支
fix/xxx         — 修复分支
docs/xxx        — 文档分支
```

### Commit Message 规范

```
<type>: <description>

类型：
- feat:     新功能
- fix:      修复
- docs:     文档
- refactor: 重构
- style:    样式
- test:     测试
- chore:    构建/工具
```

示例：
```
feat: AI群组讨论引擎
fix: 成员管理API端点修复
docs: UI设计规范v2.0
```

---

## 提交 PR 规范

1. **从 develop 分支创建功能分支**
2. **确保 build 通过**：`pnpm build` 无报错
3. **确保 lint 通过**：`pnpm lint` 无报错
4. **Commit message 遵循规范**
5. **PR 描述说明做了什么、为什么做**
6. **关联 Issue**（如有）

---

## Issue 提报规范

### Bug 报告

```
**描述**：简要描述 bug
**复现步骤**：
1. 打开 xxx 页面
2. 点击 xxx 按钮
3. 出现 xxx 错误

**期望行为**：应该 xxx
**实际行为**：实际 xxx
**环境**：OS / 浏览器 / Node 版本
**截图**：（如有）
```

### 功能请求

```
**描述**：简要描述需求
**使用场景**：为什么需要这个功能
**方案建议**：（如有）
```

---

## 代码规范

详见 `docs/guidelines/coding.md`

核心要求：
- **强制注释**：所有代码输出哪怕一行必须带注释
- **中文注释**：注释使用中文
- **TypeScript strict**：不允许 any
- **组件不重复**：openface 已有的组件绝不手写
- **图标统一**：Lucide React，禁止 emoji

---

## 文档规范

- **静态规范类**（协议、开发规范）→ 放 `docs/` 目录，进 git
- **过程类**（开发笔记、草稿）→ 放系统内文档库，标记正式后才同步到 git
- **重大决策** → 写 ADR（`docs/ADR/`）
- **踩坑记录** → 写 FAQ（`docs/FAQ.md`）
