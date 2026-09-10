/**
 * Strategy-Behavior Matcher Skill
 * 策略-行为匹配度监控技能
 * 
 * 解决"策略声明激进，但行为保守"的认知不协调问题
 * 定期分析进化日志，对比声明的策略与实际行为，计算匹配度分数
 * 当分数低于阈值时，生成探索性任务建议注入下一个cycle
 */

const SKILL_CONFIG = {
  name: 'strategy_behavior_matcher',
  version: '1.0.0',
  description: '策略-行为匹配度监控技能',
  checkInterval: 3,
  matchThreshold: 60,
  suggestionsCount: 2
};

const STRATEGY_KEYWORDS = {
  exploration: ['探索', '尝试', '试验', '探索性', 'experiment', 'explore'],
  boldness: ['大胆', '激进', '突破', '冒险', 'bold', 'aggressive'],
  innovation: ['创新', '新方法', '新工具', '创新性', 'innovate', 'creative'],
  growth: ['成长', '学习', '进化', '提升', 'grow', 'learn', 'evolve']
};

const EXPLORATION_TASKS = [
  { title: '探索未使用MCP工具', description: '分析一个从未使用过的MCP工具描述，了解其功能和潜在应用场景' },
  { title: '编写备选实现', description: '尝试为现有技能编写一个备选实现方案，比较不同实现的优劣' },
  { title: '研究新技术概念', description: '研究一个与当前问题相关的新技术概念，并评估其应用价值' },
  { title: '探索未知API', description: '查找并尝试一个之前未接触过的API或服务接口' },
  { title: '系统边界探索', description: '主动探索系统能力边界，记录发现的限制和潜在突破点' },
  { title: '配置实验', description: '对一个现有功能进行不同的配置组合实验，记录结果差异' },
  { title: '日志模式分析', description: '深入分析系统日志，发现之前未注意到的模式或异常' },
  { title: '替代方案调研', description: '为当前使用的核心组件调研至少两个替代方案' },
  { title: '跨领域知识应用', description: '从其他领域借鉴一个方法论，尝试应用到当前工作流中' },
  { title: '失败案例研究', description: '回顾并分析最近一次未达预期的尝试，提取改进点' }
];

class StrategyBehaviorMatcher {
  constructor(config = {}) {
    this.config = { ...SKILL_CONFIG, ...config };
    this.cycleCounter = 0;
    this.lastMatchScore = null;
    this.history = [];
  }

  async execute(context = {}) {
    this.cycleCounter++;
    
    if (this.cycleCounter % this.config.checkInterval !== 0) {
      return { triggered: false, reason: `等待下次检查，还需 ${this.config.checkInterval - (this.cycleCounter % this.config.checkInterval)} 个cycle` };
    }

    const strategy = this.extractStrategy(context);
    const behaviorData = this.extractBehaviorData(context);
    const matchResult = this.calculateMatchScore(strategy, behaviorData);
    
    this.lastMatchScore = matchResult.score;
    
    const report = this.generateReport(strategy, behaviorData, matchResult);
    
    if (matchResult.score < this.config.matchThreshold) {
      report.suggestedTasks = this.generateExplorationTasks();
      report.actionRequired = true;
      report.priority = matchResult.score < 40 ? 'high' : 'medium';
    }

    this.history.push({
      cycle: this.cycleCounter,
      score: matchResult.score,
      timestamp: new Date().toISOString()
    });

    return report;
  }

  extractStrategy(context) {
    const sources = {
      explicit: null,
      keywords: [],
      category: 'unknown'
    };

    if (context.config?.current_strategy) {
      sources.explicit = context.config.current_strategy;
    } else if (context.config?.strategy) {
      sources.explicit = context.config.strategy;
    }

    if (!sources.explicit && context.instructionHistory) {
      const recentInstructions = context.instructionHistory.slice(-5);
      sources.explicit = recentInstructions
        .map(i => i.content || i.instruction || '')
        .join(' ');
    }

    const textToAnalyze = sources.explicit || '';
    
    for (const [category, keywords] of Object.entries(STRATEGY_KEYWORDS)) {
      const matched = keywords.filter(kw => textToAnalyze.toLowerCase().includes(kw.toLowerCase()));
      if (matched.length > 0) {
        sources.keywords.push(...matched);
        sources.category = category;
      }
    }

    if (sources.keywords.length === 0) {
      sources.keywords = ['探索', '成长'];
      sources.category = 'exploration';
      sources.inferred = true;
    }

    return sources;
  }

  extractBehaviorData(context) {