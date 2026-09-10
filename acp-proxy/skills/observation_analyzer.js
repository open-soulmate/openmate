const ACP = require('../acp');

module.exports = async function analyzeObservations() {
  try {
    const unanalyzedCount = ACP.state.get('observations_unanalyzed') || 0;
    
    if (unanalyzedCount < 1) {
      ACP.logger.info('observation_analyzer: No unanalyzed observations, skipping analysis');
      return { success: true, message: 'No observations to analyze' };
    }

    ACP.logger.info(`observation_analyzer: Found ${unanalyzedCount} unanalyzed observations, starting analysis`);

    // 获取未分析的观察数据
    const unanalyzedObservations = await ACP.observations.getUnanalyzed();
    
    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      ACP.logger.warn('observation_analyzer: Counter shows unanalyzed observations but no data found');
      return { success: false, message: 'No observation data found despite non-zero counter' };
    }

    const analysisResults = [];

    for (const observation of unanalyzedObservations) {
      try {
        // 分类观察类型
        const classification = classifyObservation(observation);
        
        // 关联历史记忆
        const relatedMemories = await findRelatedMemories(observation, classification);
        
        // 生成分析结果摘要
        const analysisSummary = {
          observationId: observation.id || Date.now(),
          timestamp: new Date().toISOString(),
          classification: classification,
          relatedMemoryIds: relatedMemories.map(mem => mem.id).filter(id => id),
          relatedMemoryCount: relatedMemories.length,
          summary: generateSummary(observation, classification, relatedMemories),
          processed: true
        };

        // 存入记忆存储
        await ACP.memory.add({
          type: 'observation_analysis',
          content: analysisSummary,
          observation: observation,
          timestamp: new Date().toISOString(),
          metadata: {
            analyzerVersion: '1.0',
            source: 'observation_analyzer'
          }
        });

        analysisResults.push(analysisSummary);
        
        ACP.logger.info(`observation_analyzer: Processed observation ${observation.id || 'unknown'}, classified as ${classification}`);

      } catch (observationError) {
        ACP.logger.error(`observation_analyzer: Failed to process individual observation: ${observationError.message}`);
        // 继续处理其他观察数据
        continue;
      }
    }

    // 重置计数器
    ACP.state.set('observations_unanalyzed', 0);
    
    ACP.logger.info(`observation_analyzer: Successfully analyzed ${analysisResults.length} observations, counter reset to 0`);

    return {
      success: true,
      analyzedCount: analysisResults.length,
      analysisResults: analysisResults,
      counterReset: true
    };

  } catch (error) {
    ACP.logger.error(`observation_analyzer: Analysis failed: ${error.message}`);
    ACP.logger.error(`observation_analyzer: Stack trace: ${error.stack}`);
    
    // 错误情况下保持计数器不变，以便后续重试
    ACP.logger.warn('observation_analyzer: Counter left unchanged due to error');
    
    throw error;
  }
};

function classifyObservation(observation) {
  const content = (observation.content || observation.message || '').toLowerCase();
  const title = (observation.title || '').toLowerCase();
  const combinedText = `${content} ${title}`;

  // 错误关键词匹配
  const errorKeywords = ['error', 'fail', 'failed', 'exception', 'critical', 'fatal', 'panic', '异常', '错误', '失败', '致命'];
  const warningKeywords = ['warn', 'warning', 'caution', 'alert', '注意', '警告', '警示'];
  const infoKeywords = ['info', 'log', 'debug', 'notice', '信息', '日志', '调试'];

  if (errorKeywords.some(keyword => combinedText.includes(keyword))) {
    return 'error';
  }
  
  if (warningKeywords.some(keyword => combinedText.includes(keyword))) {
    return 'warning';
  }
  
  if (infoKeywords.some(keyword => combinedText.includes(keyword))) {
    return 'info';
  }

  // 默认分类
  if (observation.severity) {