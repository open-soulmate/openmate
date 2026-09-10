'use strict';

const logger = require('../utils/logger');
const systemState = require('../utils/system_state');
const observationSource = require('../data/observation_source');
const memoryStore = require('../memory/memory_store');

/**
 * 观察数据分析技能
 * 处理系统中的未分析观察数据，进行分类、关联记忆并重置计数器
 */
class ObservationAnalyzer {
  constructor() {
    this.name = 'observation_analyzer';
    this.description = '处理未分析的观察数据积压问题';
    
    // 观察类型分类规则
    this.classificationRules = [
      {
        type: 'error',
        keywords: ['error', 'exception', 'failed', 'failure', 'critical', 'fatal']
      },
      {
        type: 'warning',
        keywords: ['warning', 'warn', 'caution', 'alert', 'attention']
      },
      {
        type: 'info',
        keywords: ['info', 'information', 'notice', 'log', 'debug', 'trace']
      }
    ];
  }

  /**
   * 获取技能信息
   * @returns {Object} 技能元数据
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      version: '1.0.0',
      author: 'ACP System',
      triggers: [
        {
          condition: 'observations_unanalyzed >= 1',
          type: 'threshold'
        }
      ]
    };
  }

  /**
   * 主分析函数
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeObservations() {
    try {
      // 获取当前未分析观察数量
      const unanalyzedCount = await systemState.get('observations_unanalyzed');
      
      // 检查是否需要触发分析
      if (unanalyzedCount < 1) {
        logger.info(`[ObservationAnalyzer] 未分析的观察数量: ${unanalyzedCount}，无需处理`);
        return {
          status: 'skipped',
          message: '未达到分析阈值',
          count: unanalyzedCount
        };
      }

      logger.info(`[ObservationAnalyzer] 检测到 ${unanalyzedCount} 个未分析的观察，开始处理...`);
      
      // 获取未分析的观察数据
      const observations = await observationSource.getUnanalyzed();
      
      if (!observations || observations.length === 0) {
        logger.warn('[ObservationAnalyzer] 未找到未分析的观察数据');
        return {
          status: 'error',
          message: '无法获取观察数据',
          count: unanalyzedCount
        };
      }

      logger.info(`[ObservationAnalyzer] 获取到 ${observations.length} 条观察数据`);
      
      // 分析所有观察数据
      const analysisResults = await this.processObservations(observations);
      
      // 重置计数器
      await systemState.set('observations_unanalyzed', 0);
      
      logger.info(`[ObservationAnalyzer] 成功处理 ${analysisResults.length} 条观察数据，计数器已重置`);
      
      return {
        status: 'success',
        processedCount: analysisResults.length,
        totalCount: observations.length,
        results: analysisResults
      };
      
    } catch (error) {
      logger.error(`[ObservationAnalyzer] 分析过程中发生错误: ${error.message}`);
      
      // 重抛错误，不重置计数器
      throw error;
    }
  }

  /**
   * 处理观察数据数组
   * @param {Array} observations - 观察数据数组
   * @returns {Promise<Array>} 分析结果数组
   */
  async processObservations(observations) {
    const results = [];
    
    for (const observation of observations) {
      try {
        const result = await this.analyzeSingleObservation(observation);
        results.push(result);
      } catch (error) {
        logger.error(`[ObservationAnalyzer] 处理单个观察数据失败: ${error.message}`);
        results.push({
          observationId: observation.id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 分析单个观察数据
   * @param {Object} observation - 观察数据对象
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeSingleObservation(observation) {
    // 分类观察类型
    const classification = this.classifyObservation(observation);
    
    // 关联历史记忆
    const relatedMemories = await this.findRelatedMemories(observation, classification);
    
    // 生成分析结果摘要
    const analysisResult = {
      observationId: observation.id,
      timestamp: observation.timestamp || new Date().toISOString(),
      originalContent: observation.content,
      classification: classification,
      relatedMemories: relatedMemories,
      summary: this.generateSummary(observation, classification, relatedMemories)
    };
    
    // 存储分析结果到记忆
    await this.storeAnalysisResult(analysisResult);
    
    return analysisResult;
  }

  /**
   * 分类观察类型
   * @param {Object} observation - 观察数据对象
   * @returns {Object} 分类结果
   */
  classifyObservation(observation) {
    const content = (observation.content || '').toLowerCase();
    
    // 遍历分类规则
    for (const rule of this.classificationRules) {
      for (const keyword of rule.keywords) {
        if (content.includes(keyword)) {
          return {
            type: rule.type,
            confidence: 0.8, // 默认置信度
            matchedKeywords: [keyword]
          };
        }
      }
    }
    
    // 默认分类为信息类型
    return {
      type: 'info',
      confidence: 0.5,
      matchedKeywords: []
    };
  }

  /**
   * 查找相关记忆
   * @param {Object} observation - 观察数据对象
   * @param {Object} classification - 分类结果
   * @returns {Promise<Array>} 相关记忆ID数组
   */
  async findRelatedMemories(observation, classification) {
    try {
      const searchQuery = {
        type: classification.type,
        keywords: classification.matchedKeywords,
        timeRange: {