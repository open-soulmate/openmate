# GPT Academic

## 概述

GPT Academic 是一个学术AI助手。

**仓库**: https://github.com/binary-husky/gpt_academic | **语言**: Python

## 核心架构

> **项目**: [binary-husky/gpt_academic](https://github.com/binary-husky/gpt_academic)
> **定位**: 为GPT/GLM等LLM提供实用化交互接口，特别优化论文阅读/润色/写作体验
> **Stars**: 60k+ | **语言**: Python | **框架**: Gradio
> **分析时间**: 2026-09-13

GPT Academic 是一个基于 Gradio 的 Web 应用，核心设计理念是**"函数插件化 + 多模型桥接"**。整个系统围绕一个中心化的 `main.py` 启动文件展开，通过 `config.py` 管理配置，`toolbox.py` 提供工具函数，`request_llms/bridge_all.py` 统一调度所有 LLM 模型，`crazy_functions/` 目录承载丰富的函数插件。

架构层次如下：

[详见源码]

`main.py` 是唯一的入口文件，采用**单文件大函数**模式。启动流程：

1. 校验 Gradio 版本（锁定 `3.32.15`，确保一致性）
2. 通过 `get_conf()` 读取所有配置项（代理、端口、模型、主题等）
3. 加载 `core_functional.py` 获取基础功能按钮定义
4. 加载 `crazy_functional.py` 获取高级函数插件定义
5. 调用 `check_proxy()` 检测代理可用性
6. 使用 `gr.Blocks` 构建整个 UI 布局

配置读取优先级为 **环境变量 > config_private.py > config.py**，这种三层配置机制让用户可以在不修改源码的情况下自定义行为，同时支持 Docker 环境变量注入。

`request_llms/bridge_all.py` 是整个模型调度的核心，采用**注册表模式**：

```python
model_info = {
    "gpt-4o": {
        "fn_with_ui": chatgpt_ui,          # 有UI的流式调用
        "fn_without_ui": chatgpt_noui,     # 无UI的批量调用
        "endpoint": openai_endpoint,        # API端点
        "max_token": 128000,                # 最大token
        "tokenizer": tokenizer_gpt4,        # tokenizer
        "token_cnt": get_token_num_gpt4,    # token计数函数
    },
...

每个模型条目包含两个核心函数：
- **`fn_with_ui`**：用于普通对话，支持流式输出和前端交互
- **`fn_without_ui`**：用于函数插件中的批量调用，支持多线程

支持的模型涵盖：OpenAI GPT系列、Azure OpenAI、智谱GLM、百度千帆/文心一言、阿里通义千问、讯飞星火、DeepSeek、Google Gemini、本地ChatGLM/MOSS/RWKV等。每个模型有独立的 `bridge_*.py` 文件实现适配。

基于 Gradio 3.32.15 构建，采用**左右双栏**或**上下布局**可切换设计：

- 左/上栏：`gr.Chatbot` 对话区域
- 右/下栏：输入区 + 基础功能按钮 + 函数插件下拉菜单
- 浮动菜单：`gui_floating_menu.py` 定义的次级输入区
- 工具栏：模型选择、主题切换、暗色模式、字体选择
- 高级插件二级菜单：`gui_advanced_plugin_class.py` 处理插件参数交互

前端通过 `themes/theme.py` 管理主题系统，支持暗色模式（URL 加 `?__theme=dark`）。`format_io` 函数被挂载到 `gr.Chatbot.postprocess` 上，实现 Markdown 渲染、公式双显（TeX + 渲染）、代码高亮、Mermaid 图表渲染等。

`toolbox.py` 是核心工具库，提供：

- **`format_io()`**：后处理聊天输出，处理 Markdown、LaTeX、代码块
- **`find_free_port()`**：自动发现可用端口
- **`on_file_uploaded()`**：文件上传回调处理
- **`on_report_genera

## 关键技术

- https://github.com/binary-husky/gpt_academic
- https://github.com/binary-husky/gpt_academic/wiki
- https://github.com/binary-husky/void-terminal
- 相关: `reports/autogen.md`、`reports/continue.md`、`reports/open-interpreter.md`

[详见源码]

- watch 热加载
- UI 按钮从 SKILL.md frontmatter 生成
- Prefix/Suffix 支持

---

## 对openmate的启示

> 仓库: https://github.com/binary-husky/gpt_academic  
> 抓取通道: cdn.jsdelivr.net/gh/binary-husky/gpt_academic@master/README.md  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供学术插件体系 / 多模型 / 热更新 / 虚空终端 借鉴

---

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

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（74-gpt-academic.md）
- MiMo报告（gpt-academic-l1.md）
- MiMo卡片（gpt-academic.md）
