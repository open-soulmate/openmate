/**
 * 策略-行为匹配度监控技能
 * 用于检测策略声明与实际行为之间的不协调问题
 * 定期分析进化日志，计算匹配度分数，并生成改进建议
 */

class StrategyBehaviorMatcher {
  constructor() {
    this.skillName = 'strategy-behavior-matcher';
    this.description = '策略-行为匹配度监控技能';
    this.version = '1.0.0';
    
    // 配置参数
    this.executionInterval = 3; // 每3个cycle执行一次
    this.matchThreshold = 60;   // 匹配度阈值，低于此分数触发建议
    
    // 策略关键词库
    this.strategyKeywords = {
      highExploration: ['大胆尝试', '高探索', '创新', '实验', '测试新方法'],
      aggressive: ['激进', '冒险', '突破', '挑战'],
      growth: ['增长', '扩展', '进化', '提升']
    };
    
    // 探索性任务库
    this.explorationTasks = [
      '分析一个从未使用过的MCP工具描述',
      '尝试为现有技能编写一个备选实现',
      '研究一个与当前问题相关的新技术概念',
      '尝试使用不同的数据处理方法解决同一问题',
      '分析历史任务，找出可优化的步骤',
      '研究一种新的算法或技术框架',
      '尝试将两个现有功能组合创建新功能',
      '分析用户行为模式，提出改进建议',
      '测试系统在边缘情况下的表现',
      '研究竞争对手的解决方案，提出改进建议'
    ];
  }

  /**
   * 获取技能元信息
   * @returns {Object} 技能描述信息
   */
  getMetadata() {
    return {
      name: this.skillName,
      description: this.description,
      version: this.version,
      executionInterval: this.executionInterval,
      dependencies: ['evolution-log', 'autonomous-executor']
    };
  }

  /**
   * 执行策略-行为匹配分析
   * @param {Object} context - 执行上下文，包含进化日志等数据
   * @returns {Object} 匹配度报告和建议
   */
  async execute(context) {
    try {
      // 检查是否到达执行间隔
      if (!this.shouldExecute(context.cycleNumber)) {
        return { shouldRun: false };
      }

      // 1. 获取策略声明源
      const strategyDeclaration = await this.getStrategyDeclaration(context);
      
      // 2. 获取行为数据源
      const behaviorData = await this.getBehaviorData(context);
      
      // 3. 计算匹配度分数
      const matchResult = this.calculateMatchScore(strategyDeclaration, behaviorData);
      
      // 4. 生成报告
      const report = this.generateReport(strategyDeclaration, behaviorData, matchResult);
      
      // 5. 如果低于阈值，生成探索性任务建议
      let explorationTask = null;
      if (matchResult.score < this.matchThreshold) {
        explorationTask = this.selectExplorationTask(strategyDeclaration);
      }
      
      return {
        shouldRun: true,
        cycleNumber: context.cycleNumber,
        strategyDeclaration: strategyDeclaration,
        behaviorData: behaviorData,
        matchResult: matchResult,
        report: report,
        explorationTask: explorationTask,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`策略-行为匹配分析失败: ${error.message}`);
      return {
        shouldRun: true,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查是否应该执行（基于执行间隔）
   * @param {number} currentCycle - 当前cycle编号
   * @returns {boolean} 是否应该执行
   */
  shouldExecute(currentCycle) {
    return currentCycle % this.executionInterval === 0;
  }

  /**
   * 获取策略声明源
   * @param {Object} context - 上下文
   * @returns {Object} 策略声明信息
   */
  async getStrategyDeclaration(context) {
    // 首先尝试从配置中获取
    if (context.config && context.config.current_strategy) {
      return {
        source: 'config',
        strategyText: context.config.current_strategy,
        keywords: this.extractKeywords(context.config.current_strategy)
      };
    }
    
    // 如果没有配置，从历史指令中提取
    if (context.historicalInstructions && context.historicalInstructions.length > 0) {
      const recentInstructions = context.historicalInstructions.slice(-5); // 最近5条指令
      const allText = recentInstructions.join(' ');
      
      return {
        source: 'historical_instructions',
        strategyText: allText,
        keywords: this.extractKeywords(allText),
        instructionCount: recentInstructions.length
      };
    }
    
    // 默认策略
    return {
      source: 'default',
      strategyText: '保持稳定进化，适度探索',
      keywords: ['稳定', '进化', '探索']
    };
  }

  /**
   * 从文本中提取策略关键词
   * @param {string} text - 策略文本
   * @returns {Object} 提取的关键词分类
   */
  extractKeywords(text) {
    const extracted = {
      highExploration: [],
      aggressive: [],
      growth: []
    };
    
    if (!text) return extracted;
    
    // 检查各关键词类别
    for (const [category, keywords] of Object.entries(this.strategyKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          extracted[category].push(keyword);
        }
      }
    }
    
    return extracted;
  }

  /**
   * 获取行为数据源
   * @param {Object} context - 上下文