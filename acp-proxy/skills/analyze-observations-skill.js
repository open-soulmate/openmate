const memoryPlugin = require('../plugins/memory-plugin');

const ANALYSIS_REPORT_TYPE = 'analysis_report';
const RECENT_OBSERVATIONS_COUNT = 50;

/**
 * 分析观察记录技能
 * 自动分析记忆库中所有状态为 'unanalyzed' 的观察记录，
 * 将其转化为结构化的分析结论和行动建议
 */
module.exports = async function analyzeObservationsSkill() {
    console.log('[analyze-observations-skill] 开始执行观察分析技能...');
    
    try {
        // 1. 获取未分析的观察记录
        const unanalyzedObservations = await memoryPlugin.get_observations({
            status: 'unanalyzed'
        });
        
        if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
            console.log('[analyze-observations-skill] 没有发现未分析的观察记录');
            return {
                success: true,
                analyzedCount: 0,
                reportId: null,
                message: '没有未分析的观察记录'
            };
        }
        
        console.log(`[analyze-observations-skill] 发现 ${unanalyzedObservations.length} 条未分析的观察记录`);
        
        // 2. 内联统计分析：计算最近观察的类型分布
        const recentObservations = await memoryPlugin.get_observations({
            limit: RECENT_OBSERVATIONS_COUNT
        });
        const typeDistribution = calculateTypeDistribution(recentObservations);
        
        // 3. 分析每条观察记录
        const analysisResults = [];
        let processedCount = 0;
        
        for (const observation of unanalyzedObservations) {
            try {
                const analysis = await analyzeObservation(observation, typeDistribution);
                analysisResults.push(analysis);
                
                // 4. 更新观察记录状态
                await memoryPlugin.update_observation_status(
                    observation.id,
                    'analyzed',
                    {
                        analyzedAt: new Date().toISOString(),
                        analysisSummary: analysis.summary,
                        evolutionGoals: analysis.evolutionGoals,
                        suggestedActions: analysis.suggestedActions
                    }
                );
                
                processedCount++;
            } catch (error) {
                console.error(`[analyze-observations-skill] 分析观察 ${observation.id} 时出错:`, error);
                // 继续处理其他记录，不中断整个流程
            }
        }
        
        // 5. 生成分析报告
        const analysisReport = generateAnalysisReport(
            analysisResults,
            typeDistribution,
            processedCount
        );
        
        // 6. 将分析报告存入记忆库
        const reportId = await memoryPlugin.add_memory({
            type: ANALYSIS_REPORT_TYPE,
            content: JSON.stringify(analysisReport),
            metadata: {
                generatedAt: new Date().toISOString(),
                analyzedObservationsCount: processedCount,
                unanalyzedObservationsCount: unanalyzedObservations.length
            }
        });
        
        console.log(`[analyze-observations-skill] 成功分析 ${processedCount} 条观察记录，报告ID: ${reportId}`);
        
        // 7. 返回结构化操作结果
        return {
            success: true,
            analyzedCount: processedCount,
            totalCount: unanalyzedObservations.length,
            reportId: reportId,