/**
 * Analyze Observations Skill
 * 
 * 自动分析记忆库中未分析的观察记录，生成结构化分析结论和行动建议
 * 打破"进化循环停滞"，建立"观察-分析-行动"闭环
 */

const memoryPlugin = require('../plugins/memory-plugin');

// 预定义的进化目标关键词映射
const EVOLUTION_GOALS = {
  'error': 'error_self_fix',
  'bug': 'error_self_fix',
  'crash': 'error_self_fix',
  'performance': 'performance_optimization',
  'slow': 'performance_optimization',
  'latency': 'performance_optimization',
  'config': 'configuration_refinement',
  'setting': 'configuration_refinement',
  'tool': 'tool_creation',
  'utility': 'tool_creation',
  'skill': 'skill_enhancement',
  'function': 'skill_enhancement',
  'memory': 'memory_management',
  'storage': 'memory_management',
  'analysis': 'insight_generation',
  'pattern': 'insight_generation'
};

// 预定义的行动建议模板
const ACTION_TEMPLATES = {
  'error_self_fix': '建议：创建一个自动错误检测和修复工具',
  'performance_optimization': '建议：分析性能瓶颈，优化相关代码路径',
  'configuration_refinement': '建议：审查并优化配置参数',
  'tool_creation': '建议：开发一个专用工具来处理此类任务',
  'skill_enhancement': '建议：增强相关技能的功能',
  'memory_management': '建议：优化记忆存储和检索策略',
  'insight_generation': '建议：建立更系统的分析框架',
  'default': '建议：记录此模式，继续观察相关现象'
};

class AnalyzeObservationsSkill {
  constructor() {
    this.stats = {
      totalObservations: 0,
      analyzedCount: 0,
      reportGenerated: false,
      goalDistribution: {}
    };
  }

  /**
   * 分析单个观察记录
   * @param {Object} observation - 观察记录对象
   * @returns {Object} 分析结果
   */
  analyzeSingleObservation(observation) {
    const { id, content, metadata = {} } = observation;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
    // 1. 语义分析：提取关键词和模式
    const keywords = this.extractKeywords(contentStr);
    const patterns = this.identifyPatterns(contentStr);
    
    // 2. 目标关联分析
    const goalAssociation = this.matchEvolutionGoal(keywords);
    
    // 3. 生成行动建议
    const actionSuggestion = this.generateActionSuggestion(goalAssociation, patterns);
    
    // 4. 创建分析摘要
    const analysisSummary = this.createAnalysisSummary(
      observation, 
      keywords, 
      patterns, 
      goalAssociation, 
      actionSuggestion
    );

    return {
      observationId: id,
      keywords,
      patterns,
      goalAssociation,
      actionSuggestion,
      analysisSummary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 提取关键词
   * @param {string} text - 文本内容
   * @returns {Array} 关键词列表
   */
  extractKeywords(text) {
    // 简单的关键词提取：去除停用词后取高频词
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'with']);
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // 词频统计
    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // 返回前5个高频词
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  /**
   * 识别模式
   * @param {string} text - 文本内容
   * @returns {Array} 识别出的模式列表
   */
  identifyPatterns(text) {
    const patterns = [];
    const lowerText = text.toLowerCase();
    
    // 简单模式识别
    if (lowerText.includes('error') || lowerText.includes('exception')) {
      patterns.push('error_pattern');
    }
    if (lowerText.includes('timeout') || lowerText.includes('slow')) {
      patterns.push('performance_pattern');
    }
    if (lowerText.includes('repeated') || lowerText.includes('again')) {