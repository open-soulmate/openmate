// acp-proxy/skills/analyze-observations-skill.js
/**
 * @description 分析观察记录技能 - 打破进化循环停滞的关键技能
 * @skill analyze-observations-skill
 * @version 1.0.0
 * @author MiMo Team
 */

const memoryPlugin = require('../plugins/memory-plugin.js');
const analysisModule = require('./analysis-module.js');

class AnalyzeObservationsSkill {
  constructor() {
    this.name = 'analyze-observations-skill';
    this.description = '分析未处理的观察记录，生成结构化分析和行动建议';
    this.version = '1.0.0';
    this.author = 'MiMo Team';
    this.triggerConditions = [
      'observations_unanalyzed > 0',
      'evolution_loop_complete'
    ];
    this.executionFrequency = 'evolution_cycle';
  }

  /**
   * 技能执行入口 - 异步函数，无参数
   * @returns {Object} 操作结果
   */
  async execute() {
    const startTime = Date.now();
    const result = {
      success: false,
      analyzedCount: 0,
      reportsGenerated: 0,
      errors: [],
      executionTime: 0,
      summary: {}
    };

    try {
      console.log(`[${this.name}] 开始分析观察记录...`);
      
      // 步骤1: 获取所有未分析的观察记录
      const unanalyzedObservations = await this.getUnanalyzedObservations();
      console.log(`[${this.name}] 找到 ${unanalyzedObservations.length} 条未分析记录`);

      if (unanalyzedObservations.length === 0) {
        result.success = true;
        result.summary = { message: '没有需要分析的观察记录' };
        return result;
      }

      // 步骤2: 批量分析观察记录
      const analysisResults = await this.analyzeObservations(unanalyzedObservations);
      
      // 步骤3: 生成分析报告
      const reportId = await this.generateAnalysisReport(analysisResults, unanalyzedObservations.length);
      
      // 步骤4: 更新观察记录状态
      const updatedCount = await this.updateObservationStatuses(unanalyzedObservations, analysisResults);
      
      // 步骤5: 计算统计信息
      const statistics = this.calculateStatistics(analysisResults);
      
      // 更新结果
      result.success = true;
      result.analyzedCount = updatedCount;
      result.reportsGenerated = 1;
      result.executionTime = Date.now() - startTime;
      result.summary = {
        reportId,
        statistics,
        processedAt: new Date().toISOString(),
        nextActions: this.generateNextActions(analysisResults)
      };

      console.log(`[${this.name}] 分析完成: ${updatedCount} 条记录已分析`);
      return result;

    } catch (error) {
      console.error(`[${this.name}] 执行失败:`, error);
      result.errors.push(error.message);
      result.executionTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * 获取未分析的观察记录
   * @returns {Array} 未分析记录数组
   */
  async getUnanalyzedObservations() {
    try {
      // 调用记忆插件的get_observations方法
      const observations = await memoryPlugin.get_observations({
        status: 'unanalyzed',
        limit: 100, // 避免一次加载过多
        sort: { timestamp: 1 } // 从旧到新处理
      });
      
      // 数据格式验证
      return observations.filter(obs => 
        obs && 
        obs.id && 
        obs.content && 
        obs.timestamp &&
        obs.status === 'unanalyzed'
      );
    } catch (error) {
      console.error(`[${this.name}] 获取观察记录失败:`, error);
      throw new Error(`获取观察记录失败: ${error.message}`);
    }
  }

  /**
   * 分析观察记录 - 语义理解和模式识别
   * @param {Array} observations 观察记录数组
   * @returns {Array} 分析结果数组
   */
  async analyzeObservations(observations) {
    const analysisResults = [];
    
    for (const observation of observations) {
      try {
        // 基础分析: 识别问题和模式
        const patternAnalysis = analysisModule.identifyPatterns(observation.content);
        
        // 关联进化目标
        const goalAssociation = this.associateWithGoals(patternAnalysis);
        
        // 生成改进建议
        const improvementSuggestions = this.generateImprovements(patternAnalysis, goalAssociation);
        
        analysisResults.push({
          observationId: observation.id,
          originalContent: observation.content,
          timestamp: observation.timestamp,
          analysis: {
            patterns: patternAnalysis,
            goals: goalAssociation,
            improvements: improvementSuggestions,
            confidence: this.calculateConfidence(patternAnalysis),
            urgency: this.determineUrgency(patternAnalysis)
          }
        });

        console.log(`[${this.name}] 已分析观察 ${observation.id}: ${patternAnalysis.primaryPattern}`);

      } catch (error) {
        console.warn(`[${this.name}] 分析观察 ${observation.id} 失败:`, error);
        // 记录分析失败但不中断流程
        analysisResults.push({
          observationId: observation.id,
          error: error.message,
          analysis: { failed: true }
        });
      }
    }

    return analysisResults;
  }

  /**
   * 关联进化目标
   * @param {Object} patternAnalysis 模式分析结果
   * @returns {Array} 关联的进化目标
   */
  associateWithGoals(patternAnalysis) {
    const goalMap = {