/**
 * 策略-行为匹配度监控技能 (Strategy-Behavior Matcher Skill)
 * 
 * 解决"策略声明激进，但行为保守"的认知不协调问题。
 * 定期分析进化日志，对比声明的策略与实际行为，计算匹配度分数，
 * 并在匹配度不足时生成探索性任务建议。
 */

const SkillBase = require('./skill_base');

// ========== 常量配置 ==========
const DEFAULT_CONFIG = {
  executionInterval: 3,           // 每隔多少个cycle执行一次
  matchThreshold: 60,             // 匹配度分数阈值（0-100）
  lookbackCycles: 10,             // 回溯分析的cycle数量
  minDataPoints: 2,               // 最少需要的数据点数量才进行评估

  // 策略关键词与对应行为指标的映射
  strategyBehaviorMap: {
    exploration: {
      keywords: ['探索', '大胆尝试', '高探索', '创新', '尝试新方法', '探索性', '冒险', '实验', '突破'],
      behaviorIndicators: ['new_tools_used_count', 'exploration_actions', 'autonomous_execution_ratio'],
      weights: {
        new_tools_used_count: 0.4,
        exploration_actions: 0.35,
        autonomous_execution_ratio: 0.25
      },
      thresholds: {
        new_tools_used_count: { low: 0, mid: 2, high: 5 },
        exploration_actions: { low: 1, mid: 3, high: 7 },
        autonomous_execution_ratio: { low: 0.2, mid: 0.5, high: 0.8 }
      }
    },
    optimization: {
      keywords: ['优化', '提升', '改进', '高效', '精简', '加速'],
      behaviorIndicators: ['optimization_tasks_count', 'performance_improvements', 'refactor_actions'],
      weights: {
        optimization_tasks_count: 0.4,
        performance_improvements: 0.35,
        refactor_actions: 0.25
      },
      thresholds: {
        optimization_tasks_count: { low: 0, mid: 2, high: 5 },
        performance_improvements: { low: 0, mid: 1, high: 3 },
        refactor_actions: { low: 0, mid: 1, high: 3 }
      }
    },
    robustness: {
      keywords: ['稳健', '可靠', '稳定性', '容错', '防御', '安全'],
      behaviorIndicators: ['error_handling_additions', 'test_coverage_actions', 'fallback_implementations'],
      weights: {
        error_handling_additions: 0.35,
        test_coverage_actions: 0.35,
        fallback_implementations: 0.3
      },
      thresholds: {
        error_handling_additions: { low: 0, mid: 1, high: 3 },
        test_coverage_actions: { low: 0, mid: 2, high: 5 },
        fallback_implementations: { low: 0, mid: 1, high: 3 }
      }
    },
    learning: {
      keywords: ['学习', '研究', '深入理解', '掌握', '知识', '技能提升'],
      behaviorIndicators: ['new_concepts_learned', 'documentation_reads', 'skill_practice_count'],
      weights: {
        new_concepts_learned: 0.4,
        documentation_reads: 0.3,
        skill_practice_count: 0.3
      },
      thresholds: {
        new_concepts_learned: { low: 0, mid: 1, high: 3 },
        documentation_reads: { low: 0, mid: 2, high: 5 },
        skill_practice_count: { low: 0, mid: 2, high: 5 }
      }
    }
  },

  // 探索性任务库
  explorationTaskLibrary: {
    general: [
      '分析一个从未使用过的MCP工具描述，评估其在当前工作流中的潜在价值',
      '尝试为现有技能编写一个备选实现，探索不同的算法或架构思路',
      '研究一个与当前问题相关的新技术概念，并在日志中记录学习笔记',
      '选择一个最近重复执行的任务，设计一个全新的自动化方案',
      '查阅系统中尚未探索过的模块或接口，记录其功能和用途'
    ],
    exploration: [
      '从MCP工具列表中随机选择一个未使用过的工具，完成一个小型试验任务',
      '尝试将两个现有技能组合使用，探索协同效应',
      '为当前项目中的一个瓶颈问题设计三种不同的解决路径',
      '搜索并评估一个可能提升当前工作流效率的新工具或方法论',
      '编写一个最小可行的原型来验证一个新的技术假设'
    ],
    optimization: [
      '对当前最耗时的操作进行性能剖析，找出优化机会',
      '重构一个代码重复率最高的模块，降低复杂度',
      '设计并实现一个缓存策略来减少重复计算',
      '分析近期日志中的错误模式，制定预防性优化方案'
    ],
    robustness: [
      '为一个核心技能添加完整的错误处理和降级机制',
      '编写针对边界条件的测试用例并验证系统行为',
      '设计一个故障恢复流程，确保系统在异常情况下的自愈能力',
      '审查并加固一个关键数据流的输入验证逻辑'
    ],
    learning: [
      '深入研究一个你使用过但不完全理解的工具的完整文档',
      '尝试理解一个新领域（如分布式系统/机器学习/密码学）的核心概念',
      '阅读一个优秀开源项目的架构设计，总结可借鉴的模式',
      '为最近学到的一个新概念创建一份简明的学习笔记'
    ]
  }
};

// ========== 策略-行为匹配度监控技能 ==========
class StrategyBehaviorMatcher extends SkillBase {

  static metadata = {
    id: 'strategy_behavior_matcher',
    name: '策略-行为匹配度监控',
    version: '1.0.0',
    description: '监控声明策略与实际行为的匹配度，解决认知不协调问题',
    category: 'meta-analysis',
    requiredFields: ['evolutionLogs'],
    optionalFields: ['currentStrategy', 'userInstructionHistory', 'pluginLogs']
  };

  constructor(config = {}) {
    super(config);
    this.config = this._mergeConfig(DEFAULT_CONFIG, config);
    this.cycleCounter = 0;
    this.lastExecutionCycle = 0;
    this.matchHistory = [];
    this.strategyKeywordsCache = null;
  }

  /**
   * 技能主入口 - 决定是否在当前cycle执行分析
   */
  async execute(context) {
    const { currentCycle, evolutionLogs, currentStrategy, userInstructionHistory, pluginLogs } = context;

    this.cycleCounter++;

    // 检查是否到达执行间隔
    if (!this._shouldExecute(currentCycle)) {
      return {
        executed: false,
        reason: `等待执行间隔，当前周期: ${this.cycleCounter}，下次执行: 第${this.lastExecutionCycle + this.config.executionInterval}周期`,
        nextExecution: this.lastExecutionCycle + this.config.executionInterval
      };
    }

    this.lastExecutionCycle = currentCycle;

    try {
      // 1. 提取策略声明
      const declaredStrategies = this._extractDeclaredStrategies(
        currentStrategy,
        userInstructionHistory
      );

      // 2. 提取行为数据
      const behaviorData = this._extractBehaviorData(evolutionLogs, pluginLogs, context);

      // 3. 检查数据充足性
      if (!this._hasEnoughData(declaredStrategies, behaviorData)) {
        return {
          executed: true,
          status: 'insufficient_data',
          message: '数据不足，无法进行有效匹配分析。需要更多cycle积累行为数据。',
          declaredStrategies,
          behaviorDataSummary: behaviorData
        };
      }

      // 4. 计算匹配度
      const matchResult = this._calculateMatchScore(declaredStrategies, behaviorData);

      // 5. 生成报告和建议
      const report = this._generateReport(matchResult, declaredStrategies, behaviorData);

      // 6. 如果匹配度低，生成探索性任务建议