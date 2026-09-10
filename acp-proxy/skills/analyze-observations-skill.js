'use strict';

// 依赖的插件接口 - 在实际环境中会由系统注入
const memoryPlugin = require('../plugins/memory-plugin.js');

/**
 * analyze-observations-skill 核心技能
 * 自动分析记忆库中所有状态为 unanalyzed 的观察记录
 */
const analyzeObservationsSkill = async () => {
  const results = {
    processedCount: 0,
    updatedCount: 0,
    reportId: null,
    statistics: null,
    errors: []
  };

  try {
    console.log('[analyze-observations-skill] 开始分析未处理观察记录...');
    
    // 1. 获取所有未分析的观察记录
    const unanalyzedObservations = await memoryPlugin.get_observations({
      status: 'unanalyzed'
    });
    
    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      console.log('[analyze-observations-skill] 没有找到需要分析的观察记录');
      return results;
    }
    
    console.log(`[analyze-observations-skill] 找到 ${unanalyzedObservations.length} 条未分析记录`);
    results.processedCount = unanalyzedObservations.length;
    
    // 2. 内联统计分析功能：计算最近N条观察的类型分布
    results.statistics = await analyzeObservationDistribution(unanalyzedObservations);
    
    // 3. 对每条观察记录进行语义分析和模式识别
    const analysisResults = [];
    
    for (const observation of unanalyzedObservations) {
      try {
        const analysis = analyzeSingleObservation(observation);
        
        if (analysis) {
          analysisResults.push({
            observationId: observation.id,
            analysis: analysis
          });
          
          // 4. 更新观察记录状态为已分析，并附加分析元数据
          await memoryPlugin.update_observation_status(
            observation.id,
            'analyzed',
            {
              analyzedAt: new Date().toISOString(),
              analysisSummary: analysis.summary,
              identifiedPatterns: analysis.patterns,
              evolutionGoals: analysis.evolutionGoals,
              suggestedActions: analysis.actions
            }
          );
          
          results.updatedCount++;
        }
      } catch (error) {
        console.error(`[analyze-observations-skill] 处理观察记录 ${observation.id} 时出错:`, error);
        results.errors.push({
          observationId: observation.id,
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    // 5. 生成并存储分析报告