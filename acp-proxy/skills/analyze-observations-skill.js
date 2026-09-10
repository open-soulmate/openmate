const memoryPlugin = require('../plugins/memory-plugin.js');

/**
 * 分析观察记录的核心技能
 * 目标：将未分析的观察记录转化为结构化的分析结论和行动建议
 */
const analyzeObservationsSkill = async () => {
  const startTime = Date.now();
  const result = {
    success: false,
    analyzedCount: 0,
    reportId: null,
    errors: [],
    statistics: {}
  };

  try {
    // 1. 获取所有状态为 unanalyzed 的观察记录
    const unanalyzedObservations = await memoryPlugin.get_observations({
      status: 'unanalyzed'
    });

    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      result.success = true;
      result.message = '没有需要分析的观察记录';
      return result;
    }

    // 2. 内联统计分析功能 - 计算类型分布
    result.statistics = calculateTypeDistribution(unanalyzedObservations);

    // 3. 对每条观察记录进行分析
    const analyzedRecords = [];
    const analysisResults = [];

    for (const observation of unanalyzedObservations) {
      try {
        const analysis = await analyzeSingleObservation(observation);
        
        // 更新观察记录状态
        await memoryPlugin.update_observation_status({
          observation_id: observation.id,
          status: 'analyzed',
          metadata: {
            analysis_summary: analysis.summary,
            analysis_timestamp: new Date().toISOString(),
            patterns_identified: analysis.patterns.length
          }
        });

        analyzedRecords.push({
          observation_id: observation.id,
          original_content: observation.content.substring(0, 100) + '...',
          analysis_summary: analysis.summary,
          patterns: analysis.patterns,
          related_goals: analysis.related_goals,
          suggested_actions: analysis.suggested_actions
        });

        analysisResults.push(analysis);
        result.analyzedCount++;
        
      } catch (analysisError) {
        result.errors.push({
          observation_id: observation.id,
          error: analysisError.message,
          stack: analysisError.stack
        });
        console.error(`分析观察记录 ${observation.id} 时出错:`, analysisError);
        // 继续处理下一条记录，不中断整个流程
      }
    }

    // 4. 生成综合分析报告
    const comprehensiveReport = generateComprehensiveReport(analyzedRecords, result.statistics);
    
    // 5. 存储分析报告作为新记忆
    const reportMemory = {
      type: 'analysis_report',
      content: comprehensiveReport,
      metadata: {
        analyzed_count: result.analyzedCount,
        total_errors: result.errors.length,
        analysis_duration_ms: Date.now() - startTime,
        generation_time: new Date().toISOString(),
        pattern_statistics: calculatePatternStatistics(analysisResults)
      }
    };

    const reportResult = await memoryPlugin.create_memory(reportMemory);
    result.reportId = reportResult.memory_id || reportResult.id;

    result.success = true;
    result.message = `成功分析 ${result.analyzedCount} 条观察记录，生成分析报告`;
    
    if (result.errors.length > 0) {
      result.message += `，${result.errors.length} 条记录分析失败`;
    }

  } catch (mainError) {
    result.errors.push({
      error: mainError.message,
      stack: mainError.stack,
      context: 'analyzeObservationsSkill主流程'
    });
    result.message = `分析流程失败: ${mainError.message}`;
    console.error('analyzeObservationsSkill 主流程错误:', mainError);
  }

  return result;
};

/**
 * 计算观察记录类型分布
 */
const calculateTypeDistribution = (observations) => {
  const distribution = {};
  
  observations.forEach(obs => {
    const type = obs.type || 'unknown';
    distribution[type] = (distribution[type] || 0) + 1;
  });

  return {
    total_observations: observations.length,
    type_distribution: distribution,
    analysis_timeframe: {
      oldest: observations.length > 0 ? 
        new Date(Math.min(...observations.map(o => new Date(o.created_at || o.timestamp)))).toISOString() : null,
      newest: observations.length > 0 ? 
        new Date(Math.max(...observations.map(o => new Date(o.created_at || o.timestamp)))).toISOString() : null
    }
  };
};

/**
 * 分析单条观察记录
 */
const analyzeSingleObservation = async (observation) => {
  const content = observation.content || '';
  const metadata = observation.metadata || {};
  
  // 语义理解和模式识别（简化版本，实际可接入更复杂的NLP模型）
  const patterns = identifyPatterns(content);
  const relatedGoals = mapToEvolutionGoals(content, patterns);
  const suggestedActions = generateSuggestedActions(patterns, relatedGoals, content);
  
  const analysis = {
    observation_id: observation.id,
    patterns: patterns,
    related_goals: relatedGoals,
    suggested_actions: suggestedActions,
    summary: generateSummary(content, patterns, relatedGoals),
    confidence_score: calculateConfidence(patterns),
    analysis_method: 'rule_based_pattern_matching',
    timestamp: new Date().toISOString()
  };

  return analysis;
};

/**
 * 识别内容中的模式
 */
const identifyPatterns = (content) => {
  const patterns = [];
  
  // 错误模式识别
  if (/error|exception|fail|crash|bug/i.test(content)) {
    patterns.push('error_pattern');
  }
  
  // 性能模式识别
  if (/slow|performance|latency|delay|timeout/i.test(content)) {
    patterns.push('performance_pattern');
  }
  
  // 资源模式识别
  if (/memory|cpu|resource|usage|leak/i.test(content)) {
    patterns.push('resource_pattern');
  }
  
  // 成功模式识别
  if (/success|improve|better|fix|resolve/i.test(content)) {
    patterns.push('improvement_pattern');
  }
  
  // 如果没有识别到特定模式，标记为通用观察