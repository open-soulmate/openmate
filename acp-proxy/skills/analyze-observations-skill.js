// acp-proxy/skills/analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 观察记录分析技能
 * 自动分析记忆库中未分析的观察记录，生成结构化分析报告和行动建议
 */
async function analyzeObservationsSkill() {
    const startTime = Date.now();
    const results = {
        success: false,
        analyzedCount: 0,
        reportId: null,
        errors: [],
        executionTime: 0
    };

    try {
        console.log('[analyze-observations-skill] 开始执行观察分析流程...');
        
        // 1. 获取未分析的观察记录
        let unanalyzedObservations;
        try {
            unanalyzedObservations = await memoryPlugin.get_observations({
                status: 'unanalyzed',
                limit: 100 // 限制一次处理的数量，避免资源耗尽
            });
        } catch (error) {
            throw new Error(`获取观察记录失败: ${error.message}`);
        }

        if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
            console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
            results.success = true;
            results.message = '无未分析的观察记录';
            return results;
        }

        console.log(`[analyze-observations-skill] 找到 ${unanalyzedObservations.length} 条未分析的观察记录`);

        // 2. 内联统计分析：计算最近N条观察的类型分布
        const recentN = 10;
        const recentObservations = unanalyzedObservations.slice(-recentN);
        const typeDistribution = analyzeTypeDistribution(recentObservations);

        // 3. 对每条观察记录进行分析
        const analysisResults = [];
        let processedCount = 0;

        for (const observation of unanalyzedObservations) {
            try {
                const analysis = await analyzeSingleObservation(observation);
                analysisResults.push(analysis);
                processedCount++;
                
                // 更新观察记录状态
                await memoryPlugin.update_observation_status(
                    observation.id,
                    'analyzed',
                    {
                        analysis_summary: analysis.summary,
                        analyzed_at: new Date().toISOString(),
                        analysis_version: '1.0'
                    }
                );

                console.log(`[analyze-observations-skill] 已分析观察记录 ${observation.id}`);
            } catch (error) {
                console.error(`[analyze-observations-skill] 分析观察记录 ${observation.id} 失败:`, error);
                results.errors.push({
                    observationId: observation.id,
                    error: error.message
                });
                // 继续处理其他记录，不中断整个流程
                continue;
            }
        }

        // 4. 生成分析报告
        const report = {
            type: 'analysis_report',
            title: `观察记录分析报告 - ${new Date().toISOString()}`,
            created_at: new Date().toISOString(),
            observations_analyzed: processedCount,
            total_observations: unanalyzedObservations.length,
            type_distribution: typeDistribution,
            analysis_results: analysisResults,
            insights: extractInsights(analysisResults),
            action_suggestions: generateActionSuggestions(analysisResults)
        };

        // 5. 存储分析报告到记忆库
        try {
            const reportResult = await memoryPlugin.add_memory(report);
            results.reportId = reportResult.id;
            console.log(`[analyze-observations-skill] 分析报告已保存，ID: ${results.reportId}`);
        } catch (error) {
            throw new Error(`存储分析报告失败: ${error.message}`);
        }

        // 6. 更新结果
        results.success = true;
        results.analyzedCount = processedCount;
        results.executionTime = Date.now() - startTime;

        console.log(`[analyze-observations-skill] 分析完成: 已处理 ${processedCount} 条记录，耗时 ${results.executionTime}ms`);

        return results;

    } catch (error) {
        console.error('[analyze-observations-skill] 执行过程中发生错误:', error);
        results.errors.push({
            error: error.message,
            stack: error.stack
        });
        results.executionTime = Date.now() - startTime;
        return results;
    }
}

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
async function analyzeSingleObservation(observation) {
    const content = observation.content || '';
    const observationType = observation.type || 'general';
    
    // 基础分析：关键词提取和模式识别
    const keywords = extractKeywords(content);
    const patterns = identifyPatterns(content);
    const sentiment = analyzeSentiment(content);
    
    // 关联进化目标
    const evolutionaryGoals = mapToEvolutionaryGoals(content, patterns);
    
    // 生成建议措施
    const suggestions = generateMicroSuggestions(content, patterns, evolutionaryGoals);
    
    return {
        observation_id: observation.id,
        original_content: content,
        type: observationType,
        timestamp: observation.timestamp,
        analysis: {
            keywords: keywords,
            patterns: patterns,
            sentiment: sentiment,
            evolutionary_goals: evolutionaryGoals,
            suggestions: suggestions
        },
        summary: generateSummary(content, patterns, suggestions)
    };
}

/**
 * 提取关键词
 * @param {string} text - 文本内容
 * @returns {Array} 关键词列表
 */
function extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    
    // 简单关键词提取：去除停用词，提取高频词
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
    const words = text.replace(/[^\w\s\u4e00-\u9fa5]/g, '').split(/\s+/);
    const wordCount = {};
    
    words.forEach(word => {
        if (word.length > 1 && !stopWords.has(word)) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });
    