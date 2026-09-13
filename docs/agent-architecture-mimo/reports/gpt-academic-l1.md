# binary-husky/gpt_academic — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/binary-husky/gpt_academic  
> 抓取通道: cdn.jsdelivr.net/gh/binary-husky/gpt_academic@master/README.md  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供学术插件体系 / 多模型 / 热更新 / 虚空终端 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（中文，功能表、安装、版本史）
- 未打开: `crazy_functions/` 插件实现、`core_functional.py`
- master 最新动态: 2026-01-25 新 GUI 前端测试中；2025-08-23 Dockerfile 构建优化
- 分支: master（稳定）/ frontier（开发）

---

## 1. 项目定位（README 实读）

**GPT 学术优化** — 面向学术场景的 LLM 工作台：
- 润色/翻译/代码解释
- 论文全文翻译（arXiv/LaTeX/PDF）
- 模块化函数插件（热更新）
- 多 LLM 混合调用
- 自译解报告（self_analysis.md）

---

## 2. 核心功能（README 表实读）

### 2.1 模型接入

- 百度千帆/文心一言
- 通义千问 Qwen
- 上海 AI-Lab 书生
- 讯飞星火
- LLaMa2
- 智谱 GLM4
- DALLE3
- DeepseekCoder

**多 API key 共存**（README 实读）:
```python
API_KEY="openai-key1,openai-key2,azure-key3,api2d-key4"
```
临时换 key: 输入区输入 API_KEY 回车即生效。

### 2.2 学术插件（README 列表）

| 插件 | 能力 |
|------|------|
| Arxiv 论文精细翻译 | 超高质量（Docker 含 latex） |
| 实时语音对话输入 | 异步监听音频、自动断句 |
| **虚空终端** | 自然语言调度其他插件 |
| 程序剖析 | 一键剖析项目树 / 自我剖析 |
| 读论文/翻译论文 | latex/pdf 全文+摘要 |
| Latex 全文翻译/润色 | |
| 批量注释生成 | |
| Markdown 中英互译 | 多语言 README |
| PDF 论文全文翻译 | 多线程 |
| Arxiv 小助手 | url→摘要翻译+下载 PDF |
| Latex 一键校对 | 仿 Grammarly |
| 谷歌学术统合小助手 | related works |
| 互联网信息聚合+GPT | |

### 2.3 UI / 渲染

- mermaid 流程图/状态图/甘特图/饼图/GitGraph
- 公式 tex + 渲染双显
- 暗色主题: `/?__theme=dark`
- 左右/上下布局: `config.py` LAYOUT
- live2d 装饰（默认关）
- OpenAI 图像生成

### 2.4 模块化

- 所有按钮读 `functional.py` 动态生成
- 插件在 `crazy_functions/`
- **热更新**支持
- 自定义快捷键: `core_functional.py`

自定义按钮示例（README 实读）:
```python
"超级英译中": {
    "Prefix": "请翻译把下面一段内容成中文，然后用markdown表格逐一解释专有名词：\n\n",
    "Suffix": "",
},
```

---

## 3. 配置体系（README 实读）

### 3.1 优先级

```
环境变量  >  config_private.py  >  config.py
```

**强烈建议**: 创建 `config_private.py` 覆盖配置，自动更新时不丢失。

### 3.2 安装依赖注意

> 安装依赖时请选择 `requirements.txt` 中**指定的版本**。

```sh
python -m pip install -r requirements.txt
```

Python: **3.9 ~ 3.11**

Gradio: **务必使用 requirement.txt 指定版本**（官方 Gradio 兼容问题多）。

---

## 4. 部署矩阵（README mermaid 实读）

| 方式 | 变体 |
|------|------|
| I 直接运行 | pip / Anaconda |
| II Docker | 0 全能力大镜像（cuda+latex）/ 1 仅在线模型 / 2 +ChatGLM 等本地 / 3 +latex / 4 +audio |
| IV 其他 | Windows 一键脚本、Huggingface、Sealos、WSL2、FastAPI 二级路径 |

### 4.1 可选本地模型依赖

```sh
# ChatGLM3
pip install -r request_llms/requirements_chatglm.txt
# ChatGLM4（≥24G 显存）
pip install -r request_llms/requirements_chatglm4.txt
# MOSS
pip install -r request_llms/requirements_moss.txt
```

`AVAIL_LLM_MODELS` 示例:
```python
AVAIL_LLM_MODELS = ["gpt-3.5-turbo", "api2d-gpt-3.5-turbo", "gpt-4", "api2d-gpt-4", "chatglm", "moss"]
```

---

## 5. 版本演进（README timeline 实读）

