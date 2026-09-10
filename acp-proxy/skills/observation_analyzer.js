const { 
  getUnanalyzedObservations,
  getSystemState,
  resetObservationsCounter,
  addMemory,
  searchMemories,
  logger
} = require('../system');

async function analyzeObservations() {
  try {
    // 获取系统状态，检查未分析观察数据数量
    const systemState = getSystemState();
    const unanalyzedCount = systemState.observations_unanalyzed || 0;
    
    // 当未分析数据小于1时，直接返回
    if (unanalyzedCount < 1) {
      logger.debug('No unanalyzed observations to process');
      return { success: true, processed: 0 };
    }

    logger.info(`Found ${unanalyzedCount} unanalyzed observations, starting analysis...`);
    
    // 获取未分析的观察数据
    const observations = await getUnanalyzedObservations();
    
    if (!observations || observations.length === 0) {
      logger.warn('No observation data returned, skipping analysis');
      return { success: true, processed: 0 };
    }

    let processedCount = 0;
    const analysisResults = [];

    // 分析每条观察数据
    for (const observation of observations) {
      try {
        // 1. 分类观察类型
        const category = classifyObservation(observation);
        
        // 2. 关联历史记忆
        const relatedMemories = await findRelatedMemories(observation, category);
        
        // 3. 生成分析结果摘要
        const analysisSummary = generateAnalysisSummary(
          observation, 
          category, 
          relatedMemories
        );
        
        // 4. 存储分析结果到记忆系统
        const memoryEntry = {
          type: 'observation_analysis',
          timestamp: new Date().toISOString(),
          observationId: observation.id || `obs_${Date.now()}`,
          category: category,
          relatedMemories: relatedMemories.map(m => m.id),
          summary: analysisSummary,
          originalObservation: observation,
          analysisMetadata: {
            analyzer: 'observation_analyzer',
            version: '1.0.0'
          }
        };
        
        await addMemory(memoryEntry);
        
        analysisResults.push({
          observationId: observation.id,
          category: category,
          memoryId: memoryEntry.id,
          status: 'analyzed'
        });
        
        processedCount++;
        
        logger.debug(`Analyzed observation: ${category} - ${analysisSummary.substring(0, 100)}...`);
        
      } catch (error) {
        logger.error(`Failed to process observation: ${observation.id || 'unknown'}`, error);
        analysisResults.push({
          observationId: observation.id,
          status: 'error',
          error: error.message
        });
      }
    }

    // 5. 重置计数器（仅在至少有一条分析成功时）
    if (processedCount > 0) {
      await resetObservationsCounter(0);
      logger.info(`Analysis completed. Processed ${processedCount}/${observations.length} observations`);
    }

    return {
      success: true,
      processed: processedCount,
      total: observations.length,
      results: analysisResults
    };

  } catch (error) {
    logger.error('Observation analysis failed:', error);
    return {
      success: false,
      error: error.message,
      processed: 0
    };
  }
}

function classifyObservation(observation) {
  if (!observation || !observation.content) {
    return 'unknown';
  }

  const content = typeof observation.content === 'string' 
    ? observation.content.toLowerCase() 
    : JSON.stringify(observation.content).toLowerCase();
  
  const classificationRules = [
    { category: 'error', keywords: ['error', 'fatal', 'critical', 'exception', 'failed', 'failure'] },
    { category: 'warning', keywords: ['warning', 'warn', 'caution', 'alert', 'issue'] },
    { category: 'info', keywords: ['info', 'information', 'notice', 'log', 'debug', 'trace'] },
    { category: 'performance', keywords: ['slow', 'timeout', 'latency', 'performance', 'throughput'] },
    { category: 'security', keywords: ['security', 'unauthorized', 'access', 'permission', 'authentication'] }
  ];
