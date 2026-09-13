# HyperFrames 源码级调研报告（Rank 52）

> 调研对象：`heygen-com/hyperframes`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | HyperFrames |
| GitHub | https://github.com/heygen-com/hyperframes |
| Star | 约 4.93w（清单快照 49,287） |
| 主要语言 | TypeScript（Bun workspaces monorepo） |
| 许可证 | Apache-2.0 |
| 一句话定位 | **"Write HTML. Render video. Built for agents."——把普通 HTML/CSS + 可 seek 的动画时间线，在无头 Chrome 里逐帧 seek、再用 FFmpeg 编码成确定性 MP4 的开源渲染引擎，并自带 20 个教编码 agent 做视频的 skill** |

**目标用户/场景**：两类——(1) 直接用 CLI 本地渲染视频的开发者；(2) 更主要的，**被宿主编码 agent（Claude Code/Cursor/Gemini CLI/Codex）通过 skill 驱动**：用户对 agent 说"做一个 10 秒产品介绍"，agent 加载 `/hyperframes` 路由 skill，按其指导写 HTML、绑动画、lint、preview、render。是 Remotion 的开源 HTML 替代（Remotion 押 React，它押 plain HTML，对 LLM 更友好）。

**成熟度**：很高。根 `package.json` 实测是 Bun workspaces monorepo，含 `@hyperframes/{core,engine,producer,player,studio,studio-server,cli,sdk,parsers,lint,shader-transitions,aws-lambda,gcp-cloud-run,sdk-playground}` 十余个包，配套 vitest 单测、regression 测试（Git LFS 存约 240MB golden 基线 `output.mp4`）、oxlint/oxfmt、knip、lefthook、release 流水线脚本。已在 HeyGen 生产使用，tldraw/TanStack 等有采用记录（ADOPTERS.md）。

> **性质判定（重要）**：HyperFrames **不是一个自主 Agent 运行时**，它不跑 LLM 推理循环、不做规划/记忆/工具自主决策。它是**一个确定性渲染工具 + 一套给宿主 agent 的技能库**。因此本报告重点章节中，"自我进化"主要落在"技能沉淀"这一工具侧，"稳定性/高可用"主要落在渲染管线工程上；纯 Agent 语义的部分会明确标注。

---

## 2. 源码结构总览

根 `package.json`（已下载通读）确认 monorepo：`workspaces: ["packages/*"]`，ESM，`type: module`。

```
hyperframes/
├── packages/
│   ├── cli/            # `hyperframes` 命令：init/lint/check/snapshot/preview/render/publish/doctor + cloud/lambda render
│   ├── core/           # 类型、composition 解析器、生成器、linter、runtime、帧适配器（GSAP/Lottie/Three/Anime/WAAPI/TypeGPU）
│   ├── engine/         # Puppeteer 驱动无头 Chrome 的可 seek 抓帧引擎 + FFmpeg
│   ├── producer/       # 完整渲染管线：抓帧→编码→音频混音（含 golden regression 测试）
│   ├── player/         # 可嵌入的 <hyperframes-player> Web Component
│   ├── studio/         # 浏览器 composition 编辑器 UI
│   ├── studio-server/ # studio 后端
│   ├── shader-transitions/ # WebGL shader 转场
│   ├── aws-lambda/     # 分布式渲染的 Lambda SDK 与部署
│   ├── gcp-cloud-run/  # Cloud Run 渲染路径
│   └── sdk / sdk-playground
├── skills/             # 20 个发布给 agent 的 skill（+ 仓库内 .claude/.agents skills）
└── scripts/            # 发布/校验/lint-skills/skill-mirror 等工程脚本
```

**核心源码文件（HTTP 200 校验）**：
- 根 `package.json`（全文通读，锁定包清单与工程脚本）
- `README.md`（全文通读，锁定 composition 契约与渲染模型）

**入口流程**：CLI `init my-video` → 生成项目 → 作者写 `index.html`（带 `data-*` 时间轴属性）→ `preview`（浏览器 live reload）→ `render`：core 解析 composition → engine 起无头 Chrome、注入 Tailwind/GSAP、按时间戳逐帧 `seek` 并等布局稳定后抓帧 → producer 用 FFmpeg 合成 MP4 + 混音。

**代码规模**：十余个子包 + 20 个 skill，属中大型工程；本报告未逐文件读 TS 实现（网络限流），包级结构与契约据 package.json/README 确认。

---

## 3. 系统架构分析

### 编排模式：工具/技能驱动（非 Agent loop）——源码/文档确认

