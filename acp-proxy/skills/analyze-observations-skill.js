// acp-proxy/skills/analyze-observations-skill.js

const memoryPlugin = require('../plugins/memory-plugin');

/**
 * Analyze Observations Skill
 * 自动分析记忆库中状态为 'unanalyzed' 的观察记录，
 * 生成结构化的分析结论和行动建议，建立观察-分析-行动闭环。
 * 
 * @returns {Promise<Object>} 操作结果
 */
async function analyzeObservationsSkill() {
    const results = {
        success: false,
        analyzedCount: 0,
        newReportId: null,
        analyzedRecords: [],
        statistics: {},
        errors: []
    };

    try {
        // 1. 获取所有状态为 'unanalyzed' 的观察记录
        const unanalyzedObservations = await memoryPlugin.get_observations({
            status: 'unanalyzed'
        });

        if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
            console.log('[analyze-observations-skill] No unanalyzed observations found.');
            results.success = true;
            return results;
        }

        console.log(`[analyze-observations-skill] Found ${unanalyzedObservations.length} unanalyzed observations.`);

        // 2. 统计分析功能：计算最近观察的类型分布
        const typeDistribution = {};
        unanalyzedObservations.forEach(obs => {
            const type = obs.type || 'unknown';
            typeDistribution[type] = (typeDistribution[type] || 0) + 1;
        });
        results.statistics.typeDistribution = typeDistribution;

        // 3. 逐条分析观察记录
        for (const observation of unanalyzedObservations) {
            try {
                const analysis = analyzeObservation(observation);
                
                // 更新观察记录状态
                await memoryPlugin.update_observation_status(
                    observation.id,
                    'analyzed',
                    {
                        analysisSummary: analysis.summary,
                        identifiedPatterns: analysis.patterns,
                        relatedGoals: analysis.relatedGoals,
                        suggestedActions: analysis.suggestedActions,
                        analyzedAt: new Date().toISOString()
                    }
                );

                results.analyzedRecords.push({
                    observationId: observation.id,
                    summary: analysis.summary
                });
                results.analyzedCount++;
            } catch (error) {
                const errorMsg = `Error analyzing observation ${observation.id}: ${error.message}`;
                console.error(`[analyze-observations-skill] ${errorMsg}`);
                results.errors.push(errorMsg);
                // 继续处理其他观察记录，不中断整个流程
            }
        }

        // 4. 生成分析报告并存入记忆库
        const reportContent = generateAnalysisReport(results);
        const newMemory = await memoryPlugin.add_memory({
            type: 'analysis_report',
            content: reportContent,
            metadata: {
                analysisDate: new Date().toISOString(),
                analyzedObservationsCount: results.analyzedCount,
                statistics: results.statistics,
                triggeredBy: 'analyze-observations-skill'
            }
        });

        results.newReportId = newMemory.id;
        results.success = true;

        console.log(`[analyze-observations-skill] Successfully analyzed ${results.analyzedCount} observations. Report ID: ${results.newReportId}`);

    } catch (error) {
        const errorMsg = `Fatal error in analyze-observations-skill: ${error.message}`;
        console.error(`[analyze-observations-skill] ${errorMsg}`);
        results.errors.push(errorMsg);
        results.success = false;
    }

    return results;
}

/**
 * 分析单条观察记录
 * @param {Object} observation 观察记录对象
 * @returns {Object} 分析结果
 */
function analyzeObservation(observation) {
    const content = observation.content || '';
    const analysis = {
        summary: '',
        patterns: [],
        relatedGoals: [],
        suggestedActions: []
    };
