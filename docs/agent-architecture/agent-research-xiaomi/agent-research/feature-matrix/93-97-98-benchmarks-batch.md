# 基准线三件套 功能研究 — Mind2Web(#93)/WebArena(#97)/AgentBench(#98)

> 文档级（web_extract README，未clone——均为评测基准而非agent产品，对OpenMate/OpenSoul的价值在**评估方法论**）。
> CSV条目核对：Mind2Web正确仓库=OSU-NLP-Group/Mind2Web（1k★，CSV若有出入以此为准）；WebArena=web-arena-x/webarena（1.6k★）；AgentBench=THUDM/AgentBench（3.7k★）

## 功能清单（对OpenSoul的可借鉴点）

| # | 功能/方法 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **AgentBench FC版：function-calling风格任务+AgentRL端到端RL框架**（2025.10新增，多任务多轮RL训练agent） | 无 | 无 | **完全没有** | 行业信号：agent评测从"prompt打分"转向"RL训练闭环"。OpenSoul远期参考 |
| 2 | **全容器化任务环境**（每个任务一个docker镜像+内存/启动时间预算表：webshop 15G/3min, db <500M/20s） | 无 | benchmark/无容器化 | **完全没有** | OpenSoul benchmark升级方向：**任务=docker镜像+资源预算**，与E2B/沙箱线合流 |
| 3 | **WebArena可自托管web环境**（812任务实例+环境重置协议+执行轨迹公开） | 无 | 无 | **完全没有** | "环境重置"是评估可复现的前提——OpenSoul评估闭环需"环境快照→跑→重置" |
| 4 | **PromptConstructor类设计**（prompt构造器抽象成类，CoT/ReAct风格可换） | 无 | cortex prompt硬编码 | **部分有** | prompt组装策略对象化，与deepagents harness profiles互证 |
| 5 | **Mind2Web数据集+SeeAct**（GPT-4V网页agent一键部署；Multimodal-Mind2Web=HTML+截图配对数据集；Online-Mind2Web活网站版） | 无 | 无 | **完全没有** | 多模态网页agent训练数据集——OpenSoul浏览器自动化线的评测素材 |
| 6 | **轨迹评测法**（WebArena公开execution trajectories做参照；AgentBench逐环境指标） | 无 | trajectory扁平事件表 | **部分有** | trajectory升级后可对齐"标准轨迹格式"接入公开基准 |

## 源码亮点
- AgentBench 2025版全面function-calling化+AgentRL——**工具调用能力已成为评测一等公民**（与ToolBench win_rate互证）
- WebArena的minimal_example.py（注释完备的环境搭建脚本）是"评测环境工程化"范本

## 可复用设计
1. **评估环境=容器+资源预算+重置协议**三要素，OpenSoul benchmark/照此定义接口
2. PromptConstructor抽象：cortex的prompt组装抽成可替换策略类
3. 行业结论：**OpenSoul"5维自评"与行业标准评测（容器化任务+轨迹对比+RL闭环）差距是代差**，与langfuse评估闭环发现合读——先落LLM裁判+数据集回归，再谈基准对齐
