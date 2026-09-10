// acp-proxy/skills/analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 分析观察记录技能
 * 自动分析记忆库中状态为 'unanalyzed' 的观察记录，转化为结构化分析结论和行动建议
 */
async function analyzeObservationsSkill() {
    const results = {
        processedCount: 0,
        analyzedCount: 0,
        errors: [],
        analysisReportId: null,
        statistics: {},
        executionTime: null
    };
    
    const startTime = Date.now();
    
    try {
        console.log('[analyze-observations-skill] 开始执行观察分析流程');
        
        // 1. 获取所有未分析的观察记录
        const unanalyzedObservations = await memoryPlugin.get_observations({
            status: 'unanalyzed',
            sort: { createdAt: -1 },
            limit: 50 // 限制单次处理数量，避免过载
        });
        
        if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
            console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
            return results;
        }
        
        results.processedCount = unanalyzedObservations.length;
        console.log(`[analyze-observations-skill] 找到 ${results.processedCount} 条未分析的观察记录`);
        
        // 2. 批量处理观察记录
        for (const observation of unanalyzedObservations) {
            try {
                const analysis = analyzeSingleObservation(observation);
                
                // 3. 更新观察记录状态和元数据
                await memoryPlugin.update_observation_status(
                    observation.id,
                    'analyzed',
                    {
                        analyzedAt: new Date().toISOString(),
                        analysisSummary: analysis.summary,
                        relatedGoals: analysis.relatedGoals,
                        suggestedActions: analysis.suggestedActions,
                        patterns: analysis.patterns
                    }
                );
                
                results.analyzedCount++;
                console.log(`[analyze-observations-skill] 成功分析记录: ${observation.id}`);
                
            } catch (error) {
                console.error(`[analyze-observations-skill] 分析记录 ${observation.id} 失败:`, error);
                results.errors.push({
                    observationId: observation.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                // 继续处理下一条记录，不要中断流程
                continue;
            }
        }
        
        // 4. 生成统计分析
        results.statistics = generateStatistics(unanalyzedObservations);
        
        // 5. 创建分析报告记忆
        const analysisReport = {
            type: 'analysis_report',
            content: {
                summary: `成功分析 ${results.analyzedCount} 条观察记录`,
                totalProcessed: results.processedCount,
                totalAnalyzed: results.analyzedCount,
                errorCount: results.errors.length,
                statistics: results.statistics,
                generatedAt: new Date().toISOString(),
                executionTime: Date.now() - startTime
            },
            metadata: {
                source: 'analyze-observations-skill',
                trigger: 'automatic',
                relatedObservations: unanalyzedObservations.map(o => o.id)
            }
        };
        
        const reportId = await memoryPlugin.add_memory(analysisReport);
        results.analysisReportId = reportId;
        
        console.log(`[analyze-observations-skill] 分析报告已创建，ID: ${reportId}`);
        
    } catch (error) {
        console.error('[analyze-observations-skill] 分析流程执行失败:', error);
        results.errors.push({
            type: 'critical',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
    
    results.executionTime = Date.now() - startTime;
    console.log(`[analyze-observations-skill] 分析流程完成，耗时 ${results.executionTime}ms`);
    
    return results;
}

/**
 * 分析单条观察记录
 */
function analyzeSingleObservation(observation) {
    const content = typeof observation.content === 'string' 
        ? JSON.parse(observation.content) 
        : observation.content;
    
    const patterns = [];
    const relatedGoals = [];
    const suggestedActions = [];
    
    // 简单的模式识别逻辑
    if (content.type) {
        patterns.push(`观察类型: ${content.type}`);
    }
    
    if (content.tags && Array.isArray(content.tags)) {
        patterns.push(`标签模式: ${content.tags.join(', ')}`);
    }
    
    if (content.error) {
        relatedGoals.push('错误自修复');
        suggestedActions.push(`分析错误模式并创建修复方案: ${content.error}`);
    }
    
    if (content.pattern) {
        relatedGoals.push('模式识别优化');
        suggestedActions.push(`深化模式分析: ${content.pattern}`);
    }
    
    if (content.performance) {
        relatedGoals.push('性能优化');
        suggestedActions.push(`性能瓶颈分析: ${JSON.stringify(content.performance)}`);
    }
    
    if (content.userBehavior) {
        relatedGoals.push('用户体验优化');
        suggestedActions.push(`用户行为模式分析: ${JSON.stringify(content.userBehavior)}`);
    }
    
    // 默认建议
    if (suggestedActions.length === 0) {
        suggestedActions.push('深入分析观察内容的深层含义');
        suggestedActions.push('考虑是否需要创建新的观察模板');
    }
    
    return {
        summary: `分析观察记录: ${content.title || '无标题'}，识别出 ${patterns.length} 个模式`,
        patterns,
        relatedGoals,
        suggestedActions,
        analysisTimestamp: new Date().toISOString()
    };
}

/**
 * 生成统计分析（内联的简单统计工具）
 */
function generateStatistics(observations) {
    const stats = {
        typeDistribution: {},
        timeDistribution: {},
        totalObservations: observations.length,
        analysisPeriod: null
    };
    
    // 类型分布统计
    observations.forEach(obs => {
        const content = typeof obs.content === 'string' 
            ? JSON.parse(obs.content) 
            : obs.content;
        
        const type = content.type || 'unknown';
        stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;
    });
    
    // 时间分布统计（最近7天）
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    stats.analysisPeriod = {
        from: oneWeekAgo.toISOString(),
        to: now.toISOString()
    };
    
    // 计算每日分布
    for (let i = 0; i < 7; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayCount = observations.filter(obs => {
            const createdAt = new Date(obs.createdAt);
            return createdAt.toISOString().split('T')[0] === dateStr;
        }).length;
        
        stats.timeDistribution[dateStr] = dayCount;
    }
    
    return stats;
}

/**
 * 延迟分析触发函数
 * 用于在未分析记录数超过阈值时触发分析
 */
async function triggerAnalysisIfNeeded(threshold = 10) {
    try {
        const count = await memoryPlugin.get_observations_count({ status: 'unanalyzed' });
        console.log(`[analyze-observations-skill] 当前未分析观察数: ${count}, 阈值: ${threshold}`);
        
        if (count >= threshold) {