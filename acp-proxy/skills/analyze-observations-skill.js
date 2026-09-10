// acp-proxy/skills/analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin');

class AnalyzeObservationsSkill {
  constructor() {
    this.name = 'analyze-observations-skill';
    this.description = '自动分析unanalyzed观察记录，生成结构化分析报告';
    this.version = '1.0.0';
    this.author = 'xiaomi-mimo-team';
    this.statistics = {
      lastRunTime: null,
      totalProcessed: 0,
      recentTypeDistribution: {}
    };
  }

  /**
   * 获取所有状态为unanalyzed的观察记录
   * @returns {Promise<Array>} 观察记录数组
   */
  async getUnanalyzedObservations() {
    try {
      const observations = await memoryPlugin.get_observations({
        status: 'unanalyzed',
        sort_by: 'created_at',
        order: 'asc'
      });
      
      if (!Array.isArray(observations)) {
        throw new Error('Invalid observations data: expected array');
      }
      
      return observations;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch unanalyzed observations:`, error.message);
      throw error;
    }
  }

  /**
   * 分析单条观察记录
   * @param {Object} observation 观察记录对象
   * @returns {Object} 分析结果
   */
  analyzeSingleObservation(observation) {
    const { id, content, type, created_at } = observation;
    
    if (!id || !content) {
      throw new Error(`Invalid observation format: missing id or content in ${JSON.stringify(observation)}`);
    }

    // 简单模式识别和分析逻辑
    const analysis = {
      observation_id: id,
      timestamp: created_at || new Date().toISOString(),
      patterns_identified: [],
      related_goals: [],
      suggested_actions: [],
      confidence_score: 0.85,
      analysis_version: this.version
    };

    // 基于内容和类型的简单分析逻辑
    const contentLower = content.toLowerCase();
    
    // 识别问题/模式
    if (contentLower.includes('error') || contentLower.includes('错误') || contentLower.includes('exception')) {
      analysis.patterns_identified.push('error_pattern');
      analysis.related_goals.push('错误自修复');
      analysis.suggested_actions.push('检查错误处理逻辑，添加更详细的错误日志');
    }

    if (contentLower.includes('performance') || contentLower.includes('慢') || contentLower.includes('耗时')) {
      analysis.patterns_identified.push('performance_pattern');
      analysis.related_goals.push('性能优化');
      analysis.suggested_actions.push('分析性能瓶颈，考虑缓存或优化算法');
    }

    if (contentLower.includes('security') || contentLower.includes('安全') || contentLower.includes('漏洞')) {
      analysis.patterns_identified.push('security_pattern');
      analysis.related_goals.push('安全加固');
      analysis.suggested_actions.push('审查安全相关代码，加强输入验证');
    }

    // 基于类型的分析
    if (type === 'log') {
      analysis.patterns_identified.push('log_pattern');
      analysis.suggested_actions.push('优化日志记录级别，考虑结构化日志');
    } else if (type === 'metric') {
      analysis.patterns_identified.push('metric_pattern');
      analysis.suggested_actions.push('设置监控阈值，建立告警机制');
    }

    // 默认建议
    if (analysis.suggested_actions.length === 0) {
      analysis.suggested_actions.push('保持观察，记录更多相关数据');
      analysis.confidence_score = 0.6;
    }

    return analysis;
  }

  /**
   * 计算最近N条观察记录的类型分布（内联统计分析工具）
   * @param {Array} observations 观察记录数组
   * @param {number} n 最近N条记录
   * @returns {Object} 类型分布统计
   */
  calculateTypeDistribution(observations, n = 10) {
    const distribution = {};
    const recentObservations = observations.slice(-n);
    
    recentObservations.forEach(obs => {
      const type = obs.type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });

    return {
      sample_size: recentObservations.length,
      distribution,
      most_common_type: Object.entries(distribution)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
    };
  }

  /**
   * 生成分析报告
   * @param {Array} analyses 所有分析结果数组
   * @returns {Object} 分析报告
   */
  generateAnalysisReport(analyses) {
    const timestamp = new Date().toISOString();
    const totalObservations = analyses.length;
    
    // 汇总统计
    const goalCounts = {};
    const actionCounts = {};
    const patternCounts = {};
    
    analyses.forEach(analysis => {
      analysis.related_goals.forEach(goal => {
        goalCounts[goal] = (goalCounts[goal] || 0) + 1;
      });
      
      analysis.suggested_actions.forEach(action => {