HyperFrames 自身**无编排循环**。它对 Agent 世界的"编排"发生在 skill 层：`/hyperframes` 是**路由 skill（router + capability map）**，对任何"make me a…"请求先做意图确认，再把任务分发给领域 workflow skill（`/product-launch-video`、`/faceless-explainer`、`/pr-to-video`、`/music-to-video`、`/slideshow` 等 10 个）。真正的"plan→write HTML→wire animation→media→lint→preview→render"生产循环是由这些 skill 教给宿主 agent、由宿主 LLM 执行的。

**Composition 契约（core，文档确认）**：用普通 HTML 描述时间线——
- `data-composition-id / data-start / data-width / data-height` 定义 stage；
- `class="clip"` + `data-start / data-duration / data-track-index` 定义片段与轨道；
- 动画用一段**暂停的** GSAP timeline（`gsap.timeline({paused:true})`，挂到 `window.__timelines.<id>`），渲染器按时间戳精确 seek。

数据流：意图(skill) → 写 HTML composition → core 解析 → engine 无头 Chrome 抓帧 → producer 编码混音 → MP4。

### 关键技术选择
- **seekable（库时钟）而非 wall-clock**：README 明确"library-clock animations are seekable, frame-accurate via adapters"，这是它能"同一输入=同一视频"的根本——不靠真实时间流逝，而靠把动画时间线设为绝对时间轴后逐帧定位。
- **适配器多 runtime**：GSAP / Lottie / Three.js / Anime.js / CSS / WAAPI / TypeGPU 七种帧适配器，作者任选动画库。

---

## 4. 功能拆解

- **CLI 工具链**（`@hyperframes/cli`）：`init/lint/check/snapshot/preview/render/publish/doctor`，外加 HeyGen 云端 `cloud render` 与 AWS Lambda `lambda deploy/render/progress`。默认非交互，专为 agent 驱动设计。
- **20 个 skill（能力库核心）**：1 个路由 `/hyperframes` + 10 个创建 workflow + 9 个领域原子能力（core/animation/keyframes/creative/media-use/cli/audio/registry/figma）。`media-use` 是"媒体 OS"——把任何媒体需求冻结成本地文件并记 ledger，缺料时用 TTS/音乐/图像模型生成。
- **Catalog 块市场**：`hyperframes add <block>` 装现成转场/字幕/图表组件。
- **Studio + Player**：浏览器编辑器 + 可嵌入 Web Component，供人预览/迭代。
- **分布式渲染**：本地 / Docker / AWS Lambda / GCP Cloud Run 四条路径，CI 可驱动。
- **Codex 插件打包**：`bun run package:codex-plugin` 从 HEAD 打出 zip 并**校验不超 Codex 100MB 上传上限**（package.json scripts + README 确认）。

---

## 5. 技术亮点与优势

1. **确定性渲染（deterministic）**：同一 HTML 输入 → 同一帧序列 → 同一 MP4，专为 CI、回归测试、自动化渲染设计。这是它相对"壁钟动画"方案的核心优势。**README 明确"Built for CI, regression tests, and automated rendering"**。
2. **零构建的 HTML 原生创作**：`index.html` 即播即用，无 React/无 bundler——对 LLM 最友好，因为 LLM 本来就会写 HTML。
3. **渐进式 skill 路由**：`/hyperframes` 路由 skill 只装核心集，按意图**按需安装**创建 workflow（`skills update <workflow>`），`init` 保持精简、绝不后台偷偷拉全套——直接控制 agent 的上下文/token 膨胀。
4. **golden 回归基线**：producer 测试用 Git LFS 存约 240MB 标准 `output.mp4`，渲染正确性靠"和基线比对"回归兜底。
5. **分布式渲染可横向**：AWS Lambda/GCP Cloud Run 把重渲染从笔记本/CI 里卸载。

---

## 6. 稳定性机制【重点】

> 本章指**渲染管线**的工程稳定性（非 Agent 运行时稳定性）。

- **确定性 + 回归基线兜底**：渲染"稳定性"的第一诉求是可复现。逐帧 seek 抓帧 + FFmpeg 固定编码 + golden `output.mp4` 基线比对（`packages/producer/test:regression`、Git LFS），任何非预期帧差都能被回归测试抓到。**文档/脚本确认**。
- **lint 在渲染前拦截**：`hyperframes lint/check/snapshot` 在真正起 Chrome/编码前校验 composition 契约（`data-*`、clip/track 合法性），把错误挡在昂贵渲染之前。`@hyperframes/lint` 独立成包。**确认**。
- **帧稳定性等待**：按 README 架构说明，每帧 seek 后"等待布局稳定再抓帧"——即抓帧前做 layout/渲染就绪同步，避免抓到半布局帧（清单 architecture_notes 亦述）。**架构确认，未读实现**。
- **产物大小/边界校验**：Codex 插件打包脚本"失败 if 超 100MB"，是显式边界校验。
- **未读源码部分（如实）**：engine 层 Puppeteer 抓帧的具体重试/超时/浏览器崩溃恢复实现，本报告未逐行读 `packages/engine` TS，标为推断。

