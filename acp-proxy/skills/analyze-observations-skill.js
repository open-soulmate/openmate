const memoryPlugin = require('../plugins/memory-plugin');

/**
 * analyze-observations-skill - 核心技能：自动分析未处理的观察记录
 * 
 * 执行流程：
 * 1. 从记忆库获取状态为 'unanalyzed' 的观察记录
 * 2. 对每条记录进行语义分析和模式识别
 * 3. 生成结构化分析报告
 * 4. 更新已分析记录的状态和元数据
 * 5. 将分析报告作为新记忆存入记忆库
 * 
 * 返回：包含操作结果的结构化对象
 */
async function analyzeObservationsSkill() {
  const result = {
    success: false,
    analyzedCount: 0,
    reportId: null,
    errors: [],
    stats: {}
  };

  try {
    console.log('[analyze-observations-skill] 开始分析未处理的观察记录...');

    // 1. 获取未分析的观察记录
    const unanalyzedObservations = await memoryPlugin.get_observations({
      status: 'unanalyzed'
    });

    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
      result.success = true;
      result.message = '没有待分析的观察记录';
      return result;
    }

    console.log(`[analyze-observations-skill] 找到 ${unanalyzedObservations.length} 条未分析的观察记录`);

    // 内联统计分析功能：计算观察类型分布
    const typeDistribution = {};
    const recentObservations = unanalyzedObservations.slice(0, 20); // 最近20条记录
    
    for (const obs of recentObservations) {
      const type = obs.type || 'unknown';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    }

    result.stats.typeDistribution = typeDistribution;

    const analysisResults = [];
    let processedCount = 0;

    // 2. 分析每条观察记录
    for (const observation of unanalyzedObservations) {
      try {
        const analysis = await analyzeSingleObservation(observation);
        
        // 3. 更新观察记录状态
        await memoryPlugin.update_observation_status(observation.id, {
          status: 'analyzed',
          analyzed_at: new Date().toISOString(),
          analysis_summary: analysis.summary,
          identified_patterns: analysis.patterns,
          related_goals: analysis.relatedGoals,
          suggested_actions: analysis.suggestedActions
        });

        analysisResults.push({
          observationId: observation.id,
          analysis
        });

        processedCount++;
        console.log(`[analyze-observations-skill] 成功分析记录 ${observation.id} (${processedCount}/${unanalyzedObservations.length})`);

      } catch (error) {
        console.error(`[analyze-observations-skill] 分析记录 ${observation.id} 时出错:`, error.message);
        result.errors.push({
          observationId: observation.id,
          error: error.message
        });
        
        // 继续处理下一条记录，避免中断
        continue;
      }
    }

    // 4. 生成分析报告并存入记忆库
    const analysisReport = {
      type: 'analysis_report',
      content: {
        timestamp: new Date().toISOString(),
        totalObservations: unanalyzedObservations.length,
        analyzedSuccessfully: processedCount,
        failedAnalysis: unanalyzedObservations.length - processedCount,
        analysisResults,
        statistics: {
          typeDistribution,
          overallInsights: generateOverallInsights(analysisResults)
        },
        meta: {
          skill: 'analyze-observations-skill',
          version: '1.0.0'
        }
      },
      timestamp: new Date().toISOString()
    };

    // 存储分析报告
    const reportMemory = await memoryPlugin.add_memory(analysisReport);
    result.reportId = reportMemory.id;

    // 更新结果
    result.success = true;
    result.analyzedCount = processedCount;
    result.message = `成功分析 ${processedCount} 条观察记录，生成报告 ${reportMemory.id}`;

    console.log(`[analyze-observations-skill] 分析完成: ${result.message}`);

    return result;

  } catch (error) {
    console.error('[analyze-observations-skill] 主流程出错:', error.message);
    result.success = false;
    result.message = `分析流程失败: ${error.message}`;
    result.errors.push({ phase: 'main', error: error.message });
    
    return result;
  }
}

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
async function analyzeSingleObservation(observation) {
  const analysis = {
    patterns: [],
    relatedGoals: [],
    suggestedActions: [],
    summary: ''
  };

  try {
    const content = observation.content || '';
    const tags = observation.tags || [];
    const source = observation.source || 'unknown';

    // 模式识别：提取关键词和模式
    const patterns = extractPatterns(content, tags);
    analysis.patterns = patterns;

    // 关联进化目标
    analysis.relatedGoals = identifyRelatedGoals(content, patterns);

    // 生成改进建议
    analysis.suggestedActions = generateSuggestions(content, patterns, observation);

    // 生成分析摘要
    analysis.summary = generateSummary(content, patterns, analysis.relatedGoals, analysis.suggestedActions);

    return analysis;

  } catch (error) {
    throw new Error(`观察分析失败: ${error.message}`);
  }
}

/**
 * 提取模式和关键词
 */
function extractPatterns(content, tags) {
  const patterns = [];
  
  // 简单关键词匹配（可扩展为更复杂的NLP处理）
  const errorKeywords = ['错误', '失败', '异常', '崩溃', 'bug', 'error', 'fail'];
  const performanceKeywords = ['性能', '延迟', '缓慢', '优化', 'performance', 'latency'];
  const behaviorKeywords = ['行为', '模式', '习惯', '重复', 'behavior', 'pattern'];
  
  const contentLower = content.toLowerCase();
  
  if (errorKeywords.some(kw => contentLower.includes(kw))) {
    patterns.push('error_pattern');
  }
  
  if (performanceKeywords.some(kw => contentLower.includes(kw))) {
    patterns.push('performance_pattern');
  }
  
  if (behaviorKeywords.some(kw => contentLower.includes(kw))) {
    patterns.push('behavior_pattern');
  }

  // 基于标签的模式识别
  if (tags.includes('auto-generated')) {
    patterns.push('auto_generated');
  }
  
  if (tags.includes('user-feedback')) {
    patterns.push('user_feedback');
  }

  return patterns;
}

/**
 * 识别相关进化目标
 */
function identifyRelatedGoals(content, patterns) {
  const goals = [];
  const contentLower = content.toLowerCase();

  // 基于模式关联目标
  if (patterns.includes('error_pattern')) {
    goals.push('错误自修复');
  }
  
  if (patterns.includes('performance_pattern')) {
    goals.push('性能优化');
  }
  
  if (patterns.includes('behavior_pattern')) {
    goals.push('行为模式识别');
  }

  // 基于内容关键词关联目标
  if (contentLower.includes('配置') || contentLower.includes('config')) {
    goals.push('配置优化');
  }
  
  if (contentLower.includes('工具') || contentLower.includes('tool')) {
    goals.push('工具创造');
  }

  // 去重
  return [...new Set(goals)];
}

/**
 * 生成改进建议
 */
function generateSuggestions(content, patterns, observation) {
  const suggestions = [];

  if (patterns.includes('error_pattern')) {
    suggestions.push({
      type: 'logic_fix',
      description: '添加错误处理逻辑，包含重试机制',
      priority: 'high'
    });
  }

  if (patterns.includes('performance_pattern')) {
    suggestions.push({
      type: 'optimization',
      description: '实现缓存机制或异步处理',
      priority: 'medium'
    });