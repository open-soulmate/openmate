const memoryPlugin = require('../plugins/memory-plugin.js');
const logger = require('../utils/logger.js');

// 进化目标映射表，用于识别观察记录与目标的关联
const EVOLUTION_GOALS = {
  '错误自修复': {
    keywords: ['错误', '异常', '失败', '崩溃', 'bug', 'error', 'crash', 'exception'],
    category: 'error_fix'
  },
  '性能优化': {
    keywords: ['慢', '延迟', '性能', '内存', 'CPU', 'slow', 'delay', 'performance'],
    category: 'performance'
  },
  '功能扩展': {
    keywords: ['需要', '缺少', '功能', '添加', '扩展', 'feature', 'add', 'extend'],
    category: 'feature'
  },
  '安全加固': {
    keywords: ['安全', '漏洞', '攻击', '权限', 'security', 'vulnerability', 'attack'],
    category: 'security'
  }
};

// 简单的模式识别规则
const PATTERN_RULES = {
  frequency_pattern: {
    test: (content, stats) => stats.recentSimilar >= 3,
    analysis: '检测到高频重复模式',
    suggestion: '考虑创建处理此模式的专用工具'
  },
  configuration_pattern: {
    test: (content) => /配置|设置|config|setting/i.test(content),
    analysis: '涉及配置问题',
    suggestion: '考虑优化配置管理或创建配置验证工具'
  },
  dependency_pattern: {
    test: (content) => /依赖|版本|冲突|dependency|version/i.test(content),
    analysis: '涉及依赖问题',
    suggestion: '考虑创建依赖检查或版本管理工具'
  }
};

/**
 * 计算最近N条观察记录的类型分布统计
 * @param {Array} observations 观察记录数组
 * @param {number} n 最近记录数
 * @returns {Object} 统计结果
 */
function calculateTypeDistribution(observations, n = 50) {
  const recent = observations.slice(0, n);
  const distribution = {};
  
  recent.forEach(obs => {
    if (obs.content) {
      // 简单分类
      let category = 'general';
      for (const [goal, config] of Object.entries(EVOLUTION_GOALS)) {
        if (config.keywords.some(kw => obs.content.toLowerCase().includes(kw))) {
          category = config.category;
          break;
        }
      }
      distribution[category] = (distribution[category] || 0) + 1;
    }
  });
  
  return {
    total: recent.length,
    distribution,
    timestamp: new Date().toISOString()
  };
}

/**
 * 分析单条观察记录
 * @param {Object} observation 观察记录对象
 * @param {Array} recentObservations 最近观察记录，用于模式检测
 * @returns {Object} 分析结果
 */
function analyzeObservation(observation, recentObservations = []) {
  const content = observation.content || '';
  const analysis = {
    observationId: observation.id,
    timestamp: new Date().toISOString(),
    problems: [],
    patterns: [],
    goalAssociations: [],
    suggestions: [],
    confidence: 0
  };
  
  try {
    // 1. 关键词分析，识别问题类型
    for (const [goal, config] of Object.entries(EVOLUTION_GOALS)) {
      const matchedKeywords = config.keywords.filter(kw => 
        content.toLowerCase().includes(kw.toLowerCase())
      );
      
      if (matchedKeywords.length > 0) {
        analysis.goalAssociations.push({
          goal,
          category: config.category,
          matchedKeywords,
          relevance: matchedKeywords.length / config.keywords.length
        });
      }
    }
    
    // 2. 模式识别
    const stats = {
      recentSimilar: recentObservations.filter(obs => 
        obs.content && obs.content.includes(content.substring(0, 20))
      ).length
    };
    
    for (const [pattern, rule] of Object.entries(PATTERN_RULES)) {
      if (rule.test(content, stats)) {
        analysis.patterns.push({
          pattern,
          analysis: rule.analysis,
          suggestion: rule.suggestion
        });
      }
    }
    
    // 3. 生成建议
    if (analysis.goalAssociations.length > 0) {
      analysis.suggestions.push(
        `关联到${analysis.goalAssociations[0].goal}目标，建议针对性改进`
      );
    }
    
    if (analysis.patterns.length > 0) {
      analysis.suggestions.push(analysis.patterns[0].suggestion);
    }
    
    // 4. 计算置信度
    analysis.confidence = Math.min(
      (analysis.goalAssociations.length * 0.4) + 
      (analysis.patterns.length * 0.3) + 
      (analysis.suggestions.length * 0.3),
      1.0
    );
    
    // 5. 生成分析摘要
    analysis.summary = `发现${analysis.problems.length}个问题，识别出${analysis.patterns.length}种模式，关联到${analysis.goalAssociations.length}个进化目标`;
    
  } catch (error) {
    logger.error(`分析观察记录失败: ${observation.id}`, error);
    analysis.error = error.message;
    analysis.summary = `分析失败: ${error.message}`;
  }
  
  return analysis;
}

/**
 * 创建分析报告记忆