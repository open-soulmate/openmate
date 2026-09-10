/**
 * 策略-行为匹配度监控技能
 * 解决策略声明激进但行为保守的认知不协调问题
 */

const _ = require('lodash');

class StrategyBehaviorMatcher {
  constructor() {
    this.name = 'strategy-behavior-matcher';
    this.version = '1.0.0';
    this.description = '定期分析进化日志，对比声明的策略与实际行为记录，计算匹配度分数';
    this.config = {
      // 运行周期（每N个cycle运行一次）
      runInterval: 3,
      // 匹配度阈值
      matchThreshold: 60,
      // 探索性任务库
      explorationTaskLibrary: [
        '分析一个从未使用过的MCP工具描述',
        '尝试为现有技能编写一个备选实现',
        '研究一个与当前问题相关的新技术概念',
        '探索一种新的数据处理方法或算法',
        '尝试连接一个新的外部API或数据源',
        '重构一个现有技能的实现，提升其性能或可扩展性',
        '编写自动化测试用例覆盖一个未测试的功能模块',
        '分析一个复杂系统的架构，提出优化建议',
        '学习并应用一种新的设计模式',
        '探索边缘案例的处理方法'
      ],
      // 策略关键词映射
      strategyKeywords: {
        exploration: ['探索', '大胆', '尝试', '创新', '实验', '未知', '新领域'],
        efficiency: ['高效', '优化', '加速', '精简', '自动化'],
        robustness: ['稳健', '可靠', '容错', '备份', '恢复'],
        learning: ['学习', '研究', '分析', '理解', '掌握']
      }
    };
    
    // 数据源定义
    this.dataSources = {
      // 策略声明源
      strategySource: {
        // 当前策略（来自配置）
        currentStrategy: null,
        // 历史指令中的策略关键词
        historicalKeywords: [],
        // 策略声明时间戳
        timestamp: null
      },
      // 行为数据源（来自进化日志）
      behaviorSource: {
        // 自主执行比例
        autonomous_execution_ratio: 0,
        // 使用新工具次数
        new_tools_used_count: 0,
        // 探索性动作计数
        exploration_actions: 0,
        // 其他行为指标
        total_actions: 0,
        risky_attempts: 0,
        tool_switch_frequency: 0
      }
    };
    
    // 匹配度计算结果
    this.matchResult = {
      score: 0,
      reason: '',
      details: {},
      suggestedTasks: [],
      warning: null
    };
  }
  
  /**
   * 主运行函数，每N个cycle执行一次
   * @param {Object} context - 运行上下文
   * @param {number} currentCycle - 当前周期数
   * @param {Object} evolutionLog - 进化日志数据
   */
  run(context, currentCycle, evolutionLog) {
    // 检查是否满足运行周期
    if (currentCycle % this.config.runInterval !== 0) {
      return {
        status: 'skip',
        message: `当前周期(${currentCycle})不是运行周期，需在每${this.config.runInterval}个周期运行`
      };
    }
    
    try {
      // 1. 提取策略声明数据
      this.extractStrategyData(context);
      
      // 2. 提取行为数据
      this.extractBehaviorData(evolutionLog);
      
      // 3. 计算匹配度分数
      const matchScore = this.calculateMatchScore();
      
      // 4. 生成匹配理由
      const matchReason = this.generateMatchReason(matchScore);
      
      // 5. 处理低分数情况
      if (matchScore < this.config.matchThreshold) {
        // 从探索性任务库中抽取任务
        const suggestedTasks = this.selectExplorationTasks(matchScore);
        
        this.matchResult = {
          score: matchScore,
          reason: matchReason,
          details: {
            strategyKeywords: this.dataSources.strategySource.historicalKeywords,
            behaviorMetrics: this.dataSources.behaviorSource
          },
          suggestedTasks: suggestedTasks,
          warning: `匹配度低于阈值(${this.config.matchThreshold})，建议执行探索性任务以提升策略-行为一致性`
        };
      } else {
        this.matchResult = {
          score: matchScore,
          reason: matchReason,
          details: {
            strategyKeywords: this.dataSources.strategySource.historicalKeywords,
            behaviorMetrics: this.dataSources.behaviorSource
          },
          suggestedTasks: [],
          warning: null
        };
      }
      
      return {
        status: 'success',
        result: this.matchResult,
        message: `策略-行为匹配度分析完成，得分: ${matchScore}/100`
      };
      
    } catch (error) {
      return {
        status: 'error',
        message: `策略-行为匹配度分析失败: ${error.message}`,
        error: error
      };
    }
  }
  
  /**
   * 提取策略声明数据
   */