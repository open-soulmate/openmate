/**
 * @fileoverview analyze-observations-skill - 核心技能
 * 分析记忆库中未处理的观察记录，转化为结构化分析结论和行动建议
 * 这是打破进化循环停滞、建立观察-分析-行动闭环的关键技能
 */

const memoryPlugin = require('../plugins/memory-plugin.js');

/**
 * 分析观察记录的技能类
 */
class AnalyzeObservationsSkill {
  constructor() {
    this.skillName = 'analyze-observations-skill';
    this.skillVersion = '1.0.0';
    this.description = '自动分析记忆库中未处理的观察记录，生成分析报告和行动建议';
  }

  /**
   * 统计分析功能 - 计算最近N条观察的类型分布
   * @param {Array} observations - 观察记录数组
   * @param {number} n - 考虑的最近记录数
   * @returns {Object} 类型分布统计
   */
  analyzeTypeDistribution(observations, n = 10) {
    const recent = observations.slice(-n);
    const distribution = {};

    recent.forEach(obs => {
      const type = obs.metadata?.type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });

    return {
      total: recent.length,
      distribution,
      topTypes: Object.entries(distribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    };
  }

  /**
   * 分析单条观察记录，生成分析结论
   * @param {Object} observation - 观察记录对象
   * @returns {Object} 分析结果
   */
  analyzeSingleObservation(observation) {
    const content = typeof observation.content === 'string' 
      ? observation.content 
      : JSON.stringify(observation.content);

    // 简单的关键词匹配分析（示例）
    const patterns = {
      error: ['error', 'exception', 'failed', 'bug'],
      performance: ['slow', 'timeout', 'delay', 'lag'],
      improvement: ['optimize', 'improve', 'enhance', 'better'],
      goal: ['goal', 'objective', 'target', 'aim']
    };

    const matchedPatterns = [];
    Object.entries(patterns).forEach(([type, keywords]) => {
      if (keywords.some(keyword => content.toLowerCase().includes(keyword))) {
        matchedPatterns.push(type);
      }
    });

    // 基于模式生成分析建议
    const suggestions = [];
    if (matchedPatterns.includes('error')) {
      suggestions.push({
        type: 'fix',
        description: '识别到错误相关模式，建议创建自修复逻辑',
        confidence: 0.7
      });
    }

    if (matchedPatterns.includes('performance')) {
      suggestions.push({
        type: 'optimize',
        description: '识别到性能相关模式，建议进行性能优化',
        confidence: 0.6
      });
    }

    if (matchedPatterns.includes('improvement')) {
      suggestions.push({
        type: 'enhance',
        description: '识别到改进机会，建议实施微小改进',
        confidence: 0.8
      });
    }

    // 关联进化目标
    const goalMapping = {
      error: '错误自修复',
      performance: '性能优化',
      improvement: '持续改进',
      goal: '目标达成'
    };

    const relatedGoals = matchedPatterns
      .filter(type => goalMapping[type])
      .map(type => goalMapping[type]);

    return {
      observationId: observation.id,
      originalContent: content,
      analyzedPatterns: matchedPatterns,
      relatedGoals: [...new Set(relatedGoals)],
      suggestions,
      confidence: matchedPatterns.length > 0 ? 0.8 : 0.3,
      analysisTime: new Date().toISOString()
    };
  }

  /**
   * 主技能执行函数
   * @returns {Promise<Object>} 操作结果
   */
  async execute() {
    const startTime = Date.now();
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      reportIds: [],
      errors: [],
      summary: {}
    };

    try {
      // 1. 获取未分析的观察记录
      const unanalyzedObservations = await memoryPlugin.get_observations({
        status: 'unanalyzed'
      });

      if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
        results.summary = {
          message: '没有找到未分析的观察记录',
          unanalyzedCount: 0
        };
        return results;
      }

      results.processed = unanalyzedObservations.length;

      // 2. 进行类型分布统计分析
      const typeStats = this.analyzeTypeDistribution(unanalyzedObservations);

      // 3. 分析每条观察记录
      const analysisResults = [];
      for (const observation of unanalyzedObservations) {
        try {
          const analysis = this.analyzeSingleObservation(observation);
          
          // 4. 更新观察记录状态
          const updateResult = await memoryPlugin.update_observation_status(
            observation.id, 
            {
              status: 'analyzed',
              analysis_summary: {
                patterns: analysis.analyzedPatterns,
                goals: analysis.relatedGoals,
                suggestions: analysis.suggestions,
                analyzed_at: analysis.analysisTime
              }
            }
          );

          if (updateResult.success) {
            analysisResults.push(analysis);
            results.succeeded++;
          } else {
            results.failed++;
            results.errors.push({
              observationId: observation.id,
              error: updateResult.error || '更新状态失败'
            });
          }
        } catch (obsError) {
          results.failed++;
          results.errors.push({
            observationId: observation.id,
            error: obsError.message
          });
        }
      }

      // 5. 生成分析报告并存储