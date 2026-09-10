// acp-proxy/skills/analyze-observations-skill.js

const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 分析观察记录技能
 * 自动分析记忆库中状态为'unanalyzed'的观察记录，生成结构化分析报告
 */
const analyzeObservationsSkill = async () => {
  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;
  const errors = [];
  
  try {
    console.log('[analyze-observations-skill] 开始分析观察记录...');
    
    // 1. 获取所有未分析的观察记录
    const unanalyzedObservations = await memoryPlugin.get_observations({
      status: 'unanalyzed'
    });
    
    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
      return {
        success: true,
        message: '没有找到未分析的观察记录',
        analyzedCount: 0,
        errorCount: 0,
        reportId: null,
        executionTime: Date.now() - startTime
      };
    }
    
    console.log(`[analyze-observations-skill] 找到 ${unanalyzedObservations.length} 条未分析的观察记录`);
    
    // 2. 内联统计分析功能：计算观察记录类型分布
    const statistics = analyzeObservationDistribution(unanalyzedObservations);
    console.log('[analyze-observations-skill] 观察记录统计:', statistics);
    
    // 3. 逐条分析观察记录
    const analysisResults = [];
    
    for (const observation of unanalyzedObservations) {
      try {
        const analysis = await analyzeSingleObservation(observation);
        analysisResults.push(analysis);
        processedCount++;
        
        // 4. 更新观察记录状态为'analyzed'
        await memoryPlugin.update_observation_status(
          observation.id,
          'analyzed',
          {
            analysisSummary: analysis.summary,
            analysisTimestamp: new Date().toISOString(),
            patternsIdentified: analysis.patterns,
            relatedGoals: analysis.relatedGoals,
            suggestedActions: analysis.suggestedActions
          }
        );
        
        console.log(`[analyze-observations-skill] 已分析观察记录 ${observation.id}`);
      } catch (error) {
        console.error(`[analyze-observations-skill] 分析观察记录 ${observation.id} 失败:`, error);
        errorCount++;
        errors.push({
          observationId: observation.id,
          error: error.message
        });
      }
    }
    
    // 5. 生成分析报告
    const report = generateAnalysisReport(analysisResults, statistics, unanalyzedObservations.length);
    
    // 6. 将分析报告存入记忆库
    const reportId = await memoryPlugin.create_memory({
      type: 'analysis_report',
      content: report,
      metadata: {
        generatedAt: new Date().toISOString(),
        analyzedObservationsCount: processedCount,
        failedAnalysisCount: errorCount,
        executionTimeMs: Date.now() - startTime
      }
    });
    
    console.log(`[analyze-observations-skill] 分析报告已保存，ID: ${reportId}`);
    
    // 7. 返回操作结果
    return {
      success: true,
      message: `分析完成，处理了 ${processedCount} 条观察记录`,
      analyzedCount: processedCount,
      errorCount: errorCount,
      errors: errors,
      reportId: reportId,