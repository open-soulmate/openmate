# 32-GroupCollab-v1.0-群组多Agent协作规范

**版本**: v1.0
**创建时间**: 2026-09-12
**依据**: "Towards a Science of Scaling Agent Systems" (Kim et al., Nature Machine Intelligence, 2026)
**arXiv**: 2512.08296
**GitHub**: https://github.com/ybkim95/agent-scaling

---

## 一、适用范围

本规范适用于**群组场景**下多Agent协作任务的架构选型和设计原则。

**不适用场景**：
- 单用户对话（天然单Agent）
- dna_evolution自我进化（单strand独立执行，非多Agent协作）
- 简单问答/单次插件调用

## 二、五种标准架构

| 架构 | 定义 | 通信开销 | 错误放大 |
|------|------|---------|---------|
| Single-Agent (SAS) | 单一Agent顺序执行，统一记忆流 | 无 | 基线 |
| Independent | 多Agent并行，无通信，最后拼接 | 最小 | **17.2x** |
| Centralized | 中心Orchestrator协调，子Agent不互相通信 | 中等 | **4.4x** |
| Decentralized | 点对点网状通信，协商达成共识 | 高 | 中等 |
| Hybrid | 中心Orchestrator + 部分点对点 | 最高 | 低 |

## 三、三大核心原则

### 原则1：能力饱和临界点（45%阈值）

当单Agent完成该任务的成功率 ≥45%时，继续增加多Agent协作，收益快速饱和甚至性能下降。

- β = -0.404, p < 0.001
- 统计验证：cluster-robust inference p=0.004, Holm-Bonferroni p_Holm=0.018

**工程含义**：基线成功率>45%的任务直接用单Agent，省token省协调开销。

### 原则2：工具-协作权衡（β=-0.267, p<0.001）

越是大量调用工具的任务，多Agent的负面开销越大。工具越多，协调"税"越重。

**工程含义**：群组内多个Agent同时调API时，减少Agent数量或改用单Agent。

### 原则3：拓扑决定错误传播

- Independent：错误放大17.2x（无校验，错误雪崩）
- Centralized：仅4.4x放大（Orchestrator做校验、回滚、拦截）

**工程含义**：群组Orchestrator必须做子结果校验，拦截错误传播。

## 四、群组任务架构选型规则

| 群组场景 | 推荐架构 | 性能变化 | 理由 |
|---------|---------|---------|------|
| 多人同时分析不同文档 | Centralized | +80.8% | 高可分解+并行 |
| 动态网页协作浏览 | Decentralized | +9.2% | 高熵搜索空间 |
| 一个Agent输出作为另一个输入 | 单Agent | 多Agent -39%~-70% | 顺序依赖 |
| 群组内多个Agent同时调API | 减少Agent或单Agent | 协调开销β=-0.267 | 工具密集型 |
| 简单问答/单次插件调用 | 单Agent | 基线>45%时多Agent为负 | 能力饱和 |

## 五、预测模型

混合效应模型：R²=0.524，87%准确率预测最优架构。

输入特征：
- 协调效率 E_c（成功率/开销比）
- 错误放大系数 A_e
- 冗余度 ρ
- 工具数量 T
- 单Agent基线成功率 P_SA
- Agent数量 n

工程应用：群组收到任务时，先评估可分解性和工具调用量，用模型预测最优架构。

## 六、群组Orchestrator设计原则

1. **中心化验证瓶颈**：Orchestrator必须做子结果校验，错误放大从17.2x降到4.4x
2. **消息密度控制**：最优c*≈0.39消息/轮，超过后收益饱和（Hybrid 515%开销 vs Centralized 285%）
3. **Turn数量幂律增长**：T = 2.72×(n+0.5)^1.724（R²=0.974），每增一个Agent通信开销超线性增长
4. **错误吸收机制**：Centralized/Hybrid通过Orchestrator交叉验证，平均22.7%错误减少（95% CI: [20.1%, 25.3%]）

## 七、群组成本控制

论文数据：多Agent消耗15x更多token（Anthropic报告）。

控制措施：
1. 按任务复杂度动态启停Agent数量
2. 基线成功率>45%的任务直接用单Agent
3. 监控每轮消息密度，超过0.39消息/轮时收敛
4. 优先Centralized而非Hybrid（Hybrid开销515% vs Centralized 285%，性能差异不显著 p=0.542）

## 八、论文局限

1. 离线任务评测，没有BS长连接、多用户并发、在线滚动升级场景
2. 只评估任务成功率，不评估系统稳定性、内存泄漏、长时间运行故障
3. 没有Agent自我修改代码（自进化）场景
4. 六个benchmark可能不能覆盖所有agentic任务特性
5. 模型家族差异大（OpenAI/Gemini/Anthropic协调机制不同），跨模型泛化需验证

## 九、引用

```bibtex
@article{kim2025towards,
  title={Beyond more agents: quantifying when multi-agent collaboration benefits large language model agents},
  author={Kim, Yubin and Gu, Ken and Park, Chanwoo and Park, Chunjong and Schmidgall, Samuel and Heydari, A Ali and Yan, Yao and Zhang, Zhihan and Zhuang, Yuchen and Liu, Yun and others},
  journal={Nature Machine Intelligence},
  year={2026},
  doi={10.1038/s42256-026-01268-y}
}
```
