/**
 * analyze-observations-skill.js
 * 核心技能：自动分析未处理的观察记录，建立观察-分析-行动闭环
 * 
 * @module analyze-observations-skill
 * @requires memory-plugin
 */

const memoryPlugin = require('../plugins/memory-plugin');

// 配置常量
const SKILL_NAME = 'analyze-observations-skill';
const BATCH_SIZE = 10; // 每次分析的最大记录数，避免内存溢出
const ANALYSIS_STATUS = 'analyzed';
const OBSERVATION_TYPE_PATTERN = /\b(?:error|warning|anomaly|pattern|trend|issue)\b/i;

/**
 * 主分析函数 - 技能的入口点
 * @async
 * @function analyzeObservations
 * @returns {Promise<Object>} 操作结果对象
 */
const analyzeObservations = async () => {
  const startTime = Date.now();
  const results = {
    skill: SKILL_NAME,
    success: false,
    analyzedCount: 0,
    skippedCount: 0,
    errors: [],
    reportIds: [],
    executionTime: 0
  };

  try {
    // 1. 获取未分析的观察记录
    const unanalyzedRecords = await memoryPlugin.get_observations({
      status: 'unanalyzed',
      limit: BATCH_SIZE
    });

    if (!unanalyzedRecords || unanalyzedRecords.length === 0) {
      results.success = true;
      results.message = '没有发现未分析的观察记录';
      return results;
    }

    // 2. 对每条记录进行分析
    const analysisResults = [];
    const processedIds = [];
    const skippedIds = [];

    for (const observation of unanalyzedRecords) {
      try {
        // 验证记录格式
        if (!isValidObservation(observation)) {
          skippedIds.push(observation.id);
          results.skippedCount++;
          results.errors.push({
            observationId: observation.id,
            error: '观察记录格式无效',
            severity: 'warning'
          });
          continue;
        }

        // 执行分析
        const analysis = analyzeSingleObservation(observation);
        
        // 更新观察记录状态
        await memoryPlugin.update_observation_status({
          id: observation.id,
          status: ANALYSIS_STATUS,
          metadata: {
            analyzedAt: new Date().toISOString(),
            analysisSummary: analysis.summary,
            analysisType: analysis.type,
            skill: SKILL_NAME
          }
        });

        analysisResults.push({
          observationId: observation.id,
          analysis: analysis
        });
        processedIds.push(observation.id);
        results.analyzedCount++;

      } catch (error) {
        skippedIds.push(observation.id);
        results.skippedCount++;
        results.errors.push({
          observationId: observation.id,
          error: error.message,
          severity: 'error'
        });
        // 继续处理下一条记录，实现容错
        continue;
      }
    }

    // 3. 生成分析报告并存储为新记忆
    if (analysisResults.length > 0) {
      const report = generateAnalysisReport(analysisResults);
      
      // 存储分析报告
      const reportId = await memoryPlugin.add_memory({
        type: 'analysis_report',
        content: report,
        metadata: {
          generatedBy: SKILL_NAME,
          sourceObservations: processedIds,
          generatedAt: new Date().toISOString(),
          summary: `分析了${processedIds.length}条观察记录`
        }
      });

      results.reportIds.push(reportId);
    }

    // 4. 计算简单的统计分析（内联工具创造的实例）
    if (processedIds.length > 0) {
      const typeDistribution = computeTypeDistribution(unanalyzedRecords);
      
      // 存储统计信息作为额外报告
      const statsReportId = await memoryPlugin.add_memory({
        type: 'analysis_report',
        content: {
          title: '观察记录类型分布统计',
          distribution: typeDistribution,
          sampleSize: unanalyzedRecords.length,
          analysisDate: new Date().toISOString()
        },
        metadata: {
          generatedBy: `${SKILL_NAME}_statistics`,
          reportType: 'type_distribution',
          generatedAt: new Date().toISOString()
        }
      });

      results.reportIds.push(statsReportId);
    }

    results.success = true;
    results.executionTime = Date.now() - startTime;
    
    return results;

  } catch (error) {
    results.errors.push({
      error: `技能执行失败: ${error.message}`,
      severity: 'critical',
      stack: error.stack
    });
    results.executionTime = Date.now() - startTime;
    return results;
  }
};

/**
 * 验证观察记录格式是否有效
 * @param {Object} observation 观察记录对象
 * @returns {boolean} 是否有效
 */
const isValidObservation = (observation) => {
  const requiredFields = ['id', 'content', 'timestamp'];
  return observation && 
         requiredFields.every(field => observation[field] !== undefined) &&
         typeof observation.content === 'string' &&
         observation.content.length > 0;
};

/**
 * 分析单条观察记录
 * @param {Object} observation 观察记录
 * @returns {Object} 分析结果
 */
const analyzeSingleObservation = (observation) => {
  // 提取内容中的关键信息
  const content = observation.content;
  const analysis = {
    summary: '',
    type: 'general',
    patterns: [],
    suggestedActions: [],
    relatedGoals: [],
    severity: 'low'
  };

  // 模式识别
  if (content.match(/error|exception|failure|bug/i)) {
    analysis.type = 'error_analysis';
    analysis.patterns.push('错误相关模式');
    analysis.relatedGoals.push('error-self-repair', 'system-stability');
    analysis.suggestedActions.push('创建错误处理工具', '优化错误恢复逻辑');
    analysis.severity = 'high';
  } else if (content.match(/performance|slow|timeout|resource/i)) {
    analysis.type = 'performance_analysis';
    analysis.patterns.push('性能相关模式');
    analysis.relatedGoals.push('performance-optimization', 'resource-management');
    analysis.suggestedActions.push('创建性能监控工具', '优化资源使用');
    analysis.severity = 'medium';
  } else if (content.match(/pattern|trend|anomaly|unexpected/i)) {
    analysis.type = 'pattern_analysis';
    analysis.patterns.push('模式异常');
    analysis.relatedGoals.push('pattern-recognition', 'anomaly-detection');
    analysis.suggestedActions.push('增强模式识别算法', '创建异常检测工具');
    analysis.severity = 'medium';
  }

  // 生成摘要
  const timeInfo = observation.timestamp ? 
    `在${new Date(observation.timestamp).toLocaleString()}发现的` : '';
  const typeLabel = analysis.type.replace('_', ' ');
  analysis.summary = `${timeInfo}${typeLabel}: ${content.substring(0, 100)}...`;

  // 如果是系统观察，添加元数据分析
  if (observation.metadata) {
    if (observation.metadata.source === 'system-monitor') {
      analysis.patterns.push('系统监控数据');
      analysis.suggestedActions.push('优化系统监控频率');
    } else if (observation.metadata.source === 'user-interaction') {
      analysis.patterns.push('用户交互模式');
      analysis.relatedGoals.push('user-experience', 'interaction-optimization');
    }
  }

  return analysis;
};

/**
 * 生成完整的分析报告
 * @param {Array} analysisResults 分析结果数组