// acp-proxy/skills/analyze-observations-skill.js
// 观察分析技能 - 自动分析未处理的观察记录，生成结构化分析报告

const memoryPlugin = require('../plugins/memory-plugin');
const { logger } = require('../utils/logger');

// 内联统计分析工具 - 作为首个微小工具创造的实例
class ObservationStatsAnalyzer {
  constructor() {
    this.typeDistribution = {};
    this.recentCount = 50; // 分析最近50条记录
  }

  addObservation(type) {
    this.typeDistribution[type] = (this.typeDistribution[type] || 0) + 1;
  }

  getDistributionReport() {
    const total = Object.values(this.typeDistribution).reduce((sum, count) => sum + count, 0);
    const distribution = {};
    
    for (const [type, count] of Object.entries(this.typeDistribution)) {
      distribution[type] = {
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%'
      };
    }

    return {
      totalObservations: total,
      distribution,
      topTypes: Object.entries(this.typeDistribution)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }))
    };
  }
}

// 进化目标关键词映射
const EVOLUTION_GOALS = {
  error_self_repair: ['错误', '失败', '异常', 'bug', 'error', 'failure'],
  tool_creation: ['工具', '自动化', '脚本', 'workflow', 'tool', 'automation'],
  performance_optimization: ['慢', '优化', '性能', '响应时间', 'slow', 'optimization', 'performance'],
  pattern_recognition: ['模式', '规律', '趋势', 'pattern', 'trend', 'regularity']
};

// 改进建议模板
const IMPROVEMENT_TEMPLATES = {
  error_self_repair: '建议创建错误监控脚本，自动检测并修复类似问题',
  tool_creation: '建议将此流程工具化，提高自动化程度',
  performance_optimization: '建议优化相关代码逻辑，减少资源消耗',
  pattern_recognition: '建议建立模式库，记录类似观察结果',
  general: '建议进一步分析此观察，确定是否需要采取行动'
};

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
function analyzeObservation(observation) {
  try {
    const content = observation.content || observation.text || '';
    const type = observation.type || 'unknown';
    
    // 语义理解：提取关键词
    const keywords = extractKeywords(content);
    
    // 模式识别：关联进化目标
    const matchedGoals = [];
    
    for (const [goal, patterns] of Object.entries(EVOLUTION_GOALS)) {
      for (const pattern of patterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          if (!matchedGoals.includes(goal)) {
            matchedGoals.push(goal);
          }
          break;
        }
      }
    }
    
    // 生成建议
    const suggestions = [];
    
    if (matchedGoals.length > 0) {
      for (const goal of matchedGoals) {
        suggestions.push(IMPROVEMENT_TEMPLATES[goal]);
      }
    } else {
      suggestions.push(IMPROVEMENT_TEMPLATES.general);
    }
    
    // 分析结论
    const conclusion = `观察记录分析：识别出关键词[${keywords.slice(0, 5).join(', ')}]，关联到${matchedGoals.length}个进化目标`;
    
    return {
      conclusion,
      keywords: keywords.slice(0, 10), // 限制关键词数量
      matchedGoals,
      suggestions,
      confidence: matchedGoals.length > 0 ? 'high' : 'medium',
      analyzedAt: new Date().toISOString(),
      analysisType: 'automated'
    };
    
  } catch (error) {
    logger.error(`分析观察记录失败: ${error.message}`, { observationId: observation.id });
    return {
      conclusion: '分析失败：记录格式异常或内容解析错误',
      error: error.message,
      analyzedAt: new Date().toISOString(),
      analysisType: 'automated_error'
    };
  }
}

/**
 * 从文本中提取关键词
 * @param {string} text - 输入文本
 * @returns {string[]} 关键词数组
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // 简单的关键词提取：移除停用词，提取高频词
  const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ') // 保留中文、英文和数字
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word));
  
  // 统计词频
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // 按词频排序
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * 生成分析报告
 * @param {Object[]} analyses - 分析结果数组
 * @param {Object} stats - 统计数据
 * @returns {Object} 完整报告
 */
function generateReport(analyses, stats) {
  const successfulAnalyses = analyses.filter(a => !a.error);
  const failedAnalyses = analyses.filter(a => a.error);
  
  // 目标统计
  const goalStats = {};
  successfulAnalyses.forEach(analysis => {
    if (analysis.matchedGoals) {