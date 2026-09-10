// acp-proxy/skills/analyze-observations-skill.js
// 核心技能：分析观察记录并生成结构化报告

const memoryPlugin = require('../plugins/memory-plugin');

// 简单的统计分析函数 - 作为第一个微小工具创造的实例
const calculateTypeDistribution = (observations, limit = 10) => {
    const recentObs = observations.slice(-limit);
    const distribution = {};
    recentObs.forEach(obs => {
        const type = obs.type || 'unknown';
        distribution[type] = (distribution[type] || 0) + 1;
    });
    return {
        total: recentObs.length,
        distribution,
        mostCommon: Object.entries(distribution)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none'
    };
};

// 语义理解和模式识别的简单实现
const analyzeObservation = (observation) => {
    const content = (observation.content || '').toLowerCase();
    const type = observation.type || 'unknown';
    
    const patterns = {
        error: /错误|error|fail|异常|exception/,
        performance: /慢|slow|性能|performance|优化|optimize/,
        pattern: /模式|pattern|规律|regular/,
        improvement: /改进|improve|提升|upgrade|建议|suggest/
    };

    const detectedProblems = [];
    const relatedGoals = [];
    const suggestedActions = [];

    // 模式识别
    for (const [patternType, regex] of Object.entries(patterns)) {
        if (regex.test(content)) {
            detectedProblems.push({
                type: patternType,
                confidence: 0.7, // 简化的置信度
                description: `检测到${patternType}相关模式`
            });
        }
    }

    // 目标关联（简化版本）
    if (patterns.error.test(content)) {
        relatedGoals.push('错误自修复');
        suggestedActions.push('检查相关配置或日志，创建修复方案');
    } else if (patterns.performance.test(content)) {
        relatedGoals.push('性能优化');
        suggestedActions.push('分析性能瓶颈，优化关键路径');
    } else {
        relatedGoals.push('系统理解');
        suggestedActions.push('记录观察，增加系统知识库');
    }

    return {
        detectedProblems,
        relatedGoals,
        suggestedActions,
        analysisSummary: `观察类型:${type}，识别到${detectedProblems.length}个模式，关联${relatedGoals.length}个目标`,
        confidenceScore: detectedProblems.length > 0 ? 0.8 : 0.5,
        metadata: {
            analyzedAt: new Date().toISOString(),
            analysisVersion: '1.0.0'
        }
    };
};

// 主技能函数
const analyzeObservationsSkill = async () => {
    const startTime = Date.now();
    const results = {
        success: true,
        analyzedCount: 0,
        failedCount: 0,
        errors: [],
        reportId: null,
        stats: {},
        executionTime: 0
    };

    try {
        console.log('[analyze-observations-skill] 开始分析观察记录...');

        // 1. 获取未分析的观察记录
        const observations = await memoryPlugin.get_observations({
            status: 'unanalyzed',
            limit: 50 // 限制批次大小，避免资源耗尽
        });

        if (!observations || observations.length === 0) {
            console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
            return results;
        }

        console.log(`[analyze-observations-skill] 找到 ${observations.length} 条未分析记录`);

        // 2. 计算统计信息
        results.stats.typeDistribution = calculateTypeDistribution(observations);

        // 3. 分析每条观察记录
        const analysisResults = [];
        
        for (const observation of observations) {
            try {
                // 执行语义分析
                const analysis = analyzeObservation(observation);
                
                // 4. 更新观察记录状态
                await memoryPlugin.update_observation_status(observation.id, {
                    status: 'analyzed',
                    analysis: analysis.analysisSummary,
                    analysisDetails: analysis,
                    analyzedAt: new Date().toISOString()
                });

                analysisResults.push({
                    observationId: observation.id,
                    analysis,
                    success: true
                });
                
                results.analyzedCount++;
                console.log(`[analyze-observations-skill] 已分析记录 ${observation.id}`);
                
            } catch (error) {
                results.failedCount++;
                results.errors.push({
                    observationId: observation.id,
                    error: error.message,
                    stack: error.stack
                });
                
                console.error(`[analyze-observations-skill] 分析记录 ${observation.id} 失败:`, error.message);
                // 继续处理其他记录，不中断流程
            }
        }

        // 5. 生成综合分析报告
        if (analysisResults.length > 0) {
            const report = {
                type: 'analysis_report',
                timestamp: new Date().toISOString(),
                summary: {
                    totalAnalyzed: results.analyzedCount,
                    totalFailed: results.failedCount,
                    successRate: (results.analyzedCount / (results.analyzedCount + results.failedCount) * 100).toFixed(2) + '%'
                },
                patterns: aggregatePatterns(analysisResults),
                goalCorrelations: aggregateGoalCorrelations(analysisResults),
                recommendedActions: aggregateActions(analysisResults),
                statistics: results.stats,
                detailedResults: analysisResults.map(r => ({
                    observationId: r.observationId,
                    analysisSummary: r.analysis.analysisSummary,
                    confidence: r.analysis.confidenceScore
                }))
            };

            // 6. 将报告存入记忆库
            const reportId = await memoryPlugin.create_memory({
                content: JSON.stringify(report, null, 2),
                type: 'analysis_report',
                metadata: {
                    analysisSkillVersion: '1.0.0',
                    processedObservations: analysisResults.map(r => r.observationId),
                    generatedAt: new Date().toISOString()
                }
            });

            results.reportId = reportId;
            console.log(`[analyze-observations-skill] 生成分析报告: ${reportId}`);
        }

    } catch (error) {
        results.success = false;
        results.errors.push({
            type: 'global_error',
            error: error.message,
            stack: error.stack
        });
        console.error('[analyze-observations-skill] 全局错误:', error.message);
    }

    results.executionTime = Date.now() - startTime;
    console.log(`[analyze-observations-skill] 分析完成。耗时: ${results.executionTime}ms`);
    
    return results;
};

// 辅助函数：聚合模式
const aggregatePatterns = (analysisResults) => {
    const patterns = {};
    analysisResults.forEach(result => {
        result.analysis.detectedProblems.forEach(problem => {
            patterns[problem.type] = (patterns[problem.type] || 0) + 1;
        });
    });
    return patterns;
};

// 辅助函数：聚合目标关联
const aggregateGoalCorrelations = (analysisResults) => {
    const correlations = {};
    analysisResults.forEach(result => {
        result.analysis.relatedGoals.forEach(goal => {
            correlations[goal] = (correlations[goal] || 0) + 1;
        });
    });
    return correlations;
};

// 辅助函数：聚合建议行动
const aggregateActions = (analysisResults) => {