---

## 7. 高可用机制【重点】

> 本章指渲染任务的分发与容错（非 Agent 服务高可用）。

- **渲染与编辑分离、可分布式**：本地 preview 是轻量浏览器会话；正式 render 可走 AWS Lambda（`@hyperframes/aws-lambda`）/ GCP Cloud Run，把重型无头 Chrome 渲染卸载到无服务器函数池——单台机器 Chrome 崩溃不影响整批，可水平扩。**包清单 + README 确认**。
- **非交互 CLI 设计**：CLI 默认非交互、可被 CI/agent 脚本化调用，天然适合"失败即由上层重试"的批处理。
- **资源/环境约束**：要求 Node.js 22+、FFmpeg；Docker 渲染路径封装环境，避免宿主依赖漂移。
- **局限（如实）**：未读 engine 内部的浏览器进程池/背压/队列实现；单节点渲染本身的并发模型未见源码证据，标为推断。

---

## 8. 自我进化机制【重点】

> 非 Agent 项目，无权重学习/反思回路。其"进化"体现为**技能与资产的沉淀复用**。

- **技能库即经验沉淀**：20 个 skill 把"通用 web 文档里没有的视频生产模式"固化成可复用指令，agent 每次做视频都站在同一套最佳实践上——这是符号式"经验外化"，而非在线学习。**确认**。
- **Catalog 块市场 + frame.md 设计系统**：可复用 transition/overlay/chart 块与 `frame.md`（把 web design token 反向"为镜头重写"）持续沉淀设计资产，`hyperframes add` 直接复用，避免每次从零构图。
- **media-use 资产 ledger**：媒体素材一次生成/采集、记 manifest 后跨项目复用，避免重复花钱调 TTS/图像模型——类似"记忆/缓存"。
- **未发现**：自动反思打分、自动改 skill、A/B 评测回路；skill 更新靠版本化发布（`skills add` 拉 registry blob，可能滞后 main 数小时，README 已如实标注）。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】"路由 skill + 按需加载子 skill"的渐进式披露**：照搬 `/hyperframes` 路由 skill 的设计——openmate 不要把所有能力说明一次性塞进系统提示，而是只给 agent 一张"能力地图/路由器"，命中哪个领域再动态加载该领域的详细 skill/工具说明。这是控制移动端上下文/token 的关键手段。
- **【P0】把"工具产物"做成确定性 + 回归基线**：openmate 若有任何"生成可复现产物"的能力（如导出文档、渲染卡片），学 hyperframes 的"同输入同输出 + golden 基线回归"，把正确性固化成可自动比对的测试，而非靠人眼验收。
- **【P1】昂贵动作前置 lint**：在真正调用昂贵工具（起浏览器、跑模型、渲染）之前，先用一个轻量校验阶段拦住非法输入。openmate 移动端更要省 token/省流量，"先便宜校验，再昂贵执行"应成默认。
- **【P1】能力工具默认非交互、可脚本化**：CLI/工具默认非交互、退出码/产物清晰，方便被 agent 在后台无人值守地驱动——openmate 手机端发起、Web/桌面端后台执行的多端协作尤其需要这种 headless 契约。
- **【P2】媒体/素材 ledger 复用**：生成型素材记 manifest 跨会话/跨端复用，避免重复付费生成，对移动弱网/计费敏感场景有收益。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读）**：
- 根 `package.json`（全文：Bun workspaces 子包清单、build/test/lint/scripts、依赖、codex-plugin 打包、skill 校验脚本）
- `README.md`（全文：定位、20 skill 路由表、composition `data-*` 契约、GSAP paused timeline、Puppeteer+FFmpeg 渲染模型、确定性、AWS Lambda/GCP 分布式、Git LFS 回归基线、与 Remotion 对比）

**文档/推断**：
- `packages/engine` 的 Puppeteer 抓帧超时/重试/浏览器崩溃恢复、`packages/producer` 的 FFmpeg 并发与混音实现，未逐行读 TS 源码，据 README 架构描述与包职责推断。
- skill 内部 SKILL.md 内容未逐个打开，仅据 README 路由表与目录名（`skills/`）确认存在与职责。
- 星级/活跃度来自清单快照。