| 版本 | 关键 |
|------|------|
| 1.0 | 基础功能 |
| 2.0 | 模块化函数插件 |
| 2.2 | 插件热重载 |
| 2.5 | 自更新；token 溢出处理 |
| 3.0-3.1 | ChatGLM；多模型同时问询；api2d；多 key 负载均衡 |
| 3.4 | arxiv 翻译；latex 批改 |
| 3.44 | Azure |
| 3.46 | 实时语音 |
| 3.49 | 千帆/文心 |
| 3.50 | **虚空终端**；插件分类 |
| 3.53 | 多主题；多用户冲突 |
| 3.54 | 动态代码解释器 |
| 3.55 | 悬浮窗口+菜单栏 |
| 3.57 | GLM3/星火v3/文心v4 |
| 3.60 | **AutoGen 作为插件基石** |
| 3.70 | Mermaid 绘图 |
| 3.80 TODO | AutoGen 插件主题优化 |

---

## 6. 与 openmate 映射

| 需求 | gpt_academic 机制 | 可复用度 |
|------|------------------|----------|
| 插件热更新 | crazy_functions + 热重载 | **高** |
| 功能按钮动态生成 | functional.py 驱动 | **高** |
| Prefix/Suffix 快捷键 | core_functional.py | **高** |
| 配置三级优先级 | env > private > public | **高** |
| 多 key 负载均衡 | API_KEY 逗号分隔 | **高** |
| 临时换 key | 输入区回车 | 中 |
| 虚空终端 | NL 调度插件 | **高** |
| 多模型同时问询 | AVAIL_LLM_MODELS | **高** |
| 自译解报告 | self_analysis.md | **高** |
| Docker 分层镜像 | 5 种方案 | **高** |
| 公式双显 | tex + 渲染 | 中 |
| mermaid 渲染 | 3.70+ | 中 |
| AutoGen 插件基石 | 3.60+ | 中 |
| requirements 钉死版本 | 明确警告 | **高** |
| Python 3.9-3.11 | 区间约束 | 高 |

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9–3.11 | README |
| 配置优先级 | env > config_private.py > config.py | README |
| API_KEY | 逗号分隔多 key | README |
| AVAIL_LLM_MODELS | 可配列表 | README |
| ChatGLM4 显存 | ≥24G | README |
| 分支 | master / frontier | README |
| Docker 方案 | 0/1/2/3/4 | README |
| 最新 GUI | 2026-01-25 测试中 | README 动态 |
| Dockerfile 优化 | 2025-08-23 | README 动态 |
| Gradio | 必须 requirements 指定版 | README |
| 插件目录 | crazy_functions/ | README |
| 按钮定义 | functional.py / core_functional.py | README |
| 主题 | config.py THEME；/?__theme=dark | README |

---

## 8. 失败路径 / 边界

```
requirements 未钉版本
  → Gradio 等兼容性问题

ChatGLM 参数加载失败
  → torch cpu vs cuda；改 int4 模型

本机配置不够加载模型
  → 改 chatglm-6b-int4

浏览器翻译插件
  → 干扰前端

config_private.py 未建
  → 自动更新可能丢配置

环境变量格式错
  → 参考 docker-compose.yml 或 Wiki

ChatGLM4 <24G 显存
  → 无法加载

Windows 本地量化
  → 需 bitsandbytes-windows-webui
```

---

## 9. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **插件热更新**（crazy_functions 目录）
2. **functional.py 动态按钮生成**
3. **Prefix/Suffix 快捷操作定义**
4. **配置三级优先级**: env > private.py > public.py
5. **多 API key 逗号分隔负载均衡**
6. **虚空终端**: NL → 调度其他插件
7. **自译解报告**: 项目可自我剖析生成文档
8. **Docker 分层镜像方案**（全能力/仅在线/+latex/+audio）
9. **requirements 钉死版本 + 明确警告**
10. **公式 tex+渲染双显**

### P1

- 临时换 key（输入区）
- mermaid 渲染
- AutoGen 作为插件基石
- 多主题/布局切换

### P2

- live2d
- 语音输入
- 各学术垂直插件

---

## 10. 应避免的坑

- 勿用未钉版本的 Gradio
- ChatGLM4 需 24G+ 显存
- 优先建 config_private.py
- 浏览器翻译插件干扰
- Windows 量化需特殊 wheels
- 勿发明 crazy_functions 内部文件名

---

## 11. 源码锚点速查

```
README.md
  配置: env > config_private.py > config.py
  API_KEY: "key1,key2,key3" 多 key
  AVAIL_LLM_MODELS 列表
  插件: crazy_functions/ 热更新
  按钮: functional.py, core_functional.py Prefix/Suffix
  虚空终端: NL 调度插件
  自译解: self_analysis.md
  Docker: 方案 0-4
  Python: 3.9-3.11
  Gradio: requirements 钉死
  ChatGLM: requirements_chatglm.txt; GLM4 ≥24G
  分支: master, frontier
  版本: 1.0 → 3.80 TODO
  主题: THEME; /?__theme=dark
  布局: LAYOUT
  动态: 2026-01-25 新 GUI; 2025-08-23 Docker 优化
```

