# Cursor CLI（#84, 8k★标称）功能研究 —— ❌闭源，无法源码研究
研究时间：2026-09-16 夜间cron轮

## 结论
- **anysphere/cursor-cli 在GitHub上不存在**（codeload两分支均404；anysphere组织页无此仓库）
- Cursor CLI为**闭源产品**：`curl https://cursor.com/install -fsS | bash` 安装，配合Cursor订阅/API key
- CSV里"#84 anysphere/cursor-cli 8k★"为失实条目（可能是把第三方仿制仓库或期望值写入）
- GitHub上同名仓库均为第三方SDK仿制（pivanov/cursor-cli 5★、EroPerez/cursor-cli 1★，基于@cursor SDK），不代表官方CLI

## 官方文档可见的产品特性（仅文档级，未验证源码）
| 功能 | OpenMate | OpenSoul | 差距 |
|---|---|---|---|
| Headless CLI（脚本/CI中运行agent，structured输出） | 无CLI | — | Hermes有等价物 |
| Shell Mode（agent内直接shell+安全检查+输出展示） | — | terminal工具 | 已有 |
| GitHub Actions集成 | 无 | 无 | 可做：OpenSoul agent作为CI步骤 |
| /model切换多frontier模型（Auto/Grok/Opus/GPT/Gemini/Composer） | 无 | gland/router | 部分有（OpenSoul是后端路由，缺会话内手动切换UI） |
| /命令·@文件·! shell 三种前缀语法 | OpenMate聊天框无 | — | 部分有（Hermes有/命令） |
| 自托管runner模板（anysphere/k8s-workers：一次性Pod+warm-idle池；aws-lambda-workers/cloudflare-workers模板） | 无 | 无 | **文档级亮点**：agent执行器的serverless自托管池模式 |

## 备注
- 下轮无需重试下载；如需Cursor Agent行为对照，用文档+第三方SDK仿制仓库即可
- 行业信号：头部coding agent（Cursor/Claude Code）核心闭源，开源对标是opencode/cline/Roo-Code（均已研究）
