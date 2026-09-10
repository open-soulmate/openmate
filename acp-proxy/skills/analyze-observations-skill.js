/**
 * analyze-observations-skill.js
 * 核心技能：分析未处理的观察记录，生成结构化分析报告
 * 
 * @module analyze-observations-skill
 * @version 1.0.0
 * @author MiMo Team
 * @license MIT
 */

// 导入依赖的记忆插件（假设已通过依赖注入或模块系统可用）
// 在实际环境中，这将通过技能加载系统自动注入
const memoryPlugin = require('../plugins/memory-plugin');

// 常量定义
const STATUS = {
  UNANALYZED: 'unanalyzed',
  ANALYZED: 'analyzed'
};

const MEMORY_TYPE = {
  OBSERVATION: 'observation',
  ANALYSIS_REPORT: 'analysis_report'
};

const ANALYSIS_CONFIG = {
  MAX_BATCH_SIZE: 50,
  RECENT_COUNT: 20, // 用于统计分析的最近记录数
  CONFIDENCE_THRESHOLD: 0.6
};

/**
 * 统计分析模块 - 第一个微小工具创造的实例
 */
const statisticalAnalyzer = {
  /**
   * 计算观察记录的类型分布
   * @param {Array} observations - 观察记录数组
   * @returns {Object} 类型分布统计
   */
  analyzeTypeDistribution(observations) {
    const distribution = {};
    let totalCount = observations.length;
    
    observations.forEach(obs => {
      const type = obs.type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    
    // 计算百分比
    Object.keys(distribution).forEach(type => {
      distribution[type] = {
        count: distribution[type],
        percentage: ((distribution[type] / totalCount) * 100).toFixed(2) + '%'
      };
    });
    
    return {
      totalCount,
      distribution,
      timestamp: new Date().toISOString()
    };
  },
  
  /**
   * 识别常见模式
   * @param {Array} observations - 观察记录数组
   * @returns {Array} 识别出的模式
   */
  identifyPatterns(observations) {
    const patterns = [];
    
    // 基于关键词的模式识别
    const patternRules = [
      {
        keywords: ['error', 'failure', 'bug', 'exception'],
        type: 'error_pattern',
        goal: '错误自修复'
      },
      {
        keywords: ['performance', 'slow', 'optimization', 'latency'],
        type: 'performance_pattern',
        goal: '性能优化'
      },
      {
        keywords: ['security', 'vulnerability', 'attack', 'breach'],
        type: 'security_pattern',
        goal: '安全加固'
      },
      {
        keywords: ['user', 'feedback', 'complaint', 'suggestion'],
        type: 'user_feedback_pattern',
        goal: '用户体验改善'
      }
    ];
    
    observations.forEach(obs => {
      const content = (obs.content || '').toLowerCase();
      
      patternRules.forEach(rule => {
        const matchCount = rule.keywords.filter(keyword => 
          content.includes(keyword)
        ).length;
        
        if (matchCount >= 2) { // 至少匹配2个关键词
          patterns.push({
            observationId: obs.id,
            patternType: rule.type,
            matchedKeywords: rule.keywords.filter(keyword => content.includes(keyword)),
            relevanceToGoal: rule.goal,
            confidence: Math.min(1, matchCount / rule.keywords.length)
          });
        }
      });
    });
    
    return patterns;
  }
};

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
function analyzeSingleObservation(observation) {
  try {
    const content = observation.content || '';
    
    // 简单的情感和意图分析
    const sentimentAnalysis = {
      hasNegative: /error|fail|wrong|bug|broken|issue/i.test(content),
      hasPositive: /good|success|improve|optimize|fix/i.test(content),
      hasAction: /should|must|need|require|recommend/i.test(content)
    };
    
    // 基于内容生成建议的改进措施
    const suggestedActions = [];
    
    if (sentimentAnalysis.hasNegative) {
      suggestedActions.push({
        type: 'investigation',
        description: `调查问题根源: ${content.substring(0, 100)}...`,
        priority: 'high'
      });
    }
    
    if (sentimentAnalysis.hasAction) {
      suggestedActions.push({
        type: 'implementation',
        description: '根据观察实施改进措施',
        priority: 'medium'
      });
    }
    
    // 关联进化目标
    const goalMapping = {
      error: '错误自修复',
      performance: '性能优化',
      security: '安全加固',
      user: '用户体验改善'
    };
    
    let primaryGoal = '一般改进';
    Object.keys(goalMapping).forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        primaryGoal = goalMapping[keyword];
      }
    });
    
    return {
      observationId: observation.id,
      analysisTimestamp: new Date().toISOString(),
      identifiedIssues: sentimentAnalysis.hasNegative ? ['检测到问题或异常'] : [],
      identifiedPatterns: sentimentAnalysis.hasPositive ? ['检测到积极改进或成功案例'] : [],
      evolutionGoalAssociation: primaryGoal,
      suggestedActions,
      sentimentAnalysis,
      confidenceScore: sentimentAnalysis.hasAction ? 0.8 : 0.6,
      summary: `观察记录分析: ${content.substring(0, 50)}...`
    };
    
  } catch (error) {
    console.error(`分析观察记录 ${observation.id} 时出错:`, error);
    return {
      observationId: observation.id,
      analysisTimestamp: new Date().toISOString(),
      error: error.message,
      summary: '分析过程中出现错误',
      confidenceScore: 0
    };
  }
}

/**
 * 主技能函数 - 分析观察记录
 * @returns {Promise<Object>} 操作结果
 */
async function analyzeObservationsSkill() {
  const startTime = Date.now();
  const result = {
    success: false,
    analyzedCount: 0,
    reportId: null,
    errors: [],
    statistics: null,
    executionTime: 0
  };
  
  try {
    console.log('开始分析未处理的观察记录...');
    
    // 步骤1: 获取未分析的观察记录
    let unanalyzedObservations;
    try {
      unanalyzedObservations = await memoryPlugin.get_observations({
        status: STATUS.UNANALYZED,
        limit: ANALYSIS_CONFIG.MAX_BATCH_SIZE
      });
      
      if (!Array.isArray(unanalyzedObservations)) {
        throw new Error('记忆插件返回的观察记录格式不正确');
      }
      