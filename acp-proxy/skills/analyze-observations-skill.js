const { get_observations, update_observation_status, save_memory } = require('../plugins/memory-plugin');

/**
 * 分析观察记录技能
 * 分析记忆库中所有状态为 'unanalyzed' 的观察记录，生成结构化分析报告和行动建议
 */
const analyzeObservationsSkill = async () => {
    const startTime = Date.now();
    let analyzedCount = 0;
    let reportId = null;
    const analysisResults = [];
    const errors = [];

    try {
        console.log('[analyze-observations-skill] 开始执行分析流程...');

        // 1. 获取所有未分析的观察记录
        const observations = await get_observations({ status: 'unanalyzed' });
        
        if (!observations || observations.length === 0) {
            console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
            return {
                success: true,
                message: '没有未分析的观察记录',
                analyzedCount: 0,
                reportId: null,
                timestamp: new Date().toISOString(),
                executionTime: Date.now() - startTime
            };
        }

        console.log(`[analyze-observations-skill] 找到 ${observations.length} 条未分析的观察记录`);

        // 2. 统计分析功能（第一个微小工具创造实例）
        const typeDistribution = computeTypeDistribution(observations);
        const timeBasedStats = computeTimeBasedStatistics(observations);

        // 3. 逐条分析观察记录
        for (const observation of observations) {
            try {
                // 验证观察记录格式
                if (!observation || !observation.id || !observation.content) {
                    console.warn('[analyze-observations-skill] 观察记录格式异常:', observation);
                    continue;
                }

                // 语义理解和模式识别
                const analysis = analyzeObservationContent(observation);
                
                // 生成分析报告条目
                const analysisResult = {
                    observationId: observation.id,
                    originalContent: observation.content,
                    identifiedIssues: analysis.issues,
                    relatedGoals: analysis.goals,
                    suggestedActions: analysis.actions,
                    patterns: analysis.patterns,
                    analysisTimestamp: new Date().toISOString(),
                    confidence: analysis.confidence || 0.8
                };

                analysisResults.push(analysisResult);

                // 4. 更新观察记录状态
                await update_observation_status(observation.id, 'analyzed', {
                    analysisSummary: analysis.summary,
                    analysisTimestamp: new Date().toISOString(),
                    relatedGoals: analysis.goals
                });

                analyzedCount++;
                console.log(`[analyze-observations-skill] 已分析观察记录: ${observation.id}`);

            } catch (error) {
                console.error(`[analyze-observations-skill] 分析观察记录 ${observation?.id} 失败:`, error.message);
                errors.push({
                    observationId: observation?.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                // 继续处理其他记录，避免单条数据问题导致整个流程中断
                continue;
            }
        }

        // 5. 生成并保存分析报告
        if (analysisResults.length > 0) {
            const analysisReport = generateAnalysisReport(
                analysisResults,
                typeDistribution,
                timeBasedStats,
                errors,
                startTime
            );

            // 将分析报告作为新记忆存入
            const savedReport = await save_memory({
                type: 'analysis_report',
                content: analysisReport,
                metadata: {
                    analyzedCount,
                    totalObservations: observations.length,
                    executionTime: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            });

            reportId = savedReport.id;