**未本轮打开**: `crazy_functions/`、`core_functional.py` 实现。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | 虚空终端 + 插件 |
| 权限/安全边界 | 2 | 桌面/个人向 |
| 容错与会话恢复 | 3 | 保存/载入对话 |
| 上下文工程 | 3 | token 溢出处理 |
| 可扩展（技能/MCP） | 5 | 插件热更新 |
| 可观测与可评测 | 2 | 弱 |
| 生产可用成熟度 | 3 | Docker 完整；个人工作台 |

**综合**: **学术场景插件化 LLM 工作台**。openmate 抄插件热更新、动态按钮、三级配置优先级与虚空终端。

---

## 13. 关键链接

- https://github.com/binary-husky/gpt_academic
- https://github.com/binary-husky/gpt_academic/wiki
- https://github.com/binary-husky/void-terminal
- 相关: `reports/autogen.md`、`reports/continue.md`、`reports/open-interpreter.md`

---

## 14. 附录 A — 三级配置优先级 openmate 规范（P0）

```
环境变量  >  config_private.py  >  config.py
```

openmate:
```
ENV / .env  >  config.local.toml  >  config.toml
```

规则:
- local 配置 gitignore
- 自动更新不覆盖 local
- 敏感 key 优先 env
- 启动打印生效来源（不打印值）

---

## 15. 附录 B — 插件热更新机制

```
crazy_functions/
  my_plugin.py
    @crazy_function_summary
    def my_plugin(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
        ...
```

- 改文件即热更新（2.2+）
- functional.py 动态生成按钮
- core_functional.py 定义 Prefix/Suffix

openmate:
```
openmate skills/
  my_skill/
    SKILL.md
    run.py
```

- watch 热加载
- UI 按钮从 SKILL.md frontmatter 生成
- Prefix/Suffix 支持

---

## 16. 附录 C — 虚空终端（NL 调度插件）

```
用户: "请调用插件翻译 PDF，地址为 https://..."
  → 虚空终端
  → 意图识别 → 选插件 → 填参 → 执行
```

openmate:
- skill router
- 意图 → skill 匹配 → 参数抽取
- 失败回落通用 chat

---

## 17. 附录 D — 多 Key 负载均衡

```python
API_KEY="openai-key1,openai-key2,azure-key3,api2d-key4"
```

- 逗号分隔
- 轮询/故障切换
- 输入区临时换 key 回车生效

openmate: 同模式；记录每 key 用量。

---

## 18. 附录 E — 失败路径明细

```
Gradio 未钉版本
  → 兼容性炸
  → openmate: 锁依赖

ChatGLM 参数加载失败
  → torch cpu/cuda；改 int4

ChatGLM4 <24G 显存
  → 无法加载

config_private 未建
  → 更新丢配置

浏览器翻译插件
  → 前端干扰

Windows 量化
  → 需 bitsandbytes-windows-webui

token 溢出
  → 自更新 + 摘要压缩（2.5+）
```

---

## 19. 附录 F — 抓取核对

| 项 | 值 | 来源 |
|----|-----|------|
| Python | 3.9-3.11 | README |
| 优先级 | env > private > public | README |
| API_KEY | 逗号分隔 | README |
| 插件目录 | crazy_functions/ | README |
| 按钮 | functional.py / core_functional.py | README |
| Docker 方案 | 0-4 | README |
| 分支 | master / frontier | README |
| 动态 | 2026-01-25 GUI；2025-08-23 Docker | README |

---

## 20. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 4 | 虚空终端 + 插件 |
| 权限安全 | 2 | 个人工作台 |
| 容错恢复 | 3 | 保存/载入对话 |
| 上下文 | 3 | token 溢出处理 |
| 可扩展 | 5 | 热更新插件 |
| 可观测 | 2 | 弱 |
| 成熟度 | 3 | Docker 完整 |

**净推荐**: openmate 抄 **热更新插件 + 动态按钮 + 三级配置 + 虚空终端** 为工作台 P0。多 key 负载均衡与 Prefix/Suffix 快捷键一并纳入；requirements 必须钉死版本；公式 tex+渲染双显提升学术可读性；Docker 分层镜像（全能力/仅在线/+latex/+audio）降低部署门槛；Python 3.9–3.11 为硬约束区间；配置优先级 env > config_private.py > config.py 必须文档化；Gradio 版本必须与 requirements 钉死一致以避免前端兼容性问题；虚空终端（NL 调度插件）可作为 openmate skill router 的参考原型；对话保存/载入 html 存档机制值得借鉴；master/frontier 双分支策略可参考。
